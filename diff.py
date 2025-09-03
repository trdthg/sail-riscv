import re
import sys

# get args
args = sys.argv[1:]

sail_log = open(args[0], "r")
spike_log = open(args[1], "r")


sail_log_row = sail_log.readlines()
spike_log_row = spike_log.readlines()
sail_log_row_len = len(sail_log_row)
spike_log_row_len = len(spike_log_row)

print(f"sail_log_row_len: {sail_log_row_len}, spike_log_row_len: {spike_log_row_len}")

step_no = 0
sail_current_index = 0
spike_current_index = 0


def find_step_state(current_index, max_index, data):
    res = {"step_no": 0, "inst": "", "regs": {}}
    # find sail insn
    for i in range(current_index, max_index):
        # regex match
        # [0] [M]: 0x0000000000001000 (0x00000297) auipc x5, 0x0
        # [2] [M]: 0x0000000000001008 (0xF1402573) csrrs x10, mhartid, x0
        match = re.match(
            r"^\[(\d+)\] \[\S+\]: 0x([0-9a-fA-F]+) \(0x([0-9a-fA-F]+)\) (.*)$",
            data[i],
        )
        if match:
            # get match last elem
            [sail_step_no, PC, inst_code, inst] = match.groups()
            res["step_no"] = sail_step_no
            res["inst"] = inst
            res["inst_code"] = str.lower(inst_code).lstrip("0")
            res["pc"] = str.lower(PC).lstrip("0")
            current_index = i + 1
            break

    reg_get_count = 0
    for i in range(current_index, max_index):
        match = re.match(r"^X(\d+): 0x([0-9a-f]+)$", data[i])
        if match:
            [sail_reg_no, sail_reg_val] = match.groups()
            res["regs"][f"X{sail_reg_no}"] = f"0x{sail_reg_val}"
            current_index = i + 1
            reg_get_count += 1
            if reg_get_count == 31:
                break

    return {"data": res, "index": current_index}


def find_spike_step_state(current_index, max_index, data):
    res = {"step_no": 0, "inst": "", "regs": {}}
    # find sail insn
    for i in range(current_index, max_index):
        # regex match
        # core   0: 0x0000000000001000 (0x00000297) auipc   t0, 0x0
        match = re.match(
            r"^core\s+(\d+): 0x([0-9a-fA-F]+) \(0x([0-9a-fA-F]+)\) (.*)$",
            data[i],
        )

        if match:
            # get match last elem
            [core_id, PC, inst_code, inst] = match.groups()
            res["inst"] = inst
            res["inst_code"] = str.lower(inst_code).lstrip("0")
            res["pc"] = str.lower(PC).lstrip("0")
            current_index = i + 1
            break

    reg_get_count = 0
    for i in range(current_index, max_index):
        match = re.match(r"^X(\d+): 0x([0-9a-f]+) $", data[i])
        if match:
            [reg_no, val] = match.groups()
            res["regs"][f"X{reg_no}"] = f"0x{val}"
            current_index = i + 1
            reg_get_count += 1
            if reg_get_count == 31:
                break

    return {"data": res, "index": current_index}


def compare_res(data1, data2):
    if data1["pc"] != data2["pc"]:
        print(f"pc: {data1['pc']} != {data2['pc']}")
        return False
    if data1["inst_code"] != data2["inst_code"]:
        print(f"inst_code: {data1['inst_code']} != {data2['inst_code']}")
        return False
    for key, value in data1["regs"].items():
        if data2["regs"][key] != value:
            print(f"reg[{key}]: {data1['regs'][key]} != {data2['regs'][key]}")
            return False
    return True


debug_count = 0
while (
    debug_count < 1200
    and sail_current_index < sail_log_row_len
    and spike_current_index < spike_log_row_len
):
    debug_count += 1
    print()
    sail_res = find_step_state(sail_current_index, sail_log_row_len, sail_log_row)
    sail_current_index = sail_res["index"]

    sail_res = sail_res["data"]
    print(sail_res)

    spike_res = find_spike_step_state(
        spike_current_index, spike_log_row_len, spike_log_row
    )
    spike_res["data"]["step_no"] = sail_res["step_no"]
    spike_current_index = spike_res["index"]

    spike_res = spike_res["data"]
    print(spike_res)

    if not compare_res(sail_res, spike_res):
        break
