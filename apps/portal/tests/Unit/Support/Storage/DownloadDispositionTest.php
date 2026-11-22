<?php

use App\Support\Storage\DownloadDisposition;

// Story 3.1 AC 6 (X-10, ledger #106): r2.test.ts:69-74 plus the Unicode edges.

it('falls back to the default for blank input', function () {
    expect(DownloadDisposition::for(' '))->toBe('attachment; filename="final-deliverables.zip"; filename*=UTF-8\'\'final-deliverables.zip');
    expect(DownloadDisposition::for(''))->toContain('final-deliverables.zip');
});

it('keeps at most 160 code points', function () {
    $out = DownloadDisposition::for(str_repeat('a', 10000));
    expect(strlen($out))->toBeLessThan(400)->and($out)->toContain('filename="'.str_repeat('a', 160).'"');
    expect(DownloadDisposition::for(str_repeat('é', 200)))->toContain(str_repeat('%C3%A9', 160))->not->toContain(str_repeat('%C3%A9', 161));
});

it('replaces separators, quotes and semicolons', function () {
    expect(DownloadDisposition::for('a\\b;".zip'))->toContain('filename="a_b__.zip"');
});

it('removes CR/LF and encodes UTF-8', function () {
    $out = DownloadDisposition::for("Lógó/\"\r\nInjected: yes.zip");
    expect($out)->not->toContain("\r")->not->toContain("\n")->toContain("filename*=UTF-8''L%C3%B3g%C3%B3")->toContain('filename="L_g_');
});

it('does not throw on invalid UTF-8 (the lone surrogate case) and writes U+FFFD', function () {
    $out = DownloadDisposition::for("a\xED\xA0\x80b.zip");
    expect($out)->toContain('%EF%BF%BD')->toContain('filename="a_');
});

it('percent-encodes the RFC 5987 extras and NFC-normalises', function () {
    expect(DownloadDisposition::for("it's (a)*.zip"))->toContain("filename*=UTF-8''it%27s%20%28a%29%2A.zip");
    expect(DownloadDisposition::for("e\u{0301}.zip"))->toContain("filename*=UTF-8''%C3%A9.zip");
});

it('trims Unicode whitespace like JS trim', function () {
    expect(DownloadDisposition::for("\u{00A0} x.zip \u{FEFF}"))->toContain('filename="x.zip"');
});

it('matches encodeURIComponent for ! and ~, and replaces astral characters per UTF-16 unit', function () {
    expect(DownloadDisposition::for('a!~.zip'))->toContain("filename*=UTF-8''a!~.zip");
    expect(DownloadDisposition::for("a\u{1F600}.zip"))->toContain('filename="a__.zip"')->toContain('%F0%9F%98%80');
});
