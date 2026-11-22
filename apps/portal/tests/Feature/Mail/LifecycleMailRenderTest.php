<?php

use App\Mail\LifecycleMailable;

// Story 2.7 AC 10-11 (N-14 base): text and HTML bodies, footers, escaping.

function mailable(bool $admin, string $intro = 'Intro.'): LifecycleMailable
{
    return new LifecycleMailable(['a@example.test'], 'Subj', $admin ? 'Subj' : 'Head', $intro, 'Open it', 'https://p.example.test/x?a=1&b=2', $admin, $admin ? 'Ada' : null, $admin ? 'Brand' : null);
}

it('renders the client text body as Next', function () {
    $m = mailable(false);
    expect($m->render())->toBeString();
    $text = view('mail.layouts.base-text', [...get_object_vars($m), 'footer' => $m->footer()])->render();
    expect($text)->toBe("Intro.\n\nOpen it: https://p.example.test/x?a=1&b=2");
});

it('renders the admin text body with the context line', function () {
    $m = mailable(true);
    $text = view('mail.layouts.base-text', [...get_object_vars($m), 'footer' => $m->footer()])->render();
    expect($text)->toBe("Intro.\n\nClient: Ada\nBrand: Brand\n\nOpen it: https://p.example.test/x?a=1&b=2");
});

it('renders the HTML with footers and escaping', function () {
    $html = mailable(false, '<b>Hi</b> & "you"')->render();
    expect($html)->toContain('&lt;b&gt;Hi&lt;/b&gt; &amp; &quot;you&quot;')->and($html)->toContain('<h1')->and($html)->toContain('>Head</h1>')
        ->and($html)->toContain('This is a transactional project update from Logo Fountain.')->and($html)->toContain('href="https://p.example.test/x?a=1&amp;b=2"')->and($html)->not->toContain('<b>Hi');
    $admin = mailable(true)->render();
    expect($admin)->toContain('Intro. Client: Ada. Brand: Brand.')->and($admin)->toContain('Admin notification for transactional workflow updates.');
});
