"""Generates the static diagram SVGs in src/diagrams/. Run: python3 scripts/gen_diagrams.py"""
import os
from xml.sax.saxutils import escape as E
OUT = os.path.join(os.path.dirname(__file__), '..', 'src', 'diagrams')

class D:
    def __init__(s, name, w, h, title):
        s.name, s.w, s.h, s.title, s.parts = name, w, h, title, []
    def box(s, x, y, w, h, lines, cls='box'):
        s.parts.append(f'<rect class="{cls}" x="{x}" y="{y}" width="{w}" height="{h}" rx="6"/>')
        n = len(lines); lh = 16
        y0 = y + h/2 - (n-1)*lh/2 + 5
        for i, t in enumerate(lines):
            s.parts.append(f'<text x="{x+w/2}" y="{y0+i*lh:.1f}" text-anchor="middle">{E(t)}</text>')
    def arrow(s, pts, dash=False, label=None, lx=0, ly=0):
        d = 'M' + ' L'.join(f'{x} {y}' for x, y in pts)
        s.parts.append(f'<path class="arrow{" dash" if dash else ""}" d="{d}" marker-end="url(#a)"/>')
        if label: s.parts.append(f'<text class="small" x="{lx}" y="{ly}" text-anchor="middle">{E(label)}</text>')
    def text(s, x, y, t, cls='small', anchor='middle'):
        s.parts.append(f'<text class="{cls}" x="{x}" y="{y}" text-anchor="{anchor}">{E(t)}</text>')
    def save(s):
        svg = (f'<svg class="diagram-svg" viewBox="0 0 {s.w} {s.h}" role="img" aria-labelledby="t-{s.name}" xmlns="http://www.w3.org/2000/svg">'
               f'<title id="t-{s.name}">{E(s.title)}</title>'
               '<defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
               '<path d="M0 0 L10 5 L0 10 z" class="head"/></marker></defs>' + ''.join(s.parts) + '</svg>')
        open(os.path.join(OUT, s.name + '.svg'), 'w').write(svg)

os.makedirs(OUT, exist_ok=True)

# 1. Verilog pipeline
d = D('verilog-pipeline', 760, 250, 'Verilog testbench pipeline: designs, validation and selection, LLM testbench generation, Icarus compile and simulate, waveform and dataset QA, LoRA training and export, held-out evaluation')
labels = [['Designs'], ['Validate /', 'select'], ['LLM writes', 'testbench'], ['Icarus compile', '+ simulate'],
          ['Waveform +', 'dataset QA'], ['LoRA training', '+ export'], ['Held-out', 'evaluation']]
xs = [10, 10+120*1, 10+120*2, 10+120*3]  # row 1: 4 boxes
bw, bh = 100, 56
row1 = [(10+i*125, 30) for i in range(4)]
row2 = [(10+i*125+62, 150) for i in range(3)]
pos = row1 + row2
for (x, y), l in zip(pos, labels):
    d.box(x, y, bw, bh, l, 'box hi' if l[0] == 'Icarus compile' else 'box')
for i in range(3):
    x, y = row1[i]; d.arrow([(x+bw, y+bh/2), (x+125, y+bh/2)])
x, y = row1[3]
d.arrow([(x+bw/2, y+bh), (x+bw/2, 110), (row2[0][0]+bw/2, 110), (row2[0][0]+bw/2, 150)])
for i in range(2):
    x, y = row2[i]; d.arrow([(x+bw, y+bh/2), (x+125, y+bh/2)])
d.text(380, 232, 'Only testbenches that compile and simulate are kept for training')
d.save()

# 2. gpuq state machine
d = D('gpuq-states', 760, 380, 'gpuq job states: PENDING_REVIEW, PENDING_APPROVAL, QUEUED, STARTING, RUNNING, then COMPLETED, FAILED, TIMED_OUT, CANCELLED or INTERRUPTED; HELD and BLOCKED side states; INTERRUPTED auto-requeues, maximum 3 times')
w, h = 120, 40
main = ['PENDING_REVIEW', 'PENDING_APPROVAL', 'QUEUED', 'STARTING', 'RUNNING']
mx = [10, 160, 310, 450, 590]
mw = [130, 140, 110, 110, 110]
for n, x, ww in zip(main, mx, mw):
    d.box(x, 20, ww, h, [n], 'box hi' if n == 'RUNNING' else 'box')
for i in range(4):
    d.arrow([(mx[i]+mw[i], 40), (mx[i+1], 40)])
ends = ['COMPLETED', 'FAILED', 'TIMED_OUT', 'CANCELLED', 'INTERRUPTED']
ex = [10, 160, 310, 450, 590]
for n, x in zip(ends, ex):
    d.box(x, 150, 125 if n == 'INTERRUPTED' else 115, 40, [n], 'box warn' if n == 'INTERRUPTED' else 'box')
d.parts.append('<path class="arrow" d="M645 60 L645 105" marker-end="url(#a)"/>')
d.parts.append('<path class="arrow" d="M645 105 L67 105 L67 150" marker-end="url(#a)"/>')
for x in (217, 367, 507, 652):
    d.parts.append(f'<path class="arrow" d="M{x} 105 L{x} 150" marker-end="url(#a)"/>')
d.text(380, 98, 'terminal states', 'small')
# requeue loop
d.arrow([(652, 190), (652, 235), (292, 235), (292, 78), (330, 78), (330, 60)], dash=True)
d.text(470, 252, 'auto-requeue after reboot (max 3)')
# side states
d.box(150, 290, 110, 40, ['HELD'], 'box side')
d.box(300, 290, 110, 40, ['BLOCKED'], 'box side')
d.text(520, 315, 'HELD and BLOCKED are side states', 'small')
d.save()

# 3. labctl architecture
d = D('labctl-architecture', 760, 400, 'labctl architecture: the owner talks to a Director, which directs one Lead per project, each running Tracks; a daemon with no model calls reads a SQLite event log and dispatches wakes; each wake gets a fresh briefing; results settle back; GPU access only through gpuq')
d.box(10, 20, 110, 44, ['Owner'])
d.box(190, 20, 140, 44, ['Director'])
d.arrow([(120, 36), (190, 36)]); d.arrow([(190, 50), (120, 50)])
for i, nm in enumerate(['Lead: project A', 'Lead: project B', 'Lead: project C']):
    d.box(10+i*165, 120, 150, 44, [nm])
    d.arrow([(260, 64), (260, 92), (85+i*165, 92), (85+i*165, 120)])
for i in range(3):
    d.box(10+i*165, 215, 150, 40, ['Tracks'], 'box side')
    d.arrow([(85+i*165, 164), (85+i*165, 215)])
d.box(540, 20, 200, 90, ['Daemon', '(no model calls)', 'dispatches wakes'], 'box hi')
d.box(540, 160, 200, 50, ['SQLite event log', '(durable state)'])
d.arrow([(640, 160), (640, 110)], label='reads', lx=668, ly=140)
d.parts.append('<path class="arrow dash" d="M540 65 L340 65 L340 85 L260 85" marker-end="url(#a)"/>')
d.text(445, 59, 'wake + fresh briefing')
d.arrow([(490, 235), (515, 235), (515, 195), (540, 195)], dash=True)
d.text(625, 245, 'results settle back', 'small')
d.box(190, 320, 380, 44, ['GPU access only via gpuq'], 'box warn')
d.arrow([(85, 255), (85, 292), (380, 292), (380, 320)])
d.save()

# 4. FPGA data path
d = D('fpga-data-path', 760, 260, 'FPGA data path: signal generator core in programmable logic on the Zynq-7020, AXI interconnect, processing system (ARM, PYNQ), TCP, host capture and parity checker; golden vectors from simulation feed the checker')
d.parts.append('<rect class="zone" x="5" y="10" width="395" height="110" rx="8"/><rect class="zone" x="415" y="10" width="340" height="110" rx="8"/>')
d.text(20, 30, 'PYNQ-Z2 board (Zynq-7020)', 'small', 'start')
d.text(430, 30, 'Host', 'small', 'start')
d.box(20, 50, 110, 56, ['Signal generator', 'core (PL)'], 'box hi')
d.box(160, 50, 90, 56, ['AXI', 'interconnect'])
d.box(280, 50, 105, 56, ['PS', '(ARM, PYNQ)'])
d.box(430, 50, 140, 56, ['Host capture'])
d.box(600, 50, 140, 56, ['Parity checker'])
d.arrow([(130, 78), (160, 78)]); d.arrow([(250, 78), (280, 78)])
d.arrow([(385, 78), (430, 78)], label='TCP', lx=408, ly=68)
d.arrow([(570, 78), (600, 78)])
d.box(520, 170, 160, 50, ['Golden vectors', 'from simulation'], 'box side')
d.arrow([(670, 170), (670, 106)], dash=True)
d.save()

# 5. CPU pipeline
d = D('cpu-pipeline', 760, 300, '5-stage CPU pipeline: IF, ID, EX, MEM, WB with IF/ID, ID/EX, EX/MEM and MEM/WB registers; stall and flush paths; write-back to decode bypass')
sx = [10, 160, 310, 460, 610]
for n, x in zip(['IF', 'ID', 'EX', 'MEM', 'WB'], sx):
    d.box(x, 60, 70, 50, [n], 'box hi')
for n, x in zip(['IF/ID', 'ID/EX', 'EX/MEM', 'MEM/WB'], [95, 245, 395, 545]):
    d.parts.append(f'<rect class="reg" x="{x}" y="50" width="50" height="70" rx="4"/>')
    d.text(x+25, 138, n, 'small')
for i in range(4):
    d.arrow([(sx[i]+70, 85), (sx[i]+85, 85)])
    d.arrow([(sx[i]+135, 85), (sx[i+1], 85)])
d.arrow([(645, 110), (645, 220), (185, 220), (185, 112)], label='write-back bypass (register file to decode)', lx=415, ly=238)
d.box(10, 180, 110, 36, ['Stall'], 'box warn')
d.arrow([(65, 180), (65, 112)], dash=True)
d.text(430, 20, 'Flush (on jump / branch) clears the earlier stages', 'small')
d.arrow([(350, 60), (350, 30), (45, 30), (45, 60)], dash=True)
d.save()
