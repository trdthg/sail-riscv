#include "rvfi_dii_sail.h"
#include <optional>

// Use anonymous namespaces to avoid naming conflicts
namespace {
rvfi_handler *rvfi;
}

void register_rvfi_dii_handler(rvfi_handler *handler)
{
  rvfi = handler;
}

#ifdef __cplusplus
extern "C" {
#endif

unit rvfi_set_inst_data_insn(uint64_t insn)
{
  if (rvfi) {
    rvfi->rvfi_set_inst_data_insn(insn);
  }
  return UNIT;
}

unit rvfi_set_inst_data_order(uint64_t order)
{
  if (rvfi) {
    rvfi->rvfi_set_inst_data_order(order);
  }
  return UNIT;
}

unit rvfi_set_inst_data_mode(uint8_t mode)
{
  if (rvfi) {
    rvfi->rvfi_set_inst_data_mode(mode);
  }
  return UNIT;
}

unit rvfi_set_inst_data_ixl(uint8_t ixl)
{
  if (rvfi) {
    rvfi->rvfi_set_inst_data_ixl(ixl);
  }
  return UNIT;
}

uint32_t rvfi_get_insn(unit)
{
  if (rvfi) {
    return rvfi->rvfi_get_insn();
  } else {
    exit(1);
  }
}

unit rvfi_set_pc_data_rdata(uint64_t rdata)
{
  if (rvfi) {
    rvfi->rvfi_set_pc_data_rdata(rdata);
  }
  return UNIT;
}

unit rvfi_set_pc_data_wdata(uint64_t wdata)
{
  if (rvfi) {
    rvfi->rvfi_set_pc_data_wdata(wdata);
  }
  return UNIT;
}

#ifdef __cplusplus
} // extern "C"
#endif
