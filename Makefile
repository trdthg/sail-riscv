DOWNLOAD_GMP=FALSE

jib:
	set -e
	cmake -S . -B build -DCMAKE_BUILD_TYPE=RelWithDebInfo -DDOWNLOAD_GMP="${DOWNLOAD_GMP}" -DDUMP_JIB=TRUE
	cmake --build build --target generated_model_jib_rv64d -j10
