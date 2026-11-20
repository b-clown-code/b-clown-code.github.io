#!/usr/bin/env python3
"""Fail if a number on a page is not backed by a claim listed in that page's frontmatter.

Every numeric token in the page body (and the `metric` frontmatter value) (after removing frontmatter, HTML comments,
URLs and link targets) must appear in the text/value of a claim whose id is in
the page's `claims` list, or in scripts/claims-allowlist.txt.
"""
import json, re, sys
from decimal import Decimal, InvalidOperation
from pathlib import Path
import yaml

ROOT = Path(__file__).resolve().parent.parent
CLAIMS = ROOT / 'content' / 'claims.yaml'
ALLOW = ROOT / 'scripts' / 'claims-allowlist.txt'
PAGES = sorted((ROOT / 'src' / 'content').rglob('*.md'))

# Not preceded by a letter/digit/dot, nor by "letters-" (so Zynq-7020, gq-000119 are identifiers, not numbers).
NUM = re.compile(r'(?<![A-Za-z0-9_.])(?<![A-Za-z]-)\d[\d,]*(?:\.\d+)?(k\b)?')

def norm(tok: str):
    t = tok.replace(',', '').rstrip('.')
    try:
        d = Decimal(t)
    except InvalidOperation:
        return t
    return format(d.normalize(), 'f')

def tokens(text: str):
    out = set()
    for m in NUM.finditer(text):
        t = m.group(0)
        if t.endswith('k'):  # "3.4k" also counts as 3400
            out.add(norm(str(Decimal(t[:-1].replace(',', '')) * 1000)))
        out.add(norm(t.rstrip('k')))
    return out

def flatten(v):
    if isinstance(v, dict):
        return ' '.join(flatten(x) for x in v.values())
    if isinstance(v, (list, tuple)):
        return ' '.join(flatten(x) for x in v)
    return '' if v is None else str(v)

def split_front(raw: str):
    m = re.match(r'^---\n(.*?)\n---\n', raw, re.S)
    return (yaml.safe_load(m.group(1)) or {}, raw[m.end():]) if m else ({}, raw)

def clean(body: str) -> str:
    body = re.sub(r'<!--.*?-->', ' ', body, flags=re.S)
    alts = ' '.join(re.findall(r'alt="([^"]*)"', body))
    body = re.sub(r'<[^>]+>', ' ', body)            # html tags (attrs hold sizes/paths)
    body = re.sub(r'\]\([^)]*\)', ']', body)         # markdown link targets
    body = re.sub(r'https?://\S+|mailto:\S+', ' ', body)
    body = re.sub(r'`[^`]*`', lambda m: m.group(0), body)
    body = re.sub(r'(?m)^\s*(#+\s*)?\d+\.\s+', r'\1', body)  # list / heading numbering
    body = re.sub(r'\{#[\w-]+\}', ' ', body)
    return body + ' ' + alts

def main() -> int:
    claims = {c['id']: c for c in yaml.safe_load(CLAIMS.read_text())}
    # allowlist lines: "<token>" (global) or "<page-slug> <token>" (that page only); '#' starts a comment
    allow, page_allow = set(), set()
    for line in ALLOW.read_text().splitlines():
        parts = line.split('#', 1)[0].split()
        if len(parts) == 1:
            allow.add(norm(parts[0]))
        elif len(parts) == 2:
            page_allow.add((parts[0], norm(parts[1])))
    bad = 0
    for p in PAGES:
        fm, body = split_front(p.read_text())
        rel = p.relative_to(ROOT)
        ids = fm.get('claims') or []
        missing = [i for i in ids if i not in claims]
        if missing:
            print(f'{rel}: unknown claim ids: {", ".join(missing)}'); bad += 1
        backed = set()
        for i in ids:
            c = claims.get(i)
            if c:
                backed |= tokens(flatten(c.get('text')) + ' ' + flatten(c.get('value')))
        # page-level text that is metadata, not body
        found = tokens(clean(body))
        for c in fm.get('cases') or []:
            found |= tokens(f"{c.get('tag', '')} {c.get('delta', '')}")  # audit-card badges are shown on the page
        if fm.get('metric'):
            found |= tokens(str(fm['metric']))  # metric frontmatter is shown on the projects index
        off = sorted(t for t in found if t not in backed and t not in allow and (p.stem, t) not in page_allow)
        if off:
            print(f'{rel}: numbers not backed by this page\'s claims: {", ".join(off)}'); bad += 1
    # chart data: every number (values, intervals, and numbers inside text fields)
    # must appear in the claims the data file lists
    data_files = sorted((ROOT / 'content' / 'data').glob('*.json'))
    for f in data_files:
        d = json.loads(f.read_text())
        rel = f.relative_to(ROOT)
        ids = d.get('claims') or []
        missing = [i for i in ids if i not in claims]
        if not ids or missing:
            print(f'{rel}: missing or unknown claims: {", ".join(missing) or "(none listed)"}'); bad += 1
            continue
        backed = set()
        for i in ids:
            backed |= tokens(flatten(claims[i].get('text')) + ' ' + flatten(claims[i].get('value')))
        found = set()
        for row in d.get('rows', []):
            for k in ('value', 'low', 'high'):
                if k in row:
                    found.add(norm(str(abs(row[k]))))
            found |= tokens(row.get('label', '') + ' ' + row.get('note', ''))
        found |= tokens(d.get('title', '') + ' ' + d.get('caption', ''))
        off = sorted(t for t in found if t not in backed and t not in allow and (f.stem, t) not in page_allow)
        if off:
            print(f'{rel}: numbers not backed by its claims: {", ".join(off)}'); bad += 1
    print('check:claims', 'FAILED' if bad else f'ok ({len(PAGES)} pages, {len(data_files)} chart data files)')
    return 1 if bad else 0

if __name__ == '__main__':
    sys.exit(main())
