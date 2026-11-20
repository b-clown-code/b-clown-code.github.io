#!/usr/bin/env python3
"""Fail if dist/ contains forbidden strings, or any JPEG carries EXIF data."""
import re, sys
from pathlib import Path
from PIL import Image

DIST = Path(__file__).resolve().parent.parent / 'dist'
SUBSTR = ['ts.net', '192.168.', '/mnt/', '/home/']
WORDS: list[str] = []  # whole words, case-insensitive
# Owner-specific hostnames, usernames and names live in an untracked file (one per line; "word:" prefix = whole word).
PRIVATE = Path(__file__).resolve().parent / 'scrub-private.txt'
if PRIVATE.is_file():
    for line in PRIVATE.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith('#'): continue
        (WORDS.append(line[5:]) if line.startswith('word:') else SUBSTR.append(line))
PHONE = re.compile(r'(?<!\d)(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?!\d)')
TEXT_EXT = {'.html', '.svg', '.css', '.js', '.json', '.txt', '.xml', '.map', '.webmanifest'}

def main() -> int:
    if not DIST.is_dir():
        print('dist/ missing: run npm run build first'); return 1
    bad = 0
    pats = [(s, re.compile(re.escape(s), re.I)) for s in SUBSTR]
    pats += [(w, re.compile(r'\b' + w + r'\b', re.I)) for w in WORDS]
    pats.append(('phone number', PHONE))
    files = [p for p in DIST.rglob('*') if p.is_file()]
    for p in files:
        rel = p.relative_to(DIST)
        if p.suffix.lower() in TEXT_EXT:
            txt = p.read_text(errors='replace')
            for name, rx in pats:
                if name == 'phone number' and p.suffix.lower() == '.svg':
                    continue  # SVG path data is full of digit runs; text in SVGs is covered by the other checks
                m = rx.search(txt)
                if m:
                    print(f'{rel}: forbidden "{name}" near: {txt[max(0, m.start()-30):m.end()+30]!r}'); bad += 1
        else:
            data = p.read_bytes()
            for s in SUBSTR:  # raw bytes of images etc.
                if s.encode().lower() in data.lower():
                    print(f'{rel}: forbidden "{s}" in binary'); bad += 1
        if p.suffix.lower() in {'.jpg', '.jpeg'}:
            with Image.open(p) as im:
                if len(im.getexif()) or 'exif' in im.info or 'xmp' in im.info:
                    print(f'{rel}: JPEG has EXIF/XMP metadata'); bad += 1
    print('check:scrub', 'FAILED' if bad else f'ok ({len(files)} files)')
    return 1 if bad else 0

if __name__ == '__main__':
    sys.exit(main())
