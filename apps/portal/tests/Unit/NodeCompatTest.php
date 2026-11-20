<?php

use App\Support\NodeCompat;

// Story 1.5: the PHP equivalents of net.isIP and String.prototype.trim agree with Node 24 on every
// recorded case (tests/Fixtures/node-net/generate.mjs; regenerate with the command in that file).

/** @return array{node: string, cases: list<array{0: string, 1: int}>} */
function nodeIsIpFixture(): array
{
    /** @var array{node: string, cases: list<array{0: string, 1: int}>} $data */
    $data = json_decode((string) file_get_contents(__DIR__.'/../Fixtures/node-net/isip.json'), true, flags: JSON_THROW_ON_ERROR);

    return $data;
}

/** The fixture holds latin1 strings as JSON (UTF-8); turn each char back into its byte. */
function latin1Bytes(string $utf8): string
{
    return (string) mb_convert_encoding($utf8, 'ISO-8859-1', 'UTF-8');
}

it('agrees with Node net.isIP on every recorded input', function () {
    $fixture = nodeIsIpFixture();
    expect($fixture['node'])->toStartWith('v24.')
        ->and(count($fixture['cases']))->toBeGreaterThan(3000);

    $mismatches = [];
    foreach ($fixture['cases'] as [$input, $family]) {
        $bytes = latin1Bytes($input);
        if (NodeCompat::isIp($bytes) !== ($family !== 0)) {
            $mismatches[] = bin2hex($bytes)." node={$family}";
        }
    }
    expect($mismatches)->toBe([]);
});

it('records where filter_var would have disagreed with Node (why it is not used)', function () {
    $differ = [];
    foreach (nodeIsIpFixture()['cases'] as [$input, $family]) {
        $bytes = latin1Bytes($input);
        if ((filter_var($bytes, FILTER_VALIDATE_IP) !== false) !== ($family !== 0)) {
            $differ[] = $bytes;
        }
    }
    // Zone IDs are the known difference; if filter_var ever starts agreeing, this still passes.
    expect($differ)->toContain('fe80::1%eth0')
        ->and(array_filter($differ, fn (string $s) => ! str_contains($s, '%')))->toBe([]);
});

it('strips exactly the code points JS trim strips', function () {
    /** @var array{codePoints: list<int>} $fixture */
    $fixture = json_decode((string) file_get_contents(__DIR__.'/../Fixtures/node-net/trim.json'), true, flags: JSON_THROW_ON_ERROR);
    $stripped = [];
    for ($cp = 0; $cp <= 0xFFFF; $cp++) {
        if ($cp >= 0xD800 && $cp <= 0xDFFF) {
            continue; // lone surrogates are not valid UTF-8 (and not whitespace in JS)
        }
        if (NodeCompat::trimEnv('a'.mb_chr($cp, 'UTF-8').'a') !== 'a'.mb_chr($cp, 'UTF-8').'a') {
            throw new RuntimeException('trimmed an inner char');
        }
        if (NodeCompat::trimEnv(mb_chr($cp, 'UTF-8')) === '') {
            $stripped[] = $cp;
        }
    }
    expect($stripped)->toBe($fixture['codePoints']);

    $latin1 = array_values(array_filter($fixture['codePoints'], fn (int $cp) => $cp <= 0xFF));
    $bytes = array_values(array_filter(range(0, 0xFF), fn (int $b) => NodeCompat::trimHeader(chr($b)) === ''));
    expect($bytes)->toBe($latin1);
});
