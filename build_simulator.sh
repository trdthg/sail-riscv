#!/bin/sh

set -e

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "${repo_root}"

: "${DOWNLOAD_GMP:=TRUE}"
: "${ENABLE_RISCV_TESTS:=FALSE}"
: "${FIRST_PARTY_TESTS:=FALSE}"
: "${ENABLE_RISCV_AME_TESTS:=TRUE}"
: "${GENERATE_RISCV_AME_TESTS:=TRUE}"

if [ "${ENABLE_RISCV_AME_TESTS}" != "FALSE" ] && [ "${GENERATE_RISCV_AME_TESTS}" != "FALSE" ]; then
  generated_ame_test_dir="${repo_root}/build/test/ame/generated"
  python3 test/ame/gen/gen_ame_tests.py \
    --sail-ame-root "${repo_root}" \
    --out-dir "${generated_ame_test_dir}"
fi

cmake -S "${repo_root}" -B "${repo_root}/build" \
  -DCMAKE_BUILD_TYPE=RelWithDebInfo \
  -DDOWNLOAD_GMP="${DOWNLOAD_GMP}" \
  -DENABLE_RISCV_TESTS="${ENABLE_RISCV_TESTS}" \
  -DENABLE_RISCV_AME_TESTS="${ENABLE_RISCV_AME_TESTS}" \
  -DFIRST_PARTY_TESTS="${FIRST_PARTY_TESTS}"
jobs=$( (nproc || sysctl -n hw.ncpu || echo 2) 2>/dev/null)
cmake --build "${repo_root}/build" -j${jobs}
ctest --test-dir "${repo_root}/build" -R '^ame_' --output-on-failure
