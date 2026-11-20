; Count R1 down from 5 with a LINK/JUMP loop; BEQ leaves through a jump-table slot filled with LI+SB.
LI R1, 5
LI R2, 1
LI R7, 9
SB R7, 1
LINK 0
SUB R1, R1, R2
BEQ 1, R1, R0
JUMP 0, 255
LI R6, 99
SB R6, 3
