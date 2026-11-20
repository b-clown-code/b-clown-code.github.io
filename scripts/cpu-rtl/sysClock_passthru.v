// Test shim: replaces vendor/sysClock.v (a /8 clock divider) so the CPU's clk25 domain runs on the testbench clock.
// The divider has uninitialised registers in simulation and only sets the board clock rate; it has no effect on CPU behaviour.
module sysClock(output clk25, input clk);
  assign clk25 = clk;
endmodule
