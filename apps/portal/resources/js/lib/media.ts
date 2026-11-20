// Pure helpers behind the story 1.8c media and data components (UX §11, §12; ADR-021; DV-13).
// No imports, so tests/js runs them with node:test.

// ---------- Upload rules (the limits Next enforces, shown up front by UploadDropzone) ----------
const MIB = 1024 * 1024;

export type UploadKind = 'conceptImage' | 'finalZip';

export type UploadRule = {
    maxBytes: number;
    /** How the limit is written for people. */
    maxLabel: string;
    /** extension → the MIME types allowed with it (extension AND MIME must match, as in Next). */
    types: Record<string, readonly string[]>;
    /** The file input's accept attribute (Next's `accept` for images). */
    accept: string;
    /** "PNG, JPG or WebP, up to 10 MB and 40 megapixels". */
    summary: string;
    /** "a PNG, JPG or WebP image" (used in the wrong-type message). */
    typeNoun: string;
};

export const UPLOAD_RULES: Record<UploadKind, UploadRule> = {
    // apps/web/src/lib/upload-validation.ts:4-5 (MAX_CONCEPT_IMAGE_BYTES = 10 * MIB, its message
    // says "10 MB"; MAX_CONCEPT_IMAGE_PIXELS = 40_000_000) and :172-181 (extension + MIME).
    conceptImage: {
        maxBytes: 10 * MIB,
        maxLabel: '10 MB',
        types: { png: ['image/png'], jpg: ['image/jpeg'], jpeg: ['image/jpeg'], webp: ['image/webp'] },
        accept: '.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp',
        summary: 'PNG, JPG or WebP, up to 10 MB and 40 megapixels',
        typeNoun: 'a PNG, JPG or WebP image',
    },
    // DV-13: 95,000,000 bytes in Laravel (Next: MAX_FINAL_ZIP_BYTES = 100 * MIB); :187-190 types.
    finalZip: {
        maxBytes: 95_000_000,
        maxLabel: '95 MB',
        types: { zip: ['application/zip', 'application/x-zip-compressed'] },
        accept: '.zip,application/zip,application/x-zip-compressed',
        summary: 'One ZIP file, up to 95 MB (up to 1,000 files and 500 MB unzipped)',
        typeNoun: 'a ZIP file',
    },
};

/** The server's upload codes (brownfield storage-and-uploads §2–3), plus the client's own. */
export type UploadErrorCode =
    | 'FILE_REQUIRED'
    | 'FILE_TOO_LARGE'
    | 'INVALID_FILE_TYPE'
    | 'FILE_SIGNATURE_MISMATCH'
    | 'MALFORMED_IMAGE'
    | 'IMAGE_DIMENSIONS_TOO_LARGE'
    | 'MALFORMED_ZIP'
    | 'ZIP_LIMIT_EXCEEDED'
    | 'UPLOAD_FAILED'
    /** Client only: more than one file dropped at once. */
    | 'MULTIPLE_FILES';

function extensionOf(name: string): string {
    const dot = name.lastIndexOf('.');
    return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

/**
 * The checks the browser can make before uploading, in Next's order (size 0, size, then extension
 * and MIME together). Structure, signature and pixel limits stay server-side. null = acceptable.
 */
export function precheckUpload(kind: UploadKind, file: { name: string; size: number; type: string }): UploadErrorCode | null {
    const rule = UPLOAD_RULES[kind];
    if (file.size === 0) return 'FILE_REQUIRED';
    if (file.size > rule.maxBytes) return 'FILE_TOO_LARGE';
    const mimes = rule.types[extensionOf(file.name)];
    if (!mimes || !mimes.includes(file.type)) return 'INVALID_FILE_TYPE';
    return null;
}

/** UX §12: an error code in plain language, saying what to do. Customers never see codes. */
export function uploadErrorMessage(kind: UploadKind, code: string, file?: { name: string; size: number }): string {
    const rule = UPLOAD_RULES[kind];
    const name = file?.name ?? 'This file';
    const image = kind === 'conceptImage';
    switch (code) {
        case 'FILE_REQUIRED':
            return `${name} is empty. Choose another file.`;
        case 'FILE_TOO_LARGE':
            return file ? `${name} is ${formatBytes(file.size)}. Files can be up to ${rule.maxLabel}.` : `This file is over the ${rule.maxLabel} limit.`;
        case 'INVALID_FILE_TYPE':
            return `${name} isn’t ${rule.typeNoun}. Use ${rule.typeNoun} with a matching file extension.`;
        case 'FILE_SIGNATURE_MISMATCH':
            return image ? `${name} doesn’t contain the kind of image its name says. Export it again and retry.` : `${name} isn’t a standard ZIP archive. Create the ZIP again and retry.`;
        case 'MALFORMED_IMAGE':
            return `We couldn’t read ${image ? 'this image' : 'this file'}. It may be damaged; export it again and retry.`;
        case 'IMAGE_DIMENSIONS_TOO_LARGE':
            return 'This image is over 40 megapixels. Export it smaller and retry.';
        case 'MALFORMED_ZIP':
            return 'We couldn’t read this ZIP. It may be damaged; create it again and retry.';
        case 'MULTIPLE_FILES':
            return 'Drop one file at a time.';
        case 'ZIP_LIMIT_EXCEEDED':
            return 'This ZIP is over the limits: up to 1,000 files and 500 MB once unzipped.';
        default:
            return 'The upload didn’t finish. Check your connection and try again.';
    }
}

/** File sizes in decimal units, as people read them: "820 bytes", "48 KB", "2.4 MB", "95 MB". */
export function formatBytes(bytes: number): string {
    if (bytes < 1000) return `${bytes} ${bytes === 1 ? 'byte' : 'bytes'}`;
    const units = ['KB', 'MB', 'GB'];
    let value = bytes / 1000;
    let unit = 0;
    while (value >= 1000 && unit < units.length - 1) {
        value /= 1000;
        unit++;
    }
    const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
    return `${rounded} ${units[unit]}`;
}

/** UX §12 dates: "18 Nov 2026". */
export function formatDate(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

/** Message times inside a day group: "14:05". */
export function formatTime(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(date);
}

/** Progress for an upload, clamped to 0–100 and rounded. */
export function percent(loaded: number, total: number): number {
    if (!(total > 0)) return 0;
    return Math.max(0, Math.min(100, Math.round((loaded / total) * 100)));
}

// ---------- Stable image rule (ADR-021, DV-12, F-15) ----------
export type SignedImage = { imageKey: string; url: string; expiresAt?: number | null | undefined };

/** Swap a URL this close to its expiry, even with the same key. */
export const IMAGE_REFRESH_MARGIN_MS = 5 * 60_000;

/** Expiry of an S3/R2 presigned URL (X-Amz-Date + X-Amz-Expires), or null when it can't be read. */
export function signedUrlExpiry(url: string): number | null {
    const query = url.split('?')[1];
    if (!query) return null;
    const params = new URLSearchParams(query);
    const date = params.get('X-Amz-Date');
    const expires = Number(params.get('X-Amz-Expires'));
    const m = date?.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
    if (!m || !Number.isFinite(expires) || expires <= 0) return null;
    const start = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
    return start + expires * 1000;
}

/**
 * Which image to render after a poll: keep the current one while the imageKey is unchanged (so a
 * re-signed URL never re-downloads or flickers), unless it's within 5 minutes of expiring.
 */
export function stableImage(current: SignedImage | null, incoming: SignedImage | null, now: number): SignedImage | null {
    if (!incoming) return null;
    if (!current || current.imageKey !== incoming.imageKey) return incoming;
    if (current.url === incoming.url) return current;
    const expiry = current.expiresAt ?? signedUrlExpiry(current.url);
    if (expiry !== null && expiry - now <= IMAGE_REFRESH_MARGIN_MS) return incoming;
    return current;
}

// ---------- Data table ----------
export type SortDirection = 'ascending' | 'descending';
export type SortValue = string | number | null | undefined;

/** A stable sort; strings compare naturally ("Concept 2" < "Concept 10"); empty values go last. */
export function sortRows<T>(rows: readonly T[], value: (row: T) => SortValue, direction: SortDirection): T[] {
    const collator = new Intl.Collator('en-GB', { numeric: true, sensitivity: 'base' });
    const sign = direction === 'ascending' ? 1 : -1;
    return rows
        .map((row, index) => ({ row, index, v: value(row) }))
        .sort((a, b) => {
            const aEmpty = a.v === null || a.v === undefined || a.v === '';
            const bEmpty = b.v === null || b.v === undefined || b.v === '';
            if (aEmpty || bEmpty) return aEmpty === bEmpty ? a.index - b.index : aEmpty ? 1 : -1;
            const c = typeof a.v === 'number' && typeof b.v === 'number' ? a.v - b.v : collator.compare(String(a.v), String(b.v));
            return c === 0 ? a.index - b.index : c * sign;
        })
        .map((x) => x.row);
}

/** Clicking a header: a new column sorts ascending; the same column flips. */
export function nextSort(current: { key: string; direction: SortDirection } | null, key: string): { key: string; direction: SortDirection } {
    if (current?.key !== key) return { key, direction: 'ascending' };
    return { key, direction: current.direction === 'ascending' ? 'descending' : 'ascending' };
}

/** Keyboard row navigation: the row index a key moves to, or null for keys it doesn’t handle. */
export function rowIndexForKey(key: string, index: number, count: number): number | null {
    if (count === 0) return null;
    switch (key) {
        case 'ArrowDown':
            return Math.min(index + 1, count - 1);
        case 'ArrowUp':
            return Math.max(index - 1, 0);
        case 'Home':
            return 0;
        case 'End':
            return count - 1;
        default:
            return null;
    }
}
