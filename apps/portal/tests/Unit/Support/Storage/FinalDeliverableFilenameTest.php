<?php

use App\Support\FinalDeliverableFilename as F;

// Ledger #92 (final-deliverable-filename.test.ts:6,16) plus the UTC edge.
$d = new DateTimeImmutable('2026-03-05T08:00:00Z');

it('uses the company name', function () use ($d) {
    expect(F::build('Acme & Co', 'Alex Doe', null, $d))->toBe('acme-co-2026-03-05.zip');
});

it('falls back to client name, email local part, then the default', function () use ($d) {
    expect(F::build(null, 'Alex Doe', null, $d))->toBe('alex-doe-2026-03-05.zip')
        ->and(F::build('', null, 'client.person@example.com', $d))->toBe('client-person-2026-03-05.zip')
        ->and(F::build('!!!', '', '@x.com', $d))->toBe('logo-fountain-2026-03-05.zip');
});

it('dates in UTC', function () {
    expect(F::build('A', null, null, new DateTimeImmutable('2026-03-05T23:59:59-05:00')))->toBe('a-2026-03-06.zip');
});
