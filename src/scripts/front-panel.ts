// Browser controller for the front panel (switch mode) in src/components/cpu/FrontPanel.astro.
// All machine behaviour comes from src/lib/cpu/single.ts; this file only keeps the switches, the log and the drawing.
import { decode, bin } from '../lib/cpu/isa';
import { panelPowerOn, clockIn, PANEL_LEDS, CHALLENGES, type PanelState, type Effect } from '../lib/cpu/single';
import { seg7 } from './seg7';

const LOG_MAX = 40;

export function mountPanel(root: HTMLElement) {
  const $ = <T extends Element = HTMLElement>(sel: string) => root.querySelector(sel) as T;
  const $$ = <T extends Element = HTMLElement>(sel: string) => [...root.querySelectorAll(sel)] as T[];

  let s: PanelState = panelPowerOn();
  let sw = 0;
  let last: Effect | null = null;
  const log: { n: number; word: number; text: string; eff: Effect }[] = [];
  const solved = new Map<string, number>();
  const drawSeg = seg7($('[data-fp-seg7]'));
  const switches = $$<HTMLButtonElement>('[data-sw]');

  // static LED row: LD15 = SWmode, LD11..LD9 = jumpLimit[2:0] after reset
  $$('[data-ld]').forEach((l) => l.classList.toggle('on', ((PANEL_LEDS >> Number(l.dataset.ld)) & 1) === 1));

  const fieldsHtml = (w: number) => {
    const b = bin(w, 16);
    return `<span class="c-f">${b.slice(0, 5)}</span> <span class="c-t">${b.slice(5, 8)}</span> <span class="c-i">${b.slice(8, 10)}</span><span class="c-a">${b.slice(10, 13)}</span><span class="c-b">${b.slice(13)}</span>`;
  };

  function render() {
    switches.forEach((b) => {
      const on = ((sw >> Number(b.dataset.sw)) & 1) === 1;
      b.setAttribute('aria-checked', String(on));
    });
    const d = decode(sw);
    $('[data-fp-asm]').textContent = d.text;
    $('[data-fp-bits]').innerHTML = fieldsHtml(sw);
    $('[data-fp-next]').textContent = sw === 0 ? 'Press BTNC: NOP, no effect' : `Press BTNC: ${clockIn(s, sw).effect.text}`;
    drawSeg(s.display, `Seven-segment display showing ${s.display}`);

    const led = (k: string, on: boolean) => $(`[data-fp-led="${k}"]`).classList.toggle('on', on);
    led('wr', last?.wrote !== undefined);
    led('mem', last?.memAddr !== undefined);
    led('unst', !!last?.unstable);

    $('[data-fp-regs]').replaceChildren(...s.regs.map((v, r) => {
      const li = document.createElement('li');
      if (last?.wrote === r) li.className = 'w';
      li.innerHTML = `<span class="rn">R${r}</span><span class="rv">${v}<small>${bin(v, 8)}</small></span>`;
      return li;
    }));

    $('[data-fp-count]').textContent = `${s.clocks} press${s.clocks === 1 ? '' : 'es'}`;
    $('[data-fp-log]').replaceChildren(...log.map((e) => {
      const li = document.createElement('li');
      if (e.eff.unstable) li.className = 'unst'; else if (e.eff.noEffect) li.className = 'nop';
      li.innerHTML = `<span class="lg-n">${e.n}</span><span class="lg-w">${bin(e.word, 16).replace(/(\d{4})(?=\d)/g, '$1 ')}</span><span class="lg-a"></span><span class="lg-e"></span>`;
      li.querySelector('.lg-a')!.textContent = decode(e.word).text;
      li.querySelector('.lg-e')!.textContent = e.text;
      return li;
    }));

    $('[data-fp-ch]').replaceChildren(...CHALLENGES.map((c) => {
      const li = document.createElement('li');
      const at = solved.get(c.id);
      li.className = at !== undefined ? 'done' : '';
      li.innerHTML = `<span class="ch-led" aria-hidden="true"></span><div><p class="ch-t"></p><p class="ch-g"></p><p class="ch-s"></p><details><summary>Hint</summary><p></p></details></div>`;
      li.querySelector('.ch-t')!.textContent = c.title;
      li.querySelector('.ch-g')!.textContent = c.goal;
      li.querySelector('.ch-s')!.textContent = at !== undefined ? `Solved in ${at} press${at === 1 ? '' : 'es'} (par ${c.par}).` : `Par: ${c.par} presses.`;
      li.querySelector('details p')!.textContent = c.hint;
      return li;
    }));
    $('[data-fp-score]').textContent = `${solved.size} of ${CHALLENGES.length} solved`;
  }

  function clock() {
    const r = clockIn(s, sw);
    s = r.state; last = r.effect;
    log.unshift({ n: s.clocks, word: sw, text: r.effect.text, eff: r.effect });
    if (log.length > LOG_MAX) log.pop();
    for (const c of CHALLENGES) if (!solved.has(c.id) && c.done(s)) solved.set(c.id, s.clocks);
    render();
    const btn = $<HTMLButtonElement>('[data-fp="clock"]');
    btn.classList.remove('flash'); void btn.offsetWidth; btn.classList.add('flash');
  }

  function setWord(text: string): boolean {
    const t = text.trim().replace(/[\s_]/g, '');
    let w: number | null = null;
    if (/^[01]{16}$/.test(t)) w = parseInt(t, 2);
    else if (/^0x[0-9a-f]{1,4}$/i.test(t)) w = parseInt(t.slice(2), 16);
    const err = $('[data-fp-err]');
    if (w === null) { err.textContent = 'Enter 16 binary digits (spaces allowed) or a hex word such as 0x412A.'; return false; }
    err.textContent = '';
    sw = w; render();
    return true;
  }

  root.addEventListener('click', (ev) => {
    const t = ev.target as HTMLElement;
    const b = t.closest<HTMLButtonElement>('[data-sw]');
    if (b) { sw ^= 1 << Number(b.dataset.sw); render(); return; }
    const act = t.closest<HTMLElement>('[data-fp]')?.dataset.fp;
    if (act === 'clock') clock();
    else if (act === 'zero') { sw = 0; render(); }
    else if (act === 'power') { s = panelPowerOn(); last = null; log.length = 0; render(); }
  });
  $<HTMLFormElement>('[data-fp-form]').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const input = $<HTMLInputElement>('[data-fp-word]');
    if (setWord(input.value)) input.select();
  });
  // Arrow keys move between switches, like a radio group; Space or Enter toggles (native button behaviour).
  $('[data-fp-sws]').addEventListener('keydown', (ev) => {
    const i = switches.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    const d = ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    ev.preventDefault(); ev.stopPropagation();
    switches[(i + d + switches.length) % switches.length].focus();
  });

  render();
}
