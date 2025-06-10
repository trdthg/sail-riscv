/*=======================================================================================*/
/*  This Sail RISC-V architecture model, comprising all files and                        */
/*  directories except where otherwise noted is subject the BSD                          */
/*  two-clause license in the LICENSE file.                                              */
/*                                                                                       */
/*  SPDX-License-Identifier: BSD-2-Clause                                                */
/*=======================================================================================*/

union clause ast = TEST_BIT : (regidx, regidx, bits(6))

mapping clause encdec = TEST_BIT(rd, rs1, imm)
  <-> 0b100010 @ imm @ encdec_reg(rs1) @ 0b001 @ encdec_reg(rd) @ 0b0001011

mapping clause assembly = TEST_BIT(rd, rs1, imm)
  <-> "th.tst " ^ reg_name(rd) ^ " " ^ reg_name(rs1) ^ " " ^ hex_bits_6(imm)

function clause execute (TEST_BIT(rd, rs1, imm)) = {
  if unsigned(X(rs1) & (zero_extend(0b1) << unsigned(imm))) > 0 then {
    print("[[[ true  \n");
    X(rd) = zero_extend(0b1);
  } else {
    print("[[[ false \n");
    X(rd) = zero_extend(0b0);
  };
  print_int("int(imm) = ", unsigned(imm));
  print_bits("X(rs1) = ", X(rs1));
  print_bits("(1 << imm) = ", zero_extend(64, 0b1) << unsigned(imm));
  print_bits("rs1 & (1 << imm) = ", X(rs1) & (zero_extend(0b1) << unsigned(imm)));
  print("th.tst " ^ reg_name(rd) ^ " " ^ reg_name(rs1) ^ " " ^ hex_bits_6(imm) ^ "\n");
  return RETIRE_SUCCESS;
}

/* ****************************************************************** */
