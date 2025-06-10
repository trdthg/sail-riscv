#include "common/runtime.h"

#include <stdint.h>
int main()
{
  uint32_t rd_val;

  printf("Testing th.tst instruction:\n");
  printf("---------------------------\n");

  uint32_t rs1_val = 0b0000000000000000000000001000;

  asm volatile("th.tst %0, %1, %2" : "=r"(rd_val) : "r"(rs1_val), "i"(3) :);
  if (rd_val != 1) return 1;

  asm volatile("th.tst %0, %1, %2" : "=r"(rd_val) : "r"(rs1_val), "i"(1) :);
  if (rd_val != 0) return 1;

  asm volatile("th.tst %0, %1, %2" : "=r"(rd_val) : "r"(rs1_val), "i"(4) :);
  if (rd_val != 0) return 1;
  return 0;
}

