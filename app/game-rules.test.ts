import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { soundSources } from './audio-assets.ts';
import { chicagoDayKey, collectLightPower, formatDailyReset, gravityForModifier, millisecondsUntilNextChicagoDay, musicTrackForCourse, resetRunTiming, resolveDamage, tailwindAcceleration } from './game-rules.ts';
import { checkNickname, publicNickname } from '../lib/nickname.ts';
import { normalizeEventMetadata } from '../lib/telemetry.ts';

test('Moonstep lowers gravity while other twists preserve standard gravity', () => {
  assert.equal(gravityForModifier('moonstep'), 1500);
  assert.equal(gravityForModifier('clear'), 1850);
  assert.equal(gravityForModifier('sparkstorm'), 1850);
});

test('Tailwind only adds forward acceleration while moving right', () => {
  assert.equal(tailwindAcceleration('tailwind', 1), 85);
  assert.equal(tailwindAcceleration('tailwind', -1), 0);
  assert.equal(tailwindAcceleration('clear', 1), 0);
});

test('Gold Light shortens Dash recharge without going below zero', () => {
  assert.deepEqual(collectLightPower(false, 0.82), { dashCooldown: 0.47, shieldSeconds: 0 });
  assert.deepEqual(collectLightPower(false, 0.2), { dashCooldown: 0, shieldSeconds: 0 });
});

test('Storm Light always readies Dash and grants a five-second shield', () => {
  assert.deepEqual(collectLightPower(true, 0.82), { dashCooldown: 0, shieldSeconds: 5 });
});

test('Storm Shield absorbs exactly one hit before lives can be lost', () => {
  assert.deepEqual(resolveDamage(3, 4.2), { lives: 3, shieldSeconds: 0, absorbed: true });
  assert.deepEqual(resolveDamage(3, 0), { lives: 2, shieldSeconds: 0, absorbed: false });
});

test('each route has its own named chiptune arrangement', () => {
  const tracks = [0, 1, 2].map(musicTrackForCourse);
  assert.equal(new Set(tracks.map((track) => track.name)).size, 3);
  assert.equal(new Set(tracks.map((track) => track.tempoMs)).size, 3);
  assert.equal(new Set(tracks.map((track) => track.melody.join(','))).size, 3);
  assert.equal(new Set(tracks.map((track) => track.src)).size, 3);
});

test('each route music asset is a playable WAV file', () => {
  for (const track of [0, 1, 2].map(musicTrackForCourse)) {
    const audio = readFileSync(new URL(`../public${track.src}`, import.meta.url));
    assert.equal(audio.subarray(0, 4).toString(), 'RIFF');
    assert.equal(audio.subarray(8, 12).toString(), 'WAVE');
    assert.ok(audio.length > 100_000);
  }
});

test('every player action has a playable retro sound effect', () => {
  assert.deepEqual(Object.keys(soundSources).sort(), ['checkpoint', 'dash', 'fall', 'hit', 'jump', 'light', 'win']);
  for (const src of Object.values(soundSources)) {
    const audio = readFileSync(new URL(`../public${src}`, import.meta.url));
    assert.equal(audio.subarray(0, 4).toString(), 'RIFF');
    assert.equal(audio.subarray(8, 12).toString(), 'WAVE');
    assert.ok(audio.length > 5_000);
  }
});

test('restarting a run resets both gameplay time and HUD refresh time', () => {
  assert.deepEqual(resetRunTiming(), { elapsed: 0, lastHud: 0 });
});

test('family-safe nicknames pass after normalization', () => {
  assert.deepEqual(checkNickname('  Sunny Dad  '), { ok: true, name: 'SUNNY DAD' });
  assert.deepEqual(checkNickname('Light-Runner'), { ok: true, name: 'LIGHT-RUNNER' });
  assert.deepEqual(checkNickname('Classy Grape'), { ok: true, name: 'CLASSY GRAPE' });
  assert.equal(publicNickname('SETHY'), 'SETHY');
});

test('nickname moderation rejects profanity and common obfuscation', () => {
  for (const name of ['F U C K', 'sh1t', 'fuuuck', 'n@zi', '69']) {
    assert.equal(checkNickname(name).ok, false, `${name} should be rejected`);
  }
});

test('unsafe stored nicknames never render publicly', () => {
  assert.equal(publicNickname('F U C K'), 'SUNCRESTER');
});

test('daily reset countdown targets the next Chicago calendar day', () => {
  const beforeSpringMidnight = new Date('2026-08-26T04:30:00.000Z');
  assert.equal(chicagoDayKey(beforeSpringMidnight), '2026-08-25');
  assert.equal(formatDailyReset(millisecondsUntilNextChicagoDay(beforeSpringMidnight)), '0H 30M');
  const beforeFallMidnight = new Date('2026-12-15T05:15:00.000Z');
  assert.equal(chicagoDayKey(beforeFallMidnight), '2026-12-14');
  assert.equal(formatDailyReset(millisecondsUntilNextChicagoDay(beforeFallMidnight)), '0H 45M');
});

test('event metadata keeps useful product signals without accepting arbitrary data', () => {
  assert.equal(normalizeEventMetadata({ mode: 'practice', reason: 'fall', lives: 2, secret: 'nope' }), '{"mode":"practice","reason":"fall","lives":2}');
  assert.equal(normalizeEventMetadata({ reason: 'x'.repeat(40) }), null);
});
