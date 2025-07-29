#include "inttypes.h"
#include "cstddef"
#include "mem_if.h"
#include "rts.h"

typedef uint64_t reg_t;
typedef int64_t sreg_t;
typedef reg_t addr_t;

void chunked_memif_t::read_chunk(addr_t taddr, size_t nbytes, void *dst)
{
  uint8_t *dest_bytes = static_cast<uint8_t *>(dst);
  for (size_t i = 0; i < nbytes; ++i) {
    dest_bytes[i] = read_mem(taddr + i);
  }
}

// 将 src 中的 nbytes 字节写入到 taddr
void chunked_memif_t::write_chunk(addr_t taddr, size_t nbytes, const void *src)
{
  const uint8_t *src_bytes = static_cast<const uint8_t *>(src);
  for (size_t i = 0; i < nbytes; ++i) {
    // 每次写入一个字节
    write_mem(taddr + i, src_bytes[i]);
  }
}

// 将 taddr 开始的 nbytes 字节清零 (写入 0)
void chunked_memif_t::clear_chunk(addr_t taddr, size_t nbytes)
{
  for (size_t i = 0; i < nbytes; ++i) {
    write_mem(taddr + i, 0); // 写入 0
  }
}

void memif_t::read(addr_t addr, size_t nbytes, void *bytes)
{
  chunked_memif_t::read_chunk(addr, nbytes, bytes);
}

void memif_t::write(addr_t addr, size_t nbytes, const void *bytes)
{
  chunked_memif_t::write_chunk(addr, nbytes, bytes);
}

uint8_t memif_t::read_uint8(addr_t addr)
{
  uint8_t res = 0;
  read(addr, 1, &res);
  return res;
}

void memif_t::write_uint8(addr_t addr, uint8_t val)
{
  write(addr, 1, &val);
}