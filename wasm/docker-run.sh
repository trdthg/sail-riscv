#!/usr/bin/env bash
set -euo pipefail

here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "${here}/.." && pwd)"

SAIL_VERSION="${SAIL_VERSION:-0.20.1}"
SAIL_URL="${SAIL_URL:-https://github.com/rems-project/sail/releases/download/${SAIL_VERSION}/sail-Linux-x86_64.tar.gz}"

gmp_dist_host="${GMP_WASM_DIST:-${repo_root}/wasm/gmp-wasm/binding/gmp/dist}"
[[ -f "${gmp_dist_host}/lib/libgmp.a" ]] || { echo "error: GMP_WASM_DIST not found at ${gmp_dist_host}" >&2; exit 1; }

image="${EMSDK_IMAGE:-emscripten/emsdk:latest}"

gmp_dist_container="/work${gmp_dist_host#${repo_root}}"


# Use repo-local wasm/sail if present, otherwise download.
sail_dir="${repo_root}/wasm/sail"
if [[ ! -x "${sail_dir}/bin/sail" ]]; then
  echo "Sail not found; downloading ${SAIL_VERSION}..." >&2
  archive="/tmp/sail.tar.gz"
  curl -L "${SAIL_URL}" -o "${archive}"
  tar -xzf "${archive}" -C "${repo_root}/wasm"
fi

docker run --rm -i \
  -u "$(id -u):$(id -g)" \
  -v "${repo_root}:/work" \
  -w /work \
  -e GMP_WASM_DIST="${gmp_dist_container}" \
  -v "${sail_dir}:/sail" \
  -e SAIL_BIN="/sail/bin/sail" \
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

    link_flags=\"-s MODULARIZE=1 -s EXPORT_NAME=createSailModule -s INVOKE_RUN=0 -s EXIT_RUNTIME=0 -s ALLOW_MEMORY_GROWTH=1 -s EXPORTED_RUNTIME_METHODS=callMain,FS,HEAPU8 -s DISABLE_EXCEPTION_CATCHING=0 -s WASM_BIGINT=1 -s EMULATE_FUNCTION_POINTER_CASTS=1 -s ASSERTIONS=2 -s STACK_SIZE=4194304\"

    emcmake cmake -S \"\${repo_root}\" -B \"\${build_dir}\" \\
      -DCMAKE_BUILD_TYPE=Release \\
      -DGMP_WASM_DIST=\"\${GMP_WASM_DIST}\" \\
      -DCMAKE_EXE_LINKER_FLAGS=\"\${link_flags}\" \\
      -DCMAKE_CROSSCOMPILING_EMULATOR=\"/bin/true\"

    cmake --build \"\${build_dir}\" --target sail_riscv_web sail_riscv_sim sail_riscv_debug -j

  "

# Organize public assets for the web build.
mkdir -p "${repo_root}/wasm/web/public/wasm" "${repo_root}/wasm/web/public/config"
cp -f "${repo_root}/build-emscripten/c_emulator/sail_riscv_web.js" "${repo_root}/wasm/web/public/sail_riscv_web.js"
cp -f "${repo_root}/build-emscripten/c_emulator/sail_riscv_web.wasm" "${repo_root}/wasm/web/public/sail_riscv_web.wasm"
cp -f "${repo_root}/build-emscripten/c_emulator/sail_riscv_sim.js" "${repo_root}/wasm/web/public/sail_riscv_sim.js"
cp -f "${repo_root}/build-emscripten/c_emulator/sail_riscv_sim.wasm" "${repo_root}/wasm/web/public/sail_riscv_sim.wasm"
cp -f "${repo_root}/build-emscripten/c_emulator/sail_riscv_debug.js" "${repo_root}/wasm/web/public/sail_riscv_debug.js"
cp -f "${repo_root}/build-emscripten/c_emulator/sail_riscv_debug.wasm" "${repo_root}/wasm/web/public/sail_riscv_debug.wasm"
echo "built: ${repo_root}/wasm/web/public/sail_riscv_web.js"
echo "built: ${repo_root}/wasm/web/public/sail_riscv_web.wasm"
echo "built: ${repo_root}/wasm/web/public/sail_riscv_sim.js"
echo "built: ${repo_root}/wasm/web/public/sail_riscv_sim.wasm"
echo "built: ${repo_root}/wasm/web/public/sail_riscv_debug.js"
echo "built: ${repo_root}/wasm/web/public/sail_riscv_debug.wasm"
cp -f "${repo_root}/wasm/web/public/"*.wasm "${repo_root}/wasm/web/public/"*.js "${repo_root}/wasm/web/public/wasm/"
config_src="${repo_root}/build-emscripten/config"
if compgen -G "${config_src}/*.json" > /dev/null; then
  cp -f "${config_src}/"*.json "${repo_root}/wasm/web/public/config/"
  configs_json="${repo_root}/wasm/web/public/config/configs.json"
  tmp_configs="${configs_json}.tmp"
  default_name="rv64d_v128_e64"
  {
    echo '['
    first=1
    for f in $(ls "${config_src}"/*.json | sort); do
      name="$(basename "${f}" .json)"
      label="${name}"
      is_default=false
      if [[ "${name}" == "${default_name}" ]]; then
        label="${name} (default)"
        is_default=true
      fi
      if [[ ${first} -eq 1 ]]; then
        first=0
      else
        echo ','
      fi
      printf '  {"label":"%s","path":"/config/%s.json","default":%s}' "${label}" "${name}" "${is_default}"
    done
    echo
    echo ']'
  } > "${tmp_configs}"
  mv -f "${tmp_configs}" "${configs_json}"
fi
