.PHONY: *



log.sail.bbl:
	./build/c_emulator/sail_riscv_sim --config ./log.rv64d.json --trace-all ~/riscv/riscv64-unknown-elf/bin/bbl > log.sail.bbl 2>&1 

log.spike.bbl:
	timeout 1s 
	spike --isa=rv64gc  -l --log ./log.spike.bbl ~/riscv/riscv64-unknown-elf/bin/bbl > log.spike.bbl 2>&1


steps = 10000

log.sail.pk:
	./build/c_emulator/sail_riscv_sim --config ./log.rv64d.json --inst-limit $(steps) --trace-all ~/riscv/riscv64-unknown-elf/bin/pk  > log.sail.pk 2>&1
log.spike.pk:
	spike --instructions $(steps) -l --log ./log.spike.pk ~/riscv/riscv64-unknown-elf/bin/pk > log.spike.pk 2>&1
log.diff.pk: log.sail.pk log.spike.pk
	python3 ./diff.py log.sail.pk log.spike.pk

gen-sail-dts:
	./build/c_emulator/sail_riscv_sim --config ./log.rv64d.json --print-device-tree > log.dts.sail
compile-dtb: gen-sail-dts
	dtc -I dts -O dtb -o log.dtb.sail log.dts.sail
	dtc -I dts -O dtb -o log.dtb.spike log.dts.spike
cosim:
	./build/c_emulator/sail_riscv_sim --inst-limit 106600 --device-tree-blob ./log.dtb.sail --config ./log.rv64d.json --enable-spike --trace-all ~/riscv/riscv64-unknown-elf/bin/pk > log.cosim 2>&1
run-sail:
	./build/c_emulator/sail_riscv_sim --inst-limit 106600 --device-tree-blob ./log.dtb.sail --config ./log.rv64d.json                --trace-all ~/riscv/riscv64-unknown-elf/bin/pk > log.run.pk.sail
run-sail2:
	../sail-riscv-syscall/build/c_emulator/sail_riscv_sim --inst-limit 106600 --device-tree-blob ./log.dtb.sail --config ./log.rv64d.json                --trace-all ~/riscv/riscv64-unknown-elf/bin/pk > log.run.pk.sail

run-spike:
	spike --isa=rv64gc -l ~/riscv/riscv64-unknown-elf/bin/pk > log.run.pk.spike 2>&1
