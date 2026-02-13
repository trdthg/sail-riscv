#include <array>
#include <algorithm>
#include <cinttypes>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <iomanip>
#include <memory>
#include <optional>
#include <sstream>
#include <stdexcept>
#include <string>

#include "config_utils.h"
#include "elf_loader.h"
#include "rts.h"
#include "sail.h"
#include "sail_config.h"
#include "riscv_model_impl.h"

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#else
#define EMSCRIPTEN_KEEPALIVE
#endif

// Provided by Sail RTS (not exposed in rts.h).
extern "C" void kill_mem(void);

FILE *trace_log = stdout;

namespace {

struct DebugContext {
  std::unique_ptr<ModelImpl> model;
  std::optional<uint64_t> htif_tohost_address;
  uint64_t insns_per_tick = 1;
  uint64_t insn_cnt = 0;
  uint64_t total_steps = 0;
  mach_int step_no = 0;
  bool is_waiting = false;
  bool initialized = false;
  bool halted = false;
  int64_t exit_code = 0;
  std::string last_error;
  std::string program_output;
};

DebugContext g_ctx;
std::string g_state_json_cache;

std::string json_escape(const std::string &input) {
  std::string out;
  out.reserve(input.size() + 8);
  for (char c : input) {
    switch (c) {
    case '\\':
      out += "\\\\";
      break;
    case '"':
      out += "\\\"";
      break;
    case '\n':
      out += "\\n";
      break;
    case '\r':
      out += "\\r";
      break;
    case '\t':
      out += "\\t";
      break;
    default:
      out += c;
      break;
    }
  }
  return out;
}

const std::array<const char *, 32> kXRegAbiNames = {
  "zero", "ra", "sp", "gp", "tp", "t0", "t1", "t2",
  "s0", "s1", "a0", "a1", "a2", "a3", "a4", "a5",
  "a6", "a7", "s2", "s3", "s4", "s5", "s6", "s7",
  "s8", "s9", "s10", "s11", "t3", "t4", "t5", "t6",
};

std::string format_hex_u64(uint64_t value, int min_nibbles) {
  std::ostringstream oss;
  oss << "0x" << std::hex << std::setfill('0') << std::setw(std::max(1, min_nibbles)) << value << std::dec;
  return oss.str();
}

template <size_t N>
void append_json_string_array(std::ostringstream &oss, const std::array<std::string, N> &values) {
  oss << "[";
  for (size_t index = 0; index < values.size(); ++index) {
    if (index > 0) {
      oss << ",";
    }
    oss << "\"" << json_escape(values[index]) << "\"";
  }
  oss << "]";
}

void set_error(const std::string &msg) {
  g_ctx.last_error = msg;
  fprintf(stderr, "debug error: %s\n", msg.c_str());
}

void capture_term_byte(char c) {
  g_ctx.program_output.push_back(c);
}

void clear_state_only() {
  g_ctx.model.reset();
  g_ctx.htif_tohost_address = std::nullopt;
  g_ctx.insns_per_tick = 1;
  g_ctx.insn_cnt = 0;
  g_ctx.total_steps = 0;
  g_ctx.step_no = 0;
  g_ctx.is_waiting = false;
  g_ctx.initialized = false;
  g_ctx.halted = false;
  g_ctx.exit_code = 0;
  g_ctx.last_error.clear();
  g_ctx.program_output.clear();
}

void init_platform_constants(ModelImpl &model) {
  model.set_reservation_set_size_exp(get_config_uint64({"platform", "reservation_set_size_exp"}));
}

uint64_t load_elf(ModelImpl &model, const std::string &filename, bool main_file) {
  ELF elf = ELF::open(filename);

  switch (elf.architecture()) {
  case Architecture::RV32:
    if (model.zxlen != 32) {
      throw std::runtime_error("32-bit ELF is not supported by this model configuration.");
    }
    break;
  case Architecture::RV64:
    if (model.zxlen != 64) {
      throw std::runtime_error("64-bit ELF is not supported by this model configuration.");
    }
    break;
  }

  elf.load([](uint64_t address, const uint8_t *data, uint64_t length) {
    for (uint64_t i = 0; i < length; ++i) {
      write_mem(address + i, data[i]);
    }
  });

  if (main_file) {
    const auto symbols = elf.symbols();
    const auto &tohost = symbols.find("tohost");
    if (tohost == symbols.end()) {
      g_ctx.htif_tohost_address = std::nullopt;
      fprintf(stderr, "debug: tohost symbol not found; HTIF disabled.\n");
    } else {
      g_ctx.htif_tohost_address = tohost->second;
      fprintf(stdout, "HTIF located at 0x%0" PRIx64 "\n", *g_ctx.htif_tohost_address);
    }
  }

  return elf.entry();
}

bool init_context(const char *config_path, const char *elf_path) {
  if (elf_path == nullptr || elf_path[0] == '\0') {
    set_error("ELF path is empty.");
    return false;
  }

  clear_state_only();
  kill_mem();
  set_term_write_hook(capture_term_byte);

  g_ctx.model = std::make_unique<ModelImpl>();
  ModelImpl &model = *g_ctx.model;

  const std::string config_file = (config_path != nullptr) ? std::string(config_path) : std::string();
  try {
    validate_config_schema(config_file);
  } catch (const std::exception &exc) {
    set_error(std::string("config validation failed: ") + exc.what());
    return false;
  }

  if (config_file.empty()) {
    sail_config_set_string(get_default_config());
  } else {
    sail_config_set_file(config_file.c_str());
  }

  init_platform_constants(model);
  model.model_init();

  if (!model.zconfig_is_valid(UNIT)) {
    set_error("configuration is invalid.");
    return false;
  }

  uint64_t entry = 0;
  try {
    entry = load_elf(model, elf_path, /*main_file=*/true);
  } catch (const std::exception &exc) {
    set_error(std::string("failed to load ELF: ") + exc.what());
    return false;
  }

  fprintf(stdout, "Entry point: 0x%" PRIx64 "\n", entry);

  model.zset_pc_reset_address(entry);
  if (g_ctx.htif_tohost_address.has_value()) {
    model.zenable_htif(*g_ctx.htif_tohost_address);
  }
  model.zinit_model(config_file.empty() ? "" : config_file.c_str());
  model.zinit_boot_requirements(UNIT);

  g_ctx.insns_per_tick = get_config_uint64({"platform", "instructions_per_tick"});
  if (g_ctx.insns_per_tick == 0) {
    g_ctx.insns_per_tick = 1;
  }
  g_ctx.initialized = true;
  g_ctx.halted = false;
  g_ctx.exit_code = 0;
  g_ctx.last_error.clear();
  return true;
}

int do_step(uint32_t commit_budget) {
  if (!g_ctx.initialized || g_ctx.model == nullptr) {
    set_error("debug context is not initialized.");
    return -1;
  }
  if (g_ctx.halted) {
    return 0;
  }

  if (commit_budget == 0) {
    commit_budget = 1;
  }

  uint32_t committed = 0;
  uint64_t raw_loops = 0;
  const uint64_t max_raw_loops = static_cast<uint64_t>(commit_budget) * 4096 + 4096;
  auto &model = *g_ctx.model;

  while (!g_ctx.halted && committed < commit_budget) {
    if (++raw_loops > max_raw_loops) {
      set_error("step loop exceeded safety budget while waiting.");
      return -2;
    }

    model.call_pre_step_callbacks(g_ctx.is_waiting);

    sail_int sail_step;
    CREATE(sail_int)(&sail_step);
    CONVERT_OF(sail_int, mach_int)(&sail_step, g_ctx.step_no);
    g_ctx.is_waiting = model.ztry_step(sail_step, /*exit_wait=*/true);
    KILL(sail_int)(&sail_step);

    if (model.have_exception) {
      g_ctx.halted = true;
      g_ctx.exit_code = -1;
      set_error("Sail exception raised.");
      return -3;
    }

    model.call_post_step_callbacks(g_ctx.is_waiting);

    if (!g_ctx.is_waiting) {
      g_ctx.step_no++;
      g_ctx.insn_cnt++;
      g_ctx.total_steps++;
      committed++;
    }

    if (model.zhtif_done) {
      g_ctx.halted = true;
      g_ctx.exit_code = static_cast<int64_t>(model.zhtif_exit_code);
      if (g_ctx.exit_code == 0) {
        fprintf(stdout, "SUCCESS\n");
      } else {
        fprintf(stdout, "FAILURE: %" PRIi64 "\n", g_ctx.exit_code);
      }
      break;
    }

    if (g_ctx.insn_cnt >= g_ctx.insns_per_tick) {
      g_ctx.insn_cnt = 0;
      model.ztick_clock(UNIT);
    }
  }

  return static_cast<int>(committed);
}

uint16_t read_u16(uint64_t addr) {
  uint16_t b0 = static_cast<uint16_t>(read_mem(addr));
  uint16_t b1 = static_cast<uint16_t>(read_mem(addr + 1));
  return static_cast<uint16_t>(b0 | (b1 << 8));
}

uint32_t read_u32(uint64_t addr) {
  uint32_t b0 = static_cast<uint32_t>(read_mem(addr));
  uint32_t b1 = static_cast<uint32_t>(read_mem(addr + 1));
  uint32_t b2 = static_cast<uint32_t>(read_mem(addr + 2));
  uint32_t b3 = static_cast<uint32_t>(read_mem(addr + 3));
  return b0 | (b1 << 8) | (b2 << 16) | (b3 << 24);
}

struct DecodedInsn {
  int width = 16;
  uint64_t raw = 0;
  std::string text;
};

DecodedInsn decode_instruction_at_pc(ModelImpl &model, uint16_t inst16, uint32_t inst32) {
  DecodedInsn result;
  hart::zinstruction insn;
  if ((inst16 & 0x3u) != 0x3u) {
    result.width = 16;
    result.raw = static_cast<uint64_t>(inst16);
    model.zext_decode_compressed(&insn, result.raw);
  } else {
    result.width = 32;
    result.raw = static_cast<uint64_t>(inst32);
    model.zext_decode(&insn, result.raw);
  }

  sail_string asm_str;
  CREATE(sail_string)(&asm_str);
  if (model.zassembly_forwards_matches(insn)) {
    model.zassembly_forwards(&asm_str, insn);
  } else {
    model.zinstruction_to_str(&asm_str, insn);
  }
  result.text = asm_str;
  KILL(sail_string)(&asm_str);
  return result;
}

std::string build_state_json() {
  if (!g_ctx.initialized || g_ctx.model == nullptr) {
    return "{\"ok\":false,\"initialized\":false,\"error\":\"not initialized\"}";
  }

  auto &model = *g_ctx.model;
  const int xlen_nibbles = std::max(1, static_cast<int>((std::max<int64_t>(1, model.zxlen) + 3) / 4));
  const int flen_nibbles = std::max(1, static_cast<int>((std::max<int64_t>(1, model.zflen) + 3) / 4));

  const std::array<const sbits *, 31> xregs = {
    &model.zx1, &model.zx2, &model.zx3, &model.zx4, &model.zx5, &model.zx6, &model.zx7, &model.zx8,
    &model.zx9, &model.zx10, &model.zx11, &model.zx12, &model.zx13, &model.zx14, &model.zx15, &model.zx16,
    &model.zx17, &model.zx18, &model.zx19, &model.zx20, &model.zx21, &model.zx22, &model.zx23, &model.zx24,
    &model.zx25, &model.zx26, &model.zx27, &model.zx28, &model.zx29, &model.zx30, &model.zx31,
  };
  const std::array<const sbits *, 32> fregs = {
    &model.zf0, &model.zf1, &model.zf2, &model.zf3, &model.zf4, &model.zf5, &model.zf6, &model.zf7,
    &model.zf8, &model.zf9, &model.zf10, &model.zf11, &model.zf12, &model.zf13, &model.zf14, &model.zf15,
    &model.zf16, &model.zf17, &model.zf18, &model.zf19, &model.zf20, &model.zf21, &model.zf22, &model.zf23,
    &model.zf24, &model.zf25, &model.zf26, &model.zf27, &model.zf28, &model.zf29, &model.zf30, &model.zf31,
  };

  std::array<std::string, 32> xreg_values = {};
  xreg_values[0] = format_hex_u64(0, xlen_nibbles);
  for (size_t index = 0; index < xregs.size(); ++index) {
    xreg_values[index + 1] = format_hex_u64(xregs[index]->bits, xlen_nibbles);
  }

  std::array<std::string, 32> freg_values = {};
  for (size_t index = 0; index < fregs.size(); ++index) {
    freg_values[index] = format_hex_u64(fregs[index]->bits, flen_nibbles);
  }

  uint64_t pc = model.zPC.bits;
  uint16_t inst16 = read_u16(pc);
  uint32_t inst32 = read_u32(pc);
  const DecodedInsn decoded = decode_instruction_at_pc(model, inst16, inst32);

  std::ostringstream oss;
  oss << "{";
  oss << "\"ok\":true";
  oss << ",\"initialized\":true";
  oss << ",\"halted\":" << (g_ctx.halted ? "true" : "false");
  oss << ",\"step\":" << g_ctx.total_steps;
  oss << ",\"waiting\":" << (g_ctx.is_waiting ? "true" : "false");
  oss << ",\"exitCode\":" << g_ctx.exit_code;
  oss << ",\"haveException\":" << (model.have_exception ? "true" : "false");
  oss << ",\"htifDone\":" << (model.zhtif_done ? "true" : "false");
  oss << ",\"htifExitCode\":" << static_cast<int64_t>(model.zhtif_exit_code);
  oss << ",\"xlen\":" << model.zxlen;
  oss << ",\"flen\":" << model.zflen;
  oss << ",\"pc\":\"0x" << std::hex << pc << std::dec << "\"";
  oss << ",\"inst16\":\"0x" << std::hex << inst16 << std::dec << "\"";
  oss << ",\"inst32\":\"0x" << std::hex << inst32 << std::dec << "\"";
  oss << ",\"instWidth\":" << decoded.width;
  oss << ",\"instHex\":\"" << format_hex_u64(decoded.raw, std::max(1, decoded.width / 4)) << "\"";
  oss << ",\"disasm\":\"" << json_escape(decoded.text) << "\"";
  oss << ",\"xregAbi\":";
  {
    std::array<std::string, 32> abi_names = {};
    for (size_t index = 0; index < abi_names.size(); ++index) {
      abi_names[index] = kXRegAbiNames[index];
    }
    append_json_string_array(oss, abi_names);
  }
  oss << ",\"xregs\":";
  append_json_string_array(oss, xreg_values);
  oss << ",\"fregs\":";
  append_json_string_array(oss, freg_values);
  oss << ",\"programOutput\":\"" << json_escape(g_ctx.program_output) << "\"";
  oss << ",\"lastError\":\"" << json_escape(g_ctx.last_error) << "\"";
  oss << "}";
  return oss.str();
}

void reset_context() {
  if (g_ctx.model != nullptr && !g_ctx.model->have_exception) {
    g_ctx.model->model_fini();
  }
  set_term_write_hook(nullptr);
  clear_state_only();
  kill_mem();
}

} // namespace

extern "C" EMSCRIPTEN_KEEPALIVE int debug_init(const char *config_path, const char *elf_path) {
  return init_context(config_path, elf_path) ? 0 : -1;
}

extern "C" EMSCRIPTEN_KEEPALIVE int debug_init_default(void) {
  return init_context("/debug/config.json", "/debug/program.elf") ? 0 : -1;
}

extern "C" EMSCRIPTEN_KEEPALIVE int debug_step(int committed_steps) {
  if (committed_steps <= 0) {
    committed_steps = 1;
  }
  return do_step(static_cast<uint32_t>(committed_steps));
}

extern "C" EMSCRIPTEN_KEEPALIVE int debug_run(int max_committed_steps) {
  if (max_committed_steps <= 0) {
    max_committed_steps = 1;
  }
  int total = 0;
  while (total < max_committed_steps && !g_ctx.halted) {
    int done = do_step(1);
    if (done < 0) {
      return done;
    }
    total += done;
    if (done == 0 && g_ctx.halted) {
      break;
    }
  }
  return total;
}

extern "C" EMSCRIPTEN_KEEPALIVE const char *debug_state_json(void) {
  g_state_json_cache = build_state_json();
  return g_state_json_cache.c_str();
}

extern "C" EMSCRIPTEN_KEEPALIVE int debug_is_halted(void) {
  return g_ctx.halted ? 1 : 0;
}

extern "C" EMSCRIPTEN_KEEPALIVE int64_t debug_exit_code(void) {
  return g_ctx.exit_code;
}

extern "C" EMSCRIPTEN_KEEPALIVE const char *debug_last_error(void) {
  return g_ctx.last_error.c_str();
}

extern "C" EMSCRIPTEN_KEEPALIVE void debug_reset(void) {
  reset_context();
}

int main(int argc, char **argv) {
  if (argc < 3) {
    fprintf(stderr, "usage: %s <config.json> <program.elf> [steps]\n", argv[0]);
    return 0;
  }

  int max_steps = 1;
  if (argc >= 4) {
    max_steps = std::max(1, std::atoi(argv[3]));
  }

  int rc = debug_init(argv[1], argv[2]);
  if (rc != 0) {
    fprintf(stderr, "%s\n", debug_last_error());
    return 1;
  }

  (void)debug_run(max_steps);
  fprintf(stdout, "%s\n", debug_state_json());
  return 0;
}
