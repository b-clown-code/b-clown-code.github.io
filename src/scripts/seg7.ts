// Three-digit seven-segment display, as on the board (hundreds, tens, ones via bin2bcd).
// Shared by the pipeline view and the front panel. `null` blanks every digit.
const SVGNS = 'http://www.w3.org/2000/svg';
const SEGS: Record<string, string> = { a: 'M4,2 h16 l-3,3 h-10z', b: 'M21,3 v15 l-3,-2 v-10z', c: 'M21,21 v15 l-3,-3 v-10z', d: 'M4,37 h16 l-3,-3 h-10z', e: 'M3,21 v15 l3,-3 v-10z', f: 'M3,3 v15 l3,-2 v-10z', g: 'M5,19.5 l2,-2 h10 l2,2 l-2,2 h-10z' };
const DIG = ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'acdefg', 'abc', 'abcdefg', 'abcdfg'];

export function seg7(svg: SVGSVGElement | Element): (value: number | null, label: string) => void {
  const digits: SVGPathElement[][] = [];
  for (let d = 0; d < 3; d++) {
    const g = document.createElementNS(SVGNS, 'g');
    g.setAttribute('transform', `translate(${8 + d * 42},12) scale(1.3)`);
    const arr: SVGPathElement[] = [];
    for (const k of 'abcdefg') {
      const p = document.createElementNS(SVGNS, 'path');
      p.setAttribute('d', SEGS[k]); p.setAttribute('class', 's'); p.dataset.k = k;
      g.append(p); arr.push(p);
    }
    svg.append(g); digits.push(arr);
  }
  return (value, label) => {
    const ds = value == null ? [-1, -1, -1] : [Math.floor(value / 100), Math.floor(value / 10) % 10, value % 10];
    ds.forEach((dg, i) => digits[i].forEach((p) => p.classList.toggle('on', dg >= 0 && DIG[dg].includes(p.dataset.k!))));
    svg.setAttribute('aria-label', label);
  };
}
