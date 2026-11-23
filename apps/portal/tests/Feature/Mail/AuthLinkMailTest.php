<?php

use App\Mail\AuthLinkMail;
use App\Support\Mail\MailTheme;

// Story 4.4 AC 8-9 (N-01, N-02, N-03, N-14 base): copy, both parts, branding, escaping.

const LINK = 'https://app.example.com/auth/callback#token=abc&next=%2Fdashboard';

beforeEach(fn () => config(['portal.public_site_url' => 'https://app.example.com', 'portal.email_logo_url' => null]));

it('has the exact subjects, headings, CTA labels and text parts', function (string $kind, string $subject, string $cta, string $lead, ?string $tail) {
    $mail = new AuthLinkMail('a@example.test', $kind, LINK);
    $html = $mail->render();
    $text = view('mail.auth-link-text', ['textBody' => $mail->content()->with['textBody']])->render();

    expect($mail->envelope()->subject)->toBe($subject)
        ->and($html)->toContain(">{$subject}</h1>")->and($html)->toContain(">{$cta}</a>")->and($html)->toContain('href="'.str_replace('&', '&amp;', LINK).'"')
        ->and($text)->toBe(implode("\n", ['Your Logo Fountain account', '', $lead, LINK, ...($tail === null ? [] : ['', $tail])]));
})->with([
    ['reset', 'Reset your Logo Fountain password', 'Reset password', 'Use this secure link to reset your password:', null],
    ['setup', 'Finish setting up your Logo Fountain account', 'Finish account setup', 'Use this secure link to finish account setup:', 'Choose a password, then sign in. This link expires in one hour and can be used once.'],
    ['magic', 'Your Logo Fountain sign-in link', 'Sign in to Logo Fountain', 'Use this secure link to sign in:', null],
]);

it('carries Next intro and footer copy', function () {
    expect((new AuthLinkMail('a@example.test', 'reset', LINK))->render())
        ->toContain('Use this single-use link within one hour to reset your password. All sessions will be revoked.')
        ->toContain('If you did not request this email, you can safely ignore it.');
    expect((new AuthLinkMail('a@example.test', 'setup', LINK))->render())
        ->toContain('Thanks for your purchase. Use this secure link to finish access setup.')
        ->toContain('Set your password with this link, then sign in. It works once and expires in an hour.');
    expect((new AuthLinkMail('a@example.test', 'magic', LINK))->render())
        ->toContain('Thanks for your purchase. Use this secure link to sign in and access your project.');
});

it('refuses a CTA that is not an absolute https URL', function (string $url) {
    expect(fn () => (new AuthLinkMail('a@example.test', 'magic', $url))->render())->toThrow(InvalidArgumentException::class);
})->with(['http://evil.example/x', 'javascript:alert(1)', '/relative', 'https://user:pw@app.example.com/x', "https://app.example.com/\x01"]);

it('uses the logo from the canonical origin, an explicit one, or the embedded fallback', function () {
    expect(MailTheme::logoUrl())->toBe('https://app.example.com/img/logo.svg');
    config(['portal.email_logo_url' => 'https://cdn.example.com/l.png']);
    expect(MailTheme::logoUrl())->toBe('https://cdn.example.com/l.png');
    config(['portal.email_logo_url' => 'http://cdn.example.com/l.png']); // not https: ignored
    expect(MailTheme::logoUrl())->toBe('https://app.example.com/img/logo.svg');
    config(['portal.public_site_url' => 'http://localhost:8080']);
    expect(MailTheme::logoUrl())->toStartWith('data:image/svg+xml;utf8,%3Csvg');
});

it('renders the branded header with the logo, and escapes the logo attribute', function () {
    config(['portal.email_logo_url' => 'https://cdn.example.com/l.png?a=1&b="2"']);

    $html = (new AuthLinkMail('a@example.test', 'magic', LINK))->render();

    expect($html)->toContain('<img src="https://cdn.example.com/l.png?a=1&amp;b=&quot;2&quot;" alt="Logo Fountain"')
        ->and($html)->not->toContain('b="2"');
});
