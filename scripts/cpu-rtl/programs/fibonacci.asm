; Fibonacci: ten iterations, result stored at M[16].
LI R1, 0
LI R2, 1
LI R4, 10
LI R5, 1
LI R7, 14
SB R7, 1
LINK 0
ADD R3, R1, R2
ADD R1, R2, R0
ADD R2, R3, R0
SUB R4, R4, R5
BEQ 1, R4, R0
JUMP 0, 255
SB R2, 16
