// Rehype plugin used for all Markdown content:
//  1. prefixes internal absolute links/images (href="/x") with the site base path
//  2. turns a trailing "{#id}" in a heading into the heading id
//  3. marks numeric table columns with class "num" (right-aligned in CSS)
//  4. replaces <figure data-diagram="name"> with the inline SVG from src/diagrams/name.svg
//  5. fills <figure data-chart="name"></figure> with a build-time SVG chart from content/data/name.json (scripts/chart.mjs)
//  6. turns "**Lesson:** ..." paragraphs into labelled callouts, and (when the page frontmatter has `cases`) wraps each listed
//     h2 section in an audit card with a header bar (case index, tag, headline, delta badge)
import { readFileSync } from 'node:fs';
import { fromHtml } from 'hast-util-from-html';
import { renderChart } from './chart.mjs';

const NUMERIC = /^[~≈<>≥≤±+\u2212-]*\$?\d[\d,]*(\.\d+)?\s*(%|x|×|k|M|B|s|ms|GB|MB|KB|GiB|MiB)?$/;
const textOf = (n) => (n.type === 'text' ? n.value : (n.children || []).map(textOf).join(''));
function markNumericColumns(table) {
  const rows = [];
  walk(table, (n) => { if (n.type === 'element' && n.tagName === 'tr') rows.push(n.children.filter((c) => c.type === 'element')); });
  const body = rows.filter((r) => r.some((c) => c.tagName === 'td'));
  if (!body.length) return;
  const cols = Math.max(...rows.map((r) => r.length));
  for (let i = 0; i < cols; i++) {
    const cells = body.map((r) => r[i]).filter(Boolean);
    if (!cells.length || !cells.every((c) => NUMERIC.test(textOf(c).trim()))) continue;
    for (const r of rows) {
      const c = r[i]; if (!c) continue;
      const p = c.properties || (c.properties = {});
      p.className = [...(p.className || []), 'num'];
    }
  }
}

const chartHtml = (name) =>
  renderChart(JSON.parse(readFileSync(new URL(`../content/data/${name}.json`, import.meta.url), 'utf8')), name);

function walk(node, fn, parent = null) {
  fn(node, parent);
  if (node.children) for (const c of [...node.children]) walk(c, fn, node);
}

const el = (tagName, className, children = []) => ({ type: 'element', tagName, properties: className ? { className: [].concat(className) } : {}, children });
const txt = (value) => ({ type: 'text', value });
const isEl = (n, tag) => n.type === 'element' && n.tagName === tag;

function lessonCallouts(node) {
  if (!node.children) return;
  node.children = node.children.map((c) => {
    if (isEl(c, 'p')) {
      const kids = c.children;
      const first = kids.find((k) => !(k.type === 'text' && !k.value.trim()));
      if (first && isEl(first, 'strong') && /^Lesson:?$/.test(textOf(first).trim())) {
        const rest = kids.slice(kids.indexOf(first) + 1);
        if (rest[0]?.type === 'text') rest[0] = txt(rest[0].value.replace(/^\s+/, ''));
        return el('aside', 'lesson', [el('span', 'lesson-l', [txt('Lesson')]), el('p', null, rest)]);
      }
    } else lessonCallouts(c);
    return c;
  });
}

// Group root children into [intro, ...sections split at h2]; wrap sections named in `cases`.
function auditCards(root, cases) {
  const byId = new Map(cases.map((c) => [c.id, c]));
  const out = [];
  let cur = null, n = 0;
  const flush = () => { if (cur) out.push(cur.card); cur = null; };
  for (const node of root.children) {
    if (isEl(node, 'h2')) {
      flush();
      const c = byId.get(node.properties?.id);
      if (!c) { out.push(node); continue; }
      const practice = c.kind === 'practice';
      const label = practice ? 'Practice' : `Case ${String(++n).padStart(2, '0')}`;
      const head = el('header', 'audit-head', [
        el('p', 'case-meta', [el('span', 'case-no', [txt(label)]), el('span', 'case-tag', [txt(c.tag)])]),
        node,
        ...(c.delta ? [el('p', 'badge', [txt(c.delta)])] : []),
      ]);
      const body = el('div', 'audit-body', []);
      const card = el('section', 'audit', [head, body]);
      card.properties['aria-labelledby'] = node.properties.id;
      cur = { card, body };
    } else if (cur) cur.body.children.push(node);
    else out.push(node);
  }
  flush();
  root.children = out;
}

export function rehypeSitePlugins({ base }) {
  const prefix = base === '/' ? '' : base.replace(/\/$/, '');
  return (tree, file) => {
    walk(tree, (node) => {
      // Raw HTML written in the Markdown arrives as 'raw' nodes (parsed later by rehype-raw).
      if (node.type === 'raw' && typeof node.value === 'string') {
        node.value = node.value
          .replace(/(\s(?:src|href)=")\/(?!\/)/g, `$1${prefix}/`)
          .replace(/<figure([^>]*\sdata-chart="([\w-]+)"[^>]*)>\s*<\/figure>/g, (_m, attrs, name) =>
            `<figure${attrs} class="chart-native">${chartHtml(name)}</figure>`)
          .replace(/(<figure[^>]*\sdata-diagram="([\w-]+)"[^>]*>)/g, (_m, open, name) =>
            open + readFileSync(new URL(`../src/diagrams/${name}.svg`, import.meta.url), 'utf8'));
        return;
      }
      if (node.type !== 'element') return;
      const p = node.properties || {};
      for (const attr of ['href', 'src']) {
        const v = p[attr];
        if (typeof v === 'string' && v.startsWith('/') && !v.startsWith('//')) {
          p[attr] = prefix + v;
        }
      }
      if (node.tagName === 'table') markNumericColumns(node);
      if (/^h[1-6]$/.test(node.tagName)) {
        const last = node.children[node.children.length - 1];
        if (last && last.type === 'text') {
          const m = last.value.match(/\s*\{#([A-Za-z0-9_-]+)\}\s*$/);
          if (m) {
            last.value = last.value.slice(0, m.index);
            p.id = m[1];
            node.properties = p;
          }
        }
      }
      if (node.tagName === 'figure' && p.dataChart) {
        const frag = fromHtml(chartHtml(p.dataChart), { fragment: true });
        node.properties.className = [...(p.className || []), 'chart-native'];
        node.children = frag.children;
      }
      if (node.tagName === 'figure' && p.dataDiagram) {
        const svg = readFileSync(new URL(`../src/diagrams/${p.dataDiagram}.svg`, import.meta.url), 'utf8');
        const frag = fromHtml(svg, { fragment: true, space: 'svg' });
        node.children = [...frag.children, ...node.children];
      }
    });
    lessonCallouts(tree);
    const cases = file?.data?.astro?.frontmatter?.cases;
    if (Array.isArray(cases) && cases.length) auditCards(tree, cases);
  };
}
