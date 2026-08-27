export type ModifierId = 'clear' | 'tailwind' | 'moonstep' | 'sparkstorm';
export type TouchControl = 'left' | 'right' | 'jump' | 'dash';
export type DailyObjectiveId = 'sprint' | 'light_hunt' | 'clean_run' | 'skyline_mastery';
export type ChallengeMedal = 'BRONZE' | 'SILVER' | 'GOLD';

export const dailyObjectiveSpecs: Record<DailyObjectiveId, { name: string; short: string; description: string }> = {
  sprint: { name: 'Skyline Sprint', short: 'BEAT THE CLOCK', description: 'Gold under 0:55 · Silver under 1:15' },
  light_hunt: { name: 'Light Hunt', short: 'FIND THE LIGHT', description: 'Gold at 82% · Silver at 60%' },
  clean_run: { name: 'Perfect Landing', short: 'STAY UNTOUCHED', description: 'Gold with 0 hits · Silver with only 1' },
  skyline_mastery: { name: 'Skyline Mastery', short: 'SPEED + LIGHT', description: 'Gold under 1:15 with 70% Light' },
};

export function dailyObjectiveForSerial(daySerial: number, courseIndex: number): DailyObjectiveId {
  const objectives: DailyObjectiveId[] = ['sprint', 'light_hunt', 'clean_run', 'skyline_mastery'];
  return objectives[((daySerial * 3 + courseIndex) % objectives.length + objectives.length) % objectives.length];
}

export function challengeMedal(objective: DailyObjectiveId, result: { time: number; sparks: number; total: number; lives: number; hits?: number }): ChallengeMedal {
  const lightRatio = result.total > 0 ? result.sparks / result.total : 0;
  if (objective === 'sprint') return result.time <= 55 ? 'GOLD' : result.time <= 75 ? 'SILVER' : 'BRONZE';
  if (objective === 'light_hunt') return lightRatio >= .82 ? 'GOLD' : lightRatio >= .6 ? 'SILVER' : 'BRONZE';
  if (objective === 'clean_run') return (result.hits ?? 3 - result.lives) === 0 ? 'GOLD' : (result.hits ?? 3 - result.lives) === 1 ? 'SILVER' : 'BRONZE';
  return result.time <= 75 && lightRatio >= .7 ? 'GOLD' : result.time <= 90 || lightRatio >= .55 ? 'SILVER' : 'BRONZE';
}

export function objectiveResultLabel(objective: DailyObjectiveId, result: { time: number; sparks: number; total: number; lives: number; hits?: number }) {
  if (objective === 'sprint') return `${result.time.toFixed(1)} SEC`;
  if (objective === 'light_hunt') return `${result.sparks}/${result.total} LIGHT`;
  if (objective === 'clean_run') return `${result.hits ?? 3 - result.lives} HITS`;
  const percentage = result.total > 0 ? Math.round(result.sparks / result.total * 100) : 0;
  return `${result.time.toFixed(1)} SEC · ${percentage}% LIGHT`;
}

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
  if (modifierId !== 'tailwind') return 0;
  if (direction > 0) return 900;
  if (direction === 0) return 180;
  return 0;
}

export function horizontalSpeedLimit(modifierId: ModifierId, direction: number) {
  if (modifierId !== 'tailwind') return 430;
  return direction < 0 ? 330 : 600;
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
