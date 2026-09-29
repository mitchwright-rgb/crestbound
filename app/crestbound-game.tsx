'use client';

import { FormEvent, PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SoundKind, soundSources, soundVolumes } from './audio-assets';
import { challengeMedal, chicagoDayKey, collectLightPower, crestScoreBreakdown, dailyObjectiveSpecs, dashVelocity, formatDailyReset, gravityForModifier, horizontalSpeedLimit, jumpReleaseGravity, jumpVelocityForModifier, millisecondsUntilNextChicagoDay, musicTrackForCourse, musicTrackForSeries, objectiveResultLabel, resetRunTiming, resolveDamage, runStorageKey, seriesBeaconReached, tailwindAcceleration, touchInputFromControls, type CrestScoreBreakdown } from './game-rules';
import { buildSeededCourse } from './course-generator';
import { buildSeriesCourse } from './series-course-generator';
import { activeSeriesForDay, completedSeriesWeekIds, seriesWeekSeed } from './series-routes';
import { checkNickname } from '@/lib/nickname';
import { dailyChallengeIdForDay } from '@/lib/daily-challenge';
import { routeConditionSpecs, type DailyRouteConfig } from '@/lib/daily-route';

type Screen = 'title' | 'playing' | 'paused' | 'won' | 'over';
type Hud = { sparks: number; total: number; lives: number; hits: number; time: number; best: number | null; checkpoint: number; progress: number; dashReady: boolean; shield: number; signatureCount: number };
type Board = 'daily' | 'weekly' | 'all';
type BoardEntry = { rank: number; name: string; score: number; timeMs: number; sparks: number; points?: number; runs?: number };
type HomePanel = 'none' | 'leaderboard' | 'help' | 'series' | 'series-results' | 'resource';
type HelpTab = 'play' | 'score' | 'world';
type GameNotice = { text: string; kind: 'checkpoint' | 'power' };
type SeriesMessage = { title: string; date: string; speaker: string; url: string; appUrl: string | null; description: string; discussionGuideUrl: string | null; readingGuideUrl: string | null };
type SeriesBoardEntry = { rank: number; name: string; score: number; timeMs: number; lights: number; isPlayer: boolean };

type Community = { players: number; lights: number; goal: number; nearby: BoardEntry[]; playerRank: number | null; recent: string[] };

const WORLD_W = 15400;
const FINISH_X = 15135;
const VIEW_W = 1280;
const VIEW_H = 720;

const courseSpecs = [
  { id: 'goldline', name: 'Goldline Rooftops', short: 'GOLDLINE', accent: '#f5d263', description: 'Balanced rooftops, branching high paths, and precision shortcuts.' },
  { id: 'crosswind', name: 'Crosswind Heights', short: 'CROSSWIND', accent: '#78d7d2', description: 'Long aerial chains, moving platforms, and dash-heavy gaps.' },
  { id: 'nightshift', name: 'Night Shift', short: 'NIGHT SHIFT', accent: '#ef6f52', description: 'Low tunnels, hazard lanes, and an enemy-heavy sprint.' },
] as const;
const modifierSpecs = [
  { id: 'clear', name: 'Clear Skies', description: 'The standard route: normal gravity, normal wind, and familiar light.', shortDescription: 'Standard gravity, wind, and Light.' },
  { id: 'tailwind', name: 'Tailwind', description: 'A strong eastbound wind makes rightward jumps much faster, pushes Sunny while coasting, and resists moving left.', shortDescription: 'Eastbound wind boosts rightward movement.' },
  { id: 'moonstep', name: 'Moonstep', description: 'Low gravity makes every jump dramatically higher and keeps Sunny airborne longer.', shortDescription: 'Low gravity sends jumps higher and longer.' },
  { id: 'sparkstorm', name: 'Spark Storm', description: 'Extra teal Storm Lights appear throughout the route. Each recharges Dash and shields one hit for seven seconds.', shortDescription: 'Teal Lights ready Dash and shield one hit.' },
] as const;


function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = (seconds % 60).toFixed(1).padStart(4, '0');
  return `${minutes}:${remainder}`;
}

export default function Home({ initialDay, initialDailyRoute }: { initialDay: string; initialDailyRoute: DailyRouteConfig }) {
  const localDay = initialDay;
  const daySerial = initialDailyRoute.serial;
  const dailyChallengeId = initialDailyRoute.challengeId || dailyChallengeIdForDay(localDay);
  const dailyCourseIndex = initialDailyRoute.courseIndex;
  const dailyCourse = courseSpecs[dailyCourseIndex];
  const dailyModifier = modifierSpecs.find((item) => item.id === initialDailyRoute.modifierId) ?? modifierSpecs[0];
  const dailyObjectiveId = initialDailyRoute.objectiveId;
  const dailyCondition = routeConditionSpecs[initialDailyRoute.conditionId];
  const activeSeries = useMemo(() => activeSeriesForDay(localDay), [localDay]);
  const [seriesMode, setSeriesMode] = useState(false);
  const [seriesWeekIndex, setSeriesWeekIndex] = useState(activeSeries?.weekIndex ?? 0);
  const seriesWeek = activeSeries?.series.weeks[seriesWeekIndex] ?? null;
  const isSeries = seriesMode && Boolean(activeSeries);
  const isPractice = isSeries;
  const activeCourseIndex = isSeries ? seriesWeekIndex % courseSpecs.length : dailyCourseIndex;
  const course = isSeries
    ? { id: activeSeries!.series.id, name: seriesWeek!.routeName, short: activeSeries!.series.shortName, accent: '#ef4638', description: activeSeries!.series.description }
    : courseSpecs[activeCourseIndex];
  const modifier = isSeries ? modifierSpecs[0] : dailyModifier;
  const objectiveId = isSeries ? seriesWeek!.objective : dailyObjectiveId;
  const objective = dailyObjectiveSpecs[objectiveId];
  const routeSeed = isSeries ? seriesWeekSeed(seriesWeek!.sunday) : daySerial;
  const courseData = useMemo(() => isSeries
    ? buildSeriesCourse(seriesWeekIndex, routeSeed)
    : buildSeededCourse(activeCourseIndex, modifier.id, routeSeed, initialDailyRoute.conditionId), [activeCourseIndex, initialDailyRoute.conditionId, isSeries, modifier.id, routeSeed, seriesWeekIndex]);
  const { platforms, spikeZones, sparkSeed, enemySeed, checkpoints, rallyPoints: rallySeed = [] } = courseData;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const touchControlsRef = useRef<HTMLDivElement>(null);
  const screenRef = useRef<Screen>('title');
  const waitingForLandscapeRef = useRef(false);
  const coachPauseRef = useRef(false);
  const inputRef = useRef({ left: false, right: false, jump: false, dash: false });
  const activeTouchPointersRef = useRef<Map<number, keyof typeof inputRef.current>>(new Map());
  const resetRef = useRef<(() => void) | null>(null);
  const [screen, setScreen] = useState<Screen>('title');
  const [waitingForLandscape, setWaitingForLandscape] = useState(false);
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  const [hud, setHud] = useState<Hud>({ sparks: 0, total: sparkSeed.length, lives: 3, hits: 0, time: 0, best: null, checkpoint: 0, progress: 0, dashReady: true, shield: 0, signatureCount: 0 });
  const [finalResult, setFinalResult] = useState<Hud | null>(null);
  const finalResultRef = useRef<Hud | null>(null);
  const resultHud = finalResult ?? hud;
  const earnedMedal = challengeMedal(objectiveId, resultHud);
  const localScore = crestScoreBreakdown({ time: resultHud.time, sparks: resultHud.sparks, total: resultHud.total, ...(isSeries ? { signatureCount: resultHud.signatureCount } : { medal: earnedMedal }) });
  const objectiveResult = objectiveResultLabel(objectiveId, resultHud);
  const routeChallengeId = isSeries ? seriesWeek!.id : dailyChallengeId;
  const bestStorageKey = runStorageKey('best', { courseId: course.id, challengeId: routeChallengeId, modifierId: modifier.id, practice: isPractice });
  const ghostStorageKey = runStorageKey('ghost', { courseId: course.id, challengeId: routeChallengeId, modifierId: modifier.id, practice: isPractice });
  const scoreStorageKey = runStorageKey('score', { courseId: course.id, challengeId: routeChallengeId, modifierId: modifier.id, practice: isPractice });
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const sfxContextRef = useRef<AudioContext | null>(null);
  const sfxBuffersRef = useRef<Map<SoundKind, AudioBuffer>>(new Map());
  const telemetryQueueRef = useRef<Array<{ eventName: string; playerId: string; courseId: string; metadata: Record<string, string | number> }>>([]);
  const runIdRef = useRef<string | null>(null);
  const playerIdRef = useRef('');
  const homeTrackedRef = useRef<string | null>(null);
  const dashCoachRef = useRef(false);
  const runMetricsRef = useRef({ dashCount: 0 });
  const boardRequestRef = useRef(0);
  const dailySummaryRequestRef = useRef(0);
  const [board, setBoard] = useState<Board>('daily');
  const [entries, setEntries] = useState<BoardEntry[]>([]);
  const [dailyLeader, setDailyLeader] = useState<BoardEntry | null | undefined>(undefined);
  const [dailyPlayers, setDailyPlayers] = useState<number | undefined>(undefined);
  const [boardStatus, setBoardStatus] = useState<'loading' | 'ready' | 'offline'>('loading');
  const [nickname, setNickname] = useState('');
  const [submitState, setSubmitState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [submitError, setSubmitError] = useState('');
  const [runStartState, setRunStartState] = useState<'idle' | 'connecting' | 'error'>('idle');
  const [runStartError, setRunStartError] = useState('');
  const [rank, setRank] = useState<number | null>(null);
  const [scoreResult, setScoreResult] = useState<{ score: number; breakdown: CrestScoreBreakdown; contribution: number } | null>(null);
  const [previousBestScore, setPreviousBestScore] = useState<number | null>(null);
  const [isNewBestScore, setIsNewBestScore] = useState(false);
  const [showScoreIntro, setShowScoreIntro] = useState(false);
  const [homePanel, setHomePanel] = useState<HomePanel>('none');
  const [helpTab, setHelpTab] = useState<HelpTab>('play');
  const homePanelRef = useRef<HTMLElement>(null);
  const homePanelTriggerRef = useRef<HTMLElement | null>(null);
  const gameModalRef = useRef<HTMLDivElement>(null);
  const [showDashCoach, setShowDashCoach] = useState(false);
  const [showModifierCoach, setShowModifierCoach] = useState(false);
  const [community, setCommunity] = useState<Community>({ players: 0, lights: 0, goal: 2500, nearby: [], playerRank: null, recent: [] });
  const [streak, setStreak] = useState(0);
  const [dailyReset, setDailyReset] = useState('—');
  const [gameNotice, setGameNotice] = useState<GameNotice | null>(null);
  const gameNoticeTimerRef = useRef(0);
  const [seriesCompletions, setSeriesCompletions] = useState(0);
  const [seriesEntries, setSeriesEntries] = useState<SeriesBoardEntry[]>([]);
  const [seriesBoardStatus, setSeriesBoardStatus] = useState<'loading' | 'ready' | 'offline'>('loading');
  const [completedSeriesWeeks, setCompletedSeriesWeeks] = useState<string[]>([]);
  const [seriesBadgeNew, setSeriesBadgeNew] = useState(false);
  const [seriesMessage, setSeriesMessage] = useState<SeriesMessage | null>(null);
  const [seriesResource, setSeriesResource] = useState<{ title: string; url: string } | null>(null);
  const pendingSeriesStartRef = useRef(false);
  const displayedScore = scoreResult?.score ?? localScore.total;
  const scoreDelta = previousBestScore == null ? null : displayedScore - previousBestScore;
  const scoreResultLabel = isNewBestScore
    ? previousBestScore == null ? 'FIRST CREST SCORE' : `NEW PERSONAL BEST · +${Math.max(0, scoreDelta ?? 0).toLocaleString()}`
    : scoreDelta === 0 ? 'MATCHED YOUR BEST' : `${Math.abs(Math.min(0, scoreDelta ?? 0)).toLocaleString()} POINTS FROM YOUR BEST`;
  const seriesProgressCount = activeSeries ? activeSeries.series.weeks.filter((week) => completedSeriesWeeks.includes(week.id)).length : 0;

  const showGameNotice = useCallback((text: string, kind: GameNotice['kind']) => {
    window.clearTimeout(gameNoticeTimerRef.current);
    setGameNotice({ text, kind });
    gameNoticeTimerRef.current = window.setTimeout(() => setGameNotice(null), 2200);
  }, []);

  useEffect(() => () => window.clearTimeout(gameNoticeTimerRef.current), []);

  useEffect(() => { mutedRef.current = muted; }, [muted]);
  useEffect(() => {
    if (homePanel === 'none') return;
    const panel = homePanelRef.current;
    panel?.focus();
    const handlePanelKeys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeHomePanel();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;
      const controls = [...panel.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])')];
      if (controls.length === 0) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', handlePanelKeys);
    return () => window.removeEventListener('keydown', handlePanelKeys);
  }, [homePanel]);
  useEffect(() => {
    if (!showScoreIntro && screen !== 'paused' && screen !== 'over' && screen !== 'won') return;
    const modal = gameModalRef.current;
    modal?.focus();
    const trapModalFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !modal) return;
      const controls = [...modal.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])')];
      if (controls.length === 0) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', trapModalFocus);
    return () => window.removeEventListener('keydown', trapModalFocus);
  }, [screen, showScoreIntro]);
  useEffect(() => {
    const AudioContextConstructor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) return;
    const audioContext = new AudioContextConstructor({ latencyHint: 'interactive' });
    const buffers = sfxBuffersRef.current;
    sfxContextRef.current = audioContext;
    let cancelled = false;
    void Promise.all((Object.entries(soundSources) as Array<[SoundKind, string]>).map(async ([kind, src]) => {
      const response = await fetch(src);
      const buffer = await audioContext.decodeAudioData(await response.arrayBuffer());
      if (!cancelled) buffers.set(kind, buffer);
    })).catch(() => undefined);
    return () => {
      cancelled = true;
      buffers.clear();
      sfxContextRef.current = null;
      void audioContext.close().catch(() => undefined);
    };
  }, []);
  useEffect(() => {
    let playerId = window.localStorage.getItem('crestbound-player-id');
    if (!playerId) { playerId = crypto.randomUUID(); window.localStorage.setItem('crestbound-player-id', playerId); }
    playerIdRef.current = playerId;
    if (activeSeries) {
      const localCompleted = completedSeriesWeekIds(window.localStorage, activeSeries.series.id);
      setCompletedSeriesWeeks(localCompleted);
      void fetch(`/api/series?playerId=${encodeURIComponent(playerId)}`, { cache: 'no-store' })
        .then(async (response) => response.ok ? response.json() as Promise<{ completions?: number; completedWeeks?: string[] }> : null)
        .then((data) => {
          if (!data) return;
          setSeriesCompletions(data.completions ?? 0);
          setCompletedSeriesWeeks([...new Set([...localCompleted, ...(data.completedWeeks ?? [])])]);
        })
        .catch(() => undefined);
    }
    const syncStoredState = window.setTimeout(() => {
      const stored = window.localStorage.getItem(runStorageKey('best', { courseId: dailyCourse.id, challengeId: dailyChallengeId, modifierId: dailyModifier.id, practice: false }));
      if (stored) setHud((current) => ({ ...current, best: Number(stored) }));
      setNickname(window.localStorage.getItem('crestbound-nickname') ?? '');
    }, 0);
    if (homeTrackedRef.current !== localDay) {
      homeTrackedRef.current = localDay;
      const metadata = { mode: 'ranked', modifierId: dailyModifier.id, orientation: window.matchMedia('(orientation: portrait)').matches ? 'portrait' : 'landscape', device: window.matchMedia('(pointer: coarse)').matches ? 'touch' : 'desktop' };
      void fetch('/api/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventName: 'home_view', playerId, courseId: dailyCourse.id, metadata }) }).catch(() => undefined);
    }
    return () => window.clearTimeout(syncStoredState);
  }, [activeSeries, dailyChallengeId, dailyCourse.id, dailyModifier.id, localDay]);

  useEffect(() => {
    if (!activeSeries || !seriesWeek) return;
    setSeriesMessage(null);
    setSeriesBoardStatus('loading');
    const params = new URLSearchParams({ weekId: seriesWeek.id });
    void fetch(`/api/series-content?${params}`, { cache: 'no-store' })
      .then(async (response) => response.ok ? response.json() as Promise<{ available?: boolean; message?: SeriesMessage }> : null)
      .then((data) => { if (data?.available && data.message) setSeriesMessage(data.message); })
      .catch(() => undefined);
    if (playerIdRef.current) {
      params.set('playerId', playerIdRef.current);
      void fetch(`/api/series?${params}`, { cache: 'no-store' })
        .then(async (response) => {
          if (!response.ok) throw new Error('Series results unavailable');
          return response.json() as Promise<{ completions?: number; entries?: SeriesBoardEntry[] }>;
        })
        .then((data) => {
          setSeriesCompletions(data.completions ?? 0);
          setSeriesEntries(data.entries ?? []);
          setSeriesBoardStatus('ready');
        })
        .catch(() => {
          setSeriesEntries([]);
          setSeriesBoardStatus('offline');
        });
    }
  }, [activeSeries, seriesWeek]);

  useEffect(() => {
    const syncReturnLoop = () => {
      setStreak(Number(window.localStorage.getItem('crestbound-streak')) || 0);
      setDailyReset(formatDailyReset(millisecondsUntilNextChicagoDay()));
      const currentDay = chicagoDayKey();
      if (currentDay !== localDay && screenRef.current === 'title') window.location.reload();
    };
    syncReturnLoop();
    const timer = window.setInterval(syncReturnLoop, 30_000);
    return () => window.clearInterval(timer);
  }, [localDay]);

  useEffect(() => {
    if (screen !== 'title') return;
    const currentDay = chicagoDayKey();
    if (currentDay !== localDay) window.location.reload();
  }, [localDay, screen]);

  useEffect(() => {
    if (activeSeries) setSeriesWeekIndex(activeSeries.weekIndex);
  }, [activeSeries]);

  const loadBoard = useCallback(async (nextBoard: Board) => {
    const requestId = ++boardRequestRef.current;
    setBoardStatus('loading');
    try {
      const params = new URLSearchParams({ board: nextBoard, courseId: dailyCourse.id, playerId: playerIdRef.current });
      const response = await fetch(`/api/leaderboard?${params}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Leaderboard unavailable');
      const data = await response.json() as { entries?: BoardEntry[] };
      const nextEntries = data.entries ?? [];
      if (requestId !== boardRequestRef.current) return;
      setEntries(nextEntries);
      setBoardStatus('ready');
    } catch {
      if (requestId !== boardRequestRef.current) return;
      setEntries([]);
      setBoardStatus('offline');
    }
  }, [dailyCourse.id]);

  const loadDailySummary = useCallback(async () => {
    const requestId = ++dailySummaryRequestRef.current;
    setDailyLeader(undefined);
    setDailyPlayers(undefined);
    try {
      const params = new URLSearchParams({ board: 'daily', courseId: dailyCourse.id, playerId: playerIdRef.current });
      const response = await fetch(`/api/leaderboard?${params}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Daily summary unavailable');
      const data = await response.json() as { entries?: BoardEntry[]; players?: number; weeklyPlayers?: number; lights?: number; goal?: number; nearby?: BoardEntry[]; playerRank?: number | null; recent?: string[] };
      if (requestId !== dailySummaryRequestRef.current) return;
      setDailyLeader(data.entries?.[0] ?? null);
      setDailyPlayers(data.players ?? 0);
      setCommunity({ players: data.weeklyPlayers ?? 0, lights: data.lights ?? 0, goal: data.goal ?? 2500, nearby: data.nearby ?? [], playerRank: data.playerRank ?? null, recent: data.recent ?? [] });
    } catch {
      if (requestId !== dailySummaryRequestRef.current) return;
      setDailyLeader(undefined);
      setDailyPlayers(undefined);
    }
  }, [dailyCourse.id]);

  useEffect(() => {
    const load = window.setTimeout(() => { void loadBoard(board); }, 0);
    return () => window.clearTimeout(load);
  }, [board, loadBoard]);

  useEffect(() => {
    const load = window.setTimeout(() => { void loadDailySummary(); }, 0);
    return () => window.clearTimeout(load);
  }, [loadDailySummary]);

  const stopMusic = useCallback(() => {
    const music = musicRef.current;
    if (!music) return;
    music.pause();
    musicRef.current = null;
  }, []);

  const startMusic = useCallback((audible = true) => {
    if (mutedRef.current) return;
    const existing = musicRef.current;
    if (existing) {
      existing.volume = audible ? .34 : 0;
      if (existing.paused) void existing.play().catch(() => undefined);
      return;
    }
    const track = isSeries ? musicTrackForSeries() : musicTrackForCourse(activeCourseIndex);
    const music = new Audio(track.src);
    music.loop = true;
    music.preload = 'auto';
    music.volume = audible ? .34 : 0;
    musicRef.current = music;
    void music.play().catch(() => { if (musicRef.current === music) musicRef.current = null; });
  }, [activeCourseIndex, isSeries]);

  function sound(kind: SoundKind) {
    if (mutedRef.current) return;
    const audioContext = sfxContextRef.current;
    const buffer = sfxBuffersRef.current.get(kind);
    if (!audioContext || !buffer) return;
    if (audioContext.state === 'suspended') void audioContext.resume().catch(() => undefined);
    const source = audioContext.createBufferSource();
    const gain = audioContext.createGain();
    source.buffer = buffer;
    gain.gain.value = soundVolumes[kind];
    source.connect(gain); gain.connect(audioContext.destination); source.start();
  }

  function setGameScreen(next: Screen) {
    if (next !== 'playing') stopMusic();
    if (next !== 'playing') {
      activeTouchPointersRef.current.clear();
      inputRef.current = { left: false, right: false, jump: false, dash: false };
    }
    screenRef.current = next;
    setScreen(next);
    if (next === 'title') setSeriesMode(false);
  }

  function openHomePanel(panel: Exclude<HomePanel, 'none'>) {
    homePanelTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setHomePanel(panel);
  }

  function closeHomePanel() {
    setHomePanel('none');
    requestAnimationFrame(() => {
      if (homePanelTriggerRef.current?.isConnected) homePanelTriggerRef.current.focus();
      else document.querySelector<HTMLElement>('.play-button')?.focus();
    });
  }

  function openSeriesResource(title: string, url: string) {
    setSeriesResource({ title, url });
    openHomePanel('resource');
  }

  function postTelemetry(payload: { eventName: string; playerId: string; courseId: string; metadata: Record<string, string | number> }) {
    void fetch('/api/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => undefined);
  }

  function flushTelemetry() {
    const queued = telemetryQueueRef.current.splice(0);
    queued.forEach(postTelemetry);
  }

  function track(eventName: string, details: Record<string, string | number> = {}) {
    if (!playerIdRef.current) return;
    const metadata = {
      mode: isSeries ? 'series' : 'ranked',
      modifierId: modifier.id,
      orientation: window.matchMedia('(orientation: portrait)').matches ? 'portrait' : 'landscape',
      device: window.matchMedia('(pointer: coarse)').matches ? 'touch' : 'desktop',
      ...(isSeries && activeSeries && seriesWeek ? { seriesId: activeSeries.series.id, weekId: seriesWeek.id } : {}),
      ...details,
    };
    const payload = { eventName, playerId: playerIdRef.current, courseId: course.id, metadata };
    // Checkpoint and damage events are useful launch diagnostics, but sending
    // them while the canvas is animating can briefly contend with audio and
    // rendering on mobile Safari. Flush them when the run stops instead.
    if (eventName === 'checkpoint' || eventName === 'life_lost') telemetryQueueRef.current.push(payload);
    else postTelemetry(payload);
  }

  function dismissDashCoach(learned = false) {
    dashCoachRef.current = false; setShowDashCoach(false);
    coachPauseRef.current = false;
    window.localStorage.setItem('crestbound-dash-learned', '1');
    if (learned) track('dash_learned');
  }

  function dismissModifierCoach() {
    setShowModifierCoach(false);
    coachPauseRef.current = dashCoachRef.current;
    window.localStorage.setItem(isSeries ? `crestbound-series-mechanic-seen-${seriesWeek?.id ?? activeSeries?.series.id ?? 'series'}` : `crestbound-twist-seen-${localDay}-${modifier.id}-${initialDailyRoute.conditionId}`, '1');
    track('modifier_learned');
  }

  function dismissScoreIntro() {
    window.localStorage.setItem('crestbound-scoring-learned', '1');
    setShowScoreIntro(false);
    track('scoring_learned');
    void startGame(true, true);
  }

  async function startGame(tryImmersive = false, scoringIntroSeen = false) {
    if (!scoringIntroSeen && !window.localStorage.getItem('crestbound-scoring-learned')) {
      setShowScoreIntro(true);
      return;
    }
    if (sfxContextRef.current?.state === 'suspended') void sfxContextRef.current.resume().catch(() => undefined);
    if (tryImmersive && window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(display-mode: standalone)').matches && !document.fullscreenElement) {
      const immersiveRequest = document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
      void immersiveRequest?.catch(() => {
        /* iPhone Safari uses Add to Home Screen for standalone play. */
      });
    }
    const replaying = screenRef.current === 'over' || screenRef.current === 'won';
    finalResultRef.current = null;
    setFinalResult(null);
    setHomePanel('none');
    resetRef.current?.();
    setSubmitState('idle'); setRank(null); setScoreResult(null); runIdRef.current = null;
    setPreviousBestScore(null); setIsNewBestScore(false); setSeriesBadgeNew(false);
    runMetricsRef.current = { dashCount: 0 };
    const shouldWaitForLandscape = window.matchMedia('(orientation: portrait) and (pointer: coarse)').matches;
    {
      setRunStartState('connecting');
      setRunStartError('');
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch('/api/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'start', playerId: playerIdRef.current, courseId: isSeries ? activeSeries!.series.id : dailyCourse.id, modifierId: isSeries ? 'clear' : dailyModifier.id, challengeId: isSeries ? seriesWeek!.id : dailyChallengeId }),
          signal: controller.signal,
        });
        const data = await response.json().catch(() => null) as { runId?: string; error?: string } | null;
        if (!response.ok || !data?.runId) throw new Error(data?.error || 'Ranked play is temporarily unavailable.');
        runIdRef.current = data.runId;
      } catch (error) {
        const message = error instanceof DOMException && error.name === 'AbortError'
          ? 'The ranked connection timed out. Check your connection and try again.'
          : error instanceof Error ? error.message : 'Ranked play is temporarily unavailable. Try again.';
        setRunStartState('error');
        setRunStartError(message);
        if (screenRef.current !== 'title') setGameScreen('title');
        return;
      } finally {
        window.clearTimeout(timeout);
      }
    }
    setRunStartState('idle');
    setRunStartError('');
    startMusic(!shouldWaitForLandscape);
    waitingForLandscapeRef.current = shouldWaitForLandscape;
    setWaitingForLandscape(shouldWaitForLandscape);
    setGameScreen('playing');
    const needsCoach = !window.localStorage.getItem('crestbound-dash-learned');
    const needsModifierCoach = isSeries
      ? !window.localStorage.getItem(`crestbound-series-mechanic-seen-${seriesWeek?.id ?? activeSeries?.series.id ?? 'series'}`)
      : !window.localStorage.getItem(`crestbound-twist-seen-${localDay}-${modifier.id}-${initialDailyRoute.conditionId}`);
    coachPauseRef.current = needsCoach || needsModifierCoach;
    dashCoachRef.current = needsCoach; setShowDashCoach(needsCoach); track(isSeries ? 'series_start' : 'run_start');
    setShowModifierCoach(needsModifierCoach);
    if (shouldWaitForLandscape) track('orientation_wait');
    if (replaying) track('replay');
    requestAnimationFrame(() => canvasRef.current?.focus());
  }

  function togglePause() {
    if (screenRef.current === 'playing') { track('pause'); flushTelemetry(); setGameScreen('paused'); }
    else if (screenRef.current === 'paused') {
      const shouldWaitForLandscape = window.matchMedia('(orientation: portrait) and (pointer: coarse)').matches;
      waitingForLandscapeRef.current = shouldWaitForLandscape;
      setWaitingForLandscape(shouldWaitForLandscape);
      setGameScreen('playing');
      if (!shouldWaitForLandscape) startMusic();
    }
  }

  function toggleSound() {
    setMuted((value) => {
      const next = !value;
      mutedRef.current = next;
      if (next) stopMusic(); else if (screenRef.current === 'playing' && !waitingForLandscapeRef.current) startMusic();
      return next;
    });
  }

  function recordStreak() {
    const today = chicagoDayKey();
    const last = window.localStorage.getItem('crestbound-last-day');
    if (last === today) return;
    const yesterday = new Date(`${today}T12:00:00Z`); yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const yesterdayKey = chicagoDayKey(yesterday);
    const next = last === yesterdayKey ? (Number(window.localStorage.getItem('crestbound-streak')) || 0) + 1 : 1;
    window.localStorage.setItem('crestbound-last-day', today);
    window.localStorage.setItem('crestbound-streak', String(next));
    setStreak(next);
  }

  async function postDailyRun(runResult: Hud, cleanName: string) {
    if (!runIdRef.current) return;
    setSubmitState('saving');
    setSubmitError('');
    window.localStorage.setItem('crestbound-nickname', cleanName); setNickname(cleanName);
    try {
      const response = await fetch('/api/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'finish', runId: runIdRef.current, playerId: playerIdRef.current, courseId: dailyCourse.id, modifierId: dailyModifier.id, challengeId: dailyChallengeId, name: cleanName, scoreMs: Math.round(runResult.time * 1000), sparks: runResult.sparks, lightTotal: runResult.total, hits: runResult.hits }) });
      const data = await response.json() as { rank?: number; score?: number; breakdown?: CrestScoreBreakdown; community?: { lights: number; players: number; goal: number; contribution: number }; error?: string };
      if (!response.ok) throw new Error(data.error);
      setRank(data.rank ?? null);
      setScoreResult({ score: data.score ?? localScore.total, breakdown: data.breakdown ?? localScore, contribution: data.community?.contribution ?? runResult.sparks });
      if (data.community) setCommunity((current) => ({ ...current, lights: data.community!.lights, players: data.community!.players, goal: data.community!.goal }));
      setSubmitState('saved'); setBoard('daily'); void loadBoard('daily'); void loadDailySummary();
    } catch (error) { setSubmitError(error instanceof Error ? error.message : 'Couldn\'t post this run.'); setSubmitState('error'); }
  }

  async function submitRun(event: FormEvent) {
    event.preventDefault();
    const nicknameResult = checkNickname(nickname);
    if (!runIdRef.current || !nicknameResult.ok) {
      setSubmitError(nicknameResult.ok ? 'Online posting is unavailable for this run.' : nicknameResult.message);
      setSubmitState('error');
      return;
    }
    await postDailyRun(finalResultRef.current ?? hud, nicknameResult.name);
  }

  function syncTouchInput() {
    inputRef.current = touchInputFromControls(activeTouchPointersRef.current.values());
  }

  function releaseTouchPointer(pointerId: number) {
    activeTouchPointersRef.current.delete(pointerId);
    syncTouchInput();
  }

  function beginPress(control: keyof typeof inputRef.current, event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.pointerType === 'touch') return;
    event.preventDefault();
    activeTouchPointersRef.current.set(event.pointerId, control);
    syncTouchInput();
    canvasRef.current?.focus();
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Global release handling remains active. */ }
  }

  function endPress(control: keyof typeof inputRef.current, event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.pointerType === 'touch') return;
    event.preventDefault();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    releaseTouchPointer(event.pointerId);
  }

  useEffect(() => {
    const releasePointer = (event: PointerEvent) => {
      activeTouchPointersRef.current.delete(event.pointerId);
      inputRef.current = touchInputFromControls(activeTouchPointersRef.current.values());
    };
    const clearTouchInput = () => { activeTouchPointersRef.current.clear(); inputRef.current = { left: false, right: false, jump: false, dash: false }; };
    window.addEventListener('blur', clearTouchInput);
    window.addEventListener('pointerup', releasePointer, true);
    window.addEventListener('pointercancel', releasePointer, true);
    window.addEventListener('pagehide', clearTouchInput);
    document.addEventListener('visibilitychange', clearTouchInput);
    return () => {
      window.removeEventListener('blur', clearTouchInput);
      window.removeEventListener('pointerup', releasePointer, true);
      window.removeEventListener('pointercancel', releasePointer, true);
      window.removeEventListener('pagehide', clearTouchInput);
      document.removeEventListener('visibilitychange', clearTouchInput);
    };
  }, []);

  useEffect(() => {
    if (screen !== 'playing') return;
    const controls = touchControlsRef.current;
    if (!controls) return;
    const touchKey = (identifier: number) => -(identifier + 1);
    const startTouches = (event: TouchEvent) => {
      let handled = false;
      for (const touch of Array.from(event.changedTouches)) {
        const target = touch.target instanceof Element ? touch.target.closest<HTMLButtonElement>('button[data-control]') : null;
        const control = target?.dataset.control as keyof typeof inputRef.current | undefined;
        if (!target || !control || !controls.contains(target)) continue;
        // A new physical touch owns its control. This also self-heals any stale
        // touch identifier Safari failed to release on a prior interaction.
        for (const [pointerId, activeControl] of activeTouchPointersRef.current) {
          const sameDirectionGroup = (control === 'left' || control === 'right') && (activeControl === 'left' || activeControl === 'right');
          if (activeControl === control || sameDirectionGroup) activeTouchPointersRef.current.delete(pointerId);
        }
        activeTouchPointersRef.current.set(touchKey(touch.identifier), control);
        handled = true;
      }
      if (!handled) return;
      event.preventDefault();
      syncTouchInput();
      canvasRef.current?.focus();
    };
    const endTouches = (event: TouchEvent) => {
      for (const touch of Array.from(event.changedTouches)) activeTouchPointersRef.current.delete(touchKey(touch.identifier));
      syncTouchInput();
    };
    controls.addEventListener('touchstart', startTouches, { passive: false });
    document.addEventListener('touchend', endTouches, { passive: true, capture: true });
    document.addEventListener('touchcancel', endTouches, { passive: true, capture: true });
    return () => {
      controls.removeEventListener('touchstart', startTouches);
      document.removeEventListener('touchend', endTouches, true);
      document.removeEventListener('touchcancel', endTouches, true);
    };
  }, [screen]);

  useEffect(() => {
    const portraitPhone = window.matchMedia('(orientation: portrait) and (pointer: coarse)');
    let orientationTimer = 0;
    const syncOrientation = () => {
      window.clearTimeout(orientationTimer);
      orientationTimer = window.setTimeout(() => {
        if (screenRef.current === 'title') {
          const titleScreen = document.querySelector<HTMLElement>('.title-screen');
          if (titleScreen) titleScreen.scrollTop = 0;
          return;
        }
        if (screenRef.current !== 'playing') return;
        const shouldWait = portraitPhone.matches;
        if (waitingForLandscapeRef.current === shouldWait) return;
        waitingForLandscapeRef.current = shouldWait;
        setWaitingForLandscape(shouldWait);
        if (shouldWait) {
          activeTouchPointersRef.current.clear();
          inputRef.current = { left: false, right: false, jump: false, dash: false };
          if (musicRef.current) musicRef.current.volume = 0;
        }
        else { startMusic(); requestAnimationFrame(() => canvasRef.current?.focus()); }
      }, 160);
    };
    portraitPhone.addEventListener('change', syncOrientation);
    window.addEventListener('orientationchange', syncOrientation);
    return () => {
      window.clearTimeout(orientationTimer);
      portraitPhone.removeEventListener('change', syncOrientation);
      window.removeEventListener('orientationchange', syncOrientation);
    };
  }, [startMusic, stopMusic]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const canvasContext = canvas.getContext('2d');
    if (!canvasContext) return;
    const context: CanvasRenderingContext2D = canvasContext;
    const touchLandscape = window.matchMedia('(pointer: coarse) and (orientation: landscape)');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const atmosphere = isSeries ?
      { skyTop: '#f8e45c', skyMid: '#f8e45c', skyLow: '#ffe777', haze: '#f4d64e', far: '#ef4638', near: '#171b1c', window: '#f8e45c', rail: '#ef4638', edge: '#171b1c', blockA: '#ef4638', blockB: '#c9362c', support: '#171b1c' } : [
      { skyTop: '#0d99a8', skyMid: '#63cec4', skyLow: '#ffd36f', haze: '#ff9662', far: '#668292', near: '#365b6d', window: '#ffd86a', rail: '#2bc8c0', edge: '#087d86', blockA: '#164f5f', blockB: '#0e3e4c', support: '#082d38' },
      { skyTop: '#168fc5', skyMid: '#68cbdc', skyLow: '#d5f1e8', haze: '#fff0b0', far: '#75aeba', near: '#347382', window: '#f5fff5', rail: '#35c9c1', edge: '#087b85', blockA: '#235f70', blockB: '#194e5d', support: '#103b49' },
      { skyTop: '#06111f', skyMid: '#0a2333', skyLow: '#174251', haze: '#245d68', far: '#153746', near: '#092431', window: '#f5c84d', rail: '#24aaa9', edge: '#0b666d', blockA: '#0e3541', blockB: '#092a35', support: '#061c25' },
    ][activeCourseIndex];
    const skyLayer = document.createElement('canvas');
    skyLayer.width = VIEW_W / 4; skyLayer.height = VIEW_H / 4;
    const skyContext = skyLayer.getContext('2d');
    if (skyContext) {
      skyContext.setTransform(.25, 0, 0, .25, 0, 0);
      const skyGradient = skyContext.createLinearGradient(0, 0, 0, VIEW_H);
      skyGradient.addColorStop(0, atmosphere.skyTop);
      skyGradient.addColorStop(.38, atmosphere.skyMid);
      skyGradient.addColorStop(.67, atmosphere.skyLow);
      skyGradient.addColorStop(1, atmosphere.haze);
      skyContext.fillStyle = skyGradient; skyContext.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    const skylineTileWidth = 1440;
    const skylineTiles = [0, 1].map((layer) => {
      const tile = document.createElement('canvas');
      tile.width = skylineTileWidth / 4; tile.height = VIEW_H / 4;
      const tileContext = tile.getContext('2d');
      if (!tileContext) return tile;
      tileContext.setTransform(.25, 0, 0, .25, 0, 0);
      tileContext.imageSmoothingEnabled = false;
      const baseY = layer ? 505 : 430;
      const building = layer ? atmosphere.near : atmosphere.far;
      for (let index = 0; index < 12; index += 1) {
        const x = index * 120;
        const h = 80 + Math.abs((index * 47 + layer * 31) % 150);
        tileContext.fillStyle = building; tileContext.fillRect(x, baseY - h, 96, h + 220);
        if (index % 3 === 0) { tileContext.fillRect(x + 44, baseY - h - 28, 8, 28); tileContext.fillRect(x + 34, baseY - h - 28, 28, 5); }
        for (let wx = 16; wx < 80; wx += 24) for (let wy = baseY - h + 16; wy < baseY - 12; wy += 28) {
          const lit = (index + wx + wy + layer) % 4 !== 0;
          tileContext.fillStyle = lit ? (isSeries ? '#f8e45c' : activeCourseIndex === 2 ? atmosphere.window : activeCourseIndex === 0 ? '#e78c52' : '#bde4e8') : building;
          tileContext.fillRect(x + wx, wy, 8, 12);
        }
      }
      return tile;
    });

    const spriteSheet = new Image();
    spriteSheet.src = '/sunny-pixel-master.svg';
    const keys = new Set<string>();
    const player = { x: checkpoints[0], y: 538, w: 46, h: 82, vx: 0, vy: 0, grounded: true, jumps: 0, dashTime: 0, dashCooldown: 0, facing: 1, invuln: 1.25 };
    let sparks = sparkSeed.map((item) => ({ ...item }));
    let enemies = enemySeed.map((item) => ({ ...item }));
    let activeSpikes = spikeZones.map((item) => ({ ...item }));
    let rallyPoints = rallySeed.map((item) => ({ ...item }));
    let lives = 3;
    let hits = 0;
    let collected = 0;
    let signatureCount = 0;
    let { elapsed, lastHud } = resetRunTiming();
    let cameraX = 0;
    let checkpointIndex = 0;
    let jumpBuffer = 0;
    let coyote = 0;
    let previousJump = false;
    let previousDash = false;
    let last = performance.now();
    let accumulator = 0;
    let animation = 0;
    let screenShake = 0;
    let stormShield = 0;
    let runEnded = false;
    let trace: Array<{ t: number; x: number; y: number }> = [];
    let traceTimer = 0;
    let ghost: Array<{ t: number; x: number; y: number }> = [];
    try { ghost = JSON.parse(window.localStorage.getItem(ghostStorageKey) ?? '[]') as typeof ghost; } catch { ghost = []; }

    const tone = sound;
    const overlap = (ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number) => ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
    const resetPosition = () => {
      player.x = checkpoints[checkpointIndex]; player.y = 620 - player.h; player.vx = 0; player.vy = 0; player.grounded = true; player.jumps = 0; player.invuln = 1.5;
    };
    const hurt = (soundKind: 'hit' | 'fall' = 'hit') => {
      if (runEnded || player.invuln > 0) return;
      const damage = resolveDamage(lives, stormShield);
      if (damage.absorbed) {
        stormShield = damage.shieldSeconds;
        player.invuln = .7;
        screenShake = .1;
        showGameNotice('SHIELD SAVED YOU', 'power');
        tone(soundKind === 'fall' ? 'fall' : 'checkpoint');
        if (soundKind === 'fall') resetPosition();
        return;
      }
      lives = damage.lives;
      hits += 1;
      screenShake = .24;
      tone(soundKind);
      track('life_lost', { reason: soundKind, lives, checkpoint: checkpointIndex, progress: player.x, elapsedMs: elapsed * 1000 });
      setHud((current) => ({ ...current, lives, hits }));
      if (lives <= 0) {
        runEnded = true;
        player.invuln = 999;
        inputRef.current = { left: false, right: false, jump: false, dash: false };
        track('run_over', { reason: soundKind, hits, checkpoint: checkpointIndex, progress: player.x, elapsedMs: elapsed * 1000, lights: collected, lightTotal: sparks.length, lightPercent: sparks.length ? collected / sparks.length * 100 : 0, dashCount: runMetricsRef.current.dashCount, signatureCount });
        flushTelemetry();
        setGameScreen('over');
      } else resetPosition();
    };
    const reset = () => {
      finalResultRef.current = null;
      setFinalResult(null);
      player.x = checkpoints[0]; player.y = 620 - player.h; player.vx = 0; player.vy = 0; player.grounded = true; player.invuln = 1.25; player.jumps = 0;
      sparks = sparkSeed.map((item) => ({ ...item }));
      enemies = enemySeed.map((item) => ({ ...item }));
      activeSpikes = spikeZones.map((item) => ({ ...item }));
      rallyPoints = rallySeed.map((item) => ({ ...item }));
      lives = 3; hits = 0; collected = 0; signatureCount = 0; ({ elapsed, lastHud } = resetRunTiming()); cameraX = 0; checkpointIndex = 0; jumpBuffer = 0; coyote = 0; previousJump = false; previousDash = false; trace = []; traceTimer = 0; stormShield = 0; runEnded = false;
      runMetricsRef.current = { dashCount: 0 };
      window.clearTimeout(gameNoticeTimerRef.current); setGameNotice(null);
      const storedBest = window.localStorage.getItem(bestStorageKey);
      setHud({ sparks: 0, total: sparkSeed.length, lives: 3, hits: 0, time: 0, best: storedBest ? Number(storedBest) : null, checkpoint: 0, progress: 0, dashReady: true, shield: 0, signatureCount: 0 });
    };
    resetRef.current = reset;

    function keyDown(event: KeyboardEvent) {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(event.code)) event.preventDefault();
      keys.add(event.code);
      if (event.code === 'KeyP' || event.code === 'Escape') togglePause();
      if (event.code === 'KeyM') toggleSound();
      if ((event.code === 'Space' || event.code === 'ArrowUp' || event.code === 'KeyW') && !event.repeat) jumpBuffer = 0.14;
    }
    function keyUp(event: KeyboardEvent) { keys.delete(event.code); }
    function clearKeys() { keys.clear(); }
    window.addEventListener('keydown', keyDown, { passive: false });
    window.addEventListener('keyup', keyUp);
    window.addEventListener('blur', clearKeys);

    function inputState() {
      const pad = navigator.getGamepads?.()[0];
      const axis = pad?.axes[0] ?? 0;
      const left = keys.has('ArrowLeft') || keys.has('KeyA') || inputRef.current.left || axis < -0.3;
      const right = keys.has('ArrowRight') || keys.has('KeyD') || inputRef.current.right || axis > 0.3;
      const jump = keys.has('Space') || keys.has('ArrowUp') || keys.has('KeyW') || inputRef.current.jump || Boolean(pad?.buttons[0]?.pressed);
      const dash = keys.has('ShiftLeft') || keys.has('ShiftRight') || keys.has('KeyX') || inputRef.current.dash || Boolean(pad?.buttons[2]?.pressed);
      return { left, right, jump, dash };
    }

    function update(dt: number) {
      elapsed += dt;
      traceTimer += dt;
      if (traceTimer >= .12) { trace.push({ t: elapsed, x: player.x, y: player.y }); traceTimer = 0; }
      player.invuln = Math.max(0, player.invuln - dt);
      stormShield = Math.max(0, stormShield - dt);
      player.dashCooldown = Math.max(0, player.dashCooldown - dt);
      player.dashTime = Math.max(0, player.dashTime - dt);
      jumpBuffer = Math.max(0, jumpBuffer - dt);
      coyote = player.grounded ? 0.12 : Math.max(0, coyote - dt);
      const input = inputState();
      const direction = Number(input.right) - Number(input.left);
      if (direction) player.facing = direction;
      if (player.dashTime > 0) player.vx = dashVelocity(player.dashTime, player.facing, player.vx);
      else {
        if (direction && player.vx && Math.sign(player.vx) !== direction) player.vx *= .38;
        const acceleration = player.grounded ? 2200 : 1450;
        player.vx += direction * acceleration * dt;
        if (!direction) player.vx *= Math.pow(player.grounded ? 0.0008 : 0.08, dt);
        player.vx += tailwindAcceleration(modifier.id, direction) * dt;
        player.vx = Math.max(-horizontalSpeedLimit(modifier.id, -1), Math.min(horizontalSpeedLimit(modifier.id, direction), player.vx));
      }

      if (input.jump && !previousJump) jumpBuffer = 0.12;
      if (jumpBuffer > 0 && (player.grounded || coyote > 0 || player.jumps < 2)) {
        player.vy = jumpVelocityForModifier(modifier.id, player.jumps);
        player.grounded = false; coyote = 0; jumpBuffer = 0; player.jumps += 1; tone('jump');
      }
      if (!input.jump && player.vy < -260) player.vy += jumpReleaseGravity(modifier.id) * dt;
      if (input.dash && !previousDash && player.dashCooldown <= 0) {
        player.dashTime = 0.22; player.dashCooldown = 0.9; player.vx = player.facing * 900; player.vy *= 0.18; screenShake = .08; tone('dash');
        runMetricsRef.current.dashCount += 1;
        if (dashCoachRef.current) dismissDashCoach(true);
      }
      previousJump = input.jump;
      previousDash = input.dash;
      if (player.dashTime <= 0) player.vy += gravityForModifier(modifier.id) * dt;
      player.vy = Math.min(player.vy, 980);
      screenShake = Math.max(0, screenShake - dt);

      const activePlatforms = platforms.filter((platform) => platform.x + platform.w >= player.x - 180 && platform.x <= player.x + player.w + 180).map((platform) => {
        if (!platform.moving) return platform;
        return { ...platform, y: (platform.baseY ?? platform.y) + Math.sin(elapsed * 1.45 + (platform.phase ?? 0)) * 72 };
      });
      const previousX = player.x;
      player.x += player.vx * dt;
      for (const platform of activePlatforms) {
        const verticallyInside = player.y + 8 < platform.y + platform.h && player.y + player.h - 8 > platform.y;
        if (!verticallyInside) continue;
        const crossedLeftEdge = player.vx > 0 && previousX + player.w <= platform.x + 2 && player.x + player.w > platform.x;
        const crossedRightEdge = player.vx < 0 && previousX >= platform.x + platform.w - 2 && player.x < platform.x + platform.w;
        if (crossedLeftEdge) { player.x = platform.x - player.w; player.vx = 0; }
        else if (crossedRightEdge) { player.x = platform.x + platform.w; player.vx = 0; }
      }
      const previousY = player.y;
      const previousBottom = previousY + player.h;
      player.y += player.vy * dt;
      player.grounded = false;
      for (const platform of activePlatforms) {
        const horizontallyInside = player.x + player.w - 7 > platform.x && player.x + 7 < platform.x + platform.w;
        if (!horizontallyInside) continue;
        const newBottom = player.y + player.h;
        const landed = player.vy >= 0 && previousBottom <= platform.y + 4 && newBottom >= platform.y;
        const hitCeiling = player.vy < 0 && previousY >= platform.y + platform.h - 4 && player.y <= platform.y + platform.h;
        if (landed) {
          player.y = platform.y - player.h; player.vy = 0; player.grounded = true; player.jumps = 0;
        } else if (hitCeiling) { player.y = platform.y + platform.h; player.vy = 20; }
      }
      player.x = Math.max(0, Math.min(WORLD_W - player.w, player.x));
      if (player.y > 800) hurt('fall');
      activeSpikes.forEach((spike) => { if (overlap(player.x + 7, player.y + 12, player.w - 14, player.h - 12, spike.x, spike.y, spike.w, 28)) hurt(); });

      rallyPoints.forEach((rally) => {
        if (rally.triggered || !seriesBeaconReached(player.x, player.w, rally.x)) return;
        rally.triggered = true;
        signatureCount += 1;
        const clearUntil = rally.x + 1050;
        activeSpikes = activeSpikes.filter((spike) => spike.x < rally.x || spike.x > clearUntil);
        enemies.forEach((enemy) => { if (enemy.x >= rally.x && enemy.x <= clearUntil) enemy.alive = false; });
        screenShake = .18;
        showGameNotice(`BEACON ${signatureCount}/3 · HAZARDS CLEARED`, 'power');
        tone('checkpoint');
        track('series_signature', { signatureCount, progress: player.x, elapsedMs: elapsed * 1000 });
      });

      enemies.forEach((enemy) => {
        if (!enemy.alive) return;
        enemy.x += enemy.speed * enemy.dir * dt;
        if (enemy.x <= enemy.minX || enemy.x >= enemy.maxX) enemy.dir *= -1;
        if (!overlap(player.x, player.y, player.w, player.h, enemy.x - 27, enemy.y - 27, 54, 54)) return;
        if (player.dashTime > 0 || (player.vy > 220 && player.y + player.h < enemy.y + 12)) {
          enemy.alive = false; player.vy = -360; player.dashCooldown = 0; tone('light');
        } else hurt();
      });

      sparks.forEach((spark) => {
        if (spark.taken) return;
        const dx = player.x + player.w / 2 - spark.x;
        const dy = player.y + player.h / 2 - spark.y;
        if (dx * dx + dy * dy < 2200) {
          spark.taken = true;
          collected += 1;
          const lightPower = collectLightPower(Boolean(spark.storm), player.dashCooldown);
          player.dashCooldown = lightPower.dashCooldown;
          if (lightPower.shieldSeconds > 0) {
            stormShield = lightPower.shieldSeconds;
            showGameNotice('STORM SHIELD · 7 SEC', 'power');
          }
          tone('light');
        }
      });

      if (checkpointIndex < checkpoints.length - 1 && player.x > checkpoints[checkpointIndex + 1]) {
        checkpointIndex += 1;
        const previousLives = lives;
        lives = Math.min(3, lives + 1);
        showGameNotice(lives > previousLives ? 'CHECKPOINT · +1 LIFE' : 'CHECKPOINT · LIFE FULL', 'checkpoint');
        setHud((current) => ({ ...current, lives, checkpoint: checkpointIndex }));
        tone('checkpoint');
        track('checkpoint', { checkpoint: checkpointIndex, lives, progress: player.x, elapsedMs: elapsed * 1000 });
      }
      if (player.x > FINISH_X) {
        const best = Number(window.localStorage.getItem(bestStorageKey)) || Infinity;
        if (elapsed < best) {
          window.localStorage.setItem(bestStorageKey, String(elapsed));
          window.localStorage.setItem(ghostStorageKey, JSON.stringify(trace));
          ghost = trace;
        }
        const finishedRun: Hud = { sparks: collected, total: sparks.length, lives, hits, time: elapsed, best: Math.min(best, elapsed), checkpoint: checkpointIndex, progress: player.x, dashReady: player.dashCooldown <= 0, shield: stormShield, signatureCount };
        const finishMedal = challengeMedal(objectiveId, finishedRun);
        const finishScore = crestScoreBreakdown({ time: elapsed, sparks: collected, total: sparks.length, ...(isSeries ? { signatureCount } : { medal: finishMedal }) }).total;
        const storedScore = Number(window.localStorage.getItem(scoreStorageKey));
        const priorScore = Number.isFinite(storedScore) && storedScore > 0 ? storedScore : null;
        const newBest = priorScore == null || finishScore > priorScore;
        const scoreDifference = priorScore == null ? finishScore : finishScore - priorScore;
        const lightPercent = sparks.length ? collected / sparks.length * 100 : 0;
        setPreviousBestScore(priorScore);
        setIsNewBestScore(newBest);
        if (newBest) window.localStorage.setItem(scoreStorageKey, String(finishScore));
        finalResultRef.current = finishedRun;
        setFinalResult(finishedRun);
        setHud(finishedRun);
        if (!isSeries) recordStreak();
        else if (activeSeries) {
          const previousCompletions = completedSeriesWeekIds(window.localStorage, activeSeries.series.id);
          const newBadge = !previousCompletions.includes(seriesWeek!.id);
          const completed = [...new Set([...previousCompletions, seriesWeek!.id])];
          window.localStorage.setItem(`crestbound-series-complete-${activeSeries.series.id}`, JSON.stringify(completed));
          setCompletedSeriesWeeks(completed);
          setSeriesBadgeNew(newBadge);
          track('series_finish', { lives, hits, progress: player.x, elapsedMs: elapsed * 1000, score: finishScore, scoreDelta: scoreDifference, newBest: newBest ? 1 : 0, newBadge: newBadge ? 1 : 0, lights: collected, lightTotal: sparks.length, lightPercent, dashCount: runMetricsRef.current.dashCount, signatureCount });
          void fetch('/api/series', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ runId: runIdRef.current, playerId: playerIdRef.current, name: nickname, seriesId: activeSeries.series.id, weekId: seriesWeek!.id, timeMs: Math.round(elapsed * 1000), lights: collected, lightTotal: sparks.length, signatureCount }),
          }).then(async (response) => response.ok ? response.json() as Promise<{ score?: number; breakdown?: CrestScoreBreakdown; completions?: number; entries?: SeriesBoardEntry[]; community?: { lights: number; players: number; goal: number; contribution: number } }> : null)
            .then((data) => {
              if (data?.completions != null) setSeriesCompletions(data.completions);
              if (data?.entries) { setSeriesEntries(data.entries); setSeriesBoardStatus('ready'); }
              if (data?.score && data.breakdown) setScoreResult({ score: data.score, breakdown: data.breakdown, contribution: data.community?.contribution ?? collected });
              if (data?.community) setCommunity((current) => ({ ...current, lights: data.community!.lights, players: data.community!.players, goal: data.community!.goal }));
            })
            .catch(() => undefined);
        }
        if (!isSeries) {
          track('run_finish', { lives, hits, progress: player.x, elapsedMs: elapsed * 1000, score: finishScore, scoreDelta: scoreDifference, newBest: newBest ? 1 : 0, lights: collected, lightTotal: sparks.length, lightPercent, dashCount: runMetricsRef.current.dashCount });
          const storedName = checkNickname(nickname);
          if (storedName.ok) void postDailyRun(finishedRun, storedName.name);
        }
        if (newBest) track('personal_best', { score: finishScore, scoreDelta: scoreDifference, lights: collected, lightTotal: sparks.length, lightPercent, dashCount: runMetricsRef.current.dashCount, signatureCount });
        flushTelemetry();
        tone('win'); setGameScreen('won');
      }
      cameraX += (Math.max(0, Math.min(WORLD_W - VIEW_W, player.x - 390)) - cameraX) * Math.min(1, dt * 5.5);
      if (elapsed - lastHud > 0.2) {
        lastHud = elapsed;
        const stored = window.localStorage.getItem(bestStorageKey);
        setHud({ sparks: collected, total: sparks.length, lives, hits, time: elapsed, best: stored ? Number(stored) : null, checkpoint: checkpointIndex, progress: player.x, dashReady: player.dashCooldown <= 0, shield: stormShield, signatureCount });
      }
    }

    function draw() {
      const ctx = context;
      const shakeX = !reducedMotion && screenShake > 0 ? ((Math.floor(elapsed * 60) % 3) - 1) * 4 : 0;
      // Physics stays sub-pixel smooth, while the rendered camera lands on the
      // 4-unit grid that maps exactly to one backing-canvas pixel.
      const renderCameraX = Math.round(cameraX / 4) * 4;
      // Keep the playable rooftop above a phone's thumb controls without
      // changing the course geometry or the desktop composition.
      const touchWorldLift = touchLandscape.matches ? 120 : 0;
      ctx.setTransform(.25, 0, 0, .25, shakeX * .25, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(skyLayer, 0, 0, skyLayer.width, skyLayer.height, -8, 0, VIEW_W + 16, VIEW_H);
      ctx.save();

      if (isSeries) {
        if (activeSeries?.series.theme === 'movies') {
          // At The Movies: moving film strips, marquee bulbs, and a soft
          // projector beam make this route unmistakably cinematic.
          ctx.fillStyle = 'rgba(17, 24, 62, .38)'; ctx.fillRect(0, 0, VIEW_W, 430);
          const beamX = Math.floor((1040 - cameraX * .025) / 8) * 8;
          ctx.fillStyle = 'rgba(255, 244, 180, .22)';
          ctx.beginPath(); ctx.moveTo(beamX, 100); ctx.lineTo(beamX - 360, 430); ctx.lineTo(beamX + 360, 430); ctx.fill();
          for (let strip = 0; strip < 3; strip += 1) {
            const y = 104 + strip * 108;
            const offset = ((cameraX * (.04 + strip * .025)) % 144 + 144) % 144;
            ctx.fillStyle = strip % 2 ? '#2f43b7' : '#ef5144'; ctx.fillRect(0, y, VIEW_W, 22);
            ctx.fillStyle = '#fff6c6';
            for (let x = -offset; x < VIEW_W + 30; x += 48) ctx.fillRect(x, y + 5, 24, 12);
          }
          ctx.fillStyle = '#ffe25f';
          for (let index = 0; index < 12; index += 1) ctx.fillRect(72 + index * 104, 388 + (index % 2) * 8, 8, 8);
        } else {
          // Declarations and future generic routes retain the bold poster
          // grammar until their own series artwork becomes active.
          ctx.fillStyle = '#ef4638';
          for (let index = 0; index < 7; index += 1) {
            const x = ((index * 286 - cameraX * .07) % 1880 + 1880) % 1880 - 260;
            ctx.fillRect(x, 94 + (index % 3) * 96, 180, 22);
            ctx.fillStyle = '#171b1c'; ctx.fillRect(x + 22, 126 + (index % 3) * 96, 110, 8); ctx.fillStyle = '#ef4638';
          }
          const hornX = Math.floor((1080 - cameraX * .035) / 8) * 8;
          ctx.fillStyle = '#171b1c';
          ctx.fillRect(hornX - 34, 118, 92, 48); ctx.fillRect(hornX - 62, 128, 34, 28); ctx.fillRect(hornX - 20, 158, 18, 62);
          for (let ray = 0; ray < 4; ray += 1) ctx.fillRect(hornX + 72 + ray * 20, 104 + ray * 25, 34, 7);
        }
      } else if (activeCourseIndex === 0) {
        // Goldline: a low, oversized sun and warm bands make the whole route feel like golden hour.
        const sunX = Math.floor((1030 - cameraX * .025) / 8) * 8;
        ctx.fillStyle = '#f28a56'; ctx.fillRect(sunX - 78, 178, 156, 116);
        ctx.fillStyle = '#ffe17b'; ctx.fillRect(sunX - 60, 160, 120, 152); ctx.fillRect(sunX - 76, 184, 152, 104);
        ctx.fillStyle = '#fff6bd'; ctx.fillRect(sunX - 48, 168, 96, 16);
        for (let layer = 0; layer < 3; layer += 1) {
          const speed = .055 + layer * .035;
          const cloudY = 300 + layer * 54;
          const cloudColor = ['#fff2bc', '#ffe1a0', '#ffd08a'][layer];
          for (let index = 0; index < 7; index += 1) {
            const x = ((index * 258 - cameraX * speed) % 1810 + 1810) % 1810 - 250;
            const width = 146 + (index % 3) * 42;
            ctx.fillStyle = cloudColor;
            ctx.fillRect(x, cloudY + (index % 2) * 16, width, 42);
            ctx.fillRect(x + 24, cloudY - 20 + (index % 2) * 16, width - 52, 30);
            ctx.fillRect(x - 22, cloudY + 20 + (index % 2) * 16, width + 58, 24);
          }
        }
        for (let index = 0; index < 5; index += 1) {
          const x = ((index * 346 - cameraX * .06) % 1840 + 1840) % 1840 - 220;
          const y = 78 + (index % 3) * 52;
          ctx.fillStyle = index % 2 ? '#fff0ad' : '#ffd982';
          ctx.fillRect(x, y, 132, 10); ctx.fillRect(x + 28, y - 8, 72, 8);
        }
        ctx.fillStyle = '#fff0a8';
        for (let index = 0; index < 9; index += 1) ctx.fillRect(((index * 173 - cameraX * .18) % 1500 + 1500) % 1500 - 80, 400 + (index % 3) * 14, 76, 5);
      } else if (activeCourseIndex === 1) {
        // Crosswind: bright blue sky, high sun, and large block clouds keep the aerial route open and clear.
        const sunX = Math.floor((1120 - cameraX * .018) / 8) * 8;
        ctx.fillStyle = '#fff4ad'; ctx.fillRect(sunX - 36, 58, 72, 72); ctx.fillRect(sunX - 48, 70, 96, 48);
        for (let index = 0; index < 8; index += 1) {
          const x = ((index * 263 - cameraX * .12) % 1760 + 1760) % 1760 - 230;
          const y = 104 + (index % 4) * 66;
          const width = 112 + (index % 3) * 36;
          ctx.fillStyle = '#d7f0ee'; ctx.fillRect(x + 12, y + 16, width, 28);
          ctx.fillStyle = '#fffdf2'; ctx.fillRect(x + 32, y, width - 42, 36); ctx.fillRect(x, y + 20, width + 32, 24);
        }
        ctx.fillStyle = '#e9fbf8';
        for (let index = 0; index < 7; index += 1) {
          const x = ((index * 229 - cameraX * .06) % 1560 + 1560) % 1560 - 100;
          const y = 58 + (index % 3) * 72;
          ctx.fillRect(x, y, 12, 4); ctx.fillRect(x + 12, y - 4, 12, 4);
        }
      } else {
        // Night Shift: a veiled moon, sparse stars, and layered storm clouds set up the rain.
        for (let index = 0; index < 34; index += 1) {
          const x = ((index * 193 - cameraX * .06) % 1500 + 1500) % 1500 - 100;
          const y = 38 + ((index * 83) % 250);
          ctx.fillStyle = index % 8 === 0 ? '#f5d263' : '#5d8894';
          ctx.fillRect(Math.floor(x / 4) * 4, Math.floor(y / 4) * 4, index % 8 === 0 ? 6 : 3, index % 8 === 0 ? 6 : 3);
        }
        const moonX = Math.floor((1080 - cameraX * .025) / 8) * 8;
        ctx.fillStyle = '#a8c4c7'; ctx.fillRect(moonX - 42, 76, 84, 100);
        ctx.fillStyle = '#d8e1d9'; ctx.fillRect(moonX - 54, 90, 108, 72); ctx.fillRect(moonX - 38, 72, 76, 108);
        ctx.fillStyle = '#102433'; ctx.fillRect(moonX - 86, 126, 170, 28); ctx.fillRect(moonX - 36, 112, 116, 20);
        for (let index = 0; index < 7; index += 1) {
          const x = ((index * 286 - cameraX * .11) % 1840 + 1840) % 1840 - 250;
          const y = 104 + (index % 3) * 82;
          ctx.fillStyle = index % 2 ? '#0b1f2c' : '#102b38';
          ctx.fillRect(x, y, 218, 28); ctx.fillRect(x + 42, y - 14, 126, 18);
        }
      }

      for (let layer = 0; layer < skylineTiles.length; layer += 1) {
        const parallax = layer ? .32 : .17;
        const offset = -((renderCameraX * parallax) % skylineTileWidth);
        ctx.drawImage(skylineTiles[layer], 0, 0, skylineTiles[layer].width, skylineTiles[layer].height, offset, 0, skylineTileWidth, VIEW_H);
        ctx.drawImage(skylineTiles[layer], 0, 0, skylineTiles[layer].width, skylineTiles[layer].height, offset + skylineTileWidth, 0, skylineTileWidth, VIEW_H);
      }
      ctx.fillStyle = isSeries ? '#ef4638' : activeCourseIndex === 0 ? '#ffd77a' : activeCourseIndex === 1 ? '#dff7f2' : '#78d7d2';
      for (let index = 0; index < 16; index += 1) { const x = ((index * 101 - cameraX * .52) % 1440 + 1440) % 1440 - 80; ctx.fillRect(x, 520 + (index % 3) * 10, 10, 4); }
      ctx.fillStyle = isSeries ? '#171b1c' : activeCourseIndex === 0 ? '#2c2834' : activeCourseIndex === 1 ? '#1c5664' : '#061720'; ctx.fillRect(-8, 574, VIEW_W + 16, 10);
      ctx.fillStyle = atmosphere.near;
      for (let x = -80 - ((cameraX * .64) % 96); x < VIEW_W + 96; x += 96) { ctx.fillRect(x, 548, 8, 36); ctx.fillRect(x + 8, 552, 64, 4); }
      ctx.fillStyle = isSeries ? '#ef4638' : activeCourseIndex === 0 ? '#f5d263' : activeCourseIndex === 1 ? '#fff8e9' : '#18a7a2';
      for (let index = 0; index < 8; index += 1) { const x = ((index * 227 - cameraX * .38) % 1700 + 1700) % 1700 - 100; ctx.fillRect(x, 535 + (index % 2) * 12, 20, 4); }
      ctx.restore();

      if (!isSeries && activeCourseIndex === 2) {
        ctx.globalAlpha = .62;
        for (let index = 0; index < 96; index += 1) {
          const x = ((index * 97 + elapsed * 290 - cameraX * .04) % 1460 + 1460) % 1460 - 90;
          const y = ((index * 53 + elapsed * 460) % 820) - 90;
          ctx.fillStyle = index % 5 === 0 ? '#78d7d2' : '#457583';
          ctx.fillRect(Math.floor(x / 4) * 4, Math.floor(y / 4) * 4, index % 5 === 0 ? 4 : 3, index % 5 === 0 ? 22 : 14);
        }
        ctx.globalAlpha = 1;
      }

      if (modifier.id === 'tailwind' && !reducedMotion) {
        ctx.globalAlpha = .74;
        for (let index = 0; index < 22; index += 1) {
          const x = ((index * 149 + elapsed * 720) % 1500) - 140;
          const y = 90 + ((index * 83) % 500);
          ctx.fillStyle = index % 4 === 0 ? '#fff8e9' : '#9de8e1';
          ctx.fillRect(Math.floor(x / 4) * 4, Math.floor(y / 4) * 4, index % 3 === 0 ? 112 : 68, 4);
        }
        ctx.globalAlpha = 1;
      } else if (modifier.id === 'moonstep' && !reducedMotion) {
        ctx.globalAlpha = .42;
        for (let index = 0; index < 18; index += 1) {
          const x = ((index * 211 - cameraX * .12) % 1420 + 1420) % 1420 - 60;
          const y = ((index * 97 - elapsed * 54) % 620 + 620) % 620 + 34;
          ctx.fillStyle = index % 3 === 0 ? '#fff0ad' : '#a7e4df';
          ctx.fillRect(Math.floor(x / 4) * 4, Math.floor(y / 4) * 4, 6, 6);
        }
        ctx.globalAlpha = 1;
      }

      ctx.save(); ctx.translate(-renderCameraX, -touchWorldLift);
      const viewLeft = renderCameraX - 180;
      const viewRight = renderCameraX + VIEW_W + 180;
      const visible = (x: number, width = 0) => x + width >= viewLeft && x <= viewRight;
      platforms.forEach((sourcePlatform) => {
        if (!visible(sourcePlatform.x, sourcePlatform.w)) return;
        const platform = sourcePlatform.moving ? { ...sourcePlatform, y: (sourcePlatform.baseY ?? sourcePlatform.y) + Math.sin(elapsed * 1.45 + (sourcePlatform.phase ?? 0)) * 72 } : sourcePlatform;
        const px = Math.floor(platform.x / 4) * 4; const py = Math.floor(platform.y / 4) * 4;
        ctx.fillStyle = '#061a20'; ctx.fillRect(px - 4, py - 4, platform.w + 8, platform.h + 4);
        ctx.fillStyle = atmosphere.edge; ctx.fillRect(px, py, platform.w, 20);
        ctx.fillStyle = atmosphere.rail; ctx.fillRect(px, py, platform.w, 8);
        ctx.fillStyle = isSeries ? '#f8e45c' : activeCourseIndex === 2 ? '#78d7d2' : '#d9fff0'; ctx.fillRect(px + 8, py + 2, Math.max(0, platform.w - 16), 2);
        ctx.fillStyle = '#071316'; for (let x = px + 18; x < px + platform.w - 8; x += 48) ctx.fillRect(x, py + 12, 5, 5);
        ctx.fillStyle = atmosphere.edge; ctx.fillRect(px, py + 20, platform.w, 4);
        for (let x = px; x < px + platform.w; x += 32) for (let y = py + 24; y < py + platform.h; y += 24) {
          ctx.fillStyle = ((x + y) / 8) % 2 ? atmosphere.blockA : atmosphere.blockB; ctx.fillRect(x, y, 24, 16);
        }
        if (platform.h > 32) {
          ctx.fillStyle = atmosphere.support;
          for (let x = px + 12; x < px + platform.w - 20; x += 96) { ctx.fillRect(x, py + 34, 8, platform.h - 34); ctx.fillRect(x + 8, py + 38, 36, 6); }
        }
        if (!isSeries && activeCourseIndex === 2) {
          ctx.fillStyle = '#78d7d2';
          for (let x = px + 12; x < px + platform.w - 20; x += 74) ctx.fillRect(x, py + 5, Math.min(28, px + platform.w - x - 8), 3);
        }
      });
      const drawSign = (x: number, y: number, text: string, accent: string, width = 150) => {
        if (!visible(x, width)) return;
        ctx.fillStyle = '#071316'; ctx.fillRect(x - 6, y - 6, width, 48);
        ctx.fillStyle = accent; ctx.fillRect(x, y, width - 12, 36);
        ctx.fillStyle = '#071316'; ctx.fillRect(x + 5, y + 5, width - 22, 26);
        ctx.fillStyle = accent; ctx.font = 'bold 18px monospace'; ctx.fillText(text, x + 12, y + 24);
        ctx.fillStyle = '#fff8e9'; ctx.fillRect(x + 4, y + 4, 3, 3); ctx.fillRect(x + width - 19, y + 29, 3, 3);
      };
      if (isSeries) {
        drawSign(760, 535, 'BE CONSISTENT', '#f8e45c', 205);
        drawSign(3720, 545, 'OWN IT', '#ef4638');
        drawSign(7060, 540, 'FORGIVE', '#f8e45c');
        drawSign(8960, 535, 'SEEK WISDOM', '#ef4638', 190);
        drawSign(11280, 545, 'THE ONE', '#f8e45c');
        drawSign(14290, 540, 'DECLARE', '#ef4638');
      } else {
        drawSign(760, 535, 'KEEP GOING', '#78d7d2');
        drawSign(3720, 545, 'HALFWAY', '#f5d263');
        drawSign(7060, 540, 'SECTOR 2', '#ef6f52');
        drawSign(8960, 535, course.short, course.accent);
        drawSign(11280, 545, modifier.name.toUpperCase(), '#78d7d2');
        drawSign(14290, 540, 'FINAL PUSH', '#ef6f52');
      }
      activeSpikes.forEach((spike) => {
        if (!visible(spike.x, spike.w)) return;
        ctx.fillStyle = '#071316'; ctx.fillRect(spike.x, spike.y + 20, spike.w, 8);
        ctx.fillStyle = '#f06f52';
        for (let x = spike.x; x < spike.x + spike.w; x += 24) { ctx.beginPath(); ctx.moveTo(x, spike.y + 24); ctx.lineTo(x + 12, spike.y); ctx.lineTo(x + 24, spike.y + 24); ctx.closePath(); ctx.fill(); }
      });
      rallyPoints.forEach((rally, index) => {
        if (rally.triggered || !visible(rally.x - 32, 64)) return;
        const pulse = 1 + (Math.floor(elapsed * 5 + index) % 2) * 4;
        ctx.globalAlpha = .22; ctx.fillStyle = '#f8e45c'; ctx.fillRect(rally.x - 5, 110, 10, Math.max(0, rally.y - 142)); ctx.globalAlpha = 1;
        ctx.fillStyle = '#071316'; ctx.fillRect(rally.x - 26, rally.y - 32, 52, 56);
        ctx.fillStyle = '#f8e45c'; ctx.fillRect(rally.x - 20, rally.y - 26, 40, 44);
        ctx.fillStyle = '#ef4638'; ctx.fillRect(rally.x - 14, rally.y - 18, 28, 22);
        ctx.fillStyle = '#071316'; ctx.fillRect(rally.x - 5, rally.y - 13, 10, 12); ctx.fillRect(rally.x - 2, rally.y + 7, 4, 16);
        ctx.strokeStyle = '#f8e45c'; ctx.lineWidth = 4; ctx.strokeRect(rally.x - 32 - pulse, rally.y - 38 - pulse, 64 + pulse * 2, 68 + pulse * 2);
      });
      checkpoints.slice(1).forEach((x, index) => {
        if (!visible(x, 42)) return;
        const active = checkpointIndex > index;
        ctx.fillStyle = active ? '#f5d263' : '#527b7c'; ctx.fillRect(x - 4, 486, 8, 86); ctx.fillRect(x, 486, 42, 8);
        ctx.fillStyle = active ? '#ef6f52' : '#234d50'; ctx.fillRect(x + 8, 494, 30, 22);
      });
      sparks.forEach((spark, index) => {
        if (spark.taken || !visible(spark.x - 28, 56)) return;
        const bob = Math.round(Math.sin(elapsed * 5 + index) * 4 / 4) * 4;
        ctx.save(); ctx.translate(spark.x, spark.y + bob); const color = spark.storm ? '#78d7d2' : '#f5d263';
        ctx.fillStyle = '#071316'; ctx.fillRect(-12, -20, 24, 40); ctx.fillRect(-20, -12, 40, 24);
        ctx.fillStyle = color; ctx.fillRect(-8, -20, 16, 40); ctx.fillRect(-20, -8, 40, 16);
        ctx.fillStyle = '#fff8e9'; ctx.fillRect(-4, -8, 8, 16);
        if (spark.storm) { ctx.fillStyle = '#78d7d2'; ctx.fillRect(-28, -4, 4, 8); ctx.fillRect(24, -4, 4, 8); ctx.fillRect(-4, -28, 8, 4); }
        if (Math.floor(elapsed * 6 + index) % 3 === 0) { ctx.fillRect(-24, -20, 4, 4); ctx.fillRect(20, 16, 4, 4); }
        ctx.restore();
      });
      enemies.forEach((enemy) => {
        if (!enemy.alive || !visible(enemy.x - 32, 64)) return;
        const ex = Math.floor(enemy.x / 4) * 4; const ey = Math.floor(enemy.y / 4) * 4;
        const step = Math.floor(elapsed * 8 + enemy.x / 80) % 2 ? 4 : 0;
        ctx.fillStyle = '#071316'; ctx.fillRect(ex - 22, ey - 34, 10, 10); ctx.fillRect(ex - 8, ey - 40, 12, 12); ctx.fillRect(ex + 8, ey - 34, 10, 10);
        ctx.fillStyle = '#e2aa2f'; ctx.fillRect(ex - 18, ey - 32, 6, 6); ctx.fillRect(ex - 4, ey - 36, 8, 8); ctx.fillRect(ex + 10, ey - 32, 6, 6);
        ctx.fillStyle = '#ef6f52'; ctx.fillRect(ex - 28, ey - 20, 56, 40); ctx.fillRect(ex - 20, ey - 28, 40, 56);
        ctx.fillStyle = '#071316'; ctx.fillRect(ex - 16, ey - 8, 12, 12); ctx.fillRect(ex + 8, ey - 8, 12, 12);
        ctx.fillStyle = '#fff8e9'; ctx.fillRect(ex - 12, ey - 8, 4, 4); ctx.fillRect(ex + 12, ey - 8, 4, 4);
        ctx.fillStyle = '#071316'; ctx.fillRect(ex - 22 - step, ey + 20, 16, 8); ctx.fillRect(ex + 8 + step, ey + 20, 16, 8);
      });
      const exitX = FINISH_X - 35;
      if (visible(exitX - 16, 120)) {
        ctx.fillStyle = '#071316'; ctx.fillRect(exitX, 414, 88, 24); ctx.fillStyle = '#f5d263'; ctx.font = 'bold 16px monospace'; ctx.fillText('EXIT', exitX + 20, 432);
        ctx.fillStyle = '#b96f14'; ctx.fillRect(exitX - 16, 440, 120, 180); ctx.fillStyle = '#f5d263'; ctx.fillRect(exitX - 4, 452, 96, 168);
        ctx.fillStyle = Math.floor(elapsed * 5) % 2 ? '#18a7a2' : '#78d7d2'; ctx.fillRect(exitX + 12, 468, 64, 152);
        ctx.fillStyle = '#071820'; ctx.fillRect(exitX + 28, 484, 32, 136);
      }

      let spriteIndex = 0;
      if (player.invuln > 0 && Math.floor(elapsed * 12) % 2 === 0) ctx.globalAlpha = .35;
      if (screenRef.current === 'won') spriteIndex = 7;
      else if (player.dashTime > 0) spriteIndex = 5;
      else if (player.invuln > .9) spriteIndex = 6;
      else if (!player.grounded) spriteIndex = player.vy < 0 ? 3 : 4;
      else if (Math.abs(player.vx) > 80) spriteIndex = Math.floor(elapsed * 10) % 2 ? 1 : 2;
      if (stormShield > 0) {
        const pulse = Math.floor(elapsed * 8) % 2 ? 4 : 0;
        ctx.fillStyle = '#78d7d2';
        ctx.fillRect(player.x - 12 - pulse, player.y - 10, 8, player.h + 20);
        ctx.fillRect(player.x + player.w + 4 + pulse, player.y - 10, 8, player.h + 20);
        ctx.fillRect(player.x - 4, player.y - 18 - pulse, player.w + 8, 8);
        ctx.fillRect(player.x - 4, player.y + player.h + 10 + pulse, player.w + 8, 8);
      }
      if (spriteSheet.complete && spriteSheet.naturalWidth) {
        const drawH = spriteIndex === 5 ? 106 : 116;
        const drawW = drawH * (32 / 48);
        if (ghost.length > 1) {
          const ghostFrame = ghost[Math.min(ghost.length - 1, Math.max(0, Math.floor(elapsed / .12)))];
          if (ghostFrame && Math.abs(ghostFrame.x - player.x) < VIEW_W * 1.5) {
            ctx.save(); ctx.globalAlpha = .22; ctx.translate(ghostFrame.x + player.w / 2, ghostFrame.y + player.h); ctx.scale(player.facing, 1);
            ctx.drawImage(spriteSheet, 0, 0, 48, 72, -drawW / 2, -116, drawW, 116); ctx.restore(); ctx.globalAlpha = 1;
          }
        }
        if (player.dashTime > 0) {
          for (let trail = 3; trail > 0; trail -= 1) {
            ctx.globalAlpha = .1 + trail * .08;
            ctx.save(); ctx.translate(player.x + player.w / 2 - player.facing * trail * 30, player.y + player.h); ctx.scale(player.facing, 1);
            ctx.drawImage(spriteSheet, 240, 0, 48, 72, -drawW / 2, -drawH, drawW, drawH); ctx.restore();
          }
          ctx.globalAlpha = 1;
        }
        ctx.save(); ctx.translate(player.x + player.w / 2, player.y + player.h); ctx.scale(player.facing, 1);
        ctx.drawImage(spriteSheet, spriteIndex * 48, 0, 48, 72, -drawW / 2, -drawH, drawW, drawH); ctx.restore();
      } else { ctx.fillStyle = '#f5d263'; ctx.fillRect(player.x, player.y, player.w, player.h); }
      ctx.globalAlpha = 1; ctx.restore();
      if (!isSeries && activeCourseIndex === 2) {
        ctx.globalAlpha = .4;
        for (let index = 0; index < 24; index += 1) {
          const x = ((index * 181 + elapsed * 430) % 1420) - 70;
          const y = ((index * 109 + elapsed * 610) % 820) - 80;
          ctx.fillStyle = index % 4 === 0 ? '#a7e4df' : '#5d91a0';
          ctx.fillRect(Math.floor(x / 4) * 4, Math.floor(y / 4) * 4, 4, 28);
          ctx.fillRect(Math.floor(x / 4) * 4 + 4, Math.floor(y / 4) * 4 + 24, 4, 8);
        }
        ctx.globalAlpha = 1;
      }
    }

    function loop(now: number) {
      const frameTime = Math.min(.05, (now - last) / 1000);
      last = now;
      if (screenRef.current === 'playing' && !waitingForLandscapeRef.current && !coachPauseRef.current) {
        accumulator += frameTime;
        let steps = 0;
        while (accumulator >= 1 / 60 && steps < 3) {
          update(1 / 60);
          accumulator -= 1 / 60;
          steps += 1;
        }
        if (steps === 3) accumulator = 0;
      } else accumulator = 0;
      draw();
      animation = requestAnimationFrame(loop);
    }
    animation = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(animation); stopMusic(); window.removeEventListener('keydown', keyDown); window.removeEventListener('keyup', keyUp); window.removeEventListener('blur', clearKeys); resetRef.current = null;
    };
  // The game engine is intentionally rebuilt when the selected course mode changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCourseIndex, isSeries, routeSeed]);

  // A Series Route launches only after React has rebuilt the game engine for
  // the selected week. This prevents the two-tap "mode selected" dead end.
  useEffect(() => {
    if (!seriesMode || !pendingSeriesStartRef.current) return;
    pendingSeriesStartRef.current = false;
    void startGame(true);
  // startGame intentionally reads the freshly rendered route state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriesMode, seriesWeekIndex, routeSeed]);

  return (
    <main className="shell">
      <section className="game-frame" aria-label="Crestbound platform game starring Sunny">
        <canvas ref={canvasRef} className="game-canvas" width={320} height={180} tabIndex={0} aria-label="Platform game. Use arrows or A and D to move, Space to jump, and Shift to dash." />

        {screen !== 'title' && (
          <header className="hud" aria-live="polite" aria-atomic="false">
            <div className="hud-brand"><span className="mini-sun">✦</span><strong>{course.short}</strong><i className={hud.dashReady ? 'ready' : ''}>{hud.dashReady ? 'DASH READY' : 'DASH CHARGING'}</i></div>
            <div className={gameNotice ? `hud-stats notice-mode ${gameNotice.kind}` : 'hud-stats'}>
              {gameNotice ? <span className="hud-notice" role="status"><b>{gameNotice.text}</b></span> : <><span><b>{'◆'.repeat(hud.lives)}</b><small>LIVES</small></span>
                <span><b>{hud.sparks}/{hud.total}</b><small>LIGHT</small></span>
                {isSeries && <span className="series-status"><b>{hud.signatureCount}/3</b><small>MARKS</small></span>}
                <span><b>{formatTime(hud.time)}</b><small>TIME</small></span>
                {hud.shield > 0 && <span className="shield-status"><b>{hud.shield.toFixed(1)}</b><small>SHIELD</small></span>}</>}
            </div>
            <div className="hud-actions">
              <button type="button" onClick={toggleSound} aria-label={muted ? 'Turn sound on' : 'Mute sound'}>{muted ? '♪ OFF' : '♪ ON'}</button>
              <button type="button" onClick={togglePause} aria-label={screen === 'paused' ? 'Resume game' : 'Pause game'}>{screen === 'paused' ? '▶' : 'Ⅱ'}</button>
            </div>
            <div className="route-meter" aria-label={`${Math.round(hud.progress / (WORLD_W - 265) * 100)} percent through the course`}><span style={{ width: `${Math.min(100, hud.progress / (WORLD_W - 265) * 100)}%` }} /></div>
          </header>
        )}

        {screen === 'title' && (
          <div className="title-screen">
            <div className="home-hero">
              <div className="home-cover">
                <picture className="home-cover-scene">
                  <source media="(orientation: landscape)" srcSet="/crestbound-landscape-background-v1.png" />
                  <img src="/crestbound-square-background-v1.png" width="1254" height="1254" alt="The golden-hour Crestbound skyline beneath the A Daily Skyline Run title" />
                </picture>
                <div className="sunny-cover-character" aria-hidden="true">
                  <span className="sunny-cover-sprite" />
                  <span className="sunny-cover-name">SUNNY</span>
                </div>
                <picture className="home-cover-title-foreground">
                  <source media="(orientation: landscape)" srcSet="/crestbound-landscape-title-foreground-v1.png" />
                  <img src="/crestbound-square-title-foreground-v1.png" width="1254" height="1254" alt="" />
                </picture>
                <span className="sr-only">Sunny jumps out from behind the Crestbound title, lands on it, and waves.</span>
              </div>
              <div className="home-dashboard">
                <div className="daily-course">
                  <span>SUNNY&apos;S RUN · TODAY</span>
                  <b>{dailyCourse.name}</b>
                  <em>{dailyModifier.name} · {dailyObjectiveSpecs[dailyObjectiveId].name}</em>
                  <small className="route-condition">{dailyCondition.name} · {dailyCondition.description}</small>
                  {streak > 0 && <small className="streak-badge" title={`New route in ${dailyReset}`}>{streak} day streak</small>}
                </div>
                <button className="play-button" type="button" disabled={runStartState === 'connecting'} onClick={() => void startGame(true)}>{runStartState === 'connecting' ? 'Connecting Ranked Run…' : 'Run with Sunny'} {runStartState !== 'connecting' && <span aria-hidden="true">▶</span>}</button>
                {runStartState === 'error' && <p className="run-start-error" role="alert"><b>RUN NOT STARTED</b><span>{runStartError}</span></p>}
                <div className="daily-glance">
                  <div className="home-social-stats">
                    <span><small>TODAY&apos;S TOP</small><b>{dailyLeader === undefined ? 'CHECKING…' : dailyLeader ? `${dailyLeader.name} · ${dailyLeader.score.toLocaleString()}` : 'CLAIM #1'}</b></span>
                    <span><small>TODAY</small><b>{dailyPlayers === undefined ? 'CHECKING…' : `${dailyPlayers} ${dailyPlayers === 1 ? 'RUNNER' : 'RUNNERS'}`}</b></span>
                  </div>
                  <div className="community-progress">
                    <div><span>COMMUNITY LIGHT · WEEK</span><b>{community.lights.toLocaleString()} / {community.goal.toLocaleString()}</b></div>
                    <progress aria-label={`${community.lights} of ${community.goal} community lights collected this week`} max={community.goal} value={Math.min(community.lights, community.goal)} />
                  </div>
                </div>
                <div className="home-links">
                  <button className="series-routes-link" type="button" onClick={() => { setSeriesWeekIndex(activeSeries?.weekIndex ?? 0); openHomePanel('series'); track('series_open'); }}><strong>{activeSeries ? `${activeSeries.series.weeks.length} EXTRA SERIES ROUTES` : 'SERIES ROUTES'}</strong><small>{activeSeries ? `${activeSeries.series.name} · Weekly challenges →` : 'No active series today'}</small></button>
                  <button type="button" onClick={() => { openHomePanel('leaderboard'); track('leaderboard_open'); }}>Leaderboard</button>
                  <button type="button" onClick={() => { setHelpTab('play'); openHomePanel('help'); }}>How to Play</button>
                </div>
              </div>
            </div>
            {homePanel === 'leaderboard' && <aside ref={homePanelRef} className="leaderboard home-panel" role="dialog" aria-modal="true" aria-labelledby="leaderboard-title" tabIndex={-1}>
              <button className="panel-dismiss" type="button" aria-label="Close leaderboard" onClick={closeHomePanel}>X</button>
              <div className="board-heading"><span id="leaderboard-title">TOP RUNS</span><small>{board === 'daily' ? 'TODAY' : board === 'weekly' ? 'THIS WEEK' : 'ALL TIME'}</small></div>
              <div className="board-table">
                <div className="board-tabs">
                  {(['daily', 'weekly', 'all'] as Board[]).map((item) => <button className={board === item ? 'active' : ''} aria-pressed={board === item} type="button" key={item} onClick={() => setBoard(item)}>{item === 'daily' ? 'TODAY' : item === 'weekly' ? 'WEEK' : 'ALL'}</button>)}
                </div>
                <div className="board-legend score-board" aria-hidden="true"><span>RANK</span><span>RUNNER</span><span>SCORE</span></div>
                <ol className="board-list" aria-live="polite">
                  {boardStatus === 'loading' && <li className="board-message">LOADING RUNS...</li>}
                  {boardStatus === 'offline' && <li className="board-message">BOARD COMES ONLINE WHEN PUBLISHED.</li>}
                  {boardStatus === 'ready' && entries.length === 0 && <li className="board-message">NO FINISHERS YET. CLAIM #1.</li>}
                  {boardStatus === 'ready' && entries.slice(0, 7).map((entry) => <li className="score-board" key={`${entry.rank}-${entry.name}`}><b>#{entry.rank}</b><span>{entry.name}</span><time>{entry.score.toLocaleString()}</time></li>)}
                </ol>
              </div>
              <div className="board-context">
                {board === 'daily' && community.playerRank && community.playerRank > 7 && <div className="nearby-rivals"><b>YOUR NEARBY RIVALS // #{community.playerRank}</b>{community.nearby.map((entry) => <span key={`${entry.rank}-${entry.name}`}>#{entry.rank} {entry.name} <time>{entry.score.toLocaleString()}</time></span>)}</div>}
                {board === 'daily' && community.recent.length > 0 && <p className="recent-finishers">JUST RAN: {community.recent.join(' · ')}</p>}
                <p>{board === 'weekly' ? 'YOUR BEST CREST SCORE FROM EACH DAY BUILDS YOUR WEEKLY TOTAL.' : 'HIGH SCORE WINS: FINISH, MOVE FAST, COLLECT LIGHT, AND COMPLETE THE CHALLENGE.'}</p>
              </div>
              <button className="panel-close" type="button" onClick={closeHomePanel}>Close</button>
            </aside>}
            {homePanel === 'help' && <aside ref={homePanelRef} className="how-to home-panel" role="dialog" aria-modal="true" aria-labelledby="help-title" tabIndex={-1}>
              <button className="panel-dismiss" type="button" aria-label="Close how to play" onClick={closeHomePanel}>X</button>
              <div className="help-heading"><p className="kicker">READY, SUNNY?</p><h2 id="help-title">How to Play</h2></div>
              <div className="help-tabs" role="tablist" aria-label="How to Play sections">
                {(['play', 'score', 'world'] as HelpTab[]).map((tab) => <button id={`help-tab-${tab}`} className={helpTab === tab ? 'active' : ''} type="button" role="tab" aria-selected={helpTab === tab} aria-controls="help-tabpanel" onClick={() => setHelpTab(tab)} key={tab}>{tab === 'play' ? 'Play' : tab === 'score' ? 'Score' : 'World'}</button>)}
              </div>
              <div id="help-tabpanel" className="help-content" role="tabpanel" aria-labelledby={`help-tab-${helpTab}`}>
                {helpTab === 'play' && <section className="help-play"><div className="control-directory"><article><b>RUN</b><span>Arrows · A/D · touch</span></article><article><b>JUMP 2X</b><span>Space or JUMP · tap twice</span></article><article><b>DASH</b><span>Shift · X · DASH</span></article></div><div className="today-guide"><small>TODAY&apos;S ROUTE</small><b>{modifier.name} · {objective.name}</b><span>{modifier.description}</span>{!isSeries && <span><b>{dailyCondition.name}:</b> {dailyCondition.description}</span>}<span>{objective.description}. Finish for Bronze; reach the target for Silver or Gold.</span></div><p>Touch controls appear automatically. Turn your phone sideways before the timer starts.</p><p className="app-tip"><b>FULL SCREEN</b> On iPhone, tap Share → Add to Home Screen.</p></section>}
                {helpTab === 'score' && <section className="scoring-directory help-card-grid"><article><b>+500 · FINISH</b><span>Clear the route to bank a score.</span></article><article><b>UP TO +1,200 · PACE</b><span>Finish faster for more points.</span></article><article><b>UP TO +800 · LIGHT</b><span>Collect a larger share of the route&apos;s Light.</span></article><article><b>UP TO +200 · CHALLENGE</b><span>Earn Silver or Gold—or complete the Series objective.</span></article><p><b>EVERY FINISH COUNTS</b> All collected Light also goes to Suncrest&apos;s weekly community goal. Highest score wins; time breaks an exact tie.</p></section>}
                {helpTab === 'world' && <section className="help-world"><div className="world-rules help-card-grid"><article><b>GOLD LIGHT</b><span>Shortens Dash recharge.</span></article><article><b>STORM LIGHT</b><span>Readies Dash and shields one hit.</span></article><article><b>CHECKPOINT</b><span>Saves progress and restores one life.</span></article><article><b>ENEMY</b><span>Dash through or land from above.</span></article></div><div className="twist-directory"><h3>Daily Twists</h3>{modifierSpecs.map((item) => <article className={item.id === modifier.id && !isPractice ? 'today' : ''} key={item.id}><b>{item.name}{item.id === modifier.id && !isPractice ? ' · TODAY' : ''}</b><span>{item.shortDescription}</span></article>)}</div></section>}
              </div>
              <button className="panel-close" type="button" onClick={closeHomePanel}>Got It</button>
            </aside>}
            {homePanel === 'series' && <aside ref={homePanelRef} className="course-picker series-picker home-panel" role="dialog" aria-modal="true" aria-labelledby="series-title" tabIndex={-1}>
              <button className="panel-dismiss" type="button" aria-label="Close Series Routes" onClick={closeHomePanel}>X</button>
              <p className="kicker">NOW AT SUNCREST</p><h2 id="series-title">Series Routes</h2>
              {activeSeries && seriesWeek ? <><section className="series-feature" data-series-theme={activeSeries.series.theme}><div className="series-wordmark"><small>{activeSeries.series.wordmarkKicker}</small><b>{activeSeries.series.shortName}</b></div><p>{activeSeries.series.description}</p><div className="series-week"><span>{seriesWeekIndex === activeSeries.weekIndex ? 'THIS WEEK' : `WEEK ${seriesWeekIndex + 1} ARCHIVE`} · {seriesMessage?.title || seriesWeek.title}</span><b>{seriesWeek.routeName}</b>{seriesMessage?.speaker && <small>{seriesMessage.speaker}</small>}<div className="series-mechanic"><span>EXCLUSIVE SERIES CHALLENGE</span><b>{activeSeries.series.mechanicAction}</b><small>{activeSeries.series.mechanicHelp}</small></div></div><div className="series-week-dots" aria-label={`${seriesProgressCount} of ${activeSeries.series.weeks.length} routes completed`}>{activeSeries.series.weeks.map((week, index) => { const locked = index > activeSeries.weekIndex; const state = [completedSeriesWeeks.includes(week.id) ? 'complete' : '', index === activeSeries.weekIndex ? 'current' : '', index === seriesWeekIndex ? 'selected' : ''].filter(Boolean).join(' '); return <button type="button" className={state} disabled={locked} aria-label={locked ? `Week ${index + 1} unlocks ${week.sunday}` : `Select week ${index + 1}: ${week.title}`} aria-pressed={index === seriesWeekIndex} onClick={() => setSeriesWeekIndex(index)} key={week.id}>{locked ? '—' : index + 1}</button>; })}</div><div className="series-completion-progress"><span><b>{seriesProgressCount}/{activeSeries.series.weeks.length}</b> SERIES ROUTES</span><i style={{ width: `${seriesProgressCount / activeSeries.series.weeks.length * 100}%` }} /></div></section><button className="series-play" type="button" onClick={() => { pendingSeriesStartRef.current = true; setSeriesMode(true); closeHomePanel(); }}>Play {seriesWeekIndex === activeSeries.weekIndex ? 'This Week' : `Week ${seriesWeekIndex + 1}`} ▶</button><button className="series-results-button" type="button" onClick={() => openHomePanel('series-results')}><span><small>SELECTED ROUTE</small><strong>Results &amp; Leaderboard</strong></span><b>{seriesCompletions} {seriesCompletions === 1 ? 'FINISHER' : 'FINISHERS'} →</b></button><div className="series-resources"><button className="message-link" type="button" onClick={() => { track('message_open'); openSeriesResource(seriesMessage?.title || 'This Week\'s Message', seriesMessage?.appUrl || seriesMessage?.url || activeSeries.series.messageUrl); }}><span className="message-icon" aria-hidden="true">▶</span><span><strong>{seriesMessage ? "Watch This Week's Message" : 'Message Details'}</strong><small>{seriesMessage?.title || 'Connect this route to Suncrest'}</small></span></button>{seriesMessage?.discussionGuideUrl && <button type="button" onClick={() => openSeriesResource('Discussion Guide', seriesMessage.discussionGuideUrl!)}>Discussion Guide</button>}{seriesMessage?.readingGuideUrl && <button type="button" onClick={() => openSeriesResource('Reading Guide', seriesMessage.readingGuideUrl!)}>Reading Guide</button>}</div></> : <p>No Series Route is active today. The daily Crestbound route is still ready to run.</p>}
              <button className="panel-close" type="button" onClick={closeHomePanel}>Close</button>
            </aside>}
            {homePanel === 'series-results' && <aside ref={homePanelRef} className="course-picker series-picker series-results-panel home-panel" role="dialog" aria-modal="true" aria-labelledby="series-results-panel-title" tabIndex={-1}>
              <button className="panel-dismiss" type="button" aria-label="Close Series Route results" onClick={closeHomePanel}>X</button>
              <button className="series-results-back" type="button" onClick={() => setHomePanel('series')}>← Series Routes</button>
              <p className="kicker">{seriesWeek?.routeName || 'SERIES ROUTE'}</p><h2 id="series-results-panel-title">Results &amp; Leaderboard</h2>
              <section className="series-results" aria-label="Selected Series Route results"><header><h3>Top Scores</h3><b>{seriesCompletions} {seriesCompletions === 1 ? 'FINISHER' : 'FINISHERS'}</b></header><div className="series-result-legend score-board" aria-hidden="true"><span>RANK</span><span>RUNNER</span><span>SCORE</span></div><ol>{seriesBoardStatus === 'loading' && <li className="series-result-message">LOADING RESULTS…</li>}{seriesBoardStatus === 'offline' && <li className="series-result-message">RESULTS ARE TEMPORARILY OFFLINE.</li>}{seriesBoardStatus === 'ready' && seriesEntries.length === 0 && <li className="series-result-message">BE THE FIRST TO FINISH THIS ROUTE.</li>}{seriesBoardStatus === 'ready' && seriesEntries.slice(0, 7).map((entry) => <li className={`${entry.isPlayer ? 'you ' : ''}score-board`} key={`${entry.rank}-${entry.name}`}><b>#{entry.rank}</b><span>{entry.name}</span><time>{entry.score.toLocaleString()}</time></li>)}</ol><p>{activeSeries ? `${activeSeries.series.mechanicAction} for the full +200 Series bonus.` : 'Complete the Series challenge for the full +200 bonus.'}</p></section>
              <button className="panel-close" type="button" onClick={() => setHomePanel('series')}>Back to Series Routes</button>
            </aside>}
            {homePanel === 'resource' && seriesResource && <aside ref={homePanelRef} className="message-viewer home-panel" role="dialog" aria-modal="true" aria-labelledby="resource-title" tabIndex={-1}>
              <header><button type="button" onClick={() => setHomePanel('series')} aria-label="Back to Series Routes">← Back</button><div><small>FROM SERIES ROUTES</small><strong id="resource-title">{seriesResource.title}</strong></div></header>
              <iframe src={seriesResource.url} title={seriesResource.title} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen />
            </aside>}
          </div>
        )}

        {showScoreIntro && <div ref={gameModalRef} className="game-modal score-intro" role="dialog" aria-modal="true" aria-labelledby="score-intro-title" tabIndex={-1}><p>BEFORE YOUR FIRST RUN</p><h2 id="score-intro-title">Highest score wins.</h2><div className="score-intro-grid"><span><b>+500</b> Finish</span><span><b>+1,200</b> Move fast</span><span><b>+800</b> Collect Light</span><span><b>+200</b> Complete the challenge</span></div><p>Faster runs earn more Pace points; time breaks an exact score tie. Every finish adds your Light to Suncrest&apos;s weekly goal.</p><button type="button" onClick={dismissScoreIntro}>Got It · Start Run</button></div>}
        {screen === 'paused' && <div ref={gameModalRef} className="game-modal" role="dialog" aria-modal="true" aria-labelledby="pause-title" tabIndex={-1}><p>RUN PAUSED</p><h2 id="pause-title">Catch your breath.</h2><button type="button" onClick={togglePause}>Resume</button><button className="secondary" type="button" onClick={() => { track('quit', { hits: hud.hits, checkpoint: hud.checkpoint, progress: hud.progress, elapsedMs: hud.time * 1000, lights: hud.sparks, lightTotal: hud.total, lightPercent: hud.total ? hud.sparks / hud.total * 100 : 0, dashCount: runMetricsRef.current.dashCount, signatureCount: hud.signatureCount }); flushTelemetry(); setGameScreen('title'); }}>Quit Run</button></div>}
        {screen === 'over' && <div ref={gameModalRef} className="game-modal" role="dialog" aria-modal="true" aria-labelledby="over-title" tabIndex={-1}><p>LIGHT LOST</p><h2 id="over-title">That route got you.</h2><p>Use the high paths, save your dash, and hit enemies from above.</p><button type="button" onClick={() => void startGame()}>Run It Back</button><button className="secondary" type="button" onClick={() => { setGameScreen('title'); if (isSeries) openHomePanel('series'); }}>{isSeries ? 'Back to Series Routes' : 'Back to Home'}</button></div>}
        {screen === 'won' && (
          <div ref={gameModalRef} className={`game-modal win-modal ${isSeries ? 'series-win' : 'daily-win'}`} role="dialog" aria-modal="true" aria-labelledby="win-title" tabIndex={-1}>
            <p>{isSeries ? `${activeSeries?.series.mechanicName ?? 'SERIES MARKS'} ${resultHud.signatureCount}/3` : `LIGHT RESTORED // ${earnedMedal} MEDAL`}</p><h2 id="win-title">Route cleared.</h2>
            <div className={`score-tally ${isNewBestScore ? 'new-best' : ''}`} aria-label={`Crest Score ${displayedScore.toLocaleString()}. ${scoreResultLabel}`}>
              <span><small>ROUTE COMPLETE</small><b>+{(scoreResult?.breakdown.finish ?? localScore.finish).toLocaleString()}</b></span>
              <span><small>PACE BONUS · {formatTime(resultHud.time)}</small><b>+{(scoreResult?.breakdown.pace ?? localScore.pace).toLocaleString()}</b></span>
              <span><small>LIGHT · {resultHud.sparks}/{resultHud.total}</small><b>+{(scoreResult?.breakdown.light ?? localScore.light).toLocaleString()}</b></span>
              <span><small>{isSeries ? `${activeSeries?.series.shortName ?? 'SERIES'} · ${resultHud.signatureCount}/3` : `${earnedMedal} CHALLENGE`}</small><b>+{(scoreResult?.breakdown.bonus ?? localScore.bonus).toLocaleString()}</b></span>
              <strong><small>{scoreResultLabel}</small><b>{displayedScore.toLocaleString()}</b></strong>
            </div>
            <div className="result-priority"><b>+{resultHud.sparks} COMMUNITY LIGHT</b><span>Every verified finish counts toward Suncrest&apos;s weekly goal.</span></div>
            {isSeries
              ? <div className="challenge-result series-signature"><b>{activeSeries?.series.mechanicName ?? 'SERIES MARKS'}</b><span>{resultHud.signatureCount}/3 · {resultHud.signatureCount === 3 ? 'FULL +200 SERIES BONUS' : 'PARTIAL SERIES BONUS'}</span></div>
              : <div className={`challenge-result ${earnedMedal.toLowerCase()}`}><b>{objective.name}</b><span>{objectiveResult}</span></div>}
            {isSeries ? <div className={`rank-callout ${seriesBadgeNew ? 'badge-earned' : ''}`}>{seriesBadgeNew ? `BADGE EARNED · WEEK ${seriesWeekIndex + 1}` : 'SERIES RUN RECORDED'} · {seriesProgressCount}/{activeSeries?.series.weeks.length ?? 0} ROUTES</div> : submitState !== 'saved' ? <form className="score-form" onSubmit={submitRun} noValidate>
              <label htmlFor="nickname">POST TO TODAY&apos;S BOARD</label>
              <div><input id="nickname" value={nickname} onChange={(event) => setNickname(event.target.value)} minLength={2} maxLength={12} placeholder="NICKNAME" autoComplete="nickname" autoCapitalize="characters" spellCheck={false} /><button type="submit" disabled={submitState === 'saving' || !runIdRef.current}>{submitState === 'saving' ? 'SAVING...' : 'POST RUN'}</button></div>
              <small>Family-friendly nicknames only. Don&apos;t use your real name.{!runIdRef.current ? ' Online posting is unavailable for this run.' : ''}</small>
              {submitState === 'error' && <em role="alert">{submitError || 'COULDN\'T POST. TRY AGAIN.'}</em>}
            </form> : <div className="rank-callout">RUN POSTED {rank ? `// TODAY #${rank}` : '// TO TODAY'}</div>}
            <div className="result-actions">
              <button type="button" onClick={() => void startGame()}>Run It Again</button>
              {activeSeries && !isSeries && <button className="series-result-cta" type="button" onClick={() => { setGameScreen('title'); setSeriesWeekIndex(activeSeries.weekIndex); openHomePanel('series'); }}>Try {activeSeries.series.weeks.length} Series Challenges</button>}
              {isSeries && <button className="series-result-cta" type="button" onClick={() => { setSeriesMode(false); setGameScreen('title'); }}>Run Today&apos;s Route</button>}
              {isSeries && seriesMessage && <button className="message-result-cta" type="button" onClick={() => { setGameScreen('title'); setSeriesWeekIndex(seriesWeekIndex); openSeriesResource(seriesMessage.title, seriesMessage.appUrl || seriesMessage.url); }}>Watch This Week&apos;s Message</button>}
              {isSeries && <button className="secondary series-back-action" type="button" onClick={() => { setGameScreen('title'); setSeriesWeekIndex(seriesWeekIndex); openHomePanel('series'); }}>Back to Series Routes</button>}
              {!isSeries && <button className="secondary" type="button" onClick={() => { setGameScreen('title'); openHomePanel('leaderboard'); void loadBoard('daily'); }}>View Leaderboard</button>}
              <button className="secondary back-home-action" type="button" onClick={() => { setSeriesMode(false); closeHomePanel(); setGameScreen('title'); }}>Back to Home</button>
            </div>
          </div>
        )}

        {screen === 'playing' && (
          <>{waitingForLandscape && <div className="rotate-prompt"><span aria-hidden="true">↻</span><strong>Turn Sideways to Start</strong><small>Your run and timer are paused until the phone is in landscape.</small></div>}{showModifierCoach && !waitingForLandscape ? <div className="dash-coach modifier-coach"><b>{isSeries ? `EXCLUSIVE CHALLENGE · ${activeSeries?.series.mechanicName ?? 'SERIES MARKS'}` : `${modifier.name} + ${dailyCondition.name}`}</b><span>{isSeries ? activeSeries?.series.mechanicHelp : `${modifier.description} ${dailyCondition.description}`}</span><button type="button" onClick={dismissModifierCoach}>LET&apos;S RUN</button></div> : showDashCoach && !waitingForLandscape && <div className="dash-coach"><b>DASH IS YOUR EDGE</b><span>Press SHIFT or X — or tap DASH — to burst through hazards and enemies. The HUD tells you when it recharges.</span><button type="button" onClick={() => dismissDashCoach()}>GOT IT</button></div>}<div ref={touchControlsRef} className="touch-controls" aria-label="Touch controls">
            <div><button type="button" data-control="left" aria-label="Move left" onPointerDown={(event) => beginPress('left', event)} onPointerUp={(event) => endPress('left', event)} onPointerCancel={(event) => endPress('left', event)} onLostPointerCapture={(event) => endPress('left', event)}>←</button><button type="button" data-control="right" aria-label="Move right" onPointerDown={(event) => beginPress('right', event)} onPointerUp={(event) => endPress('right', event)} onPointerCancel={(event) => endPress('right', event)} onLostPointerCapture={(event) => endPress('right', event)}>→</button></div>
            <div><button className={hud.dashReady ? 'dash-control ready' : 'dash-control'} type="button" data-control="dash" aria-label={hud.dashReady ? 'Dash ready' : 'Dash charging'} onPointerDown={(event) => beginPress('dash', event)} onPointerUp={(event) => endPress('dash', event)} onPointerCancel={(event) => endPress('dash', event)} onLostPointerCapture={(event) => endPress('dash', event)}>DASH</button><button className="jump-control" type="button" data-control="jump" aria-label="Jump — tap twice for double jump" onPointerDown={(event) => beginPress('jump', event)} onPointerUp={(event) => endPress('jump', event)} onPointerCancel={(event) => endPress('jump', event)} onLostPointerCapture={(event) => endPress('jump', event)}>JUMP 2X</button></div>
          </div></>
        )}
      </section>
    </main>
  );
}
