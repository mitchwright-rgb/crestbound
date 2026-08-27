export type SoundKind = 'jump' | 'dash' | 'light' | 'fall' | 'hit' | 'checkpoint' | 'win';

export const soundSources: Record<SoundKind, string> = {
  jump: '/audio/sfx-jump.wav',
  dash: '/audio/sfx-dash.wav',
  light: '/audio/sfx-light.wav',
  fall: '/audio/sfx-fall.wav',
  hit: '/audio/sfx-hurt.wav',
  checkpoint: '/audio/sfx-checkpoint.wav',
  win: '/audio/sfx-win.wav',
};

export const soundVolumes: Record<SoundKind, number> = {
  jump: .38,
  dash: .4,
  light: .38,
  fall: .42,
  hit: .45,
  checkpoint: .4,
  win: .5,
};
