import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { soundSources } from './audio-assets.ts';
import { challengeMedal, chicagoDayKey, collectLightPower, crestScoreBreakdown, dailyObjectiveForSerial, dashVelocity, formatDailyReset, gravityForModifier, horizontalSpeedLimit, jumpReleaseGravity, jumpVelocityForModifier, lightHuntTargets, millisecondsUntilNextChicagoDay, musicTrackForCourse, musicTrackForSeries, objectiveResultLabel, resetRunTiming, resolveDamage, runStorageKey, seriesBeaconReached, tailwindAcceleration, touchInputFromControls } from './game-rules.ts';
import { buildSeededCourse, checkpointHasClearLanding, checkpointIsSupported, courseSignature, maximumGroundGap } from './course-generator.ts';
import { buildDeclarationsCourse } from './series-course-generator.ts';
import { activeSeriesForDay, completedSeriesWeekIds, declarationsSeries, seriesWeekSeed } from './series-routes.ts';
import { checkNickname, publicNickname } from '../lib/nickname.ts';
import { normalizeEventMetadata } from '../lib/telemetry.ts';
import { parseMessageDetails, parseSeriesMessages } from '../lib/suncrest-messages.ts';

test('Moonstep lowers gravity while other twists preserve standard gravity', () => {
  assert.equal(gravityForModifier('moonstep'), 1050);
  assert.equal(gravityForModifier('clear'), 1850);
  assert.equal(gravityForModifier('sparkstorm'), 1850);
});

test('Moonstep has a visibly stronger jump and a gentler phone-tap release', () => {
  assert.equal(jumpVelocityForModifier('moonstep', 0), -780);
  assert.equal(jumpVelocityForModifier('moonstep', 1), -700);
  assert.equal(jumpVelocityForModifier('clear', 0), -690);
  assert.equal(jumpReleaseGravity('moonstep'), 650);
  assert.equal(jumpReleaseGravity('clear'), 1450);
});

test('Dash preserves its burst velocity for the full active window', () => {
  assert.equal(dashVelocity(.19, 1, 430), 900);
  assert.equal(dashVelocity(.01, -1, -430), -900);
  assert.equal(dashVelocity(0, 1, 318), 318);
});

test('Crest Score rewards finishing, pace, normalized Light, and the route challenge', () => {
  assert.deepEqual(crestScoreBreakdown({ time: 40, sparks: 30, total: 60, medal: 'SILVER' }), { finish: 500, pace: 800, light: 400, bonus: 100, total: 1800 });
  assert.ok(crestScoreBreakdown({ time: 40, sparks: 60, total: 60, medal: 'GOLD' }).total > crestScoreBreakdown({ time: 40, sparks: 30, total: 60, medal: 'GOLD' }).total);
  assert.ok(crestScoreBreakdown({ time: 35, sparks: 30, total: 60, medal: 'GOLD' }).total > crestScoreBreakdown({ time: 55, sparks: 30, total: 60, medal: 'GOLD' }).total);
  assert.equal(crestScoreBreakdown({ time: 40, sparks: 30, total: 60, signatureCount: 3 }).bonus, 200);
});

test('Series Declaration Beacons activate reliably across every route height', () => {
  assert.equal(seriesBeaconReached(920, 48, 1000), false);
  assert.equal(seriesBeaconReached(976, 48, 1000), true);
  assert.equal(seriesBeaconReached(1220, 48, 1000), true);
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
  assert.equal(runStorageKey('score', ranked), 'crestbound-score-ranked-crosswind-2026-08-27-layout-1-tailwind');
  assert.notEqual(runStorageKey('ghost', ranked), runStorageKey('ghost', { ...ranked, challengeId: '2026-08-28-layout-1' }));
  assert.notEqual(runStorageKey('best', ranked), runStorageKey('best', { ...ranked, practice: true }));
  assert.notEqual(runStorageKey('score', ranked), runStorageKey('score', { ...ranked, challengeId: '2026-08-28-layout-1' }));
  assert.notEqual(runStorageKey('score', ranked), runStorageKey('score', { ...ranked, practice: true }));
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

test('server and client share one authoritative Chicago day during hydration', () => {
  const pageSource = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
  const gameSource = readFileSync(new URL('./crestbound-game.tsx', import.meta.url), 'utf8');
  assert.match(pageSource, /<CrestboundGame initialDay=\{chicagoDayKey\(\)\}/);
  assert.match(gameSource, /function Home\(\{ initialDay \}/);
  assert.doesNotMatch(gameSource, /^const localDay\s*=/m);
});

test('event metadata keeps useful product signals without accepting arbitrary data', () => {
  assert.equal(normalizeEventMetadata({ mode: 'practice', reason: 'fall', lives: 2, hits: 3, scoreDelta: -182, newBest: 0, lightPercent: 72.6, dashCount: 4, secret: 'nope' }), '{"mode":"practice","reason":"fall","lives":2,"hits":3,"scoreDelta":-182,"newBest":0,"lightPercent":73,"dashCount":4}');
  assert.equal(normalizeEventMetadata({ reason: 'x'.repeat(40) }), null);
});

test('Declarations rolls to a new weekly route every Sunday and remains available through Saturday', () => {
  assert.equal(activeSeriesForDay('2026-08-15'), null);
  assert.equal(activeSeriesForDay('2026-08-16')?.week.id, 'declarations-2026-w1');
  assert.equal(activeSeriesForDay('2026-08-22')?.week.id, 'declarations-2026-w1');
  assert.equal(activeSeriesForDay('2026-08-23')?.week.id, 'declarations-2026-w2');
  assert.equal(activeSeriesForDay('2026-09-13')?.week.id, 'declarations-2026-w5');
  assert.equal(activeSeriesForDay('2026-09-19')?.week.id, 'declarations-2026-w5');
  assert.equal(activeSeriesForDay('2026-09-20')?.week.id, 'at-the-movies-2026-w1');
  assert.equal(activeSeriesForDay('2026-09-26')?.week.id, 'at-the-movies-2026-w1');
  assert.equal(activeSeriesForDay('2026-09-27')?.week.id, 'at-the-movies-2026-w2');
  assert.equal(activeSeriesForDay('2026-10-03')?.week.id, 'at-the-movies-2026-w2');
  assert.equal(activeSeriesForDay('2026-10-04'), null);
  assert.equal(activeSeriesForDay('2026-10-11')?.series.id, 'soundtrack-2026');
  assert.equal(activeSeriesForDay('2026-11-01')?.series.id, 'trust-issues-2026');
  assert.equal(activeSeriesForDay('2026-12-06')?.series.id, 'behold-2026');
});

test('Suncrest message pages expose the exact weekly content and resource links', () => {
  const summaries = parseSeriesMessages(`<a class="sp-media-item" href="/media/87drmvz/be-consistent"><div class="sp-media-title">Be Consistent</div><div class="sp-media-subtitle">Aug 23, 2026 &nbsp;<span>&bull;</span>&nbsp; Greg Lee</div></a>`);
  assert.deepEqual(summaries, [{ title: 'Be Consistent', date: '2026-08-23', speaker: 'Greg Lee', url: 'https://suncrest.org/media/87drmvz/be-consistent' }]);
  const details = parseMessageDetails(`<meta name="description" content="Everyday faithfulness &amp; courage." /><link rel="canonical" href="https://suncrest.org/media/87drmvz/be-consistent" /><a href="https://page.church/discuss" data-label="Discussion Guide">Discussion Guide</a><a href="https://page.church/read" data-label="Reading Guide">Reading Guide</a>`, summaries[0]);
  assert.equal(details.description, 'Everyday faithfulness & courage.');
  assert.equal(details.appUrl, 'https://suncrestchurch.subspla.sh/87drmvz');
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
    assert.equal(route.rallyPoints?.length, 3);
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

test('production hosting migrations include Crest Score and every-run Community Light', () => {
  const migration = readFileSync(new URL('../drizzle/0005_crest_score.sql', import.meta.url), 'utf8');
  assert.match(migration, /ALTER TABLE crest_scores ADD COLUMN crest_score/);
  assert.match(migration, /ALTER TABLE series_completions ADD COLUMN best_score/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS community_light_contributions/);
  assert.match(migration, /contribution_id TEXT PRIMARY KEY/);
});

test('daily scores accept every verified Light on generated routes', () => {
  const migration = readFileSync(new URL('../drizzle/0006_expand_daily_light.sql', import.meta.url), 'utf8');
  const schema = readFileSync(new URL('../db/schema.ts', import.meta.url), 'utf8');
  assert.match(migration, /sparks INTEGER NOT NULL DEFAULT 0 CHECK\(sparks >= 0\)/);
  assert.doesNotMatch(migration, /sparks BETWEEN 0 AND 64/);
  assert.match(schema, /sparks INTEGER NOT NULL DEFAULT 0 CHECK\(sparks >= 0\)/);
  assert.match(schema, /challenge_id TEXT NOT NULL DEFAULT 'legacy'/);
});

test('post-run layouts keep Daily and Series results distinct and landscape-safe', () => {
  const game = readFileSync(new URL('./crestbound-game.tsx', import.meta.url), 'utf8');
  const styles = readFileSync(new URL('./globals.css', import.meta.url), 'utf8');
  assert.match(game, /isSeries \? 'series-win' : 'daily-win'/);
  assert.match(game, /mechanicName/);
  assert.match(game, /SERIES RUN RECORDED/);
  assert.match(game, /NEW PERSONAL BEST/);
  assert.match(game, /POINTS FROM YOUR BEST/);
  assert.match(game, /BADGE EARNED/);
  assert.match(game, /series-completion-progress/);
  assert.match(game, /mechanicAction/);
  assert.match(game, /series-status/);
  assert.match(game, /Back to Series Routes/);
  assert.match(game, /Watch This Week&apos;s Message/);
  assert.match(game, /crestbound-series-mechanic-seen-\$\{seriesWeek\?\.id/);
  assert.match(game, /Highest score wins\./);
  assert.match(game, /track\('scoring_learned'/);
  assert.match(game, /track\('personal_best'/);
  assert.match(game, /back-home-action[\s\S]*?Back to Home/);
  assert.match(game, /!isSeries && <button className="secondary"[\s\S]*?View Leaderboard/);
  assert.match(styles, /grid-template-columns: minmax\(0, 1\.08fr\) minmax\(300px, \.92fr\)/);
  assert.match(styles, /\.win-modal \.result-actions \{[\s\S]*?grid-column: 1 \/ -1/);
  assert.match(styles, /\.score-tally\.new-best/);
  assert.match(styles, /\.series-completion-progress/);
  assert.match(styles, /\.series-mechanic/);
  assert.match(styles, /\.message-result-cta/);
});

test('menu guidance uses readable in-place views instead of a scrolling document', () => {
  const game = readFileSync(new URL('./crestbound-game.tsx', import.meta.url), 'utf8');
  const styles = readFileSync(new URL('./globals.css', import.meta.url), 'utf8');
  assert.match(game, /type HelpTab = 'play' \| 'score' \| 'world'/);
  assert.match(game, /role="tablist"/);
  assert.match(game, /aria-controls="help-tabpanel"/);
  assert.match(game, /EVERY FINISH COUNTS/);
  assert.match(game, /Daily Twists/);
  assert.match(styles, /Single-viewport menus/);
  assert.match(styles, /\.how-to\.home-panel \{[\s\S]*?overflow: hidden/);
  assert.match(styles, /\.series-results-panel\.home-panel \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(styles, /\.win-modal \.result-actions \{ grid-template-columns: 1fr 1fr/);
  assert.match(styles, /\.help-play \{[\s\S]*?align-content: start/);
  assert.match(styles, /\.leaderboard \.board-list li\.score-board \{ align-items: start; align-content: start/);
  assert.match(styles, /\.leaderboard\.home-panel \{[\s\S]*?display: flex;[\s\S]*?flex-direction: column;[\s\S]*?margin: 0/);
  assert.match(styles, /\.leaderboard \.board-tabs button \{ min-height: 44px/);
  assert.match(styles, /\.leaderboard \.board-list \{ min-height: 0; display: flex; flex-direction: column/);
  assert.match(styles, /\.board-table \{ min-height: 0; display: grid; grid-template-rows: auto auto minmax\(0, 1fr\)/);
  assert.match(game, /<div className="board-table">[\s\S]*?<ol className="board-list"/);
  assert.match(game, /<div className="board-context">[\s\S]*?<button className="panel-close"/);
  assert.match(styles, /\.series-results-panel\.home-panel \{[\s\S]*?height: auto;[\s\S]*?grid-template-rows: 44px auto auto 44px/);
  assert.match(styles, /\.series-results-panel \.series-results ol \{[\s\S]*?display: flex; flex-direction: column/);
  assert.match(game, /<header><h3>Top Scores<\/h3>/);
});

test('home summary stays pinned to today while leaderboard filters change', () => {
  const game = readFileSync(new URL('./crestbound-game.tsx', import.meta.url), 'utf8');
  const leaderboard = readFileSync(new URL('./api/leaderboard/route.ts', import.meta.url), 'utf8');
  assert.match(game, /const \[dailyLeader, setDailyLeader\]/);
  assert.match(game, /const \[dailyPlayers, setDailyPlayers\]/);
  assert.match(game, /const loadDailySummary = useCallback/);
  assert.match(game, /board: 'daily'/);
  assert.match(game, /setDailyLeader\(data\.entries\?\.\[0\] \?\? null\)/);
  assert.match(game, /setDailyPlayers\(data\.players \?\? 0\)/);
  assert.match(game, /TODAY&apos;S TOP/);
  assert.match(game, /dailyPlayers === undefined \? 'CHECKING…'/);
  assert.doesNotMatch(game, /<small>TOP SCORE<\/small><b>\{entries\[0\]/);
  assert.doesNotMatch(game, /<small>TODAY<\/small><b>\{community\.players/);
  assert.match(leaderboard, /players: ranked\.length/);
  assert.match(leaderboard, /weeklyPlayers: summary\?\.players \?\? 0/);
  assert.match(game, /const requestId = \+\+boardRequestRef\.current/);
  assert.match(game, /const requestId = \+\+dailySummaryRequestRef\.current/);
  assert.match(game, /if \(requestId !== boardRequestRef\.current\) return/);
  assert.match(game, /if \(requestId !== dailySummaryRequestRef\.current\) return/);
});
