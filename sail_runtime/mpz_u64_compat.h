#pragma once

#include <limits.h>
#include <stdint.h>
#include <stdio.h>

#include <gmp.h>

#if ULONG_MAX < UINT64_MAX
static inline uint64_t sail_mpz_get_ui64_compat(const mpz_t op) {
  uint64_t value = 0;
  size_t written = 0;
  mpz_export(&value, &written, -1, sizeof(value), 0, 0, op);
  return value;
}

static inline void sail_mpz_set_ui64_compat(mpz_t rop, uint64_t value) {
  mpz_import(rop, 1, -1, sizeof(value), 0, 0, &value);
}

static inline void sail_mpz_init_set_ui64_compat(mpz_t rop, uint64_t value) {
  mpz_init(rop);
  sail_mpz_set_ui64_compat(rop, value);
}

#undef mpz_get_ui
#undef mpz_set_ui
#undef mpz_init_set_ui
#define mpz_get_ui sail_mpz_get_ui64_compat
#define mpz_set_ui sail_mpz_set_ui64_compat
#define mpz_init_set_ui sail_mpz_init_set_ui64_compat
#endif
