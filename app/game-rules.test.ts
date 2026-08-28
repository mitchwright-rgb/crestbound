import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { soundSources } from './audio-assets.ts';
import { challengeMedal, chicagoDayKey, collectLightPower, dailyObjectiveForSerial, formatDailyReset, gravityForModifier, horizontalSpeedLimit, lightHuntTargets, millisecondsUntilNextChicagoDay, musicTrackForCourse, musicTrackForSeries, objectiveResultLabel, resetRunTiming, resolveDamage, runStorageKey, tailwindAcceleration, touchInputFromControls } from './game-rules.ts';
import { buildSeededCourse, checkpointHasClearLanding, checkpointIsSupported, courseSignature, maximumGroundGap } from './course-generator.ts';
import { buildDeclarationsCourse } from './series-course-generator.ts';
import { activeSeriesForDay, completedSeriesWeekIds, declarationsSeries, seriesWeekSeed } from './series-routes.ts';
import { checkNickname, publicNickname } from '../lib/nickname.ts';
import { normalizeEventMetadata } from '../lib/telemetry.ts';
import { parseMessageDetails, parseSeriesMessages } from '../lib/suncrest-messages.ts';

test('Moonstep lowers gravity while other twists preserve standard gravity', () => {
  assert.equal(gravityForModifier('moonstep'), 1350);
  assert.equal(gravityForModifier('clear'), 1850);
  assert.equal(gravityForModifier('sparkstorm'), 1850);
});

test('Tailwind strongly accelerates right, drifts while coasting, and resists leftward recovery', () => {
  assert.equal(tailwindAcceleration('tailwind', 1), 900);
  assert.equal(tailwindAcceleration('tailwind', 0), 180);
  assert.equal(tailwindAcceleration('tailwind', -1), 0);
  assert.equal(tailwindAcceleration('clear', 1), 0);
  assert.equal(horizontalSpeedLimit('tailwind', 1), 600);
  assert.equal(horizontalSpeedLimit('tailwind', 0), 600);
  assert.equal(horizontalSpeedLimit('tailwind', -1), 330);
  assert.equal(horizontalSpeedLimit('clear', 1), 430);
});

test('Gold Light shortens Dash recharge without going below zero', () => {
  assert.deepEqual(collectLightPower(false, 0.82), { dashCooldown: 0.47, shieldSeconds: 0 });
  assert.deepEqual(collectLightPower(false, 0.2), { dashCooldown: 0, shieldSeconds: 0 });
});

test('Storm Light always readies Dash and grants a seven-second shield', () => {
  assert.deepEqual(collectLightPower(true, 0.82), { dashCooldown: 0, shieldSeconds: 7 });
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
  for (const track of [...[0, 1, 2].map(musicTrackForCourse), musicTrackForSeries()]) {
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

test('personal bests and ghosts stay scoped to the exact daily route and mode', () => {
  const ranked = { courseId: 'crosswind', challengeId: '2026-08-27-layout-1', modifierId: 'tailwind' as const, practice: false };
  assert.equal(runStorageKey('best', ranked), 'crestbound-best-ranked-crosswind-2026-08-27-layout-1-tailwind');
  assert.notEqual(runStorageKey('ghost', ranked), runStorageKey('ghost', { ...ranked, challengeId: '2026-08-28-layout-1' }));
  assert.notEqual(runStorageKey('best', ranked), runStorageKey('best', { ...ranked, practice: true }));
});

test('releasing Jump cannot cancel or stick a separately held direction', () => {
  assert.deepEqual(touchInputFromControls(['right', 'jump']), { left: false, right: true, jump: true, dash: false });
  assert.deepEqual(touchInputFromControls(['right']), { left: false, right: true, jump: false, dash: false });
  assert.deepEqual(touchInputFromControls([]), { left: false, right: false, jump: false, dash: false });
});

test('family-safe nicknames pass after normalization', () => {
  assert.deepEqual(checkNickname('JL'), { ok: true, name: 'JL' });
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

test('Declarations rolls to a new weekly route every Sunday and remains available through Saturday', () => {
  assert.equal(activeSeriesForDay('2026-08-15'), null);
  assert.equal(activeSeriesForDay('2026-08-16')?.week.id, 'declarations-2026-w1');
  assert.equal(activeSeriesForDay('2026-08-22')?.week.id, 'declarations-2026-w1');
  assert.equal(activeSeriesForDay('2026-08-23')?.week.id, 'declarations-2026-w2');
  assert.equal(activeSeriesForDay('2026-09-13')?.week.id, 'declarations-2026-w5');
  assert.equal(activeSeriesForDay('2026-09-19')?.week.id, 'declarations-2026-w5');
  assert.equal(activeSeriesForDay('2026-09-20'), null);
});

test('Suncrest message pages expose the exact weekly content and resource links', () => {
  const summaries = parseSeriesMessages(`<a class="sp-media-item" href="/media/87drmvz/be-consistent"><div class="sp-media-title">Be Consistent</div><div class="sp-media-subtitle">Aug 23, 2026 &nbsp;<span>&bull;</span>&nbsp; Greg Lee</div></a>`);
  assert.deepEqual(summaries, [{ title: 'Be Consistent', date: '2026-08-23', speaker: 'Greg Lee', url: 'https://suncrest.org/media/87drmvz/be-consistent' }]);
  const details = parseMessageDetails(`<meta name="description" content="Everyday faithfulness &amp; courage." /><link rel="canonical" href="https://suncrest.org/media/87drmvz/be-consistent" /><a href="https://page.church/discuss" data-label="Discussion Guide">Discussion Guide</a><a href="https://page.church/read" data-label="Reading Guide">Reading Guide</a>`, summaries[0]);
  assert.equal(details.description, 'Everyday faithfulness & courage.');
  assert.equal(details.discussionGuideUrl, 'https://page.church/discuss');
  assert.equal(details.readingGuideUrl, 'https://page.church/read');
});

test('Series Route completion progress safely reads local storage', () => {
  const storage = { getItem: () => JSON.stringify(['declarations-2026-w1', 42, 'declarations-2026-w2']) };
  assert.deepEqual(completedSeriesWeekIds(storage, declarationsSeries.id), ['declarations-2026-w1', 'declarations-2026-w2']);
});

test('each Declarations week is structurally distinct and keeps recovery points safe', () => {
  const routes = declarationsSeries.weeks.map((week, index) => buildDeclarationsCourse(index, seriesWeekSeed(week.sunday)));
  assert.equal(new Set(routes.map(courseSignature)).size, declarationsSeries.weeks.length);
  for (const route of routes) {
    assert.ok(maximumGroundGap(route) <= 370);
    assert.ok(route.checkpoints.every((checkpoint) => checkpointIsSupported(route, checkpoint)));
    assert.ok(route.checkpoints.every((checkpoint) => checkpointHasClearLanding(route, checkpoint)));
    assert.ok(route.platforms.some((platform) => platform.y >= 600 && 15135 >= platform.x && 15135 <= platform.x + platform.w));
    assert.ok(route.sparkSeed.length <= 120);
  }
});

test('daily route generation is deterministic but changes with the date seed', () => {
  const first = buildSeededCourse(0, 'clear', 20693);
  const repeated = buildSeededCourse(0, 'clear', 20693);
  const tomorrow = buildSeededCourse(0, 'clear', 20694);
  assert.equal(courseSignature(first), courseSignature(repeated));
  assert.notEqual(courseSignature(first), courseSignature(tomorrow));
});

test('seeded routes stay structurally distinct and keep safe recovery paths', () => {
  for (const seed of [20693, 20694, 20700, 21000]) {
    const routes = [0, 1, 2].map((courseIndex) => buildSeededCourse(courseIndex, 'sparkstorm', seed));
    assert.equal(new Set(routes.map(courseSignature)).size, 3);
    for (const route of routes) {
      assert.ok(maximumGroundGap(route) <= 370);
      assert.ok(route.checkpoints.every((checkpoint) => checkpointIsSupported(route, checkpoint)));
      assert.ok(route.checkpoints.every((checkpoint) => checkpointHasClearLanding(route, checkpoint)));
      assert.ok(route.platforms.some((platform) => platform.y >= 600 && 15135 >= platform.x && 15135 <= platform.x + platform.w));
      assert.ok(route.sparkSeed.some((spark) => spark.storm));
    }
  }
});

test('a full year of daily routes keeps starts, checkpoints, and score limits safe', () => {
  const modifiers = ['clear', 'tailwind', 'moonstep', 'sparkstorm'] as const;
  for (let seed = 20693; seed < 20693 + 365; seed += 1) {
    for (let courseIndex = 0; courseIndex < 3; courseIndex += 1) {
      const route = buildSeededCourse(courseIndex, modifiers[(seed + courseIndex) % modifiers.length], seed);
      assert.ok(route.checkpoints.every((checkpoint) => checkpointIsSupported(route, checkpoint)));
      assert.ok(route.checkpoints.every((checkpoint) => checkpointHasClearLanding(route, checkpoint)));
      assert.ok(route.spikeZones.every((spike) => spike.x >= 760));
      assert.ok(route.enemySeed.every((enemy) => enemy.minX >= 760 && enemy.x >= enemy.minX && enemy.x <= enemy.maxX));
      assert.ok(route.sparkSeed.length <= 120);
    }
  }
});

test('daily objectives rotate predictably and award meaningful medal tiers', () => {
  const rotation = Array.from({ length: 4 }, (_, offset) => dailyObjectiveForSerial(20693 + offset, 0));
  assert.equal(new Set(rotation).size, 4);
  assert.equal(challengeMedal('sprint', { time: 54.9, sparks: 1, total: 40, lives: 1 }), 'GOLD');
  assert.equal(challengeMedal('sprint', { time: 70, sparks: 1, total: 40, lives: 1 }), 'SILVER');
  assert.equal(challengeMedal('light_hunt', { time: 200, sparks: 33, total: 40, lives: 1 }), 'GOLD');
  assert.equal(challengeMedal('clean_run', { time: 200, sparks: 1, total: 40, lives: 3, hits: 0 }), 'GOLD');
  assert.equal(challengeMedal('clean_run', { time: 200, sparks: 1, total: 40, lives: 3, hits: 1 }), 'SILVER');
  assert.equal(challengeMedal('clean_run', { time: 200, sparks: 1, total: 40, lives: 3, hits: 2 }), 'BRONZE');
  assert.equal(challengeMedal('skyline_mastery', { time: 74, sparks: 30, total: 40, lives: 2 }), 'GOLD');
  assert.equal(lightHuntTargets(82).gold, 68);
  assert.equal(objectiveResultLabel('light_hunt', { time: 60, sparks: 22, total: 40, lives: 2 }), '22/40 LIGHT · 55% · 11 MORE FOR GOLD');
  assert.equal(objectiveResultLabel('light_hunt', { time: 160, sparks: 40, total: 40, lives: 2 }), '40/40 LIGHT · 100% · GOLD TARGET MET');
});

test('production hosting migrations include the daily challenge columns', () => {
  const migration = readFileSync(new URL('../drizzle/0003_daily_layout_version.sql', import.meta.url), 'utf8');
  assert.match(migration, /ALTER TABLE run_context ADD COLUMN challenge_id/);
  assert.match(migration, /ALTER TABLE crest_scores ADD COLUMN challenge_id/);
});

test('production hosting migrations include Series Route completions', () => {
  const migration = readFileSync(new URL('../drizzle/0004_series_routes.sql', import.meta.url), 'utf8');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS series_completions/);
  assert.match(migration, /UNIQUE\(player_id, week_id\)/);
});
