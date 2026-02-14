export function toErrorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function formatFailureStatus(prefix: string, error: unknown): string {
  return `${prefix}: ${toErrorText(error)}`
}

export function readHalted(state: Record<string, unknown> | null | undefined): boolean {
  if (!state || typeof state !== 'object') {
    return false
  }
  return Boolean(state.halted)
}

export function readExitCode(state: Record<string, unknown> | null | undefined): number {
  if (!state || typeof state !== 'object') {
    return 0
  }
  const value = Number((state as { exitCode?: unknown }).exitCode)
  return Number.isFinite(value) ? value : 0
}

export function formatHaltedStatus(state: Record<string, unknown> | null | undefined): string {
  return `Halted (exit=${readExitCode(state)})`
}

export function formatSteppedStatus(committed: unknown): string {
  const numeric = Number(committed)
  return `Stepped ${Number.isFinite(numeric) ? numeric : 0} instruction(s).`
}

export function formatStepLineReachedStatus(committed: unknown): string {
  const numeric = Number(committed)
  return `Stepped to next line (${Number.isFinite(numeric) ? numeric : 0} instruction(s)).`
}

export function formatStepLineLimitStatus(committed: unknown): string {
  const numeric = Number(committed)
  return `Step line limit reached (${Number.isFinite(numeric) ? numeric : 0} instruction(s)).`
}

export function formatRunStatus(args: { exitCode: number; runName: string }): string {
  if (args.exitCode === 0) {
    return `Run finished: ${args.runName}`
  }
  return `Run failed with exit code ${args.exitCode}`
}
