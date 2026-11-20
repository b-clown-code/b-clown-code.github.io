"""Aggregate the gpuq event log into the counts used on the site.

Usage: python3 scripts/gpuq_stats.py [--log PATH] [--cutoff ISO8601]
Default log: ~/.local/state/gpuq/events.jsonl. Prints JSON with counts only
(no job rows, actors, commands or paths). Days are America/Phoenix dates.
"""
import argparse, json, os, collections
from datetime import datetime, timezone, timedelta

PHX = timezone(timedelta(hours=-7))  # Arizona: no DST
TERMINAL = ['COMPLETED', 'FAILED', 'CANCELLED', 'TIMED_OUT', 'INTERRUPTED']

ap = argparse.ArgumentParser()
ap.add_argument('--log', default=os.path.expanduser('~/.local/state/gpuq/events.jsonl'))
ap.add_argument('--cutoff', default='2026-11-17T00:00:00+00:00')
a = ap.parse_args()
cut = datetime.fromisoformat(a.cutoff).timestamp()

ev = [json.loads(l) for l in open(a.log) if l.strip()]
ev = [e for e in ev if e.get('job_id') is not None and e.get('to') and e['ts'] < cut]
ev.sort(key=lambda e: (e['job_id'], e['ts']))
jobs = collections.defaultdict(list)
for e in ev:
    jobs[e['job_id']].append(e)

last, per_day, run_s = collections.Counter(), collections.Counter(), 0.0
for jid, es in jobs.items():
    sub = next((e for e in es if e['to'] == 'SUBMITTED'), None)
    if sub is None:
        continue
    per_day[datetime.fromtimestamp(sub['ts'], PHX).date().isoformat()] += 1
    state = es[-1]['to']
    last[state] += 1
    for i, e in enumerate(es):
        if e['to'] == 'RUNNING':
            end = es[i + 1]['ts'] if i + 1 < len(es) else cut
            run_s += end - e['ts']

out = {
    'cutoff_utc': datetime.fromtimestamp(cut, timezone.utc).isoformat(),
    'jobs': sum(per_day.values()),
    'final_state': {k: last[k] for k in TERMINAL},
    'not_finished': {k: v for k, v in last.items() if k not in TERMINAL},
    'run_hours': round(run_s / 3600, 1),
    'jobs_per_day': dict(sorted(per_day.items())),
}
print(json.dumps(out, indent=1))
