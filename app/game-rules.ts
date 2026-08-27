export type ModifierId = 'clear' | 'tailwind' | 'moonstep' | 'sparkstorm';
export type TouchControl = 'left' | 'right' | 'jump' | 'dash';

export function touchInputFromControls(controls: Iterable<TouchControl>) {
  const active = new Set(controls);
  return { left: active.has('left'), right: active.has('right'), jump: active.has('jump'), dash: active.has('dash') };
}

export type MusicTrack = {
  name: string;
  src: string;
  tempoMs: number;
  melody: readonly number[];
  bass: readonly number[];
  lead: OscillatorType;
  bassVoice: OscillatorType;
};

const musicTracks: readonly MusicTrack[] = [
  {
    name: 'Golden Hour Run', src: '/audio/goldline-theme.wav', tempoMs: 120, lead: 'square', bassVoice: 'triangle',
    melody: [659, 0, 784, 0, 880, 784, 659, 0, 587, 0, 659, 784, 523, 0, 587, 0, 659, 784, 988, 0, 880, 784, 659, 587, 523, 0, 440, 523, 587, 0, 494, 0],
    bass: [131, 165, 110, 147, 131, 196, 165, 147],
  },
  {
    name: 'Blue Sky Circuit', src: '/audio/crosswind-theme.wav', tempoMs: 108, lead: 'square', bassVoice: 'sine',
    melody: [784, 988, 1175, 0, 1047, 988, 880, 0, 784, 880, 988, 1175, 1319, 0, 1175, 988, 880, 1047, 1175, 0, 988, 880, 784, 659, 784, 0, 880, 988, 1047, 0, 988, 880],
    bass: [147, 196, 165, 220, 147, 247, 196, 165],
  },
  {
    name: 'Rainline After Dark', src: '/audio/nightshift-theme.wav', tempoMs: 136, lead: 'triangle', bassVoice: 'square',
    melody: [440, 0, 523, 0, 587, 523, 466, 0, 392, 0, 440, 523, 349, 0, 392, 0, 440, 523, 622, 0, 587, 523, 466, 392, 349, 0, 311, 349, 392, 0, 330, 0],
    bass: [110, 131, 98, 117, 110, 147, 131, 98],
  },
] as const;

export function musicTrackForCourse(courseIndex: number): MusicTrack {
  return musicTracks[Math.max(0, Math.min(musicTracks.length - 1, Math.trunc(courseIndex)))];
}

export function resetRunTiming() {
  return { elapsed: 0, lastHud: 0 };
}

export function gravityForModifier(modifierId: ModifierId) {
  return modifierId === 'moonstep' ? 1350 : 1850;
}

export function tailwindAcceleration(modifierId: ModifierId, direction: number) {
  return modifierId === 'tailwind' && direction > 0 ? 360 : 0;
}

export function horizontalSpeedLimit(modifierId: ModifierId, direction: number) {
  return modifierId === 'tailwind' && direction > 0 ? 520 : 430;
}

export function collectLightPower(storm: boolean, dashCooldown: number) {
  return storm
    ? { dashCooldown: 0, shieldSeconds: 7 }
    : { dashCooldown: Math.max(0, dashCooldown - 0.35), shieldSeconds: 0 };
}

export function resolveDamage(lives: number, shieldSeconds: number) {
  if (shieldSeconds > 0) return { lives, shieldSeconds: 0, absorbed: true };
  return { lives: Math.max(0, lives - 1), shieldSeconds: 0, absorbed: false };
}

export function chicagoDayKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(date);
}

export function millisecondsUntilNextChicagoDay(now = new Date()) {
  const currentKey = chicagoDayKey(now);
  let lower = now.getTime();
  let upper = lower + 30 * 60 * 60 * 1000;
  while (upper - lower > 1000) {
    const midpoint = Math.floor((lower + upper) / 2);
    if (chicagoDayKey(new Date(midpoint)) === currentKey) lower = midpoint;
    else upper = midpoint;
  }
  return Math.max(0, upper - now.getTime());
}

export function formatDailyReset(milliseconds: number) {
  const totalMinutes = Math.max(0, Math.floor(milliseconds / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}H ${String(minutes).padStart(2, '0')}M`;
}
