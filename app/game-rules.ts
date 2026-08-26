export type ModifierId = 'clear' | 'tailwind' | 'moonstep' | 'sparkstorm';

export function gravityForModifier(modifierId: ModifierId) {
  return modifierId === 'moonstep' ? 1500 : 1850;
}

export function tailwindAcceleration(modifierId: ModifierId, direction: number) {
  return modifierId === 'tailwind' && direction > 0 ? 85 : 0;
}

export function collectLightPower(storm: boolean, dashCooldown: number) {
  return storm
    ? { dashCooldown: 0, shieldSeconds: 5 }
    : { dashCooldown: Math.max(0, dashCooldown - 0.35), shieldSeconds: 0 };
}

export function resolveDamage(lives: number, shieldSeconds: number) {
  if (shieldSeconds > 0) return { lives, shieldSeconds: 0, absorbed: true };
  return { lives: Math.max(0, lives - 1), shieldSeconds: 0, absorbed: false };
}
