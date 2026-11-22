// Story 3.4 (DV-12, ADR-021): the PHP SignedImage <-> stableImage contract. @unit.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { IMAGE_REFRESH_MARGIN_MS, signedUrlExpiry, stableImage } from '../../resources/js/lib/media.ts';

// Shaped like PrivateStorage::sign('concepts', ..., 3600) output (SigV4, X-Amz-Date + X-Amz-Expires=3600).
const base = 'https://acct.r2.cloudflarestorage.com/portal-concepts/p/c/v1.abc.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=k%2F20261122%2Fauto%2Fs3%2Faws4_request';
const url1 = `${base}&X-Amz-Date=20261122T100000Z&X-Amz-SignedHeaders=host&X-Amz-Expires=3600&X-Amz-Signature=aaaa`;
const url2 = `${base}&X-Amz-Date=20261122T100030Z&X-Amz-SignedHeaders=host&X-Amz-Expires=3600&X-Amz-Signature=bbbb`;
const expiry1 = Date.UTC(2026, 10, 22, 11, 0, 0);

describe('SignedImage contract (DV-12)', () => {
    test('same imageKey, re-signed URL: keeps the first src', () => {
        const cur = { imageKey: 'k1', url: url1, expiresAt: expiry1 };
        const out = stableImage(cur, { imageKey: 'k1', url: url2, expiresAt: expiry1 + 30_000 }, expiry1 - 3_000_000);
        assert.equal(out?.url, url1);
    });
    test('within 5 minutes of expiry: adopts the new URL', () => {
        const cur = { imageKey: 'k1', url: url1, expiresAt: expiry1 };
        const out = stableImage(cur, { imageKey: 'k1', url: url2, expiresAt: expiry1 + 30_000 }, expiry1 - IMAGE_REFRESH_MARGIN_MS);
        assert.equal(out?.url, url2);
    });
    test('fixture captured from a real PHP sign(): expiresAt equals the URL expiry', () => {
        const fx = JSON.parse(readFileSync(new URL('../fixtures/signed-image.json', import.meta.url), 'utf8'));
        assert.deepEqual(Object.keys(fx), ['imageKey', 'url', 'expiresAt']);
        assert.equal(signedUrlExpiry(fx.url), fx.expiresAt);
    });
    test('expiresAt as the server sends it equals the URL expiry', () => {
        assert.equal(signedUrlExpiry(url1), expiry1);
    });
});
