#!/usr/bin/env python3
"""Turn one specimen sample per ancient language into SVG path data, so the corpus tile on the home and
projects pages never depends on the visitor having the right fonts.

Run:  python3 scripts/gen_glyphs.py <dir-with-noto-woff-files>
Writes src/components/visuals/glyphs.json. The fonts are Noto (SIL OFL 1.1) and are not shipped, only outlines
derived from them. Needs fontTools. Re-run only if the sample set changes.
"""
import json, sys
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.transformPen import TransformPen

SAMPLES = [  # (language code as in the V9 receipts, display name, text, font file)
    ('lat', 'Latin', 'Ave', 'noto-serif-latin-400-normal.woff'),
    ('grc', 'Ancient Greek', 'λόγος', 'noto-serif-greek-400-normal.woff'),
    ('san', 'Sanskrit', 'ॐ', 'noto-sans-devanagari-devanagari-400-normal.woff'),
    ('syr', 'Syriac', 'ܐ', 'noto-sans-syriac-syriac-400-normal.woff'),
    ('akk', 'Akkadian', '𒀭', 'noto-sans-cuneiform-cuneiform-400-normal.woff'),
    ('egy', 'Egyptian', '𓂀', 'noto-sans-egyptian-hieroglyphs-egyptian-hieroglyphs-400-normal.woff'),
    ('cop', 'Coptic', 'ⲁⲃ', 'noto-sans-coptic-coptic-400-normal.woff'),
]
BOX_W, BOX_H, PAD = 72, 56, 6

def outline(font, text):
    """Combined glyph outline for `text` laid out left to right with plain advances (no shaping needed here)."""
    cmap, gs, hmtx = font.getBestCmap(), font.getGlyphSet(), font['hmtx']
    items, x = [], 0
    for ch in text:
        g = cmap.get(ord(ch))
        if g is None:
            raise SystemExit(f'{font.reader.file.name if hasattr(font.reader.file, "name") else "font"}: no glyph for U+{ord(ch):04X}')
        items.append((g, x)); x += hmtx[g][0]
    bp = BoundsPen(gs)
    for g, dx in items:
        gs[g].draw(TransformPen(bp, (1, 0, 0, 1, dx, 0)))
    return gs, items, bp.bounds

def main(fontdir):
    out = []
    for code, name, text, fn in SAMPLES:
        font = TTFont(Path(fontdir) / fn)
        gs, items, (x0, y0, x1, y1) = outline(font, text)
        s = min((BOX_W - 2 * PAD) / (x1 - x0), (BOX_H - 2 * PAD) / (y1 - y0))
        ox = (BOX_W - (x1 - x0) * s) / 2 - x0 * s
        oy = (BOX_H - (y1 - y0) * s) / 2 + y1 * s   # flip y: font units point up, SVG down
        pen = SVGPathPen(gs, ntos=lambda v: f'{v:.1f}'.rstrip('0').rstrip('.'))
        for g, dx in items:
            gs[g].draw(TransformPen(pen, (s, 0, 0, -s, ox + dx * s, oy)))
        out.append({'code': code, 'name': name, 'sample': text, 'd': pen.getCommands()})
    dest = Path(__file__).resolve().parent.parent / 'src' / 'components' / 'visuals' / 'glyphs.json'
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps({'w': BOX_W, 'h': BOX_H, 'glyphs': out}, ensure_ascii=False, indent=1) + '\n')
    print('wrote', dest.relative_to(dest.parents[3]), f'({dest.stat().st_size} bytes)')

if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '.')
