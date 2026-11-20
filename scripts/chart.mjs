// Build-time SVG charts. renderChart(data) -> HTML string (figcaption, two inline SVG layouts, data table).
// Two SVGs are emitted (wide 600 / narrow 360 viewBox units); CSS shows one, so text stays ~13-14px
// rendered at every width instead of shrinking with the viewBox. Colours come only from CSS classes.
//
// data: { form: 'bar'|'column'|'interval', unit, title, caption, rows:[{label,value,low?,high?,note?,emphasis?}],
//         scale?: 'millions', order?: 'given', baseline?: number }

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const r1 = (n) => Math.round(n * 100) / 100;
const MINUS = '−';
const CH = 8.2; // approx px per character at 14px (sans labels)
const VCH = 8.2; // approx px per character of the 13px mono value labels (0.6em = 7.8px, plus slack)

const commas = (s) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
function decimalsOf(data) {
  let d = 0;
  for (const r of data.rows) for (const v of [r.value, r.low, r.high]) {
    if (typeof v !== 'number') continue;
    const s = String(v); const i = s.indexOf('.');
    if (i >= 0) d = Math.max(d, s.length - i - 1);
  }
  return d;
}
function makeFmt(data) {
  const dec = decimalsOf(data);
  const num = (v) => { const [a, b] = v.toFixed(dec).split('.'); return commas(a) + (b ? '.' + b : ''); };
  const signed = (v) => (v > 0 ? '+' : v < 0 ? MINUS : '') + num(Math.abs(v));
  // short form for the on-chart value label
  const short = (v) => {
    if (data.scale === 'millions') {
      if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
      return Math.round(v / 1e3) + 'K';
    }
    if (data.unit === '%') return num(v) + '%';
    if (data.unit === '×') return num(v) + '×';
    return num(v);
  };
  // full form with unit, for tooltips and the table
  const full = (v) => {
    if (data.unit === '%') return num(v) + '%';
    if (data.unit === '×') return num(v) + '×';
    if (data.form === 'interval') return signed(v) + ' ' + data.unit;
    return num(v) + ' ' + data.unit;
  };
  return { num, signed, short, full };
}

function barPath(x, y, w, h) { // square at the baseline (left), 4px round at the data end
  const r = Math.min(4, w / 2, h / 2);
  return `M${r1(x)} ${r1(y)}h${r1(w - r)}a${r} ${r} 0 0 1 ${r} ${r}v${r1(h - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${r}h${r1(-(w - r))}z`;
}
function colPath(x, y, w, h) { // square at the baseline (bottom), 4px round at the top
  const r = Math.min(4, w / 2, h);
  return `M${r1(x)} ${r1(y + h)}V${r1(y + r)}a${r} ${r} 0 0 1 ${r} ${-r}h${r1(w - 2 * r)}a${r} ${r} 0 0 1 ${r} ${r}V${r1(y + h)}z`;
}

function niceStep(range) {
  const raw = range / 5;
  for (const s of [1, 2, 5, 10, 20, 25, 50, 100]) if (raw <= s) return s;
  return 100;
}

function bar(data, W, F) {
  const hasEmph = data.rows.some((r) => r.emphasis);
  let rows = data.rows.map((r) => ({ ...r }));
  if (data.order !== 'given') rows.sort((a, b) => b.value - a.value);
  const labels = rows.map((r, i) => F.short(r.value) + (i === 0 && !['%', '×'].includes(data.unit) ? ' ' + data.unit : ''));
  const valW = Math.max(...labels.map((s) => s.length)) * VCH + 12;
  const X0 = 0, X1 = W - valW;
  const dmax = Math.max(...rows.map((r) => r.value), data.baseline || 0);
  const k = (X1 - X0) / dmax;
  const top = data.baseline != null ? 24 : 4, pitch = 46;
  const H = top + rows.length * pitch;
  let s = '';
  if (data.baseline != null) {
    const bx = r1(X0 + data.baseline * k);
    s += `<line class="cn-ref" x1="${bx}" x2="${bx}" y1="${top - 6}" y2="${H - 4}"/>`;
    s += `<text class="cn-tick" x="${bx}" y="12" text-anchor="middle">baseline ${Number.isInteger(data.baseline) ? data.baseline.toFixed(1) : data.baseline}</text>`;
  }
  rows.forEach((r, i) => {
    const y = top + i * pitch;
    const w = Math.max(2, r.value * k);
    const dim = (hasEmph && !r.emphasis ? ' dim' : '') + (r.tone ? ' tone-' + r.tone : '');
    const tip = `${r.label}: ${F.full(r.value)}${r.note ? ' (' + r.note + ')' : ''}`;
    s += `<g class="pt"><title>${esc(tip)}</title><rect class="cn-hit" x="0" y="${y - 2}" width="${W}" height="${pitch - 4}"/>`
      + `<text class="cn-lbl" x="0" y="${y + 14}">${esc(r.label)}</text>`
      + `<path class="cn-mark${dim}" d="${barPath(X0, y + 22, w, 14)}"/>`
      + `<text class="cn-val" x="${r1(X0 + w + 8)}" y="${y + 33}">${esc(labels[i])}</text></g>`;
  });
  return { H, s };
}

function column(data, W, F) {
  const rows = data.rows;
  const n = rows.length, slot = W / n, cw = Math.min(24, slot * 0.5);
  const top = 26, ph = 150, base = top + ph;
  const max = Math.max(...rows.map((r) => r.value));
  const split = slot < 64;
  let s = `<line class="cn-zero" x1="0" x2="${W}" y1="${base}" y2="${base}"/>`;
  rows.forEach((r, i) => {
    const cx = slot * i + slot / 2;
    const h = Math.max(2, (r.value / max) * ph);
    const dim = r.note ? ' dim' : '';
    const tip = `${r.label}: ${F.full(r.value)}${r.note ? ' (' + r.note + ')' : ''}`;
    let lab;
    if (split) { const [a, ...b] = r.label.split(' '); lab = `<tspan x="${r1(cx)}">${esc(a)}</tspan><tspan x="${r1(cx)}" dy="16">${esc(b.join(' '))}</tspan>`; }
    else lab = esc(r.label);
    s += `<g class="pt"><title>${esc(tip)}</title><rect class="cn-hit" x="${r1(slot * i)}" y="0" width="${r1(slot)}" height="${base + 40}"/>`
      + `<path class="cn-mark${dim}" d="${colPath(cx - cw / 2, base - h, cw, h)}"/>`
      + `<text class="cn-val" x="${r1(cx)}" y="${r1(base - h - 7)}" text-anchor="middle">${esc(F.short(r.value))}</text>`
      + `<text class="cn-lbl" x="${r1(cx)}" y="${base + 20}" text-anchor="middle">${lab}</text></g>`;
  });
  let H = base + (split ? 44 : 30);
  const notes = [...new Set(rows.filter((r) => r.note).map((r) => r.note))];
  if (notes.length) {
    s += `<text class="cn-tick" x="0" y="${H + 12}">Gray column: ${esc(notes.join(', '))}</text>`;
    H += 20;
  }
  return { H, s };
}

function interval(data, W, F) {
  const rows = data.rows, hasEmph = rows.some((r) => r.emphasis);
  // Wide: label in a left gutter on the same line as its dot and value.
  // Narrow: label directly above its own dot (tight), a larger gap before the next row.
  const wide = W >= 480;
  const gut = wide ? Math.max(...rows.map((r) => r.label.length)) * CH + 16 : 0;
  const valW = 56, top = 4, pitch = wide ? 36 : 50;
  const mx = 14, px0 = gut + mx, px1 = W - valW - mx;
  const lo = Math.min(0, ...rows.map((r) => r.low)), hi = Math.max(0, ...rows.map((r) => r.high));
  const step = niceStep(hi - lo);
  const t0 = Math.floor(lo / step) * step, t1 = Math.ceil(hi / step) * step;
  const k = (px1 - px0) / (t1 - t0);
  const X = (v) => r1(px0 + (v - t0) * k);
  const axisY = top + rows.length * pitch;
  let s = '';
  for (let t = t0; t <= t1 + 1e-9; t += step) {
    s += `<line class="${t === 0 ? 'cn-zero' : 'cn-grid'}" x1="${X(t)}" x2="${X(t)}" y1="${top}" y2="${axisY}"/>`
      + `<text class="cn-tick" x="${X(t)}" y="${axisY + 17}" text-anchor="middle">${t < 0 ? MINUS + Math.abs(t) : t}</text>`;
  }
  s += `<text class="cn-tick" x="${r1((px0 + px1) / 2)}" y="${axisY + 36}" text-anchor="middle">percentage points</text>`;
  rows.forEach((r, i) => {
    const y = top + i * pitch, cy = wide ? y + 18 : y + 25;
    const ly = wide ? cy + 5 : y + 13;
    const dim = hasEmph && !r.emphasis ? ' dim' : '';
    const tip = `${r.label}: ${F.full(r.value)} (95% interval ${F.signed(r.low)} to ${F.signed(r.high)})`;
    s += `<g class="pt"><title>${esc(tip)}</title><rect class="cn-hit" x="0" y="${y}" width="${W}" height="${pitch}"/>`
      + `<text class="cn-lbl" x="0" y="${ly}">${esc(r.label)}</text>`
      + `<text class="cn-val" x="${W - 2}" y="${cy + 5}" text-anchor="end">${esc(F.signed(r.value))}</text>`
      + `<line class="cn-int${dim}" x1="${X(r.low)}" x2="${X(r.high)}" y1="${cy}" y2="${cy}"/>`
      + `<circle class="cn-dot${dim}" cx="${X(r.value)}" cy="${cy}" r="5"/></g>`;
  });
  return { H: axisY + 44, s };
}

function table(data, F) {
  const iv = data.form === 'interval';
  const hasNote = data.rows.some((r) => r.note);
  let h = `<table><thead><tr><th scope="col">${data.form === 'column' ? 'Day' : 'Item'}</th><th scope="col" class="num">Value</th>`
    + (iv ? '<th scope="col" class="num">95% interval</th>' : '') + (hasNote ? '<th scope="col">Note</th>' : '') + '</tr></thead><tbody>';
  for (const r of data.rows) {
    const val = data.scale === 'millions' ? `${F.num(r.value)} ${data.unit}` : F.full(r.value);
    h += `<tr><td>${esc(r.label)}</td><td class="num">${esc(val)}</td>`
      + (iv ? `<td class="num">${esc(F.signed(r.low))} to ${esc(F.signed(r.high))}</td>` : '')
      + (hasNote ? `<td>${esc(r.note || '')}</td>` : '') + '</tr>';
  }
  return h + '</tbody></table>';
}

export function renderChart(data, name) {
  const F = makeFmt(data);
  const build = { bar, column, interval }[data.form];
  if (!build) throw new Error(`chart ${name}: unknown form "${data.form}"`);
  const svgs = [['wide', 600], ['narrow', 360]].map(([v, W]) => {
    const { H, s } = build(data, W, F);
    const id = `cn-${name}-${v}`;
    return `<svg class="cn-svg cn-${v}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="${id}" xmlns="http://www.w3.org/2000/svg">`
      + `<title id="${id}">${esc(data.title)}</title>${s}</svg>`;
  }).join('');
  return `<figcaption><span class="cn-title">${esc(data.title)}</span> ${esc(data.caption || '')}</figcaption>`
    + svgs
    + `<details class="cn-table"><summary>Data table</summary>${table(data, F)}</details>`;
}
