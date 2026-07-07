// =======================================================================================
// This Sail RISC-V architecture model, comprising all files and
// directories except where otherwise noted is subject the BSD
// two-clause license in the LICENSE file.
//
// SPDX-License-Identifier: BSD-2-Clause
// =======================================================================================
register m0 : amereglen
register m1 : amereglen
register m2 : amereglen
register m3 : amereglen
register m4 : amereglen
register m5 : amereglen
register m6 : amereglen
register m7 : amereglen
register m8 : amereglen
register m9 : amereglen
register m10 : amereglen
register m11 : amereglen
register m12 : amereglen
register m13 : amereglen
register m14 : amereglen
register m15 : amereglen
register m16 : amereglen
register m17 : amereglen
register m18 : amereglen
register m19 : amereglen
register m20 : amereglen
register m21 : amereglen
register m22 : amereglen
register m23 : amereglen
register m24 : amereglen
register m25 : amereglen
register m26 : amereglen
register m27 : amereglen
register m28 : amereglen
register m29 : amereglen
register m30 : amereglen
register m31 : amereglen

mapping amereg_name_raw : bits(5) <-> string = {
  0b00000 <-> "m0",
  0b00001 <-> "m1",
  0b00010 <-> "m2",
  0b00011 <-> "m3",
  0b00100 <-> "m4",
  0b00101 <-> "m5",
  0b00110 <-> "m6",
  0b00111 <-> "m7",
  0b01000 <-> "m8",
  0b01001 <-> "m9",
  0b01010 <-> "m10",
  0b01011 <-> "m11",
  0b01100 <-> "m12",
  0b01101 <-> "m13",
  0b01110 <-> "m14",
  0b01111 <-> "m15",
  0b10000 <-> "m16",
  0b10001 <-> "m17",
  0b10010 <-> "m18",
  0b10011 <-> "m19",
  0b10100 <-> "m20",
  0b10101 <-> "m21",
  0b10110 <-> "m22",
  0b10111 <-> "m23",
  0b11000 <-> "m24",
  0b11001 <-> "m25",
  0b11010 <-> "m26",
  0b11011 <-> "m27",
  0b11100 <-> "m28",
  0b11101 <-> "m29",
  0b11110 <-> "m30",
  0b11111 <-> "m31"
}

mapping amereg_name : ameregidx <-> string = { Ameregidx(i) <-> amereg_name_raw(i) }

function rM(Ameregno(i) : ameregno) -> amereglen = {
  match i {
    0  => m0,
    1  => m1,
    2  => m2,
    3  => m3,
    4  => m4,
    5  => m5,
    6  => m6,
    7  => m7,
    8  => m8,
    9  => m9,
    10 => m10,
    11 => m11,
    12 => m12,
    13 => m13,
    14 => m14,
    15 => m15,
    16 => m16,
    17 => m17,
    18 => m18,
    19 => m19,
    20 => m20,
    21 => m21,
    22 => m22,
    23 => m23,
    24 => m24,
    25 => m25,
    26 => m26,
    27 => m27,
    28 => m28,
    29 => m29,
    30 => m30,
    31 => m31,
  }
}

function wM(Ameregno(i) : ameregno, v : amereglen) -> unit = {
  match i {
    0  => m0 = v,
    1  => m1 = v,
    2  => m2 = v,
    3  => m3 = v,
    4  => m4 = v,
    5  => m5 = v,
    6  => m6 = v,
    7  => m7 = v,
    8  => m8 = v,
    9  => m9 = v,
    10 => m10 = v,
    11 => m11 = v,
    12 => m12 = v,
    13 => m13 = v,
    14 => m14 = v,
    15 => m15 = v,
    16 => m16 = v,
    17 => m17 = v,
    18 => m18 = v,
    19 => m19 = v,
    20 => m20 = v,
    21 => m21 = v,
    22 => m22 = v,
    23 => m23 = v,
    24 => m24 = v,
    25 => m25 = v,
    26 => m26 = v,
    27 => m27 = v,
    28 => m28 = v,
    29 => m29 = v,
    30 => m30 = v,
    31 => m31 = v,
  };
}

function rM_bits(Ameregidx(i) : ameregidx) -> amereglen = rM(Ameregno(unsigned(i)))

function wM_bits(Ameregidx(i) : ameregidx, data : amereglen) -> unit = {
  wM(Ameregno(unsigned(i))) = data
}

overload M = {rM_bits, wM_bits, rM, wM}

register md0 : bits(32)
register md1 : bits(32)
register md2 : bits(32)
register md3 : bits(32)
register md4 : bits(32)
register md5 : bits(32)
register md6 : bits(32)
register md7 : bits(32)
register md8 : bits(32)
register md9 : bits(32)
register md10 : bits(32)
register md11 : bits(32)
register md12 : bits(32)
register md13 : bits(32)
register md14 : bits(32)
register md15 : bits(32)
register md16 : bits(32)
register md17 : bits(32)
register md18 : bits(32)
register md19 : bits(32)
register md20 : bits(32)
register md21 : bits(32)
register md22 : bits(32)
register md23 : bits(32)
register md24 : bits(32)
register md25 : bits(32)
register md26 : bits(32)
register md27 : bits(32)
register md28 : bits(32)
register md29 : bits(32)
register md30 : bits(32)
register md31 : bits(32)

mapping mdreg_name_raw : bits(5) <-> string = {
  0b00000 <-> "md0",
  0b00001 <-> "md1",
  0b00010 <-> "md2",
  0b00011 <-> "md3",
  0b00100 <-> "md4",
  0b00101 <-> "md5",
  0b00110 <-> "md6",
  0b00111 <-> "md7",
  0b01000 <-> "md8",
  0b01001 <-> "md9",
  0b01010 <-> "md10",
  0b01011 <-> "md11",
  0b01100 <-> "md12",
  0b01101 <-> "md13",
  0b01110 <-> "md14",
  0b01111 <-> "md15",
  0b10000 <-> "md16",
  0b10001 <-> "md17",
  0b10010 <-> "md18",
  0b10011 <-> "md19",
  0b10100 <-> "md20",
  0b10101 <-> "md21",
  0b10110 <-> "md22",
  0b10111 <-> "md23",
  0b11000 <-> "md24",
  0b11001 <-> "md25",
  0b11010 <-> "md26",
  0b11011 <-> "md27",
  0b11100 <-> "md28",
  0b11101 <-> "md29",
  0b11110 <-> "md30",
  0b11111 <-> "md31"
}

mapping mdreg_name : mdregidx <-> string = { Mdregidx(i) <-> mdreg_name_raw(i) }

function rMD(Mdregno(i) : mdregno) -> bits(32) = {
  match i {
    0  => md0,
    1  => md1,
    2  => md2,
    3  => md3,
    4  => md4,
    5  => md5,
    6  => md6,
    7  => md7,
    8  => md8,
    9  => md9,
    10 => md10,
    11 => md11,
    12 => md12,
    13 => md13,
    14 => md14,
    15 => md15,
    16 => md16,
    17 => md17,
    18 => md18,
    19 => md19,
    20 => md20,
    21 => md21,
    22 => md22,
    23 => md23,
    24 => md24,
    25 => md25,
    26 => md26,
    27 => md27,
    28 => md28,
    29 => md29,
    30 => md30,
    31 => md31,
  }
}

function wMD(Mdregno(i) : mdregno, v : bits(32)) -> unit = {
  match i {
    0  => md0 = v,
    1  => md1 = v,
    2  => md2 = v,
    3  => md3 = v,
    4  => md4 = v,
    5  => md5 = v,
    6  => md6 = v,
    7  => md7 = v,
    8  => md8 = v,
    9  => md9 = v,
    10 => md10 = v,
    11 => md11 = v,
    12 => md12 = v,
    13 => md13 = v,
    14 => md14 = v,
    15 => md15 = v,
    16 => md16 = v,
    17 => md17 = v,
    18 => md18 = v,
    19 => md19 = v,
    20 => md20 = v,
    21 => md21 = v,
    22 => md22 = v,
    23 => md23 = v,
    24 => md24 = v,
    25 => md25 = v,
    26 => md26 = v,
    27 => md27 = v,
    28 => md28 = v,
    29 => md29 = v,
    30 => md30 = v,
    31 => md31 = v,
  };
}

function rMD_bits(Mdregidx(i) : mdregidx) -> bits(32) = rMD(Mdregno(unsigned(i)))

function wMD_bits(Mdregidx(i) : mdregidx, data : bits(32)) -> unit = {
  wMD(Mdregno(unsigned(i))) = data
}

overload MD = {rMD_bits, wMD_bits, rMD, wMD}

register acc0 : ameaccreglen
register acc1 : ameaccreglen
register acc2 : ameaccreglen
register acc3 : ameaccreglen

mapping ameaccreg_name_raw : bits(2) <-> string = {
  0b00 <-> "acc0",
  0b01 <-> "acc1",
  0b10 <-> "acc2",
  0b11 <-> "acc3"
}

mapping ameaccreg_name : ameaccregidx <-> string = { Ameaccregidx(i) <-> ameaccreg_name_raw(i) }
mapping ameadreg_name : ameadregidx <-> string = { Ameadregidx(i) <-> ameaccreg_name_raw(i) }

function rACC(Ameaccregno(i) : ameaccregno) -> ameaccreglen = {
  match i {
    0 => acc0,
    1 => acc1,
    2 => acc2,
    3 => acc3,
  }
}

function wACC(Ameaccregno(i) : ameaccregno, v : ameaccreglen) -> unit = {
  match i {
    0 => acc0 = v,
    1 => acc1 = v,
    2 => acc2 = v,
    3 => acc3 = v,
  }
}

function rACC_bits(Ameaccregidx(i) : ameaccregidx) -> ameaccreglen = rACC(Ameaccregno(unsigned(i)))

function wACC_bits(Ameaccregidx(i) : ameaccregidx, data : ameaccreglen) -> unit = {
  wACC(Ameaccregno(unsigned(i))) = data
}

overload ACC = {rACC_bits, wACC_bits, rACC, wACC}

register ad0 : bits(32)
register ad1 : bits(32)
register ad2 : bits(32)
register ad3 : bits(32)

function rAD(Ameadregno(i) : ameadregno) -> bits(32) = {
  match i {
    0 => ad0,
    1 => ad1,
    2 => ad2,
    3 => ad3,
  }
}

function wAD(Ameadregno(i) : ameadregno, v : bits(32)) -> unit = {
  match i {
    0 => ad0 = v,
    1 => ad1 = v,
    2 => ad2 = v,
    3 => ad3 = v,
  }
}

function rAD_bits(Ameadregidx(i) : ameadregidx) -> bits(32) = rAD(Ameadregno(unsigned(i)))

function wAD_bits(Ameadregidx(i) : ameadregidx, data : bits(32)) -> unit = {
  wAD(Ameadregno(unsigned(i))) = data
}

overload AD = {rAD_bits, wAD_bits, rAD, wAD}

register amenxlen : bits(64)
mapping clause csr_name_map = 0xC01  <-> "amenxlen"
function clause is_CSR_accessible(0xC01, _, _) = hartSupports(Ext_Zvame)
function clause is_CSR_exception_virtual(0xC01, _, _) = true
function clause read_CSR(0xC01) = amenxlen[xlen - 1 .. 0]
function clause write_CSR(0xC01, value) = { Ok(amenxlen[xlen - 1 .. 0]) }

register ameudsz : bits(64)
mapping clause csr_name_map = 0xC02  <-> "ameudsz"
function clause is_CSR_accessible(0xC02, _, _) = hartSupports(Ext_Zvame)
function clause is_CSR_exception_virtual(0xC02, _, _) = true
function clause read_CSR(0xC02) = ameudsz[xlen - 1 .. 0]
function clause write_CSR(0xC02, value) = { Ok(ameudsz[xlen - 1 .. 0]) }
