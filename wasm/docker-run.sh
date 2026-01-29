#!/usr/bin/env bash
set -euo pipefail

here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "${here}/.." && pwd)"

SAIL_VERSION="${SAIL_VERSION:-0.20.1}"
SAIL_URL="${SAIL_URL:-https://github.com/rems-project/sail/releases/download/${SAIL_VERSION}/sail-Linux-x86_64.tar.gz}"

gmp_dist_host="${GMP_WASM_DIST:-${repo_root}/wasm/gmp-wasm/binding/gmp/dist}"
if [[ ! -f "${gmp_dist_host}/lib/libgmp.a" ]]; then
  echo "error: GMP_WASM_DIST not found at ${gmp_dist_host}" >&2
  echo "hint: build gmp-wasm on host (wasm/gmp-wasm/binding/build-gmp.sh) or set GMP_WASM_DIST." >&2
  exit 1
fi

image="${EMSDK_IMAGE:-emscripten/emsdk:latest}"

gmp_dist_container="${gmp_dist_host}"
case "${gmp_dist_host}" in
  "${repo_root}"/*)
    gmp_dist_container="/work${gmp_dist_host#${repo_root}}"
    ;;
esac

docker_mounts=(
  -v "${repo_root}:/work"
)

docker_envs=(
  -e GMP_WASM_DIST="${gmp_dist_container}"
)

# Optional: mount a prebuilt Sail release (untarred), and prepend its bin to PATH.
# Default to repo-local wasm/sail if present, otherwise download it.
if [[ -z "${SAIL_HOST_DIR:-}" ]]; then
  if [[ -x "${repo_root}/wasm/sail/bin/sail" ]]; then
    SAIL_HOST_DIR="${repo_root}/wasm/sail"
  else
    echo "Sail not found; downloading ${SAIL_VERSION}..." >&2
    tmp_dir="$(mktemp -d)"
    archive="${tmp_dir}/sail.tar.gz"
    if command -v curl >/dev/null 2>&1; then
      curl -L "${SAIL_URL}" -o "${archive}"
    elif command -v wget >/dev/null 2>&1; then
      wget -O "${archive}" "${SAIL_URL}"
    else
      echo "error: neither curl nor wget is available to download Sail." >&2
      exit 1
    fi
    sail_top="$(tar -tzf "${archive}" | head -1 | cut -d/ -f1)"
    tar -xzf "${archive}" -C "${tmp_dir}"
    rm -rf "${repo_root}/wasm/sail"
    mv "${tmp_dir}/${sail_top}" "${repo_root}/wasm/sail"
    rm -rf "${tmp_dir}"
    SAIL_HOST_DIR="${repo_root}/wasm/sail"
  fi
fi
if [[ -n "${SAIL_HOST_DIR:-}" ]]; then
  if [[ ! -x "${SAIL_HOST_DIR}/bin/sail" ]]; then
    echo "error: SAIL_HOST_DIR does not contain bin/sail: ${SAIL_HOST_DIR}" >&2
    exit 1
  fi
  docker_mounts+=(-v "${SAIL_HOST_DIR}:/sail")
  docker_envs+=(-e SAIL_BIN="/sail/bin/sail")
fi

docker run --rm -it \
  "${docker_mounts[@]}" \
  -w /work \
  "${docker_envs[@]}" \
  "${image}" \
  bash -lc "
    set -euo pipefail
    if [ -f /emsdk/emsdk_env.sh ]; then source /emsdk/emsdk_env.sh >/dev/null 2>&1; fi
    if [ -d /sail/bin ]; then export PATH=\"/sail/bin:\$PATH\"; fi

    repo_root=/work
    gmp_dist_default=\"\${repo_root}/wasm/gmp-wasm/binding/gmp/dist\"
    web_public=\"\${repo_root}/wasm/web/public\"
    build_dir=\"\${repo_root}/build-emscripten\"
    GMP_WASM_DIST=\"\${GMP_WASM_DIST:-\${gmp_dist_default}}\"

    link_flags=\"-s MODULARIZE=1 -s EXPORT_NAME=createSailModule -s INVOKE_RUN=0 -s EXIT_RUNTIME=0 -s ALLOW_MEMORY_GROWTH=1 -s EXPORTED_RUNTIME_METHODS=callMain,FS -s DISABLE_EXCEPTION_CATCHING=0 -s LEGALIZE_JS_FFI=1 -s EMULATE_FUNCTION_POINTER_CASTS=1 -s ASSERTIONS=2 -s STACK_SIZE=4194304\"

    emcmake cmake -S \"\${repo_root}\" -B \"\${build_dir}\" \\
      -DCMAKE_BUILD_TYPE=Release \\
      -DGMP_WASM_DIST=\"\${GMP_WASM_DIST}\" \\
      -DCMAKE_EXE_LINKER_FLAGS=\"\${link_flags}\" \\
      -DCMAKE_CROSSCOMPILING_EMULATOR=\"/bin/true\"

    cmake --build \"\${build_dir}\" --target sail_riscv_web -j

    mkdir -p \"\${web_public}\"
    cp -f \"\${build_dir}/c_emulator/sail_riscv_web.js\" \"\${web_public}/sail_riscv_web.js\"
    cp -f \"\${build_dir}/c_emulator/sail_riscv_web.wasm\" \"\${web_public}/sail_riscv_web.wasm\"
    echo \"built: \${web_public}/sail_riscv_web.js\"
    echo \"built: \${web_public}/sail_riscv_web.wasm\"
  "
