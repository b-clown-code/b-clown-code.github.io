const raw = import.meta.env.BASE_URL || '/';
export const BASE = raw.endsWith('/') ? raw : raw + '/';
/** Prefix an absolute site path ("/projects/") with the configured base. */
export const url = (p: string) => BASE + p.replace(/^\//, '');

export function statusClass(status: string): string {
  const s = status.toLowerCase();
  if (s.startsWith('verified, with caveats')) return 'caveat';
  if (s.startsWith('verified')) return 'verified';
  if (s.startsWith('live')) return 'live';
  if (s.startsWith('null')) return 'off';
  if (s.startsWith('ongoing')) return 'ongoing';
  if (s.startsWith('data verified')) return 'caveat';
  return 'off';
}

/** Wrap the numbers in a short metric string so the stat block scans: returns [text, isNumber] parts. */
export function metricParts(metric: string): { t: string; n: boolean }[] {
  return metric.split(/(\d[\d,.]*[MK%×]?)/).filter(Boolean).map((t) => ({ t, n: /^\d/.test(t) }));
}
export const splitCaveat = (c: string) => c.replace(/^Caveat:\s*/i, '');
