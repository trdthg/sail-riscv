import { useEffect } from 'react';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

import { RuntimeKeepAliveSlot } from './RuntimeKeepAliveSlot';

describe('RuntimeKeepAliveSlot', () => {
  it('keeps runtime subtree mounted after first runtime activation', () => {
    let mounts = 0;
    let unmounts = 0;

    const RuntimeProbe = () => {
      useEffect(() => {
        mounts += 1;
        return () => {
          unmounts += 1;
        };
      }, []);
      return <div data-testid="runtime-probe">runtime</div>;
    };

    const explorerContent = <div data-testid="explorer-probe">explorer</div>;

    const { rerender, unmount } = render(
      <RuntimeKeepAliveSlot
        activePage="explorer"
        runtimeEverMounted={false}
        explorerContent={explorerContent}
        runtimeContent={<RuntimeProbe />}
      />
    );

    expect(mounts).toBe(0);

    rerender(
      <RuntimeKeepAliveSlot
        activePage="runtime"
        runtimeEverMounted
        explorerContent={explorerContent}
        runtimeContent={<RuntimeProbe />}
      />
    );
    expect(mounts).toBe(1);
    expect(unmounts).toBe(0);

    rerender(
      <RuntimeKeepAliveSlot
        activePage="explorer"
        runtimeEverMounted
        explorerContent={explorerContent}
        runtimeContent={<RuntimeProbe />}
      />
    );
    expect(mounts).toBe(1);
    expect(unmounts).toBe(0);

    rerender(
      <RuntimeKeepAliveSlot
        activePage="runtime"
        runtimeEverMounted
        explorerContent={explorerContent}
        runtimeContent={<RuntimeProbe />}
      />
    );
    expect(mounts).toBe(1);
    expect(unmounts).toBe(0);

    unmount();
    expect(unmounts).toBe(1);
  });
});
