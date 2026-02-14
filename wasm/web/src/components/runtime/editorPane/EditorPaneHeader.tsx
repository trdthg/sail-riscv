type EditorPaneHeaderArgs = {
  showDualPane: boolean
  isUploadMode: boolean
  leftIsProgram: boolean
  panelBarClass: string
  tabActiveClass: string
}

export function EditorPaneHeader({
  showDualPane,
  isUploadMode,
  leftIsProgram,
  panelBarClass,
  tabActiveClass,
}: EditorPaneHeaderArgs) {
  return (
    <div className={`flex items-center gap-2 px-2 py-1 ${panelBarClass}`}>
      {showDualPane ? (
        <>
          <span className={`rounded px-2 py-1 text-[11px] font-medium ${tabActiveClass}`}>
            {leftIsProgram ? 'program.S' : 'link.ld'}
          </span>
          <span className="text-[11px] opacity-60">↔</span>
          <span className={`rounded px-2 py-1 text-[11px] font-medium ${tabActiveClass}`}>
            objdump.S
          </span>
          <span className="ml-1 text-[10px] uppercase tracking-[0.08em] opacity-60">
            same color = same source mapping
          </span>
        </>
      ) : isUploadMode ? (
        <span className={`rounded px-2 py-1 text-[11px] font-medium ${tabActiveClass}`}>disasm.S</span>
      ) : (
        <span className={`rounded px-2 py-1 text-[11px] font-medium ${tabActiveClass}`}>link.ld</span>
      )}
    </div>
  )
}
