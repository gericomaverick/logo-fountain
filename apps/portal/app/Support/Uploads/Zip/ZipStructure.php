<?php

namespace App\Support\Uploads\Zip;

use App\Support\Uploads\UploadValidationException;

/**
 * Port of validateZip (apps/web/src/lib/zip-validation.ts:30-131), check order preserved: the first failing rule
 * decides the code. Reads ranges from the file; payloads go through the 16 KiB streaming inflater, never whole.
 */
final class ZipStructure
{
    public const int MAX_ENTRIES = 1000;

    public const int MAX_UNCOMPRESSED = 500 * 1024 * 1024;

    public const int MAX_RATIO = 100;

    private const int CHUNK = 16 * 1024;

    private const string CP437 = "ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■\u{A0}";

    private static function bad(string $m): never
    {
        throw new UploadValidationException('MALFORMED_ZIP', $m);
    }

    private static function limit(): never
    {
        throw new UploadValidationException('ZIP_LIMIT_EXCEEDED', 'ZIP exceeds actual expanded-size or per-entry compression ratio limit');
    }

    private static function decodeName(string $b, bool $utf8): string
    {
        if (! $utf8) {
            $cp = mb_str_split(self::CP437);
            $o = '';
            foreach (str_split($b) as $c) {
                $v = ord($c);
                $o .= $v < 128 ? $c : $cp[$v - 128];
            }

            return $o;
        }
        if (! mb_check_encoding($b, 'UTF-8')) {
            self::bad('Invalid UTF-8 entry name');
        }

        return str_starts_with($b, "\xEF\xBB\xBF") ? substr($b, 3) : $b; // TextDecoder drops a leading BOM
    }

    private static function safeName(string $name): string
    {
        if ($name === '' || $name !== \Normalizer::normalize($name, \Normalizer::FORM_KC)
            || preg_match('/[\\\\\x00-\x1f\x7f:]/', $name) === 1 || str_starts_with($name, '/')) {
            self::bad('Unsafe or noncanonical ZIP path');
        }
        $parts = explode('/', preg_replace('/\/\z/', '', $name) ?? $name);
        foreach ($parts as $p) {
            if ($p === '' || $p === '.' || $p === '..' || preg_match('/[. ]\z/', $p) === 1
                || preg_match('/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|\z)/i', $p) === 1) {
                self::bad('Unsafe ZIP path component');
            }
        }

        return mb_strtolower(implode('/', $parts));
    }

    private static function extras(ZipFile $z, int $start, int $length): void
    {
        $end = $start + $length;
        $block = $z->read($start, $length);
        $i = 0;
        while ($start + $i < $end) {
            $id = $start + $i;
            if ($id + 4 > $end || $id + 4 + $z->u16($id + 2) > $end) {
                self::bad('Truncated extra field');
            }
            if (in_array($z->u16($id), [0x7075, 0x6375, 0x0001, 0x000D, 0x756E], true)) {
                self::bad('Unsupported path/link/ZIP64 extra field');
            }
            $i += 4 + $z->u16($id + 2);
        }
        unset($block);
    }

    public static function validate(ZipFile $z): void
    {
        $len = $z->length;
        if ($len < 22 || $z->u32(0) !== 0x04034B50) {
            self::bad('Not a nonempty standard ZIP');
        }
        $eocd = -1;
        $floor = max(0, $len - 65557);
        $tail = $z->read($floor, $len - $floor);
        for ($p = $len - 22; $p >= $floor; $p--) {
            $o = $p - $floor;
            if (substr($tail, $o, 4) === "PK\x05\x06" && $p + 22 + (ord($tail[$o + 20]) | (ord($tail[$o + 21]) << 8)) === $len) {
                $eocd = $p;
                break;
            }
        }
        unset($tail);
        if ($eocd < 0) {
            self::bad('Missing end directory');
        }
        $count = $z->u16($eocd + 10);
        $central = $z->u32($eocd + 16);
        if ($z->u16($eocd + 4) || $z->u16($eocd + 6) || $count !== $z->u16($eocd + 8) || ! $count) {
            self::bad('Multivolume/empty ZIP unsupported');
        }
        if ($count > self::MAX_ENTRIES) {
            self::limit();
        }
        if ($central + $z->u32($eocd + 12) !== $eocd) {
            self::bad('Invalid directory bounds');
        }

        $records = [];
        $names = [];
        $p = $central;
        for ($i = 0; $i < $count; $i++) {
            if ($p + 46 > $eocd || $z->u32($p) !== 0x02014B50) {
                self::bad('Invalid central record');
            }
            $flags = $z->u16($p + 8);
            $method = $z->u16($p + 10);
            $crc = $z->u32($p + 16);
            $compressed = $z->u32($p + 20);
            $size = $z->u32($p + 24);
            $nl = $z->u16($p + 28);
            $xl = $z->u16($p + 30);
            $cl = $z->u16($p + 32);
            $local = $z->u32($p + 42);
            if ($p + 46 + $nl + $xl + $cl > $eocd || $z->u16($p + 34) || in_array(0xFFFFFFFF, [$size, $compressed, $local], true)) {
                self::bad('Truncated, split or ZIP64 record');
            }
            if (($flags & ~(0x800 | 8 | 6)) || ! in_array($method, [0, 8], true) || ($method === 0 && ($flags & 6))) {
                self::bad('Unsupported flags/compression/encryption');
            }
            $name = self::decodeName($z->read($p + 46, $nl), (bool) ($flags & 0x800));
            $key = self::safeName($name);
            $directory = str_ends_with($name, '/');
            if (array_key_exists($key, $names)) {
                self::bad('Colliding ZIP names');
            }
            $names[$key] = $directory;
            $attr = $z->u32($p + 38);
            $unixType = ($attr >> 16) & 0xF000;
            if (($unixType && $unixType !== 0x8000 && $unixType !== 0x4000) || ($attr & 8) || ($unixType === 0x4000 && ! $directory)
                || ($unixType === 0x8000 && $directory) || (($attr & 16) && ! $directory)) {
                self::bad('Symlink/special file or inconsistent directory attributes');
            }
            self::extras($z, $p + 46 + $nl, $xl);
            if ($local + 30 > $central || $z->u32($local) !== 0x04034B50) {
                self::bad('Invalid local header');
            }
            $lnl = $z->u16($local + 26);
            $lxl = $z->u16($local + 28);
            $data = $local + 30 + $lnl + $lxl;
            if ($data + $compressed > $central || $z->u16($local + 6) !== $flags || $z->u16($local + 8) !== $method) {
                self::bad('Local header mismatch');
            }
            $localName = self::decodeName($z->read($local + 30, $lnl), (bool) ($flags & 0x800));
            self::safeName($localName);
            if ($localName !== $name) {
                self::bad('Local and central names differ');
            }
            self::extras($z, $local + 30 + $lnl, $lxl);
            $end = $data + $compressed;
            if ($flags & 8) {
                foreach ([[14, $crc], [18, $compressed], [22, $size]] as [$off, $expected]) {
                    if ($z->u32($local + $off) !== 0 && $z->u32($local + $off) !== $expected) {
                        self::bad('Inconsistent local descriptor fields');
                    }
                }
                $matches = static fn (int $q): bool => $q + 12 <= $central && $z->u32($q) === $crc && $z->u32($q + 4) === $compressed && $z->u32($q + 8) === $size;
                if ($end + 16 <= $central && $z->u32($end) === 0x08074B50 && $matches($end + 4)) {
                    $end += 16;
                } elseif ($matches($end)) {
                    $end += 12;
                } else {
                    self::bad('Invalid data descriptor');
                }
            } elseif ($z->u32($local + 14) !== $crc || $z->u32($local + 18) !== $compressed || $z->u32($local + 22) !== $size) {
                self::bad('Local size/CRC mismatch');
            }
            if ($method === 0 && $compressed !== $size) {
                self::bad('Stored size mismatch');
            }
            if ($directory && ($size || $crc || ($method === 0 && $compressed))) {
                self::bad('Directory contains payload');
            }
            if ($size > self::MAX_UNCOMPRESSED || $size > max(1, $compressed) * self::MAX_RATIO) {
                self::limit();
            }
            $records[] = ['start' => $local, 'end' => $end, 'data' => $data, 'compressed' => $compressed, 'size' => $size, 'crc' => $crc, 'method' => $method];
            $p += 46 + $nl + $xl + $cl;
        }
        if ($p !== $eocd) {
            self::bad('Directory length mismatch');
        }
        $sorted = $records;
        usort($sorted, static fn (array $a, array $b): int => $a['start'] <=> $b['start']);
        $end = 0;
        foreach ($sorted as $r) {
            if ($r['start'] !== $end) {
                self::bad('Overlapping or unreferenced local records');
            }
            $end = $r['end'];
        }
        if ($end !== $central) {
            self::bad('Unexpected data before directory');
        }
        foreach (array_keys($names) as $key) {
            $parts = explode('/', (string) $key);
            for ($i = 1; $i < count($parts); $i++) {
                $anc = implode('/', array_slice($parts, 0, $i));
                if (array_key_exists($anc, $names) && $names[$anc] === false) {
                    self::bad('File used as ancestor directory');
                }
            }
        }

        $total = 0;
        foreach ($records as $r) {
            self::inflateAndCheck($z, $r, $total);
        }
    }

    /** @param array{data: int, compressed: int, size: int, crc: int, method: int} $r */
    private static function inflateAndCheck(ZipFile $z, array $r, int &$total): void
    {
        $actual = 0;
        $hash = hash_init('crc32b');
        $account = static function (string $chunk) use (&$actual, &$total, $r, $hash): void {
            $n = strlen($chunk);
            $actual += $n;
            $total += $n;
            if ($actual > $r['size'] || $total > self::MAX_UNCOMPRESSED || $actual > max(1, $r['compressed']) * self::MAX_RATIO) {
                self::limit();
            }
            hash_update($hash, $chunk);
        };
        if ($r['method'] === 0) {
            for ($i = 0; $i < $r['compressed']; $i += self::CHUNK) {
                $account($z->read($r['data'] + $i, min(self::CHUNK, $r['compressed'] - $i)));
            }
        } else {
            $ctx = inflate_init(ZLIB_ENCODING_RAW);
            if ($ctx === false) {
                throw new \RuntimeException('inflate_init failed');
            }
            for ($i = 0; $i < $r['compressed'] && inflate_get_status($ctx) !== ZLIB_STREAM_END; $i += self::CHUNK) {
                set_error_handler(static fn (): bool => true); // inflate_add warns on corrupt data and returns false
                try {
                    $out = inflate_add($ctx, $z->read($r['data'] + $i, min(self::CHUNK, $r['compressed'] - $i)));
                } finally {
                    restore_error_handler();
                }
                if ($out === false) {
                    self::bad('Invalid or truncated deflate stream');
                }
                if ($out !== '') {
                    $account($out);
                }
            }
            if (inflate_get_status($ctx) !== ZLIB_STREAM_END) {
                self::bad('Invalid or truncated deflate stream');
            }
            if (inflate_get_read_len($ctx) !== $r['compressed']) {
                self::bad('Trailing compressed data');
            }
        }
        if ($actual !== $r['size'] || hexdec(hash_final($hash)) !== $r['crc']) {
            self::bad('Actual size/CRC mismatch');
        }
    }
}
