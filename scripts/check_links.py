#!/usr/bin/env python3
"""Check internal links/anchors resolve inside dist/ and external links are on the allowlist.
Uses BASE_PATH (default "/") like the build does. External URLs are never fetched."""
import os, re, sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit, unquote

DIST = Path(__file__).resolve().parent.parent / 'dist'
BASE = os.environ.get('BASE_PATH') or '/'
BASE = ('/' + BASE.strip('/') + '/') if BASE.strip('/') else '/'

EXT_PREFIXES = [
    'https://github.com/b-clown-code/verilog-llm',
    'https://github.com/b-clown-code/ancient-text-research',
    'https://github.com/b-clown-code/8-bit-verilog-processor',
    'https://github.com/b-clown-code',
    'https://www.linkedin.com/in/brandon-treglown-443910202',
    'https://sites.google.com/view/brandon-oldportfolio',
    # research library: paper identifiers only
    'https://arxiv.org/abs',
    'https://doi.org',
]

class P(HTMLParser):
    def __init__(self):
        super().__init__(); self.links = []; self.ids = set()
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if a.get('id'): self.ids.add(a['id'])
        if tag == 'a' and a.get('name'): self.ids.add(a['name'])
        for k in ('href', 'src'):
            if a.get(k) and tag != 'link' or (tag == 'link' and k == 'href' and a.get(k)):
                self.links.append((tag, a[k]))

def parse(path):
    p = P(); p.feed(path.read_text(errors='replace')); return p

def main() -> int:
    if not DIST.is_dir():
        print('dist/ missing: run npm run build first'); return 1
    pages = {f: parse(f) for f in DIST.rglob('*.html')}
    bad = 0; n = 0
    for f, p in pages.items():
        rel = f.relative_to(DIST)
        for tag, href in p.links:
            n += 1
            if href.startswith('data:') or href.startswith('#') and len(href) == 1:
                continue
            u = urlsplit(href)
            if u.scheme in ('http', 'https'):
                if not any(href == e or href.startswith(e + '/') or href.startswith(e + '#') or href.startswith(e + '?') for e in EXT_PREFIXES):
                    print(f'{rel}: external link not allowlisted: {href}'); bad += 1
                continue
            if u.scheme == 'mailto':
                continue
            if u.scheme:
                print(f'{rel}: unexpected scheme: {href}'); bad += 1; continue
            if u.path == '':
                target, ids = f, p.ids
            else:
                path = u.path
                if not path.startswith('/'):
                    print(f'{rel}: relative link (use base-aware absolute): {href}'); bad += 1; continue
                if not path.startswith(BASE):
                    print(f'{rel}: internal link outside base {BASE}: {href}'); bad += 1; continue
                local = unquote(path[len(BASE):])
                target = DIST / local
                if target.is_dir() or local == '' or local.endswith('/'):
                    target = target / 'index.html'
                if not target.is_file():
                    print(f'{rel}: broken link {href}'); bad += 1; continue
                ids = pages[target].ids if target in pages else set()
            if u.fragment and (target.suffix == '.html') and u.fragment not in ids:
                print(f'{rel}: missing anchor #{u.fragment} in {target.relative_to(DIST)} (from {href})'); bad += 1
    print('check:links', 'FAILED' if bad else f'ok ({n} links, base {BASE})')
    return 1 if bad else 0

if __name__ == '__main__':
    sys.exit(main())
