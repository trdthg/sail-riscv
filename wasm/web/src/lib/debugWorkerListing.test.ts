import fs from 'node:fs'
import vm from 'node:vm'

import { describe, expect, it, vi } from 'vitest'

type WorkerTestApi = {
  parseObjdumpAddressMap?: (text: string) => Array<{ address: number; line: number; text: string }>
  buildSourceToDisasmLinks?: (
    lineEntries: Array<{ address: number; line: number | null }>,
    disasmEntries: Array<{ address: number; line: number }>
  ) => Array<{ sourceLine: number; expandedLines: number[] }>
  extractTraceRegWrites?: (
    lines: string[],
    committedPc?: string | number | null
  ) => Array<
    | { kind: 'reg'; name: string; value: string }
    | { kind: 'mem'; access: string; address: string; value: string }
  >
}

describe('debugWorker disassembly mapping', () => {
  it('builds source/disassembly links from objdump address mapping', () => {
    const workerUrl = new URL('../../public/workers/debugWorker.js', import.meta.url)
    const workerSource = fs.readFileSync(workerUrl, 'utf8')
    const sandbox: Record<string, unknown> = {
      self: { postMessage: vi.fn(), onmessage: null },
      __SAIL_DEBUG_WORKER_TEST_API__: {},
    }
    sandbox.globalThis = sandbox
    vm.runInNewContext(workerSource, sandbox, { filename: 'debugWorker.js' })

    const api = sandbox.__SAIL_DEBUG_WORKER_TEST_API__ as WorkerTestApi
    expect(typeof api.parseObjdumpAddressMap).toBe('function')
    expect(typeof api.buildSourceToDisasmLinks).toBe('function')

    const objdumpText = `
/tmp/edit/generated_program.elf:     file format elf64-littleriscv

Disassembly of section .text:

0000000080000000 <_start>:
    80000000:   04800513                li a0,72
    80000004:   00a2a023                sw a0,0(t0)
    80000008:   06500513                li a0,101
    8000000c:   00a2a023                sw a0,0(t0)
`

    const disasmEntries = api.parseObjdumpAddressMap?.(objdumpText) ?? []
    expect(disasmEntries).toHaveLength(4)
    expect(disasmEntries[0]).toMatchObject({
      address: 0x80000000,
      text: '    80000000:   04800513                li a0,72',
    })

    const lineEntries = [
      { address: 0x80000000, line: 15 },
      { address: 0x80000008, line: 16 },
    ]
    const links = api.buildSourceToDisasmLinks?.(lineEntries, disasmEntries) ?? []
    expect(links).toEqual([
      { sourceLine: 15, expandedLines: [disasmEntries[0].line, disasmEntries[1].line] },
      { sourceLine: 16, expandedLines: [disasmEntries[2].line, disasmEntries[3].line] },
    ])
  })

  it('extracts reg+mem writes from committed instruction block', () => {
    const workerUrl = new URL('../../public/workers/debugWorker.js', import.meta.url)
    const workerSource = fs.readFileSync(workerUrl, 'utf8')
    const sandbox: Record<string, unknown> = {
      self: { postMessage: vi.fn(), onmessage: null },
      __SAIL_DEBUG_WORKER_TEST_API__: {},
    }
    sandbox.globalThis = sandbox
    vm.runInNewContext(workerSource, sandbox, { filename: 'debugWorker.js' })

    const api = sandbox.__SAIL_DEBUG_WORKER_TEST_API__ as WorkerTestApi
    expect(typeof api.extractTraceRegWrites).toBe('function')

    const writes =
      api.extractTraceRegWrites?.(
        [
          '[2] [M]: 0x0000000080002008 (0x04800513) addi a0, zero, 0x48',
          'a0 <- 0x0000000000000048',
          '[3] [M]: 0x000000008000200C (0x00A2A023) sw a0, 0x0(t0)',
          'mem[W,0x00000000020C0000] <- 0x00000048',
          '[4] [M]: 0x0000000080002010 (0x01010537) lui a0, 0x1010',
        ],
        '0x000000008000200C'
      ) ?? []

    expect(writes).toEqual([
      {
        kind: 'mem',
        access: 'W',
        address: '0x00000000020C0000',
        value: '0x00000048',
      },
    ])
  })
})
