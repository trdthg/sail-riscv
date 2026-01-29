#include <cerrno>
#include <cinttypes>
#include <cstdint>
#include <cstdlib>
#include <cstdio>
#include <iostream>
#include <string>

#include "CLI11.hpp"
#include "config_utils.h"
#include "riscv_model_impl.h"
#include "sail.h"
#include "sail_config.h"

FILE *trace_log = stdout;
bool config_print_instr = false;
bool config_print_step = false;
bool config_print_clint = false;
bool config_print_exception = false;
bool config_print_interrupt = false;
bool config_print_htif = false;
bool config_print_pma = false;
bool config_enable_rvfi = false;
bool config_use_abi_names = false;

namespace {

bool parse_hex_u64(const std::string &s, uint64_t &out) {
  std::string v = s;
  if (v.rfind("0x", 0) == 0 || v.rfind("0X", 0) == 0) {
    v = v.substr(2);
  }
  if (v.empty()) {
    return false;
  }
  char *end = nullptr;
  errno = 0;
  out = std::strtoull(v.c_str(), &end, 16);
  return errno == 0 && end != nullptr && *end == '\0';
}

void print_isa(ModelImpl &model) {
  sail_string isa;
  CREATE(sail_string)(&isa);
  model.zgenerate_canonical_isa_string(&isa, UNIT);
  std::cout << isa << std::endl;
  KILL(sail_string)(&isa);
}

void decode_and_print(ModelImpl &model, bool compressed, uint64_t bits) {
  hart::zinstruction insn;
  if (compressed) {
    model.zext_decode_compressed(&insn, bits & 0xffffu);
  } else {
    model.zext_decode(&insn, bits & 0xffffffffu);
  }

  sail_string asm_str;
  CREATE(sail_string)(&asm_str);
  if (model.zassembly_forwards_matches(insn)) {
    model.zassembly_forwards(&asm_str, insn);
  } else {
    model.zinstruction_to_str(&asm_str, insn);
  }
  std::cout << asm_str << std::endl;
  KILL(sail_string)(&asm_str);
}

} // namespace

int main(int argc, char **argv) {
  CLI::App app("Sail RISC-V Web Tools");
  std::string config_file;
  std::string decode16_hex;
  std::string decode32_hex;
  bool print_isa_flag = false;

  app.add_option("--config", config_file, "Configuration file")->option_text("<file>");
  app.add_flag("--print-isa-string", print_isa_flag, "Print ISA string");
  app.add_option("--decode16", decode16_hex, "Decode 16-bit (compressed) instruction hex")->option_text("<hex>");
  app.add_option("--decode32", decode32_hex, "Decode 32-bit instruction hex")->option_text("<hex>");

  CLI11_PARSE(app, argc, argv);

  // Initialize configuration.
  validate_config_schema(config_file);
  if (!config_file.empty()) {
    sail_config_set_file(config_file.c_str());
  } else {
    sail_config_set_string(get_default_config());
  }

  // Model instance.
  ModelImpl model;
  model.model_init();
  model.set_reservation_set_size_exp(get_config_uint64({"platform", "reservation_set_size_exp"}));

  if (print_isa_flag) {
    print_isa(model);
  }

  if (!decode16_hex.empty()) {
    uint64_t bits = 0;
    if (!parse_hex_u64(decode16_hex, bits)) {
      std::cerr << "Invalid hex for --decode16: " << decode16_hex << std::endl;
      return 1;
    }
    decode_and_print(model, /*compressed=*/true, bits);
  }

  if (!decode32_hex.empty()) {
    uint64_t bits = 0;
    if (!parse_hex_u64(decode32_hex, bits)) {
      std::cerr << "Invalid hex for --decode32: " << decode32_hex << std::endl;
      return 1;
    }
    decode_and_print(model, /*compressed=*/false, bits);
  }

  if (!print_isa_flag && decode16_hex.empty() && decode32_hex.empty()) {
    std::cerr << "No action specified. Use --decode16/--decode32 or --print-isa-string.\n";
    return 1;
  }

  model.model_fini();
  return 0;
}
