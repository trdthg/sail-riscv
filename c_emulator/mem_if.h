#include "inttypes.h"

typedef uint64_t reg_t;
typedef int64_t sreg_t;
typedef reg_t addr_t;

class chunked_memif_t {
public:
  static void read_chunk(addr_t taddr, size_t len, void *dst);
  static void write_chunk(addr_t taddr, size_t len, const void *src);
  static void clear_chunk(addr_t taddr, size_t len);
};

class memif_t {
public:
  static void read(addr_t addr, size_t len, void *bytes);
  static void write(addr_t addr, size_t len, const void *bytes);

  static uint8_t read_uint8(addr_t addr);
  static void write_uint8(addr_t addr, uint8_t val);
};
