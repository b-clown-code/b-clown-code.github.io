; Producer/consumer at distances 1-4: EX/MEM forward, MEM/WB forward, register-file bypass, plain read.
LI R1, 7
ADD R2, R1, R1
LI R3, 5
AND R0, R0, R0
ADD R4, R3, R3
LI R5, 9
AND R0, R0, R0
AND R0, R0, R0
ADD R6, R5, R5
LI R7, 3
AND R0, R0, R0
AND R0, R0, R0
AND R0, R0, R0
SUB R7, R7, R1
ADD R1, R2, R4
ADD R1, R1, R1
SUB R2, R1, R2
SB R1, 10
SB R2, 11
