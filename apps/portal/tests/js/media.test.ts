// Story 1.8c: the pure logic behind the media and data components (resources/js/lib/media.ts).
// @unit. Run: npm run test:unit
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
    formatBytes,
    formatDate,
    formatTime,
    IMAGE_REFRESH_MARGIN_MS,
    nextSort,
    percent,
    precheckUpload,
    rowIndexForKey,
    signedUrlExpiry,
    sortRows,
    stableImage,
    UPLOAD_RULES,
    uploadErrorMessage,
} from '../../resources/js/lib/media.ts';

const MIB = 1024 * 1024;

describe('upload rules (the limits Next enforces; DV-13)', () => {
    test('concept images: 10 MiB, PNG/JPEG/WebP with a matching extension and MIME', () => {
        assert.equal(UPLOAD_RULES.conceptImage.maxBytes, 10 * MIB);
        const ok = (name: string, type: string, size = 1000) => precheckUpload('conceptImage', { name, type, size });
        assert.equal(ok('logo.png', 'image/png'), null);
        assert.equal(ok('logo.JPG', 'image/jpeg'), null);
        assert.equal(ok('logo.jpeg', 'image/jpeg'), null);
        assert.equal(ok('logo.webp', 'image/webp'), null);
        assert.equal(ok('logo.png', 'image/jpeg'), 'INVALID_FILE_TYPE', 'extension and MIME must agree');
        assert.equal(ok('logo.gif', 'image/gif'), 'INVALID_FILE_TYPE');
        assert.equal(ok('logo', ''), 'INVALID_FILE_TYPE');
        assert.equal(ok('logo.png', 'image/png', 0), 'FILE_REQUIRED');
        assert.equal(ok('logo.png', 'image/png', 10 * MIB), null);
        assert.equal(ok('logo.png', 'image/png', 10 * MIB + 1), 'FILE_TOO_LARGE');
        assert.equal(ok('big.gif', 'image/gif', 10 * MIB + 1), 'FILE_TOO_LARGE', 'size is checked before type, as in Next');
    });

    test('final ZIP: 95,000,000 bytes (DV-13), .zip with an allowed ZIP MIME', () => {
        assert.equal(UPLOAD_RULES.finalZip.maxBytes, 95_000_000);
        const ok = (name: string, type: string, size = 1000) => precheckUpload('finalZip', { name, type, size });
        assert.equal(ok('finals.zip', 'application/zip'), null);
        assert.equal(ok('finals.zip', 'application/x-zip-compressed'), null);
        assert.equal(ok('finals.zip', 'application/zip', 95_000_000), null);
        assert.equal(ok('finals.zip', 'application/zip', 95_000_001), 'FILE_TOO_LARGE');
        assert.equal(ok('finals.rar', 'application/vnd.rar'), 'INVALID_FILE_TYPE');
    });

    test('the limits are written out up front', () => {
        assert.equal(UPLOAD_RULES.conceptImage.summary, 'PNG, JPG or WebP, up to 10 MB and 40 megapixels');
        assert.match(UPLOAD_RULES.finalZip.summary, /up to 95 MB/);
    });

    test('every code maps to plain language that never shows the code; size errors name the limit', () => {
        const codes = ['FILE_REQUIRED', 'FILE_TOO_LARGE', 'INVALID_FILE_TYPE', 'FILE_SIGNATURE_MISMATCH', 'MALFORMED_IMAGE', 'IMAGE_DIMENSIONS_TOO_LARGE', 'MALFORMED_ZIP', 'ZIP_LIMIT_EXCEEDED', 'MULTIPLE_FILES', 'REQUEST_KEY_MISMATCH'];
        for (const kind of ['conceptImage', 'finalZip'] as const) {
            for (const code of codes) {
                const text = uploadErrorMessage(kind, code, { name: 'x.png', size: 5 });
                assert.ok(text.length > 10, code);
                assert.doesNotMatch(text, /[A-Z]{2,}_[A-Z]/, `${code} leaks a code`);
            }
        }
        assert.equal(uploadErrorMessage('conceptImage', 'FILE_TOO_LARGE', { name: 'logo.png', size: 12_400_000 }), 'logo.png is 12 MB. Files can be up to 10 MB.');
        assert.equal(uploadErrorMessage('finalZip', 'FILE_TOO_LARGE'), 'This file is over the 95 MB limit.');
        assert.match(uploadErrorMessage('conceptImage', 'INVALID_FILE_TYPE', { name: 'logo.gif', size: 1 }), /PNG, JPG or WebP/);
        assert.match(uploadErrorMessage('conceptImage', 'UPLOAD_FAILED'), /Check your connection/);
    });
});

describe('formatting', () => {
    test('bytes in decimal units', () => {
        assert.deepEqual([0, 1, 999, 1000, 48_200, 2_400_000, 95_000_000, 10 * MIB + 1, 3_200_000_000].map(formatBytes), [
            '0 bytes',
            '1 byte',
            '999 bytes',
            '1 KB',
            '48 KB',
            '2.4 MB',
            '95 MB',
            '10 MB',
            '3.2 GB',
        ]);
    });

    test('dates "18 Nov 2026" and times "14:05" (UX §12); bad input is empty', () => {
        assert.equal(formatDate('2026-11-18T10:00:00Z'), '18 Nov 2026');
        assert.equal(formatDate('nope'), '');
        assert.match(formatTime('2026-11-18T14:05:00Z'), /^\d{2}:\d{2}$/);
    });

    test('percent clamps and rounds', () => {
        assert.deepEqual([percent(0, 0), percent(1, 3), percent(5, 4), percent(-1, 4)], [0, 33, 100, 0]);
    });
});

describe('stable image rule (ADR-021, DV-12)', () => {
    const now = Date.UTC(2026, 10, 20, 12, 0, 0);
    const img = (imageKey: string, url: string, expiresAt?: number) => ({ imageKey, url, expiresAt });

    test('a re-signed URL for the same key keeps the rendered src', () => {
        const current = img('k1', 'https://r2/a?sig=1', now + 3600_000);
        assert.equal(stableImage(current, img('k1', 'https://r2/a?sig=2', now + 7200_000), now), current);
    });

    test('a new key swaps at once; no image means preview unavailable', () => {
        const next = img('k2', 'https://r2/b?sig=1');
        assert.equal(stableImage(img('k1', 'https://r2/a'), next, now), next);
        assert.equal(stableImage(null, next, now), next);
        assert.equal(stableImage(img('k1', 'https://r2/a'), null, now), null);
    });

    test('within 5 minutes of expiry the new URL is taken, even for the same key', () => {
        const near = img('k1', 'https://r2/a?sig=1', now + IMAGE_REFRESH_MARGIN_MS);
        const next = img('k1', 'https://r2/a?sig=2', now + 3600_000);
        assert.equal(stableImage(near, next, now), next);
        const far = img('k1', 'https://r2/a?sig=1', now + IMAGE_REFRESH_MARGIN_MS + 1);
        assert.equal(stableImage(far, next, now), far);
    });

    test('without expiresAt, the expiry is read from the presigned URL', () => {
        const url = 'https://r2.example/c.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Date=20261120T110000Z&X-Amz-Expires=3600&X-Amz-Signature=abc';
        assert.equal(signedUrlExpiry(url), Date.UTC(2026, 10, 20, 12, 0, 0));
        assert.equal(signedUrlExpiry('https://r2.example/c.png'), null);
        assert.equal(signedUrlExpiry('https://r2.example/c.png?X-Amz-Date=bad&X-Amz-Expires=60'), null);
        // That URL expires exactly now: the fresh one is used.
        const next = img('k1', 'https://r2.example/c.png?sig=new');
        assert.equal(stableImage(img('k1', url), next, now), next);
        // An unreadable expiry keeps the current one (the key rule decides).
        const plain = img('k1', 'https://r2.example/c.png?sig=old');
        assert.equal(stableImage(plain, next, now), plain);
    });
});

describe('data table', () => {
    const rows = [
        { name: 'Concept 10', n: 3 },
        { name: 'concept 2', n: 1 },
        { name: '', n: 2 },
        { name: 'Concept 2', n: 1 },
    ];

    test('natural, case-insensitive, stable sort with empty values last in both directions', () => {
        assert.deepEqual(sortRows(rows, (r) => r.name, 'ascending').map((r) => r.name), ['concept 2', 'Concept 2', 'Concept 10', '']);
        assert.deepEqual(sortRows(rows, (r) => r.name, 'descending').map((r) => r.name), ['Concept 10', 'concept 2', 'Concept 2', '']);
        assert.deepEqual(sortRows(rows, (r) => r.n, 'descending').map((r) => r.n), [3, 2, 1, 1]);
    });

    test('a new column sorts ascending; the same column flips', () => {
        assert.deepEqual(nextSort(null, 'a'), { key: 'a', direction: 'ascending' });
        assert.deepEqual(nextSort({ key: 'a', direction: 'ascending' }, 'a'), { key: 'a', direction: 'descending' });
        assert.deepEqual(nextSort({ key: 'a', direction: 'descending' }, 'b'), { key: 'b', direction: 'ascending' });
    });

    test('row keys: arrows stop at the ends, Home/End jump, other keys are not handled', () => {
        assert.deepEqual(
            ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter'].map((k) => rowIndexForKey(k, 1, 3)),
            [2, 0, 0, 2, null],
        );
        assert.equal(rowIndexForKey('ArrowDown', 2, 3), 2);
        assert.equal(rowIndexForKey('ArrowUp', 0, 3), 0);
        assert.equal(rowIndexForKey('ArrowDown', 0, 0), null);
    });
});
