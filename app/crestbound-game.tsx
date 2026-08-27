'use client';

import { FormEvent, PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SoundKind, soundSources, soundVolumes } from './audio-assets';
import { chicagoDayKey, collectLightPower, formatDailyReset, gravityForModifier, millisecondsUntilNextChicagoDay, musicTrackForCourse, resetRunTiming, resolveDamage, tailwindAcceleration } from './game-rules';
import { checkNickname } from '@/lib/nickname';

type Screen = 'title' | 'playing' | 'paused' | 'won' | 'over';
type Hud = { sparks: number; total: number; lives: number; time: number; best: number | null; checkpoint: number; progress: number; dashReady: boolean; shield: number };
type Platform = { x: number; y: number; w: number; h: number; moving?: boolean; phase?: number; baseY?: number };
type Spark = { x: number; y: number; taken?: boolean; secret?: boolean; storm?: boolean };
type Enemy = { x: number; y: number; minX: number; maxX: number; speed: number; dir: number; alive: boolean };
type Board = 'daily' | 'weekly' | 'all';
type BoardEntry = { rank: number; name: string; timeMs: number; sparks: number; points?: number; runs?: number };
type HomePanel = 'none' | 'leaderboard' | 'help' | 'courses';
type GameNotice = { text: string; kind: 'checkpoint' | 'power' };

type Community = { players: number; lights: number; goal: number; nearby: BoardEntry[]; playerRank: number | null; recent: string[] };

const COURSE_OFFSET = 7600;
const WORLD_W = 15400;
const FINISH_X = 15135;
const VIEW_W = 1280;
const VIEW_H = 720;

const localDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
const daySerial = Math.floor(new Date(`${localDay}T12:00:00Z`).getTime() / 86400000);
const dailyCourseIndex = ((daySerial % 3) + 3) % 3;
const courseSpecs = [
  { id: 'goldline', name: 'Goldline Rooftops', short: 'GOLDLINE', accent: '#f5d263', description: 'Balanced rooftops, branching high paths, and precision shortcuts.' },
  { id: 'crosswind', name: 'Crosswind Heights', short: 'CROSSWIND', accent: '#78d7d2', description: 'Long aerial chains, moving platforms, and dash-heavy gaps.' },
  { id: 'nightshift', name: 'Night Shift', short: 'NIGHT SHIFT', accent: '#ef6f52', description: 'Low tunnels, hazard lanes, and an enemy-heavy sprint.' },
] as const;
const modifierSpecs = [
  { id: 'clear', name: 'Clear Skies', description: 'The standard route: normal gravity, normal wind, and familiar light.' },
  { id: 'tailwind', name: 'Tailwind', description: 'A steady breeze gives Sunny a small forward push while moving right.' },
  { id: 'moonstep', name: 'Moonstep', description: 'Lower gravity gives every jump more height and longer airtime.' },
  { id: 'sparkstorm', name: 'Spark Storm', description: 'Extra teal Storm Lights appear on high routes. Each recharges Dash and shields one hit for five seconds.' },
] as const;
const dailyCourse = courseSpecs[dailyCourseIndex];
const dailyModifier = modifierSpecs[((daySerial + dailyCourseIndex) % modifierSpecs.length + modifierSpecs.length) % modifierSpecs.length];

const basePlatforms: Platform[] = [
  { x: 0, y: 620, w: 860, h: 120 }, { x: 240, y: 500, w: 210, h: 24 }, { x: 560, y: 410, w: 180, h: 24 },
  { x: 950, y: 620, w: 790, h: 120 }, { x: 1020, y: 505, w: 180, h: 24 }, { x: 1280, y: 415, w: 185, h: 24 }, { x: 1510, y: 330, w: 150, h: 24 },
  { x: 1810, y: 620, w: 480, h: 120 }, { x: 1970, y: 485, w: 170, h: 24 },
  { x: 2310, y: 555, w: 175, h: 24 }, { x: 2510, y: 455, w: 165, h: 24 }, { x: 2710, y: 350, w: 180, h: 24 }, { x: 2940, y: 445, w: 170, h: 24 },
  { x: 3160, y: 620, w: 720, h: 120 }, { x: 3340, y: 460, w: 165, h: 24, moving: true, phase: 0, baseY: 460 }, { x: 3600, y: 360, w: 190, h: 24 },
  { x: 3950, y: 620, w: 730, h: 120 }, { x: 4050, y: 490, w: 170, h: 24 }, { x: 4310, y: 390, w: 190, h: 24 },
  { x: 4720, y: 620, w: 940, h: 120 }, { x: 4820, y: 505, w: 175, h: 24 }, { x: 5100, y: 410, w: 190, h: 24 }, { x: 5390, y: 325, w: 180, h: 24 },
  { x: 5720, y: 550, w: 170, h: 24, moving: true, phase: 1.7, baseY: 500 }, { x: 5960, y: 430, w: 170, h: 24, moving: true, phase: 3.1, baseY: 440 },
  { x: 6200, y: 620, w: 1600, h: 120 }, { x: 6360, y: 500, w: 190, h: 24 }, { x: 6660, y: 405, w: 180, h: 24 }, { x: 6960, y: 315, w: 180, h: 24 }, { x: 7250, y: 445, w: 210, h: 24 },
];

const baseSpikeZones = [
  { x: 1120, y: 596, w: 130 }, { x: 1675, y: 596, w: 65 }, { x: 4070, y: 596, w: 150 },
  { x: 5030, y: 596, w: 160 }, { x: 5290, y: 596, w: 175 }, { x: 6480, y: 596, w: 130 }, { x: 6850, y: 596, w: 130 },
];

const baseSparkSeed: Spark[] = [
  { x: 345, y: 450 }, { x: 650, y: 360 }, { x: 1030, y: 565 }, { x: 1370, y: 360 }, { x: 1585, y: 275, secret: true },
  { x: 2055, y: 430 }, { x: 2385, y: 500 }, { x: 2590, y: 400 }, { x: 2795, y: 295 }, { x: 3030, y: 390 },
  { x: 3420, y: 400 }, { x: 3685, y: 305, secret: true }, { x: 4125, y: 435 }, { x: 4400, y: 335 }, { x: 4895, y: 450 },
  { x: 5195, y: 355 }, { x: 5480, y: 270, secret: true }, { x: 5800, y: 430 }, { x: 6040, y: 355 }, { x: 6445, y: 445 },
  { x: 6745, y: 350 }, { x: 7045, y: 260, secret: true }, { x: 7340, y: 390 }, { x: 7500, y: 545 },
];

const baseEnemySeed: Enemy[] = [
  { x: 1180, y: 570, minX: 970, maxX: 1660, speed: 95, dir: 1, alive: true },
  { x: 2040, y: 570, minX: 1830, maxX: 2240, speed: 125, dir: -1, alive: true },
  { x: 4180, y: 570, minX: 3970, maxX: 4610, speed: 150, dir: 1, alive: true },
  { x: 4920, y: 570, minX: 4740, maxX: 5580, speed: 170, dir: -1, alive: true },
  { x: 6690, y: 570, minX: 6250, maxX: 7100, speed: 185, dir: 1, alive: true },
];

function buildCourse(index: number, modifierId: string) {
  if (index === 0) {
    const platforms = [0, 1].flatMap((copy) => basePlatforms.map((platform, platformIndex) => {
      const shift = copy === 0 || platform.y >= 600 ? 0 : [24, -42, 36, -28][platformIndex % 4];
      const y = platform.y >= 600 ? platform.y : Math.max(280, Math.min(555, platform.y + shift));
      const xShift = copy === 0 || platform.y >= 600 ? 0 : [-30, 48, 0, 72][platformIndex % 4];
      return { ...platform, x: platform.x + copy * COURSE_OFFSET + xShift, y, baseY: platform.moving ? y : platform.baseY };
    }));
    const regularSparks: Spark[] = [0, 1].flatMap((copy) => baseSparkSeed.map((spark, sparkIndex) => ({ ...spark, x: spark.x + copy * COURSE_OFFSET + (copy ? (sparkIndex % 3 - 1) * 38 : 0) })));
    const stormSparks = modifierId === 'sparkstorm' ? platforms
      .filter((platform, platformIndex) => platform.y < 520 && platformIndex % 4 === 1)
      .slice(0, 12)
      .map((platform, stormIndex) => ({ x: platform.x + platform.w * (stormIndex % 2 ? .72 : .28), y: platform.y - 74, storm: true })) : [];
    return {
      platforms,
      spikeZones: [0, 1].flatMap((copy) => baseSpikeZones.map((spike, spikeIndex) => ({ ...spike, x: spike.x + copy * COURSE_OFFSET + (copy ? spikeIndex % 2 * 70 : 0) }))),
      sparkSeed: [...regularSparks, ...stormSparks].sort((a, b) => a.x - b.x),
      enemySeed: [0, 1].flatMap((copy) => baseEnemySeed.map((enemy) => ({ ...enemy, x: enemy.x + copy * COURSE_OFFSET, minX: enemy.minX + copy * COURSE_OFFSET, maxX: enemy.maxX + copy * COURSE_OFFSET, speed: enemy.speed + copy * 18 }))),
      checkpoints: [270, 2180, 4780, 7720, 9780, 12380],
    };
  }

  const platforms: Platform[] = [];
  const spikeZones: Array<{ x: number; y: number; w: number }> = [];
  for (let section = 0; section < 20; section += 1) {
    const x = section * 760;
    if (index === 1) {
      const width = section === 19 ? 960 : [520, 440, 610, 390][section % 4];
      platforms.push({ x, y: 620, w: width, h: 120 });
      platforms.push({ x: x + Math.max(250, width - 40), y: 510 - (section % 2) * 35, w: 170, h: 24, moving: section % 3 === 1, phase: section * .7, baseY: 510 - (section % 2) * 35 });
      platforms.push({ x: x + 120 + (section % 3) * 45, y: 375 - (section % 2) * 55, w: 180, h: 24, moving: section % 4 === 2, phase: section, baseY: 375 - (section % 2) * 55 });
      if (section % 2 === 0) platforms.push({ x: x + 500, y: 300 + (section % 3) * 35, w: 150, h: 24, moving: true, phase: section * .45, baseY: 300 + (section % 3) * 35 });
      if (section % 4 === 2) spikeZones.push({ x: x + 120, y: 596, w: 110 });
    } else {
      const width = section === 19 ? 960 : [700, 520, 650, 440][section % 4];
      platforms.push({ x, y: 620, w: width, h: 120 });
      platforms.push({ x: x + 165, y: 455 + (section % 2) * 35, w: 240, h: 24 });
      if (section % 3 !== 1) platforms.push({ x: x + 455, y: 355 - (section % 2) * 35, w: 175, h: 24, moving: section % 5 === 0, phase: section * .6, baseY: 355 - (section % 2) * 35 });
      if (width < 600) platforms.push({ x: x + width + 25, y: 535, w: 145, h: 24 });
      if (section > 0 && section % 2 === 0) spikeZones.push({ x: x + 315, y: 596, w: section % 4 === 0 ? 150 : 100 });
    }
  }

  const aerial = platforms.filter((platform) => platform.y < 600).map((platform, sparkIndex) => ({ x: platform.x + platform.w / 2, y: platform.y - 48, secret: sparkIndex % 7 === 0 }));
  const groundLight = Array.from({ length: 20 }, (_, section) => ({ x: section * 760 + 105, y: 555, secret: false }));
  const regularSparks = [...aerial, ...groundLight].sort((a, b) => a.x - b.x).slice(0, 60);
  const stormSparks = modifierId === 'sparkstorm' ? platforms
    .filter((platform, platformIndex) => platform.y < 500 && platformIndex % 5 === 2)
    .slice(0, 12)
    .map((platform, stormIndex) => ({ x: platform.x + platform.w * (stormIndex % 2 ? .7 : .3), y: platform.y - 78, storm: true })) : [];
  const ground = platforms.filter((platform) => platform.y >= 600 && platform.w >= 430);
  const enemySeed = ground.filter((_, groundIndex) => groundIndex > 0 && (index === 2 || groundIndex % 2 === 0)).map((platform, enemyIndex) => ({
    x: platform.x + Math.min(platform.w - 80, 260 + enemyIndex % 3 * 70), y: 570, minX: platform.x + 60, maxX: platform.x + platform.w - 60,
    speed: (index === 2 ? 155 : 115) + enemyIndex % 4 * 18, dir: enemyIndex % 2 ? -1 : 1, alive: true,
  }));
  return { platforms, spikeZones, sparkSeed: [...regularSparks, ...stormSparks].sort((a, b) => a.x - b.x), enemySeed, checkpoints: [270, 2400, 4680, 7720, 10000, 12300] };
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = (seconds % 60).toFixed(1).padStart(4, '0');
  return `${minutes}:${remainder}`;
}

function medalFor(seconds: number) {
  if (seconds < 45) return 'GOLD';
  if (seconds < 75) return 'SILVER';
  if (seconds < 110) return 'BRONZE';
  return 'FINISHER';
}

export default function Home() {
  const [practiceCourseIndex, setPracticeCourseIndex] = useState<number | null>(null);
  const isPractice = practiceCourseIndex !== null;
  const activeCourseIndex = practiceCourseIndex ?? dailyCourseIndex;
  const course = courseSpecs[activeCourseIndex];
  const modifier = isPractice ? modifierSpecs[0] : dailyModifier;
  const courseData = useMemo(() => buildCourse(activeCourseIndex, modifier.id), [activeCourseIndex, modifier.id]);
  const { platforms, spikeZones, sparkSeed, enemySeed, checkpoints } = courseData;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const screenRef = useRef<Screen>('title');
  const waitingForLandscapeRef = useRef(false);
  const coachPauseRef = useRef(false);
  const inputRef = useRef({ left: false, right: false, jump: false, dash: false });
  const resetRef = useRef<(() => void) | null>(null);
  const [screen, setScreen] = useState<Screen>('title');
  const [waitingForLandscape, setWaitingForLandscape] = useState(false);
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  const [hud, setHud] = useState<Hud>({ sparks: 0, total: sparkSeed.length, lives: 3, time: 0, best: null, checkpoint: 0, progress: 0, dashReady: true, shield: 0 });
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const sfxContextRef = useRef<AudioContext | null>(null);
  const sfxBuffersRef = useRef<Map<SoundKind, AudioBuffer>>(new Map());
  const telemetryQueueRef = useRef<Array<{ eventName: string; playerId: string; courseId: string; metadata: Record<string, string | number> }>>([]);
  const runIdRef = useRef<string | null>(null);
  const playerIdRef = useRef('');
  const homeTrackedRef = useRef(false);
  const dashCoachRef = useRef(false);
  const [board, setBoard] = useState<Board>('daily');
  const [entries, setEntries] = useState<BoardEntry[]>([]);
  const [boardStatus, setBoardStatus] = useState<'loading' | 'ready' | 'offline'>('loading');
  const [nickname, setNickname] = useState('');
  const [submitState, setSubmitState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [submitError, setSubmitError] = useState('');
  const [rank, setRank] = useState<number | null>(null);
  const [homePanel, setHomePanel] = useState<HomePanel>('none');
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
    if (screen !== 'paused' && screen !== 'over' && screen !== 'won') return;
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
  }, [screen]);
  useEffect(() => {
    const AudioContextConstructor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) return;
    const audioContext = new AudioContextConstructor({ latencyHint: 'interactive' });
    sfxContextRef.current = audioContext;
    let cancelled = false;
    void Promise.all((Object.entries(soundSources) as Array<[SoundKind, string]>).map(async ([kind, src]) => {
      const response = await fetch(src);
      const buffer = await audioContext.decodeAudioData(await response.arrayBuffer());
      if (!cancelled) sfxBuffersRef.current.set(kind, buffer);
    })).catch(() => undefined);
    return () => {
      cancelled = true;
      sfxBuffersRef.current.clear();
      sfxContextRef.current = null;
      void audioContext.close().catch(() => undefined);
    };
  }, []);
  useEffect(() => {
    let playerId = window.localStorage.getItem('crestbound-player-id');
    if (!playerId) { playerId = crypto.randomUUID(); window.localStorage.setItem('crestbound-player-id', playerId); }
    playerIdRef.current = playerId;
    const syncStoredState = window.setTimeout(() => {
      const stored = window.localStorage.getItem(`crestbound-best-${dailyCourse.id}`);
      if (stored) setHud((current) => ({ ...current, best: Number(stored) }));
      setNickname(window.localStorage.getItem('crestbound-nickname') ?? '');
    }, 0);
    if (!homeTrackedRef.current) {
      homeTrackedRef.current = true;
      const metadata = { mode: 'ranked', modifierId: dailyModifier.id, orientation: window.matchMedia('(orientation: portrait)').matches ? 'portrait' : 'landscape', device: window.matchMedia('(pointer: coarse)').matches ? 'touch' : 'desktop' };
      void fetch('/api/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventName: 'home_view', playerId, courseId: dailyCourse.id, metadata }) }).catch(() => undefined);
    }
    return () => window.clearTimeout(syncStoredState);
  }, []);

  useEffect(() => {
    const initialDay = chicagoDayKey();
    const syncReturnLoop = () => {
      if (chicagoDayKey() !== initialDay) {
        window.location.reload();
        return;
      }
      setStreak(Number(window.localStorage.getItem('crestbound-streak')) || 0);
      setDailyReset(formatDailyReset(millisecondsUntilNextChicagoDay()));
    };
    syncReturnLoop();
    const timer = window.setInterval(syncReturnLoop, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const loadBoard = useCallback(async (nextBoard: Board) => {
    setBoardStatus('loading');
    try {
      const params = new URLSearchParams({ board: nextBoard, courseId: dailyCourse.id, playerId: playerIdRef.current });
      const response = await fetch(`/api/leaderboard?${params}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Leaderboard unavailable');
      const data = await response.json() as { entries?: BoardEntry[]; players?: number; lights?: number; goal?: number; nearby?: BoardEntry[]; playerRank?: number | null; recent?: string[] };
      setEntries(data.entries ?? []);
      setCommunity({ players: data.players ?? 0, lights: data.lights ?? 0, goal: data.goal ?? 2500, nearby: data.nearby ?? [], playerRank: data.playerRank ?? null, recent: data.recent ?? [] });
      setBoardStatus('ready');
    } catch {
      setEntries([]);
      setBoardStatus('offline');
    }
  }, []);

  useEffect(() => {
    const load = window.setTimeout(() => { void loadBoard(board); }, 0);
    return () => window.clearTimeout(load);
  }, [board, loadBoard]);

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
    const track = musicTrackForCourse(activeCourseIndex);
    const music = new Audio(track.src);
    music.loop = true;
    music.preload = 'auto';
    music.volume = audible ? .34 : 0;
    musicRef.current = music;
    void music.play().catch(() => { if (musicRef.current === music) musicRef.current = null; });
  }, [activeCourseIndex]);

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
    screenRef.current = next;
    setScreen(next);
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
      mode: isPractice ? 'practice' : 'ranked',
      modifierId: modifier.id,
      orientation: window.matchMedia('(orientation: portrait)').matches ? 'portrait' : 'landscape',
      device: window.matchMedia('(pointer: coarse)').matches ? 'touch' : 'desktop',
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
    window.localStorage.setItem(`crestbound-twist-seen-${localDay}-${modifier.id}`, '1');
    track('modifier_learned');
  }

  function startGame(tryImmersive = false) {
    if (sfxContextRef.current?.state === 'suspended') void sfxContextRef.current.resume().catch(() => undefined);
    if (tryImmersive && window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(display-mode: standalone)').matches && !document.fullscreenElement) {
      const immersiveRequest = document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
      void immersiveRequest?.catch(() => {
        /* iPhone Safari uses Add to Home Screen for standalone play. */
      });
    }
    const replaying = screenRef.current === 'over' || screenRef.current === 'won';
    setHomePanel('none');
    resetRef.current?.();
    setSubmitState('idle'); setRank(null); runIdRef.current = null;
    const shouldWaitForLandscape = window.matchMedia('(orientation: portrait) and (pointer: coarse)').matches;
    startMusic(!shouldWaitForLandscape);
    if (!isPractice) {
      void fetch('/api/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'start', playerId: playerIdRef.current, courseId: dailyCourse.id, modifierId: dailyModifier.id }) })
        .then(async (response) => { if (response.ok) runIdRef.current = ((await response.json()) as { runId: string }).runId; })
        .catch(() => undefined);
    }
    waitingForLandscapeRef.current = shouldWaitForLandscape;
    setWaitingForLandscape(shouldWaitForLandscape);
    setGameScreen('playing');
    const needsCoach = !window.localStorage.getItem('crestbound-dash-learned');
    const needsModifierCoach = !isPractice && !window.localStorage.getItem(`crestbound-twist-seen-${localDay}-${modifier.id}`);
    coachPauseRef.current = needsCoach || needsModifierCoach;
    dashCoachRef.current = needsCoach; setShowDashCoach(needsCoach); track(isPractice ? 'practice_start' : 'run_start');
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

  async function submitRun(event: FormEvent) {
    event.preventDefault();
    const nicknameResult = checkNickname(nickname);
    if (!runIdRef.current || !nicknameResult.ok) {
      setSubmitError(nicknameResult.ok ? 'Online posting is unavailable for this run.' : nicknameResult.message);
      setSubmitState('error');
      return;
    }
    setSubmitState('saving');
    setSubmitError('');
    const cleanName = nicknameResult.name;
    window.localStorage.setItem('crestbound-nickname', cleanName); setNickname(cleanName);
    try {
      const response = await fetch('/api/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'finish', runId: runIdRef.current, playerId: playerIdRef.current, courseId: dailyCourse.id, modifierId: dailyModifier.id, name: cleanName, scoreMs: Math.round(hud.time * 1000), sparks: hud.sparks }) });
      const data = await response.json() as { rank?: number; error?: string };
      if (!response.ok) throw new Error(data.error);
      setRank(data.rank ?? null); setSubmitState('saved'); setBoard('daily'); void loadBoard('daily');
    } catch (error) { setSubmitError(error instanceof Error ? error.message : 'Couldn\'t post this run.'); setSubmitState('error'); }
  }

  function press(control: keyof typeof inputRef.current, active: boolean) {
    inputRef.current[control] = active;
    if (active) canvasRef.current?.focus();
  }

  function beginPress(control: keyof typeof inputRef.current, event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    press(control, true);
  }

  function endPress(control: keyof typeof inputRef.current, event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    press(control, false);
  }

  useEffect(() => {
    const clearTouchInput = () => { inputRef.current = { left: false, right: false, jump: false, dash: false }; };
    window.addEventListener('blur', clearTouchInput);
    window.addEventListener('pointercancel', clearTouchInput);
    document.addEventListener('visibilitychange', clearTouchInput);
    return () => {
      window.removeEventListener('blur', clearTouchInput);
      window.removeEventListener('pointercancel', clearTouchInput);
      document.removeEventListener('visibilitychange', clearTouchInput);
    };
  }, []);

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
        if (shouldWait) { if (musicRef.current) musicRef.current.volume = 0; }
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
    const context = canvas.getContext('2d');
    if (!context) return;
    const touchLandscape = window.matchMedia('(pointer: coarse) and (orientation: landscape)');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const atmosphere = [
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
          tileContext.fillStyle = lit ? (activeCourseIndex === 2 ? atmosphere.window : activeCourseIndex === 0 ? '#e78c52' : '#bde4e8') : building;
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
    let lives = 3;
    let collected = 0;
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
    try { ghost = JSON.parse(window.localStorage.getItem(`crestbound-ghost-${course.id}`) ?? '[]') as typeof ghost; } catch { ghost = []; }

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
        return;
      }
      lives = damage.lives;
      screenShake = .24;
      tone(soundKind);
      track('life_lost', { reason: soundKind, lives, checkpoint: checkpointIndex, progress: player.x, elapsedMs: elapsed * 1000 });
      setHud((current) => ({ ...current, lives }));
      if (lives <= 0) {
        runEnded = true;
        player.invuln = 999;
        inputRef.current = { left: false, right: false, jump: false, dash: false };
        track('run_over', { reason: soundKind, checkpoint: checkpointIndex, progress: player.x, elapsedMs: elapsed * 1000 });
        flushTelemetry();
        setGameScreen('over');
      } else resetPosition();
    };
    const reset = () => {
      player.x = checkpoints[0]; player.y = 620 - player.h; player.vx = 0; player.vy = 0; player.grounded = true; player.invuln = 1.25; player.jumps = 0;
      sparks = sparkSeed.map((item) => ({ ...item }));
      enemies = enemySeed.map((item) => ({ ...item }));
      lives = 3; collected = 0; ({ elapsed, lastHud } = resetRunTiming()); cameraX = 0; checkpointIndex = 0; jumpBuffer = 0; coyote = 0; previousJump = false; previousDash = false; trace = []; traceTimer = 0; stormShield = 0; runEnded = false;
      window.clearTimeout(gameNoticeTimerRef.current); setGameNotice(null);
      const storedBest = window.localStorage.getItem(`crestbound-best-${course.id}`);
      setHud({ sparks: 0, total: sparkSeed.length, lives: 3, time: 0, best: storedBest ? Number(storedBest) : null, checkpoint: 0, progress: 0, dashReady: true, shield: 0 });
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
      if (direction && player.vx && Math.sign(player.vx) !== direction) player.vx *= .38;
      const acceleration = player.grounded ? 2200 : 1450;
      player.vx += direction * acceleration * dt;
      if (!direction) player.vx *= Math.pow(player.grounded ? 0.0008 : 0.08, dt);
      player.vx = Math.max(-430, Math.min(430, player.vx));

      if (input.jump && !previousJump) jumpBuffer = 0.12;
      if (jumpBuffer > 0 && (player.grounded || coyote > 0 || player.jumps < 2)) {
        player.vy = player.jumps === 1 ? -610 : -690;
        player.grounded = false; coyote = 0; jumpBuffer = 0; player.jumps += 1; tone('jump');
      }
      if (!input.jump && player.vy < -260) player.vy += 1450 * dt;
      if (input.dash && !previousDash && player.dashCooldown <= 0) {
        player.dashTime = 0.17; player.dashCooldown = 0.82; player.vx = player.facing * 900; player.vy *= 0.18; screenShake = .08; tone('dash');
        if (dashCoachRef.current) dismissDashCoach(true);
      }
      previousJump = input.jump;
      previousDash = input.dash;
      player.vx += tailwindAcceleration(modifier.id, direction) * dt;
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
      spikeZones.forEach((spike) => { if (overlap(player.x + 7, player.y + 12, player.w - 14, player.h - 12, spike.x, spike.y, spike.w, 28)) hurt(); });

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
            showGameNotice('STORM SHIELD · 5 SEC', 'power');
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
        const bestKey = `crestbound-best-${course.id}`;
        const best = Number(window.localStorage.getItem(bestKey)) || Infinity;
        if (elapsed < best) {
          window.localStorage.setItem(bestKey, String(elapsed));
          window.localStorage.setItem(`crestbound-ghost-${course.id}`, JSON.stringify(trace));
          ghost = trace;
        }
        setHud({ sparks: collected, total: sparks.length, lives, time: elapsed, best: Math.min(best, elapsed), checkpoint: checkpointIndex, progress: player.x, dashReady: player.dashCooldown <= 0, shield: stormShield });
        if (!isPractice) recordStreak();
        else track('practice_finish', { lives, progress: player.x, elapsedMs: elapsed * 1000 });
        flushTelemetry();
        tone('win'); setGameScreen('won');
      }
      cameraX += (Math.max(0, Math.min(WORLD_W - VIEW_W, player.x - 390)) - cameraX) * Math.min(1, dt * 5.5);
      if (elapsed - lastHud > 0.2) {
        lastHud = elapsed;
        const stored = window.localStorage.getItem(`crestbound-best-${course.id}`);
        setHud({ sparks: collected, total: sparks.length, lives, time: elapsed, best: stored ? Number(stored) : null, checkpoint: checkpointIndex, progress: player.x, dashReady: player.dashCooldown <= 0, shield: stormShield });
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

      if (activeCourseIndex === 0) {
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
      ctx.fillStyle = activeCourseIndex === 0 ? '#ffd77a' : activeCourseIndex === 1 ? '#dff7f2' : '#78d7d2';
      for (let index = 0; index < 16; index += 1) { const x = ((index * 101 - cameraX * .52) % 1440 + 1440) % 1440 - 80; ctx.fillRect(x, 520 + (index % 3) * 10, 10, 4); }
      ctx.fillStyle = activeCourseIndex === 0 ? '#2c2834' : activeCourseIndex === 1 ? '#1c5664' : '#061720'; ctx.fillRect(-8, 574, VIEW_W + 16, 10);
      ctx.fillStyle = atmosphere.near;
      for (let x = -80 - ((cameraX * .64) % 96); x < VIEW_W + 96; x += 96) { ctx.fillRect(x, 548, 8, 36); ctx.fillRect(x + 8, 552, 64, 4); }
      ctx.fillStyle = activeCourseIndex === 0 ? '#f5d263' : activeCourseIndex === 1 ? '#fff8e9' : '#18a7a2';
      for (let index = 0; index < 8; index += 1) { const x = ((index * 227 - cameraX * .38) % 1700 + 1700) % 1700 - 100; ctx.fillRect(x, 535 + (index % 2) * 12, 20, 4); }
      ctx.restore();

      if (activeCourseIndex === 2) {
        ctx.globalAlpha = .62;
        for (let index = 0; index < 96; index += 1) {
          const x = ((index * 97 + elapsed * 290 - cameraX * .04) % 1460 + 1460) % 1460 - 90;
          const y = ((index * 53 + elapsed * 460) % 820) - 90;
          ctx.fillStyle = index % 5 === 0 ? '#78d7d2' : '#457583';
          ctx.fillRect(Math.floor(x / 4) * 4, Math.floor(y / 4) * 4, index % 5 === 0 ? 4 : 3, index % 5 === 0 ? 22 : 14);
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
        ctx.fillStyle = activeCourseIndex === 2 ? '#78d7d2' : '#d9fff0'; ctx.fillRect(px + 8, py + 2, Math.max(0, platform.w - 16), 2);
        ctx.fillStyle = '#071316'; for (let x = px + 18; x < px + platform.w - 8; x += 48) ctx.fillRect(x, py + 12, 5, 5);
        ctx.fillStyle = atmosphere.edge; ctx.fillRect(px, py + 20, platform.w, 4);
        for (let x = px; x < px + platform.w; x += 32) for (let y = py + 24; y < py + platform.h; y += 24) {
          ctx.fillStyle = ((x + y) / 8) % 2 ? atmosphere.blockA : atmosphere.blockB; ctx.fillRect(x, y, 24, 16);
        }
        if (platform.h > 32) {
          ctx.fillStyle = atmosphere.support;
          for (let x = px + 12; x < px + platform.w - 20; x += 96) { ctx.fillRect(x, py + 34, 8, platform.h - 34); ctx.fillRect(x + 8, py + 38, 36, 6); }
        }
        if (activeCourseIndex === 2) {
          ctx.fillStyle = '#78d7d2';
          for (let x = px + 12; x < px + platform.w - 20; x += 74) ctx.fillRect(x, py + 5, Math.min(28, px + platform.w - x - 8), 3);
        }
      });
      const drawSign = (x: number, y: number, text: string, accent: string) => {
        if (!visible(x, 150)) return;
        ctx.fillStyle = '#071316'; ctx.fillRect(x - 6, y - 6, 150, 48);
        ctx.fillStyle = accent; ctx.fillRect(x, y, 138, 36);
        ctx.fillStyle = '#071316'; ctx.fillRect(x + 5, y + 5, 128, 26);
        ctx.fillStyle = accent; ctx.font = 'bold 18px monospace'; ctx.fillText(text, x + 12, y + 24);
        ctx.fillStyle = '#fff8e9'; ctx.fillRect(x + 4, y + 4, 3, 3); ctx.fillRect(x + 131, y + 29, 3, 3);
      };
      drawSign(760, 535, 'KEEP GOING', '#78d7d2');
      drawSign(3720, 545, 'HALFWAY', '#f5d263');
      drawSign(7060, 540, 'SECTOR 2', '#ef6f52');
      drawSign(8960, 535, course.short, course.accent);
      drawSign(11280, 545, modifier.name.toUpperCase(), '#78d7d2');
      drawSign(14290, 540, 'FINAL PUSH', '#ef6f52');
      spikeZones.forEach((spike) => {
        if (!visible(spike.x, spike.w)) return;
        ctx.fillStyle = '#071316'; ctx.fillRect(spike.x, spike.y + 20, spike.w, 8);
        ctx.fillStyle = '#f06f52';
        for (let x = spike.x; x < spike.x + spike.w; x += 24) { ctx.beginPath(); ctx.moveTo(x, spike.y + 24); ctx.lineTo(x + 12, spike.y); ctx.lineTo(x + 24, spike.y + 24); ctx.closePath(); ctx.fill(); }
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
      if (activeCourseIndex === 2) {
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
  }, [activeCourseIndex, isPractice]);

  return (
    <main className="shell">
      <section className="game-frame" aria-label="Crestbound platform game starring Sunny">
        <canvas ref={canvasRef} className="game-canvas" width={320} height={180} tabIndex={0} aria-label="Platform game. Use arrows or A and D to move, Space to jump, and Shift to dash." />

        {screen !== 'title' && (
          <header className="hud" aria-live="polite" aria-atomic="false">
            <div className="hud-brand"><span className="mini-sun">✦</span><strong>{course.short}</strong><i className={hud.dashReady ? 'ready' : ''}>{hud.dashReady ? 'DASH READY' : 'DASH CHARGING'}</i></div>
            <div className="hud-stats">
              <span><b>{'◆'.repeat(hud.lives)}</b><small>LIVES</small></span>
              <span><b>{hud.sparks}/{hud.total}</b><small>LIGHT</small></span>
              <span><b>{formatTime(hud.time)}</b><small>TIME</small></span>
              {hud.shield > 0 && <span className="shield-status"><b>{hud.shield.toFixed(1)}</b><small>SHIELD</small></span>}
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
                <picture>
                  <source media="(orientation: landscape)" srcSet="/crestbound-home-hero.svg" />
                  <img src="/crestbound-square-key-art.svg" width="1254" height="1254" alt="Sunny runs across the golden-hour Crestbound skyline beneath the A Daily Skyline Run tagline" />
                </picture>
              </div>
              <div className="home-dashboard">
                <div className="daily-course"><span>{isPractice ? 'PRACTICE RUN' : 'TODAY\'S RUN'}</span><b>{course.name}</b><em>{isPractice ? 'STANDARD RULES' : `TWIST · ${modifier.name}`}</em><div className="daily-return"><strong>{isPractice ? 'PRACTICE MODE' : streak > 0 ? `${streak} DAY STREAK` : 'FINISH TO START A STREAK'}</strong><small>{isPractice ? 'TODAY\'S BOARD IS UNAFFECTED' : `NEW RUN IN ${dailyReset}`}</small></div></div>
                <button className="play-button" type="button" onClick={() => void startGame(true)}>{isPractice ? 'Start Practice' : 'Play Today\'s Run'} <span aria-hidden="true">▶</span></button>
                <div className="daily-glance"><span>{community.players} {community.players === 1 ? 'SUNCRESTER HAS' : 'SUNCRESTERS HAVE'} RUN TODAY</span><b>{entries[0] ? `FASTEST: ${entries[0].name} · ${formatTime(entries[0].timeMs / 1000)}` : 'BE THE FIRST FINISHER'}</b><div className="community-progress"><div><span>COMMUNITY LIGHT</span><b>{community.lights.toLocaleString()} / {community.goal.toLocaleString()}</b></div><progress aria-label={`${community.lights} of ${community.goal} community lights collected today`} max={community.goal} value={Math.min(community.lights, community.goal)} /><small>{community.lights >= community.goal ? 'TODAY\'S GOAL REACHED — KEEP IT GLOWING' : `${(community.goal - community.lights).toLocaleString()} LIGHTS TO TODAY'S GOAL`}</small></div></div>
                <div className="home-links"><button type="button" onClick={() => { openHomePanel('leaderboard'); track('leaderboard_open'); }}>Leaderboard</button><button type="button" onClick={() => openHomePanel('courses')}>{isPractice ? 'Change Course' : 'Practice Courses'}</button><button type="button" onClick={() => openHomePanel('help')}>How to Play</button></div>
              </div>
            </div>
            {homePanel === 'leaderboard' && <aside ref={homePanelRef} className="leaderboard home-panel" role="dialog" aria-modal="true" aria-labelledby="leaderboard-title" tabIndex={-1}>
              <button className="panel-dismiss" type="button" aria-label="Close leaderboard" onClick={closeHomePanel}>X</button>
              <div className="board-heading"><span id="leaderboard-title">TOP RUNS</span><small>{board === 'daily' ? 'TODAY' : board === 'weekly' ? 'THIS WEEK' : 'ALL TIME'}</small></div>
              <div className="board-tabs">
                {(['daily', 'weekly', 'all'] as Board[]).map((item) => <button className={board === item ? 'active' : ''} aria-pressed={board === item} type="button" key={item} onClick={() => setBoard(item)}>{item === 'daily' ? 'TODAY' : item === 'weekly' ? 'WEEK' : 'ALL'}</button>)}
              </div>
              <ol className="board-list" aria-live="polite">
                {boardStatus === 'loading' && <li className="board-message">LOADING RUNS...</li>}
                {boardStatus === 'offline' && <li className="board-message">BOARD COMES ONLINE WHEN PUBLISHED.</li>}
                {boardStatus === 'ready' && entries.length === 0 && <li className="board-message">NO FINISHERS YET. CLAIM #1.</li>}
                {boardStatus === 'ready' && entries.slice(0, 7).map((entry) => <li key={`${entry.rank}-${entry.name}`}><b>#{entry.rank}</b><span>{entry.name}</span><time>{board === 'weekly' ? `${entry.points ?? 0} PT` : formatTime(entry.timeMs / 1000)}</time><small>{entry.sparks}◆</small></li>)}
              </ol>
              {community.playerRank && <div className="nearby-rivals"><b>YOUR NEARBY RIVALS // #{community.playerRank}</b>{community.nearby.map((entry) => <span key={`${entry.rank}-${entry.name}`}>#{entry.rank} {entry.name} <time>{formatTime(entry.timeMs / 1000)}</time></span>)}</div>}
              {community.recent.length > 0 && <p className="recent-finishers">JUST RAN: {community.recent.join(' · ')}</p>}
              <p>FASTEST VERIFIED TIME WINS. WEEKLY BOARD REWARDS CONSISTENCY. NICKNAMES ONLY.</p>
              <button className="panel-close" type="button" onClick={closeHomePanel}>Close</button>
            </aside>}
            {homePanel === 'help' && <aside ref={homePanelRef} className="how-to home-panel" role="dialog" aria-modal="true" aria-labelledby="help-title" tabIndex={-1}>
              <button className="panel-dismiss" type="button" aria-label="Close how to play" onClick={closeHomePanel}>X</button>
              <p className="kicker">READY, SUNNY?</p><h2 id="help-title">How to Play</h2>
              <div><b>RUN</b><span>Arrow keys / A D / touch arrows</span><b>JUMP</b><span>Space / touch JUMP · tap twice</span><b>DASH</b><span>Shift or X / touch DASH · recharges</span></div>
              <p>Touch controls appear automatically. Turn your phone sideways for the full course.</p>
              <section className="world-rules"><h3>World Rules</h3><article><b>GOLD LIGHT</b><span>Shortens Dash recharge.</span></article><article><b>STORM LIGHT</b><span>Teal. In Spark Storm, fully recharges Dash and shields one hit for five seconds.</span></article><article><b>CHECKPOINT</b><span>Saves your route and restores one life, up to three.</span></article><article><b>ENEMY</b><span>Dash through it or land on it from above.</span></article></section>
              <section className="twist-directory"><h3>Daily Twists</h3>{modifierSpecs.map((item) => <article className={item.id === modifier.id && !isPractice ? 'today' : ''} key={item.id}><b>{item.name}{item.id === modifier.id && !isPractice ? ' · TODAY' : ''}</b><span>{item.description}</span></article>)}</section>
              <p className="app-tip"><b>FULL-SCREEN TEST</b> On iPhone, tap Share, then Add to Home Screen. Crestbound will open without Safari&apos;s bars.</p>
              <button className="panel-close" type="button" onClick={closeHomePanel}>Got It</button>
            </aside>}
            {homePanel === 'courses' && <aside ref={homePanelRef} className="course-picker home-panel" role="dialog" aria-modal="true" aria-labelledby="courses-title" tabIndex={-1}>
              <button className="panel-dismiss" type="button" aria-label="Close practice courses" onClick={closeHomePanel}>X</button>
              <p className="kicker">EXPLORE THE SKYLINE</p><h2 id="courses-title">Practice Courses</h2>
              <p>Practice any route now. Practice times stay on this device and do not enter the daily board.</p>
              <div>{courseSpecs.map((item, index) => <button className={practiceCourseIndex === index ? 'active' : ''} aria-pressed={practiceCourseIndex === index} type="button" key={item.id} onClick={() => { setPracticeCourseIndex(index); closeHomePanel(); }}><b>{item.name}</b><span>{item.description}</span></button>)}</div>
              {isPractice && <button className="today-course" type="button" onClick={() => { setPracticeCourseIndex(null); closeHomePanel(); }}>Return to Today&apos;s Course</button>}
              <button className="panel-close" type="button" onClick={closeHomePanel}>Close</button>
            </aside>}
          </div>
        )}

        {screen === 'paused' && <div ref={gameModalRef} className="game-modal" role="dialog" aria-modal="true" aria-labelledby="pause-title" tabIndex={-1}><p>RUN PAUSED</p><h2 id="pause-title">Catch your breath.</h2><button type="button" onClick={togglePause}>Resume</button><button className="secondary" type="button" onClick={() => { track('quit', { checkpoint: hud.checkpoint, progress: hud.progress, elapsedMs: hud.time * 1000 }); setGameScreen('title'); }}>Quit Run</button></div>}
        {screen === 'over' && <div ref={gameModalRef} className="game-modal" role="dialog" aria-modal="true" aria-labelledby="over-title" tabIndex={-1}><p>LIGHT LOST</p><h2 id="over-title">That route got you.</h2><p>Use the high paths, save your dash, and hit enemies from above.</p><button type="button" onClick={() => void startGame()}>Run It Back</button><button className="secondary" type="button" onClick={() => { setGameScreen('title'); if (isPractice) openHomePanel('courses'); }}>{isPractice ? 'Choose Another Course' : 'Back to Home'}</button></div>}
        {screen === 'won' && (
          <div ref={gameModalRef} className="game-modal win-modal" role="dialog" aria-modal="true" aria-labelledby="win-title" tabIndex={-1}>
            <p>LIGHT RESTORED // {medalFor(hud.time)} MEDAL</p><h2 id="win-title">Skyline cleared.</h2>
            <div className="result-grid"><span><b>{formatTime(hud.time)}</b><small>FINISH</small></span><span><b>{hud.sparks}/{hud.total}</b><small>LIGHT</small></span><span><b>{hud.best ? formatTime(hud.best) : '—'}</b><small>BEST</small></span></div>
            {isPractice ? <div className="rank-callout">PRACTICE COMPLETE // PERSONAL BESTS STAY ON THIS DEVICE</div> : submitState !== 'saved' ? <form className="score-form" onSubmit={submitRun}>
              <label htmlFor="nickname">POST TO TODAY&apos;S BOARD</label>
              <div><input id="nickname" value={nickname} onChange={(event) => setNickname(event.target.value)} minLength={2} maxLength={12} pattern="[A-Za-z0-9 _-]{2,12}" placeholder="NICKNAME" autoComplete="nickname" /><button type="submit" disabled={submitState === 'saving' || !runIdRef.current}>{submitState === 'saving' ? 'SAVING...' : 'POST RUN'}</button></div>
              <small>Family-friendly nicknames only. Don&apos;t use your real name.{!runIdRef.current ? ' Online posting is unavailable for this run.' : ''}</small>
              {submitState === 'error' && <em role="alert">{submitError || 'COULDN\'T POST. TRY AGAIN.'}</em>}
            </form> : <div className="rank-callout">RUN POSTED {rank ? `// TODAY #${rank}` : '// TO TODAY'}</div>}
            <button type="button" onClick={() => void startGame()}>Beat Your Time</button>
            <button className="secondary" type="button" onClick={() => { setPracticeCourseIndex(null); setGameScreen('title'); if (!isPractice) openHomePanel('leaderboard'); void loadBoard('daily'); }}>{isPractice ? 'Return to Today' : 'View Leaderboard'}</button>
          </div>
        )}

        {screen === 'playing' && (
          <>{waitingForLandscape && <div className="rotate-prompt"><span aria-hidden="true">↻</span><strong>Turn Sideways to Start</strong><small>Your run and timer are paused until the phone is in landscape.</small></div>}{gameNotice && !waitingForLandscape && !showModifierCoach && !showDashCoach && <div className={`game-notice ${gameNotice.kind}`} role="status"><b>{gameNotice.text}</b></div>}{showModifierCoach && !waitingForLandscape ? <div className="dash-coach modifier-coach"><b>TODAY&apos;S TWIST · {modifier.name}</b><span>{modifier.description}</span><button type="button" onClick={dismissModifierCoach}>LET&apos;S RUN</button></div> : showDashCoach && !waitingForLandscape && <div className="dash-coach"><b>DASH IS YOUR EDGE</b><span>Press SHIFT or X — or tap DASH — to burst through hazards. The HUD tells you when it recharges.</span><button type="button" onClick={() => dismissDashCoach()}>GOT IT</button></div>}<div className="touch-controls" aria-label="Touch controls">
            <div><button type="button" aria-label="Move left" onPointerDown={(event) => beginPress('left', event)} onPointerUp={(event) => endPress('left', event)} onPointerCancel={(event) => endPress('left', event)} onLostPointerCapture={() => press('left', false)}>←</button><button type="button" aria-label="Move right" onPointerDown={(event) => beginPress('right', event)} onPointerUp={(event) => endPress('right', event)} onPointerCancel={(event) => endPress('right', event)} onLostPointerCapture={() => press('right', false)}>→</button></div>
            <div><button className={hud.dashReady ? 'dash-control ready' : 'dash-control'} type="button" aria-label={hud.dashReady ? 'Dash ready' : 'Dash charging'} onPointerDown={(event) => beginPress('dash', event)} onPointerUp={(event) => endPress('dash', event)} onPointerCancel={(event) => endPress('dash', event)} onLostPointerCapture={() => press('dash', false)}>DASH</button><button className="jump-control" type="button" aria-label="Jump — tap twice for double jump" onPointerDown={(event) => beginPress('jump', event)} onPointerUp={(event) => endPress('jump', event)} onPointerCancel={(event) => endPress('jump', event)} onLostPointerCapture={() => press('jump', false)}>JUMP 2X</button></div>
          </div></>
        )}
      </section>
    </main>
  );
}
