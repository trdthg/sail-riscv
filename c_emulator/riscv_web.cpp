#include <cerrno>
#include <cinttypes>
#include <cstdint>
#include <cstdlib>
#include <cstdio>
#include <cctype>
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

std::string trim_copy(const std::string &s) {
  const auto start = s.find_first_not_of(" \t\r\n");
  if (start == std::string::npos) {
    return "";
  }
  const auto end = s.find_last_not_of(" \t\r\n");
  return s.substr(start, end - start + 1);
}

std::string json_escape(const std::string &s) {
  std::string out;
  out.reserve(s.size() + 8);
  for (const char ch : s) {
    switch (ch) {
      case '\"': out += "\\\""; break;
      case '\\': out += "\\\\"; break;
      case '\b': out += "\\b"; break;
      case '\f': out += "\\f"; break;
      case '\n': out += "\\n"; break;
      case '\r': out += "\\r"; break;
      case '\t': out += "\\t"; break;
      default:
        if (static_cast<unsigned char>(ch) < 0x20) {
          char buf[7];
          std::snprintf(buf, sizeof(buf), "\\u%04x", ch & 0xff);
          out += buf;
        } else {
          out += ch;
        }
        break;
    }
  }
  return out;
}

void print_isa(ModelImpl &model) {
  sail_string isa;
  CREATE(sail_string)(&isa);
  model.zgenerate_canonical_isa_string(&isa, UNIT);
  std::cout << "{\"type\":\"isa\",\"isa\":\"" << json_escape(isa) << "\"}" << std::endl;
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
  const int width = compressed ? 16 : 32;
  const uint64_t mask = compressed ? 0xffffu : 0xffffffffu;
  const uint64_t val = bits & mask;
  std::string bin;
  bin.reserve(width);
  for (int i = width - 1; i >= 0; --i) {
    bin.push_back(((val >> i) & 1u) ? '1' : '0');
  }
  std::cout << "{\"type\":\"decode\",\"width\":" << width
            << ",\"asm\":\"" << json_escape(asm_str)
            << "\",\"hex\":\"0x" << std::hex << std::nouppercase << val << std::dec
            << "\",\"bin\":\"" << bin << "\"}" << std::endl;
  KILL(sail_string)(&asm_str);
}

void assemble_and_print(ModelImpl &model, const std::string &asm_line) {
  const std::string trimmed = trim_copy(asm_line);
  if (trimmed.empty()) {
    std::cout << "{\"type\":\"assemble\",\"error\":\"empty assembly\"}" << std::endl;
    return;
  }
  if (!model.zassembly_backwards_matches(trimmed.c_str())) {
    std::cout << "{\"type\":\"assemble\",\"error\":\"assembly did not match\",\"input\":\""
              << json_escape(trimmed) << "\"}" << std::endl;
    return;
  }
  hart::zinstruction insn;
  model.zassembly_backwards(&insn, trimmed.c_str());
  const uint64_t bits = model.zencdec_forwards(insn);

  sail_string asm_str;
  CREATE(sail_string)(&asm_str);
  if (model.zassembly_forwards_matches(insn)) {
    model.zassembly_forwards(&asm_str, insn);
  } else {
    model.zinstruction_to_str(&asm_str, insn);
  }
  const std::string normalized = asm_str;
  if (normalized.rfind("illegal", 0) == 0 || normalized.rfind("c.illegal", 0) == 0) {
    std::cout << "{\"type\":\"assemble\",\"error\":\"assembly did not match\",\"input\":\""
              << json_escape(trimmed) << "\"}" << std::endl;
    KILL(sail_string)(&asm_str);
    return;
  }

  bool is_compressed = false;
  if (trimmed.size() >= 2) {
    const char c0 = std::tolower(trimmed[0]);
    const char c1 = trimmed[1];
    if (c0 == 'c' && c1 == '.') {
      is_compressed = true;
    }
  }
  const int width = is_compressed ? 16 : 32;
  const uint64_t mask = is_compressed ? 0xffffu : 0xffffffffu;
  const uint64_t val = bits & mask;

  std::string bin;
  bin.reserve(width);
  for (int i = width - 1; i >= 0; --i) {
    bin.push_back(((val >> i) & 1u) ? '1' : '0');
  }

  std::cout << "{\"type\":\"assemble\",\"asm\":\"" << json_escape(asm_str)
            << "\",\"width\":" << width
            << ",\"hex\":\"0x" << std::hex << std::nouppercase << val << std::dec
            << "\",\"bin\":\"" << bin << "\"}" << std::endl;

  KILL(sail_string)(&asm_str);
}

} // namespace

int main(int argc, char **argv) {
  CLI::App app("Sail RISC-V Web Tools");
  std::string config_file;
  std::string decode16_hex;
  std::string decode32_hex;
  std::string assemble_asm;
  bool print_isa_flag = false;

  app.add_option("--config", config_file, "Configuration file")->option_text("<file>");
  app.add_flag("--print-isa-string", print_isa_flag, "Print ISA string");
  app.add_option("--decode16", decode16_hex, "Decode 16-bit (compressed) instruction hex")->option_text("<hex>");
  app.add_option("--decode32", decode32_hex, "Decode 32-bit instruction hex")->option_text("<hex>");
  app.add_option("--assemble", assemble_asm, "Assemble instruction string")->option_text("<asm>");

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
      std::cout << "{\"type\":\"decode\",\"error\":\"invalid hex\",\"input\":\""
                << json_escape(decode16_hex) << "\"}" << std::endl;
      return 1;
    }
    decode_and_print(model, /*compressed=*/true, bits);
  }

  if (!decode32_hex.empty()) {
    uint64_t bits = 0;
    if (!parse_hex_u64(decode32_hex, bits)) {
      std::cout << "{\"type\":\"decode\",\"error\":\"invalid hex\",\"input\":\""
                << json_escape(decode32_hex) << "\"}" << std::endl;
      return 1;
    }
    decode_and_print(model, /*compressed=*/false, bits);
  }

  if (!assemble_asm.empty()) {
    assemble_and_print(model, assemble_asm);
  }

  if (!print_isa_flag && decode16_hex.empty() && decode32_hex.empty() && assemble_asm.empty()) {
    std::cout << "{\"error\":\"no action specified\"}" << std::endl;
    return 1;
  }

  model.model_fini();
  return 0;
}
