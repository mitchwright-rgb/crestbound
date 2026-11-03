import type { ReactNode } from 'react';

type PortraitGameShellProps = {
  children: ReactNode;
  controls: ReactNode;
  label: string;
  theme?: string;
};

/**
 * Shared portrait console for Crestbound and future Suncrest games.
 * Individual games provide the screen and controls; the device never changes.
 */
export default function PortraitGameShell({ children, controls, label, theme }: PortraitGameShellProps) {
  return (
    <main className="portrait-game-shell">
      <section className="game-frame portrait-game-frame" data-series-theme={theme} aria-label={label}>
        <header className="handheld-brand" aria-hidden="true">
          <span>SUNCREST ARCADE</span>
          <strong>CRESTBOUND</strong>
          <i>01</i>
        </header>
        <div className="handheld-screen">{children}</div>
        <footer className="handheld-control-bay">{controls}<span className="handheld-speaker" aria-hidden="true" /></footer>
      </section>
    </main>
  );
}
