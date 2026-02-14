import type { ReactNode } from 'react';

type RuntimeKeepAliveSlotProps = {
  activePage: 'explorer' | 'runtime';
  runtimeEverMounted: boolean;
  explorerContent: ReactNode;
  runtimeContent: ReactNode;
};

export function RuntimeKeepAliveSlot({
  activePage,
  runtimeEverMounted,
  explorerContent,
  runtimeContent,
}: RuntimeKeepAliveSlotProps) {
  return (
    <>
      <div hidden={activePage !== 'explorer'}>
        {explorerContent}
      </div>
      {runtimeEverMounted ? (
        <div className={activePage === 'runtime' ? 'flex-1 min-h-0' : 'hidden'}>
          {runtimeContent}
        </div>
      ) : null}
    </>
  );
}
