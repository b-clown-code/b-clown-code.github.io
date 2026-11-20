// Research library: tabs, catalog filter, topic graph (small in-house force sim), keyword "Ask".
// Vanilla TS, no dependencies. Data comes from the inline #rl-data JSON block.

type P = [number, string, string, number, string, string | null, number | null, number | null];
type T = [number, string, 0 | 1, string, string, number[]];
interface Data { cats: Record<string, string>; papers: P[]; topics: T[] }

const $ = <E extends Element = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector<E>(s);
const $$ = <E extends Element = HTMLElement>(s: string, r: ParentNode = document) => [...r.querySelectorAll<E>(s)];
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function initResearch(): void {
  const raw = $('#rl-data');
  if (!raw) return;
  const D = JSON.parse(raw.textContent!) as Data;
  const paper = new Map(D.papers.map((p) => [p[0], p]));
  const topic = new Map(D.topics.map((t) => [t[0], t]));
  const tabs = initTabs();
  initCatalog();
  const g = initGraph(D, paper, topic);
  initAsk(D, paper, topic, (id) => { tabs('explore'); g.focusTopic(id); });
}

function initTabs(): (k: string) => void {
  const bar = $('[data-rltabs]')!;
  const btns = $$<HTMLButtonElement>('[role=tab]', bar);
  const panels = $$('[data-panel]');
  bar.hidden = false;
  document.documentElement.classList.add('rl-js');
  const show = (k: string, focus = false) => {
    btns.forEach((b) => {
      const on = b.getAttribute('aria-controls') === `p-${k}`;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
    });
    panels.forEach((p) => { p.hidden = p.dataset.panel !== k; });
    window.dispatchEvent(new Event('rl:tab'));
  };
  bar.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[role=tab]');
    if (!b) return;
    const k = b.getAttribute('aria-controls')!.slice(2);
    show(k);
    history.replaceState(null, '', k === 'explore' ? location.pathname : `#${k}`);
  });
  bar.addEventListener('keydown', (e) => {
    const i = btns.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    show(btns[(i + d + btns.length) % btns.length].getAttribute('aria-controls')!.slice(2), true);
  });
  const h = location.hash.slice(1);
  show(['catalog', 'ask'].includes(h) ? h : 'explore');
  return (k) => show(k);
}

function pressGroup(el: HTMLElement, attr: string, on: (v: string) => void) {
  el.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>(`[data-${attr}]`);
    if (!b) return;
    $$(`[data-${attr}]`, el).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    on(b.dataset[attr]!);
  });
}

function initCatalog() {
  const box = $('[data-csearch]')!;
  box.hidden = false;
  const items = $$('[data-clist] > li');
  const q = $<HTMLInputElement>('#rl-q')!;
  const count = $('[data-ccount]')!;
  const groups = $$('.rl-filters', box);
  const oldest = Number($$<HTMLButtonElement>('[data-y]', box).filter((b) => /^\d+$/.test(b.dataset.y!)).pop()?.dataset.y ?? 0);
  let cat = 'all', yr = 'all';
  const apply = () => {
    const terms = q.value.toLowerCase().split(/\s+/).filter(Boolean);
    let n = 0;
    for (const li of items) {
      const y = Number(li.dataset.y);
      const ok = (cat === 'all' || li.dataset.c === cat)
        && (yr === 'all' || (yr === 'older' ? y < oldest : y === Number(yr)))
        && terms.every((t) => li.dataset.s!.includes(t));
      li.hidden = !ok;
      if (ok) n++;
    }
    count.textContent = `${n} of ${items.length} papers`;
  };
  pressGroup(groups[0], 'c', (v) => { cat = v; apply(); });
  pressGroup(groups[1], 'y', (v) => { yr = v; apply(); });
  q.addEventListener('input', apply);
  apply();
}

// ---------------------------------------------------------------- graph
interface N { id: number; kind: 'p' | 't'; r: number; x: number; y: number; vx: number; vy: number; cat: string; label: string; pin?: boolean }

function initGraph(D: Data, paper: Map<number, P>, topic: Map<number, T>) {
  const wrap = $('[data-graph]')!;
  const canvas = $<HTMLCanvasElement>('canvas', wrap)!;
  const hint = $('[data-hint]')!;
  const sheet = $('[data-sheet]')!;
  const ctx = canvas.getContext('2d')!;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const narrow = matchMedia('(max-width: 759px)');
  const TOP = 60;
  let cat = 'all';
  let open = new Set<number>();
  let sel: N | null = null;
  let hover: N | null = null;
  const nodes = new Map<string, N>();
  let links: [N, N][] = [];
  let W = 0, H = 0, alpha = 1, raf = 0;

  // Topic-topic links: a problem and a technique that share at least one paper.
  const topIds = D.topics.slice(0, TOP).map((t) => t[0]);
  const pair = new Map<string, number>();
  for (const p of D.papers) if (p[6] != null && p[7] != null && topIds.includes(p[6]) && topIds.includes(p[7])) {
    const k = `${p[6]}-${p[7]}`; pair.set(k, (pair.get(k) ?? 0) + 1);
  }

  const colors = () => {
    const s = getComputedStyle(document.documentElement);
    const v = (n: string) => s.getPropertyValue(n).trim();
    return { ai_ml_general: v('--teal'), neural_computer: v('--plum'), fpga: v('--clay'), ink: v('--ink'), sec: v('--sec'), line: v('--line-strong'), bg: v('--bg-card'), acc: v('--acc') } as Record<string, string>;
  };
  let C = colors();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { C = colors(); draw(); });

  const visible = (t: T) => cat === 'all' || t[3] === cat;
  function build() {
    const keep = new Map(nodes);
    nodes.clear();
    for (const id of topIds) {
      const t = topic.get(id)!;
      if (!visible(t)) continue;
      const k = `t${id}`;
      const old = keep.get(k);
      nodes.set(k, old ?? { id, kind: 't', r: 5 + Math.sqrt(t[5].length) * 3.2, x: W / 2 + (Math.random() - .5) * W * .6, y: H / 2 + (Math.random() - .5) * H * .6, vx: 0, vy: 0, cat: t[3], label: t[1] });
    }
    for (const id of open) {
      const tn = nodes.get(`t${id}`);
      if (!tn) continue;
      for (const pid of topic.get(id)![5]) {
        const p = paper.get(pid)!;
        if (cat !== 'all' && p[4] !== cat) continue;
        const k = `p${pid}`;
        if (!nodes.has(k)) nodes.set(k, keep.get(k) ?? { id: pid, kind: 'p', r: 4, x: tn.x + (Math.random() - .5) * 40, y: tn.y + (Math.random() - .5) * 40, vx: 0, vy: 0, cat: p[4], label: p[1] });
      }
    }
    links = [];
    for (const [k] of pair) {
      const [a, b] = k.split('-');
      const na = nodes.get(`t${a}`), nb = nodes.get(`t${b}`);
      if (na && nb) links.push([na, nb]);
    }
    for (const n of nodes.values()) if (n.kind === 'p') {
      const p = paper.get(n.id)!;
      for (const t of [p[6], p[7]]) { const tn = t != null && nodes.get(`t${t}`); if (tn) links.push([n, tn]); }
    }
    kick();
  }

  function tick() {
    const ns = [...nodes.values()];
    const k = alpha;
    for (let i = 0; i < ns.length; i++) {
      const a = ns[i];
      for (let j = i + 1; j < ns.length; j++) {
        const b = ns[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        let d2 = dx * dx + dy * dy || .01;
        if (d2 > 40000) continue;
        const d = Math.sqrt(d2), min = a.r + b.r + 6;
        const f = (900 / d2 + (d < min ? (min - d) * .5 : 0)) * k;
        dx /= d; dy /= d;
        a.vx -= dx * f; a.vy -= dy * f; b.vx += dx * f; b.vy += dy * f;
      }
    }
    for (const [a, b] of links) {
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
      const rest = a.kind === 'p' || b.kind === 'p' ? 34 : 90;
      const f = (d - rest) * .02 * k;
      a.vx += dx / d * f; a.vy += dy / d * f; b.vx -= dx / d * f; b.vy -= dy / d * f;
    }
    for (const n of ns) {
      n.vx += (W / 2 - n.x) * .004 * k; n.vy += (H / 2 - n.y) * .004 * k;
      if (n.pin) { n.vx = n.vy = 0; continue; }
      n.vx *= .6; n.vy *= .6;
      n.x = Math.max(n.r + 4, Math.min(W - n.r - 4, n.x + n.vx));
      n.y = Math.max(n.r + 4, Math.min(H - n.r - 4, n.y + n.vy));
    }
    alpha *= .985;
  }

  function draw() {
    const dpr = devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const focus = sel ?? hover;
    const near = new Set<N>();
    if (focus) { near.add(focus); for (const [a, b] of links) { if (a === focus) near.add(b); if (b === focus) near.add(a); } }
    ctx.lineWidth = 1;
    for (const [a, b] of links) {
      const on = focus && (a === focus || b === focus);
      ctx.strokeStyle = C.line;
      ctx.globalAlpha = focus ? (on ? .9 : .12) : .45;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    for (const n of nodes.values()) {
      ctx.globalAlpha = focus && !near.has(n) ? .25 : 1;
      ctx.fillStyle = C[n.cat] ?? C.sec;
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      if (n.kind === 't') { ctx.fill(); } else { ctx.fillStyle = C.bg; ctx.fill(); ctx.strokeStyle = C[n.cat] ?? C.sec; ctx.lineWidth = 1.5; ctx.stroke(); }
      if (n === sel) { ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 3, 0, Math.PI * 2); ctx.stroke(); }
      if (open.has(n.id) && n.kind === 't') { ctx.strokeStyle = C.acc; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 3, 0, Math.PI * 2); ctx.stroke(); }
    }
    ctx.globalAlpha = 1;
    ctx.font = '500 11.5px "Instrument Sans", system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    for (const n of nodes.values()) {
      const show = n === focus || (focus ? near.has(n) && n.kind === 't' : n.kind === 't' && n.r > 14);
      if (!show) continue;
      const t = n.label.length > 42 ? n.label.slice(0, 40) + '…' : n.label;
      const w = ctx.measureText(t).width;
      let x = n.x + n.r + 5;
      if (x + w > W - 4) x = n.x - n.r - 5 - w;
      ctx.fillStyle = C.bg; ctx.globalAlpha = .85; ctx.fillRect(x - 2, n.y - 8, w + 4, 16);
      ctx.globalAlpha = 1; ctx.fillStyle = n === focus ? C.ink : C.sec; ctx.fillText(t, x, n.y);
    }
  }

  const loop = () => { tick(); draw(); raf = alpha > .02 ? requestAnimationFrame(loop) : 0; };
  function kick(a = .8) {
    alpha = Math.max(alpha, a);
    if (reduce.matches) { for (let i = 0; i < 300 && alpha > .02; i++) tick(); draw(); return; }
    if (!raf) raf = requestAnimationFrame(loop);
  }

  function size() {
    const r = wrap.getBoundingClientRect();
    if (!r.width) return;
    const dpr = devicePixelRatio || 1;
    const sx = W ? r.width / W : 1, sy = H ? r.height / H : 1;
    W = r.width; H = r.height;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
    for (const n of nodes.values()) { n.x *= sx; n.y *= sy; }
    if (!nodes.size) build(); else kick(.3);
  }

  const hit = (x: number, y: number) => {
    let best: N | null = null, bd = Infinity;
    for (const n of nodes.values()) { const d = Math.hypot(n.x - x, n.y - y); if (d < n.r + 6 && d < bd) { best = n; bd = d; } }
    return best;
  };
  const pos = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  let drag: N | null = null, moved = false;
  canvas.addEventListener('pointerdown', (e) => { const [x, y] = pos(e); drag = hit(x, y); moved = false; if (drag) { drag.pin = true; canvas.setPointerCapture(e.pointerId); } });
  canvas.addEventListener('pointermove', (e) => {
    const [x, y] = pos(e);
    if (drag) { moved = true; drag.x = x; drag.y = y; kick(.3); return; }
    const h = hit(x, y);
    if (h !== hover) { hover = h; canvas.style.cursor = h ? 'pointer' : 'default'; if (!raf) draw(); }
  });
  canvas.addEventListener('pointerup', () => {
    if (drag && !moved) select(drag);
    if (drag) drag.pin = false;
    drag = null;
  });
  canvas.addEventListener('pointerleave', () => { hover = null; if (!raf) draw(); });

  function select(n: N) {
    sel = n;
    if (n.kind === 't') {
      if (open.has(n.id)) open.delete(n.id); else open.add(n.id);
      build();
      showTopic(n.id);
    } else { showPaper(n.id); }
    if (!raf) draw();
  }

  const topicLink = (id: number | null) => {
    if (id == null) return '';
    const t = topic.get(id)!;
    return `<button type="button" class="rl-chip" data-topic="${id}"><span class="rl-k">${t[2] ? 'technique' : 'problem'}</span> ${esc(t[1])}</button>`;
  };
  function showTopic(id: number) {
    const t = topic.get(id)!;
    const ps = t[5].map((p) => paper.get(p)!).sort((a, b) => b[3] - a[3]);
    const rel = new Map<number, number>();
    for (const p of ps) { const o = t[2] ? p[6] : p[7]; if (o != null) rel.set(o, (rel.get(o) ?? 0) + 1); }
    sheet.innerHTML = `<p class="rl-k">${t[2] ? 'Technique family' : 'Problem'}</p><h3>${esc(t[1])}</h3>`
      + (t[4] ? `<p class="rl-desc">${esc(t[4])}</p>` : '')
      + `<p class="rl-l">${ps.length} paper${ps.length === 1 ? '' : 's'}</p><ul class="rl-sl">${ps.map((p) => `<li><button type="button" data-paper="${p[0]}">${esc(p[1])}</button> <span class="rl-y">${p[3]}</span></li>`).join('')}</ul>`
      + (rel.size ? `<p class="rl-l">Paired ${t[2] ? 'problems' : 'techniques'}</p><p class="rl-chips">${[...rel.keys()].map(topicLink).join('')}</p>` : '');
  }
  function showPaper(id: number) {
    const p = paper.get(id)!;
    sheet.innerHTML = `<p class="rl-k">Paper · ${p[3]} · ${esc(D.cats[p[4]] ?? '')}</p><h3>${esc(p[1])}</h3><p class="rl-desc">${esc(p[2])}</p>`
      + (p[5] ? `<p><a class="rl-out" href="${esc(p[5])}" rel="noopener">${p[5].includes('arxiv') ? 'arXiv' : 'DOI'}: ${esc(p[5].replace(/^https:\/\/(arxiv\.org\/abs\/|doi\.org\/)/, ''))} <span aria-hidden="true">↗</span></a></p>` : '<p class="rl-noid">No public identifier</p>')
      + `<p class="rl-l">Classified under</p><p class="rl-chips">${topicLink(p[6])}${topicLink(p[7])}</p>`;
  }
  sheet.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-paper],[data-topic]');
    if (!b) return;
    if (b.dataset.paper) { const id = +b.dataset.paper; sel = nodes.get(`p${id}`) ?? null; showPaper(id); }
    else focusTopic(+b.dataset.topic!);
    if (!raf) draw();
  });
  $('[data-toplist]')!.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-topic]');
    if (b) { focusTopic(+b.dataset.topic!); sheet.scrollIntoView({ block: 'nearest', behavior: reduce.matches ? 'auto' : 'smooth' }); }
  });
  pressGroup($('[data-gcats]')!, 'c', (v) => { cat = v; sel = null; build(); });

  function focusTopic(id: number) {
    const n = nodes.get(`t${id}`);
    if (n) { if (!open.has(id)) { open.add(id); build(); } sel = n; }
    showTopic(id);
    if (!raf) draw();
  }

  // Graph is for wide screens; phones get the topic list and the sheet.
  const mode = () => {
    const graph = !narrow.matches;
    wrap.hidden = !graph;
    if (graph) { size(); hint.hidden = true; }
  };
  narrow.addEventListener('change', mode);
  new ResizeObserver(() => { if (!wrap.hidden) size(); }).observe(wrap);
  window.addEventListener('rl:tab', () => { if (!wrap.hidden) size(); });
  mode();
  return { focusTopic };
}

// ---------------------------------------------------------------- ask (ranked keyword search)
function initAsk(D: Data, paper: Map<number, P>, topic: Map<number, T>, goTopic: (id: number) => void) {
  const box = $('[data-ask]')!;
  box.hidden = false;
  const q = $<HTMLInputElement>('#rl-ask-q')!;
  const out = $('[data-askres]')!;
  const STOP = new Set('a an and are as at be by do does for from how in is it of on or the to what which with about any papers paper library'.split(' '));
  const tok = (s: string) => s.toLowerCase().replace(/[^a-z0-9+-]+/g, ' ').split(' ').filter((w) => w.length > 1 && !STOP.has(w));
  const stem = (w: string) => w.replace(/(ing|es|s)$/, '');
  const docs = [
    ...D.topics.map((t) => ({ kind: 't' as const, id: t[0], w: 2, text: `${t[1]} ${t[1]} ${t[4]}` })),
    ...D.papers.map((p) => ({ kind: 'p' as const, id: p[0], w: 1, text: `${p[1]} ${p[6] != null ? topic.get(p[6])![1] : ''} ${p[7] != null ? topic.get(p[7])![1] : ''}` })),
  ].map((d) => ({ ...d, toks: tok(d.text).map(stem) }));
  const df = new Map<string, number>();
  docs.forEach((d) => new Set(d.toks).forEach((t) => df.set(t, (df.get(t) ?? 0) + 1)));
  let timer = 0;
  const run = () => {
    const qt = [...new Set(tok(q.value).map(stem))];
    if (!qt.length) { out.innerHTML = ''; return; }
    const scored = docs.map((d) => {
      let s = 0;
      for (const t of qt) { const c = d.toks.filter((x) => x === t).length; if (c) s += (1 + Math.log(c)) * Math.log(docs.length / df.get(t)!); }
      return { d, s: s * d.w / Math.sqrt(d.toks.length || 1) };
    }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
    const ts = scored.filter((x) => x.d.kind === 't').slice(0, 4);
    const ps = scored.filter((x) => x.d.kind === 'p').slice(0, 8);
    if (!ts.length && !ps.length) { out.innerHTML = '<p class="rl-note">No matches in titles or topic names. Try fewer or broader words.</p>'; return; }
    out.innerHTML = (ts.length ? `<p class="rl-l">Topics</p><p class="rl-chips">${ts.map(({ d }) => { const t = topic.get(d.id)!; return `<button type="button" class="rl-chip" data-topic="${d.id}"><span class="rl-k">${t[2] ? 'technique' : 'problem'}</span> ${esc(t[1])} <span class="rl-n">${t[5].length}</span></button>`; }).join('')}</p>` : '')
      + (ps.length ? `<p class="rl-l">Papers, best match first</p><ol class="rl-sl">${ps.map(({ d }) => { const p = paper.get(d.id)!; return `<li>${p[5] ? `<a href="${esc(p[5])}" rel="noopener">${esc(p[1])}</a>` : esc(p[1])} <span class="rl-y">${p[3]}</span></li>`; }).join('')}</ol>` : '');
  };
  q.addEventListener('input', () => { clearTimeout(timer); timer = window.setTimeout(run, 120); });
  out.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-topic]');
    if (b) goTopic(+b.dataset.topic!);
  });
}
