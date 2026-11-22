<?php

namespace App\Mail;

use App\Support\Mail\MailTheme;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

/**
 * N-01 (reset), N-02 (setup), N-03 (sign-in) (story 4.4; Next `lib/auth/mail.ts:20-40`). Not queued: auth mode, sent
 * synchronously by `SendAuthLink` after commit (ADR-018). Both parts carry the same link.
 */
final class AuthLinkMail extends Mailable
{
    /** @param  'setup'|'reset'|'magic'  $kind */
    public function __construct(private readonly string $recipient, public readonly string $kind, public readonly string $link) {}

    public function envelope(): Envelope
    {
        return new Envelope(to: [$this->recipient], subject: $this->subjectLine());
    }

    public function content(): Content
    {
        $setup = $this->kind === 'setup';
        $reset = $this->kind === 'reset';
        $url = MailTheme::safeUrl($this->link);

        return new Content(view: 'mail.layouts.base', text: 'mail.auth-link-text', with: [
            'heading' => $this->subjectLine(),
            'intro' => $reset
                ? 'Use this single-use link within one hour to reset your password. All sessions will be revoked.'
                : ($setup ? 'Thanks for your purchase. Use this secure link to finish access setup.'
                    : 'Thanks for your purchase. Use this secure link to sign in and access your project.'),
            'ctaLabel' => $reset ? 'Reset password' : ($setup ? 'Finish account setup' : 'Sign in to Logo Fountain'),
            'ctaUrl' => $url,
            'footer' => $setup
                ? 'Set your password with this one-hour, single-use mailbox proof, then sign in.'
                : 'If you did not request this email, you can safely ignore it.',
            'admin' => false,
            'clientName' => null,
            'brandName' => null,
            'textBody' => implode("\n", [
                'Your Logo Fountain account',
                '',
                $reset ? 'Use this secure link to reset your password:' : ($setup ? 'Use this secure link to finish account setup:' : 'Use this secure link to sign in:'),
                $url,
                ...($setup ? ['', 'Choose a password, then sign in. This link expires in one hour and can be used once.'] : []),
            ]),
        ]);
    }

    public function subjectLine(): string
    {
        return match ($this->kind) {
            'reset' => 'Reset your Logo Fountain password',
            'setup' => 'Finish setting up your Logo Fountain account',
            default => 'Your Logo Fountain sign-in link',
        };
    }
}
