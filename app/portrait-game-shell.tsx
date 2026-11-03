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
        <footer className="handheld-control-bay">
          <div className="handheld-internals" aria-hidden="true">
            <svg viewBox="0 0 430 360" role="presentation">
              <path className="circuit-trace" d="M25 45h74v36h72v42h88v-28h118M43 289h72v-43h86v-36h86v42h107M55 150h48v38h54M374 151h-65v35h-52" />
              <g className="phone-board">
                <rect x="96" y="84" width="238" height="186" rx="18" />
                <circle cx="126" cy="114" r="11" /><circle cx="158" cy="114" r="11" />
                <rect x="240" y="101" width="66" height="34" rx="6" />
                <path d="M112 151h62v22h-62zM267 166h46v67h-46zM110 220h82v28h-82z" />
              </g>
              <g className="hamster-core">
                <circle className="hamster-wheel" cx="215" cy="194" r="48" />
                <circle className="hamster-body" cx="216" cy="207" r="22" />
                <circle className="hamster-ear" cx="202" cy="188" r="9" />
                <circle className="hamster-ear" cx="229" cy="188" r="9" />
                <circle className="hamster-face" cx="216" cy="198" r="18" />
                <circle className="hamster-eye" cx="210" cy="195" r="2.5" />
                <circle className="hamster-eye" cx="222" cy="195" r="2.5" />
                <path className="hamster-smile" d="M212 202q4 5 8 0" />
                <path className="hamster-feet" d="M197 226l-13 8M235 226l13 8" />
                <text x="215" y="258" textAnchor="middle">HAMSTER CORE</text>
              </g>
              <g className="battery-pack"><rect x="32" y="196" width="58" height="95" rx="8" /><rect x="49" y="187" width="24" height="11" rx="3" /><text x="61" y="236" textAnchor="middle">SUN</text><text x="61" y="250" textAnchor="middle">CELL</text><text x="61" y="270" textAnchor="middle">100%</text></g>
              <g className="tiny-chip"><rect x="343" y="196" width="54" height="58" rx="7" /><text x="370" y="220" textAnchor="middle">JOY</text><text x="370" y="235" textAnchor="middle">CHIP</text></g>
            </svg>
          </div>
          {controls}
          <span className="handheld-speaker" aria-hidden="true" />
        </footer>
      </section>
    </main>
  );
}
