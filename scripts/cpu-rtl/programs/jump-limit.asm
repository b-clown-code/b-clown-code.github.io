; JUMP with a limit of 3, then a second loop whose limit is already used up by jumpCount.
LI R2, 1
LINK 0
ADD R1, R1, R2
JUMP 0, 3
SB R1, 5
LINK 2
ADD R3, R3, R2
JUMP 2, 4
SB R3, 6
DISPLAY R3
