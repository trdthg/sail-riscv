/dts-v1/;

/ {
  #address-cells = <2>;
  #size-cells = <2>;
  compatible = "ucbbar,spike-bare-dev";
  model = "ucbbar,spike-bare";
  chosen {
    bootargs = "console=hvc0 earlycon=sbi";
  };
  cpus {
    #address-cells = <1>;
    #size-cells = <0>;
    timebase-frequency = <500000000>;
    CPU0: cpu@0 {
      device_type = "cpu";
      reg = <0>;
      status = "okay";
      compatible = "riscv";
      riscv,isa-base = "rv64i";
      riscv,isa = "rv64imafdc_zicbom_zicboz_zicntr_zicond_zicsr_zifencei_zihpm_zimop_zabha_zacas_zawrs_zfa_zfh_zca_zcb_zcd_zcmop_zbc_zbkb_zbkc_zbkx_zknd_zkne_zknh_zkr_zksed_zksh_zkt_zvbb_zvbc_zvkg_zvkned_zvknha_zvknhb_zvksed_zvksh_zvkt_sscofpmf_sstc_svinval_smcntrpmf";
      riscv,isa-extensions = "i", "m", "a", "f", "d", "c", "zicbom", "zicboz", "zicntr", "zicond", "zicsr", "zifencei", "zihpm", "zimop", "zabha", "zacas", "zawrs", "zfa", "zfh", "zca", "zcb", "zcd", "zcmop", "zbc", "zbkb", "zbkc", "zbkx", "zknd", "zkne", "zknh", "zkr", "zksed", "zksh", "zkt", "zvbb", "zvbc", "zvkg", "zvkned", "zvknha", "zvknhb", "zvksed", "zvksh", "zvkt", "sscofpmf", "sstc", "svinval", "smcntrpmf";
      mmu-type = "riscv,sv57";
      clock-frequency = <1000000000>;
      CPU0_intc: interrupt-controller {
        #address-cells = <2>;
        #interrupt-cells = <1>;
        interrupt-controller;
        compatible = "riscv,cpu-intc";
      };
    };
  };
  memory@80000000 {
    device_type = "memory";
    reg = <0x0 0x80000000 0x0 0x80000000>;
  };
  soc {
    #address-cells = <2>;
    #size-cells = <2>;
    compatible = "ucbbar,spike-bare-soc", "simple-bus";
    ranges;
    clint@2000000 {
      compatible = "riscv,clint0";
      interrupts-extended = <&CPU0_intc 3 &CPU0_intc 7>;
      reg = <0x0 0x2000000 0x0 0xc0000>;
    };
  };
  htif {
    compatible = "ucb,htif0";
  };
};
