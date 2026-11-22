<?php

namespace App\Mail;

use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

/**
 * Story 2.7 (N-14 base): the minimal lifecycle layout. Story 4.4 replaces it with the branded one (logo).
 * Sent synchronously inside `SendLifecycleMail`, so it is not itself queued.
 */
final class LifecycleMailable extends Mailable
{
    /** @param  list<string>  $recipients */
    public function __construct(
        private readonly array $recipients,
        private readonly string $mailSubject,
        public readonly string $heading,
        public readonly string $intro,
        public readonly string $ctaLabel,
        public readonly string $ctaUrl,
        public readonly bool $admin,
        public readonly ?string $clientName,
        public readonly ?string $brandName,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(to: $this->recipients, subject: $this->mailSubject);
    }

    public function content(): Content
    {
        return new Content(view: 'mail.layouts.base', text: 'mail.layouts.base-text', with: ['footer' => $this->footer()]);
    }

    public function footer(): string
    {
        return $this->admin
            ? 'Admin notification for transactional workflow updates.'
            : 'This is a transactional project update from Logo Fountain.';
    }
}
