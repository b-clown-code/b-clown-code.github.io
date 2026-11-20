`timescale 1ns / 1ps
// Cycle trace of the vendored CPU (Control.v) for comparison with src/lib/cpu/core.ts.
// Power-on state is modelled as on the FPGA: every flip-flop, latch and data-memory byte starts at 0.
// Line "C <n> ..." is the settled combinational state after n rising edges. Run vvp in a directory holding memory.mem.
module tb_trace;
  reg clk = 0;
  reg [15:0] sw = 16'd0;
  wire [15:0] led; wire [7:0] seg; wire [3:0] an;
  integer cycles, c, i;
  Control dut (.LED(led), .D1_SEG(seg), .D1_AN(an), .SW(sw), .BTN(4'b0), .clk(clk));

  initial begin
    if (!$value$plusargs("cycles=%d", cycles)) cycles = 64;
    if ($test$plusargs("loop")) sw[3] = 1'b1;
    for (i = 0; i < 256; i = i + 1) dut.m0.dataMem[i] = 8'd0;
    dut.fetch_decode.instr_o = 0; dut.fetch_decode.funct = 0; dut.fetch_decode.target = 0;
    dut.fetch_decode.Areg = 0; dut.fetch_decode.Breg = 0; dut.fetch_decode.immed = 0;
    dut.decode_execute.opA = 0; dut.decode_execute.opB = 0; dut.decode_execute.memWriteData = 0;
    dut.decode_execute.addressIn_o = 0; dut.decode_execute.immed_o = 0; dut.decode_execute.ALUop_o = 0;
    dut.decode_execute.targetReg_o = 0; dut.decode_execute.Areg_o = 0; dut.decode_execute.Breg_o = 0;
    dut.decode_execute.regWrite_o = 0; dut.decode_execute.memReadWrite_o = 0; dut.decode_execute.jumpEnable_o = 0;
    dut.decode_execute.funct_o = 0;
    dut.execute_memAccess.funct_o = 0; dut.execute_memAccess.immed_o = 0; dut.execute_memAccess.memAddr_o = 0;
    dut.execute_memAccess.ALUresult_o = 0; dut.execute_memAccess.memWriteData_o = 0; dut.execute_memAccess.zeroFlag_o = 0;
    dut.execute_memAccess.memReadWrite_o = 0; dut.execute_memAccess.regWrite_o = 0; dut.execute_memAccess.targetReg_o = 0;
    dut.execute_memAccess.Areg_o = 0; dut.execute_memAccess.Breg_o = 0; dut.execute_memAccess.jumpEnable_o = 0;
    dut.memAccess_WriteBack.funct_o = 0; dut.memAccess_WriteBack.immed_o = 0; dut.memAccess_WriteBack.memData_o = 0;
    dut.memAccess_WriteBack.ALUresult_o = 0; dut.memAccess_WriteBack.targetReg_o = 0; dut.memAccess_WriteBack.regWrite_o = 0;
    dut.ALUop = 0; dut.addressIn = 0; dut.PClink = 0;
    #2;
    for (c = 0; c <= cycles; c = c + 1) begin
      $display("C %0d pc=%h if=%h id=%h ex=%h mem=%h wb=%h stall=%b clr=%b br=%b pcn=%h fa=%b fb=%b a=%h b=%h alu=%h z=%b we=%b ma=%h md=%h mo=%h rw=%b rt=%h wd=%h jc=%h lat=%h,%h,%h r=%h,%h,%h,%h,%h,%h,%h,%h",
        c, dut.PC, dut.instr, dut.instr_IDo, dut.funct_EXo, dut.funct_MEMo, dut.funct_WBo,
        dut.IF_IDstall, dut.jumpClear, dut.branch, dut.PCnext, dut.forwardA, dut.forwardB,
        dut.aluAin, dut.aluBin, dut.ALUresult, dut.zeroFlag,
        dut.memReadWrite_MEMo, dut.memAddr_MEMo, dut.memDataIn_muxxed, dut.memDataOut,
        dut.regWrite_WBo, dut.targetReg_WBo, dut.writeData, dut.jumpCount,
        dut.ALUop, dut.addressIn, dut.PClink,
        dut.r0.regFile[0], dut.r0.regFile[1], dut.r0.regFile[2], dut.r0.regFile[3],
        dut.r0.regFile[4], dut.r0.regFile[5], dut.r0.regFile[6], dut.r0.regFile[7]);
      #3 clk = 1; #5 clk = 0; #2;
    end
    $write("M");
    for (i = 0; i < 256; i = i + 1) $write(" %h", dut.m0.dataMem[i]);
    $write("\n");
    $finish;
  end
endmodule
