; SB of a register written 1, 2 and 3 instructions earlier.
LI R1, 9
SB R1, 20
LI R2, 11
AND R0, R0, R0
SB R2, 21
LI R3, 13
AND R0, R0, R0
AND R0, R0, R0
SB R3, 22
ADD R4, R1, R2
SB R4, 23
LB R5, 21
SB R5, 24
