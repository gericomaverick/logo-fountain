# Story 1.8c: generates the /dev/ui/media fixture "logos" (tiny flat PNGs, stdlib only, no external
# sources). Re-run from this folder: python3 make-concepts.py . (then refresh the L7 baselines).
import os
import struct
import sys
import zlib

PAPER = (251, 249, 244)
INK = (21, 20, 18)
PURPLE = (81, 80, 247)
GOLD = (200, 140, 40)
GREEN = (23, 112, 74)


def png(path, w, h, draw):
    raw = b''.join(b'\x00' + b''.join(bytes(draw(x / w, y / h)) for x in range(w)) for y in range(h))

    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xFFFFFFFF)

    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
    print(path, os.path.getsize(path), 'bytes')


def disc(cx, cy, r_in, r_out, colour, aspect):
    return lambda x, y: colour if r_in ** 2 <= ((x - cx) * aspect) ** 2 + (y - cy) ** 2 <= r_out ** 2 else None


def bar(x0, y0, x1, y1, colour):
    return lambda x, y: colour if x0 <= x <= x1 and y0 <= y <= y1 else None


def layers(*shapes):
    def draw(x, y):
        for shape in shapes:
            c = shape(x, y)
            if c:
                return c
        return PAPER
    return draw


out = sys.argv[1] if len(sys.argv) > 1 else '.'
a = 4 / 3
png(f'{out}/concept-1-v1.png', 480, 360, layers(disc(0.5, 0.4, 0, 0.16, PURPLE, a), bar(0.3, 0.72, 0.7, 0.78, INK)))
png(f'{out}/concept-1-v2.png', 1200, 900, layers(disc(0.5, 0.4, 0, 0.05, GOLD, a), disc(0.5, 0.4, 0.1, 0.17, PURPLE, a), bar(0.28, 0.72, 0.72, 0.77, INK), bar(0.38, 0.81, 0.62, 0.83, INK)))
png(f'{out}/concept-2-v1.png', 480, 360, layers(bar(0.38, 0.22, 0.62, 0.3, GREEN), bar(0.32, 0.36, 0.68, 0.44, GREEN), bar(0.26, 0.5, 0.74, 0.58, INK), bar(0.36, 0.72, 0.64, 0.76, INK)))
png(f'{out}/concept-3-v1.png', 480, 360, layers(disc(0.5, 0.45, 0, 0.2, GOLD, a), bar(0.34, 0.76, 0.66, 0.8, INK)))
