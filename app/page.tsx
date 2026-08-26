'use client';

/* eslint-disable @next/next/no-img-element -- game sprites are rendered directly into canvas */

import { FormEvent, PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from 'react';

type Screen = 'title' | 'playing' | 'paused' | 'won' | 'over';
type Hud = { sparks: number; total: number; lives: number; time: number; best: number | null; checkpoint: number; progress: number; dashReady: boolean };
type Platform = { x: number; y: number; w: number; h: number; moving?: boolean; phase?: number; baseY?: number };
type Spark = { x: number; y: number; taken?: boolean; secret?: boolean };
type Enemy = { x: number; y: number; minX: number; maxX: number; speed: number; dir: number; alive: boolean };
type Board = 'daily' | 'weekly' | 'all';
type BoardEntry = { rank: number; name: string; timeMs: number; sparks: number; points?: number; runs?: number };
type HomePanel = 'none' | 'leaderboard' | 'help';

type Community = { players: number; lights: number; goal: number; nearby: BoardEntry[]; playerRank: number | null; recent: string[] };

const COURSE_OFFSET = 7600;
const WORLD_W = 15400;
const FINISH_X = 15135;
const VIEW_W = 1280;
const VIEW_H = 720;

const localDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
const daySerial = Math.floor(new Date(`${localDay}T12:00:00Z`).getTime() / 86400000);
const courseIndex = ((daySerial % 3) + 3) % 3;
const courseSpecs = [
  { id: 'goldline', name: 'Goldline Rooftops', short: 'GOLDLINE', accent: '#f5d263' },
  { id: 'crosswind', name: 'Crosswind Heights', short: 'CROSSWIND', accent: '#78d7d2' },
  { id: 'nightshift', name: 'Night Shift', short: 'NIGHT SHIFT', accent: '#ef6f52' },
] as const;
const modifierSpecs = [
  { id: 'clear', name: 'Clear Skies' },
  { id: 'tailwind', name: 'Tailwind' },
  { id: 'moonstep', name: 'Moonstep' },
  { id: 'sparkstorm', name: 'Spark Storm' },
] as const;
const course = courseSpecs[courseIndex];
const modifier = modifierSpecs[((daySerial + courseIndex) % modifierSpecs.length + modifierSpecs.length) % modifierSpecs.length];

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

function elevate(y: number, index: number, copy: number) {
  if (y >= 600 || courseIndex === 0) return y;
  const shifts = courseIndex === 1 ? [-24, 16, -42, 26] : [-54, -10, 24, -34];
  return Math.max(250, Math.min(555, y + shifts[(index + copy) % shifts.length]));
}

const platforms: Platform[] = [0, 1].flatMap((copy) => basePlatforms.map((platform, index) => {
  const y = elevate(platform.y, index, copy);
  const moving = platform.moving || (y < 600 && (index + courseIndex * 2 + copy) % 9 === 0);
  return { ...platform, x: platform.x + copy * COURSE_OFFSET, y, moving, baseY: moving ? y : platform.baseY };
}));
const spikeZones = [0, 1].flatMap((copy) => baseSpikeZones.map((spike) => ({ ...spike, x: spike.x + copy * COURSE_OFFSET })));
const sparkSeed: Spark[] = [0, 1].flatMap((copy) => baseSparkSeed.map((spark, index) => ({
  ...spark, x: spark.x + copy * COURSE_OFFSET, y: elevate(spark.y, index, copy), secret: spark.secret || (modifier.id === 'sparkstorm' && index % 6 === 0),
})));
const enemySeed: Enemy[] = [0, 1].flatMap((copy) => baseEnemySeed.map((enemy) => ({
  ...enemy, x: enemy.x + copy * COURSE_OFFSET, minX: enemy.minX + copy * COURSE_OFFSET, maxX: enemy.maxX + copy * COURSE_OFFSET, speed: enemy.speed + courseIndex * 14 + copy * 12,
})));
const checkpoints = [120, 2180, 4780, 7720, 9780, 12380];

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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const screenRef = useRef<Screen>('title');
  const inputRef = useRef({ left: false, right: false, jump: false, dash: false });
  const resetRef = useRef<(() => void) | null>(null);
  const [screen, setScreen] = useState<Screen>('title');
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  const [hud, setHud] = useState<Hud>({ sparks: 0, total: sparkSeed.length, lives: 3, time: 0, best: null, checkpoint: 0, progress: 0, dashReady: true });
  const audioRef = useRef<AudioContext | null>(null);
  const musicRef = useRef<{ timer: ReturnType<typeof setInterval>; gain: GainNode; step: number } | null>(null);
  const runIdRef = useRef<string | null>(null);
  const playerIdRef = useRef('');
  const dashCoachRef = useRef(false);
  const [board, setBoard] = useState<Board>('daily');
  const [entries, setEntries] = useState<BoardEntry[]>([]);
  const [boardStatus, setBoardStatus] = useState<'loading' | 'ready' | 'offline'>('loading');
  const [nickname, setNickname] = useState('');
  const [submitState, setSubmitState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [rank, setRank] = useState<number | null>(null);
  const [streak, setStreak] = useState(0);
  const [homePanel, setHomePanel] = useState<HomePanel>('none');
  const [showDashCoach, setShowDashCoach] = useState(false);
  const [community, setCommunity] = useState<Community>({ players: 0, lights: 0, goal: 2500, nearby: [], playerRank: null, recent: [] });

  useEffect(() => { mutedRef.current = muted; }, [muted]);
  useEffect(() => {
    let playerId = window.localStorage.getItem('crestbound-player-id');
    if (!playerId) { playerId = crypto.randomUUID(); window.localStorage.setItem('crestbound-player-id', playerId); }
    playerIdRef.current = playerId;
    const stored = window.localStorage.getItem(`crestbound-best-${course.id}`);
    if (stored) setHud((current) => ({ ...current, best: Number(stored) }));
    setNickname(window.localStorage.getItem('crestbound-nickname') ?? '');
    setStreak(Number(window.localStorage.getItem('crestbound-streak')) || 0);
  }, []);

  const loadBoard = useCallback(async (nextBoard: Board) => {
    setBoardStatus('loading');
    try {
      const params = new URLSearchParams({ board: nextBoard, courseId: course.id, playerId: playerIdRef.current });
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

  useEffect(() => { void loadBoard(board); }, [board, loadBoard]);

  function stopMusic() {
    const music = musicRef.current;
    if (!music) return;
    clearInterval(music.timer);
    music.gain.gain.setTargetAtTime(0.0001, music.gain.context.currentTime, .025);
    musicRef.current = null;
  }

  function startMusic() {
    if (mutedRef.current || musicRef.current || !('AudioContext' in window)) return;
    const context = audioRef.current ?? new AudioContext();
    audioRef.current = context;
    void context.resume();
    const master = context.createGain();
    master.gain.value = .034;
    master.connect(context.destination);
    const melody = [659, 0, 784, 0, 880, 784, 659, 0, 587, 0, 659, 784, 523, 0, 587, 0, 659, 784, 988, 0, 880, 784, 659, 587, 523, 0, 440, 523, 587, 0, 494, 0];
    const bass = [131, 165, 110, 147, 131, 196, 165, 147];
    const playNote = (frequency: number, length: number, volume: number, type: OscillatorType) => {
      if (!frequency) return;
      const now = context.currentTime;
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = type; osc.frequency.value = frequency;
      gain.gain.setValueAtTime(volume, now);
      gain.gain.setValueAtTime(volume, now + length * .62);
      gain.gain.linearRampToValueAtTime(.0001, now + length);
      osc.connect(gain).connect(master); osc.start(now); osc.stop(now + length + .02);
    };
    const music = { timer: 0 as unknown as ReturnType<typeof setInterval>, gain: master, step: 0 };
    const tick = () => {
      const step = music.step++;
      playNote(melody[step % melody.length], .105, .72, 'square');
      if (step % 4 === 0) playNote(bass[(step / 4) % bass.length], .38, .6, 'triangle');
      if (step % 8 === 6) playNote(98, .035, .18, 'square');
    };
    tick(); music.timer = setInterval(tick, 120); musicRef.current = music;
  }

  function sound(kind: 'jump' | 'dash' | 'spark' | 'hit' | 'checkpoint' | 'win') {
    if (mutedRef.current || !('AudioContext' in window)) return;
    const context = audioRef.current ?? new AudioContext();
    audioRef.current = context;
    void context.resume();
    const map = {
      jump: [420, 610], dash: [170, 390], spark: [740, 980], hit: [180, 110], checkpoint: [420, 620, 820], win: [523, 659, 784, 1047],
    } as const;
    map[kind].forEach((frequency, index) => {
      const osc = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime + index * 0.075;
      osc.type = kind === 'dash' ? 'sawtooth' : 'sine';
      osc.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(kind === 'hit' ? 0.035 : 0.055, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.14);
      osc.connect(gain).connect(context.destination);
      osc.start(start);
      osc.stop(start + 0.16);
    });
  }

  function setGameScreen(next: Screen) {
    if (next !== 'playing') stopMusic();
    screenRef.current = next;
    setScreen(next);
  }

  function track(eventName: string) {
    if (!playerIdRef.current) return;
    void fetch('/api/event', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventName, playerId: playerIdRef.current, courseId: course.id }) }).catch(() => undefined);
  }

  function dismissDashCoach(learned = false) {
    dashCoachRef.current = false; setShowDashCoach(false);
    window.localStorage.setItem('crestbound-dash-learned', '1');
    if (learned) track('dash_learned');
  }

  async function startGame() {
    resetRef.current?.();
    setSubmitState('idle'); setRank(null); runIdRef.current = null;
    try {
      const response = await fetch('/api/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'start', playerId: playerIdRef.current, courseId: course.id, modifierId: modifier.id }) });
      if (response.ok) runIdRef.current = ((await response.json()) as { runId: string }).runId;
    } catch { /* Offline play remains available. */ }
    setGameScreen('playing');
    const needsCoach = !window.localStorage.getItem('crestbound-dash-learned');
    dashCoachRef.current = needsCoach; setShowDashCoach(needsCoach); track('run_start');
    startMusic();
    requestAnimationFrame(() => canvasRef.current?.focus());
  }

  function togglePause() {
    if (screenRef.current === 'playing') setGameScreen('paused');
    else if (screenRef.current === 'paused') { setGameScreen('playing'); startMusic(); }
  }

  function toggleSound() {
    setMuted((value) => {
      const next = !value;
      mutedRef.current = next;
      if (next) stopMusic(); else if (screenRef.current === 'playing') startMusic();
      return next;
    });
  }

  function recordStreak() {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
    const last = window.localStorage.getItem('crestbound-last-day');
    if (last === today) return;
    const yesterday = new Date(`${today}T12:00:00`); yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = yesterday.toLocaleDateString('en-CA');
    const next = last === yesterdayKey ? (Number(window.localStorage.getItem('crestbound-streak')) || 0) + 1 : 1;
    window.localStorage.setItem('crestbound-last-day', today);
    window.localStorage.setItem('crestbound-streak', String(next)); setStreak(next);
  }

  async function submitRun(event: FormEvent) {
    event.preventDefault();
    if (!runIdRef.current || nickname.trim().length < 2) { setSubmitState('error'); return; }
    setSubmitState('saving');
    const cleanName = nickname.trim().toUpperCase();
    window.localStorage.setItem('crestbound-nickname', cleanName); setNickname(cleanName);
    try {
      const response = await fetch('/api/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'finish', runId: runIdRef.current, playerId: playerIdRef.current, courseId: course.id, modifierId: modifier.id, name: cleanName, scoreMs: Math.round(hud.time * 1000), sparks: hud.sparks }) });
      const data = await response.json() as { rank?: number; error?: string };
      if (!response.ok) throw new Error(data.error);
      setRank(data.rank ?? null); setSubmitState('saved'); setBoard('daily'); void loadBoard('daily');
    } catch { setSubmitState('error'); }
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
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    const spriteSheet = new Image();
    spriteSheet.src = '/sunny-pixel-master.svg';
    const keys = new Set<string>();
    const player = { x: 120, y: 520, w: 46, h: 82, vx: 0, vy: 0, grounded: false, jumps: 0, dashTime: 0, dashCooldown: 0, facing: 1, invuln: 0 };
    let sparks = sparkSeed.map((item) => ({ ...item }));
    let enemies = enemySeed.map((item) => ({ ...item }));
    let lives = 3;
    let collected = 0;
    let elapsed = 0;
    let cameraX = 0;
    let checkpointIndex = 0;
    let jumpBuffer = 0;
    let coyote = 0;
    let previousJump = false;
    let previousDash = false;
    let last = performance.now();
    let lastHud = 0;
    let animation = 0;
    let screenShake = 0;
    let trace: Array<{ t: number; x: number; y: number }> = [];
    let traceTimer = 0;
    let ghost: Array<{ t: number; x: number; y: number }> = [];
    try { ghost = JSON.parse(window.localStorage.getItem(`crestbound-ghost-${course.id}`) ?? '[]') as typeof ghost; } catch { ghost = []; }

    const tone = sound;
    const overlap = (ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number) => ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
    const resetPosition = () => {
      player.x = checkpoints[checkpointIndex]; player.y = 520; player.vx = 0; player.vy = 0; player.invuln = 1.5;
    };
    const hurt = () => {
      if (player.invuln > 0) return;
      lives -= 1;
      screenShake = .24;
      tone('hit');
      if (lives <= 0) {
        setGameScreen('over');
      } else resetPosition();
    };
    const reset = () => {
      player.x = 120; player.y = 520; player.vx = 0; player.vy = 0; player.invuln = 0; player.jumps = 0;
      sparks = sparkSeed.map((item) => ({ ...item }));
      enemies = enemySeed.map((item) => ({ ...item }));
      lives = 3; collected = 0; elapsed = 0; cameraX = 0; checkpointIndex = 0; jumpBuffer = 0; coyote = 0; previousJump = false; previousDash = false; trace = []; traceTimer = 0;
      setHud((current) => ({ sparks: 0, total: sparkSeed.length, lives: 3, time: 0, best: current.best, checkpoint: 0, progress: 0, dashReady: true }));
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
      if (modifier.id === 'tailwind' && direction > 0) player.vx += 85 * dt;
      if (player.dashTime <= 0) player.vy += (modifier.id === 'moonstep' ? 1500 : 1850) * dt;
      player.vy = Math.min(player.vy, 980);
      screenShake = Math.max(0, screenShake - dt);

      const activePlatforms = platforms.map((platform) => {
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
      if (player.y > 800) hurt();
      spikeZones.forEach((spike) => { if (overlap(player.x + 7, player.y + 12, player.w - 14, player.h - 12, spike.x, spike.y, spike.w, 28)) hurt(); });

      enemies.forEach((enemy) => {
        if (!enemy.alive) return;
        enemy.x += enemy.speed * enemy.dir * dt;
        if (enemy.x <= enemy.minX || enemy.x >= enemy.maxX) enemy.dir *= -1;
        if (!overlap(player.x, player.y, player.w, player.h, enemy.x - 27, enemy.y - 27, 54, 54)) return;
        if (player.dashTime > 0 || (player.vy > 220 && player.y + player.h < enemy.y + 12)) {
          enemy.alive = false; player.vy = -360; player.dashCooldown = 0; tone('spark');
        } else hurt();
      });

      sparks.forEach((spark) => {
        if (spark.taken) return;
        const dx = player.x + player.w / 2 - spark.x;
        const dy = player.y + player.h / 2 - spark.y;
        if (dx * dx + dy * dy < 2200) { spark.taken = true; collected += 1; player.dashCooldown = 0; tone('spark'); }
      });

      if (checkpointIndex < checkpoints.length - 1 && player.x > checkpoints[checkpointIndex + 1]) {
        checkpointIndex += 1; lives = Math.min(3, lives + 1); tone('checkpoint');
      }
      if (player.x > FINISH_X) {
        const bestKey = `crestbound-best-${course.id}`;
        const best = Number(window.localStorage.getItem(bestKey)) || Infinity;
        if (elapsed < best) {
          window.localStorage.setItem(bestKey, String(elapsed));
          window.localStorage.setItem(`crestbound-ghost-${course.id}`, JSON.stringify(trace));
          ghost = trace;
        }
        setHud({ sparks: collected, total: sparks.length, lives, time: elapsed, best: Math.min(best, elapsed), checkpoint: checkpointIndex, progress: player.x, dashReady: player.dashCooldown <= 0 });
        recordStreak(); tone('win'); setGameScreen('won');
      }
      cameraX += (Math.max(0, Math.min(WORLD_W - VIEW_W, player.x - 390)) - cameraX) * Math.min(1, dt * 5.5);
      if (elapsed - lastHud > 0.08) {
        lastHud = elapsed;
        const stored = window.localStorage.getItem(`crestbound-best-${course.id}`);
        setHud({ sparks: collected, total: sparks.length, lives, time: elapsed, best: stored ? Number(stored) : null, checkpoint: checkpointIndex, progress: player.x, dashReady: player.dashCooldown <= 0 });
      }
    }

    function draw() {
      const ctx = context;
      const shakeX = screenShake > 0 ? ((Math.floor(elapsed * 60) % 3) - 1) * 4 : 0;
      ctx.setTransform(.25, 0, 0, .25, shakeX * .25, 0);
      ctx.imageSmoothingEnabled = false;
      const zone = Math.min(3, Math.floor((cameraX + 240) / 1900));
      const skyTop = ['#071820', '#081724', '#10152a', '#18182d'][zone];
      const skyLow = ['#0c2830', '#102d38', '#18313c', '#3a2933'][zone];
      ctx.fillStyle = skyTop; ctx.fillRect(-8, 0, VIEW_W + 16, VIEW_H);
      ctx.fillStyle = skyLow; ctx.fillRect(-8, 252, VIEW_W + 16, 468);
      ctx.fillStyle = ['#12343b', '#173744', '#233b45', '#51363a'][zone]; ctx.fillRect(-8, 360, VIEW_W + 16, 360);
      ctx.save();
      for (let index = 0; index < 54; index += 1) {
        const x = ((index * 193 - cameraX * .08) % 1500 + 1500) % 1500 - 100;
        const y = 45 + ((index * 83) % 290);
        ctx.fillStyle = index % 9 === 0 ? '#f5d263' : '#9ac5c4';
        const size = index % 9 === 0 ? 8 : 4;
        ctx.fillRect(Math.floor(x / 4) * 4, Math.floor(y / 4) * 4, size, size);
      }
      const moonX = Math.floor((1060 - cameraX * .03) / 8) * 8;
      ctx.fillStyle = '#d18c18'; ctx.fillRect(moonX - 48, 72, 96, 112);
      ctx.fillStyle = '#f5d263'; ctx.fillRect(moonX - 64, 88, 128, 80); ctx.fillRect(moonX - 48, 72, 96, 112);
      ctx.fillStyle = '#e2aa2f'; ctx.fillRect(moonX - 34, 92, 18, 16); ctx.fillRect(moonX + 18, 132, 24, 16); ctx.fillRect(moonX - 12, 156, 16, 12);
      for (let layer = 0; layer < 2; layer += 1) {
        const parallax = layer ? .32 : .17;
        const baseY = layer ? 505 : 430;
        const building = layer ? '#102f34' : '#173c42';
        for (let index = -1; index < 18; index += 1) {
          const x = index * 120 - ((cameraX * parallax) % 120);
          const h = 80 + Math.abs((index * 47 + layer * 31) % 150);
          const buildingX = Math.floor(x / 8) * 8;
          ctx.fillStyle = building; ctx.fillRect(buildingX, baseY - h, 96, h + 220);
          if (index % 3 === 0) { ctx.fillRect(buildingX + 44, baseY - h - 28, 8, 28); ctx.fillRect(buildingX + 34, baseY - h - 28, 28, 5); }
          for (let wx = 16; wx < 80; wx += 24) for (let wy = baseY - h + 16; wy < baseY - 12; wy += 28) {
            const lit = (index + wx + wy + layer) % 4 !== 0;
            ctx.fillStyle = lit ? (layer ? '#2c5558' : '#315c60') : (zone > 1 ? '#d18c18' : '#214246');
            ctx.fillRect(buildingX + wx, wy, 8, 12);
          }
        }
      }
      ctx.fillStyle = '#78d7d2';
      for (let index = 0; index < 16; index += 1) { const x = ((index * 101 - cameraX * .52) % 1440 + 1440) % 1440 - 80; ctx.fillRect(x, 520 + (index % 3) * 10, 10, 4); }
      ctx.fillStyle = '#071b20'; ctx.fillRect(-8, 574, VIEW_W + 16, 10);
      ctx.fillStyle = '#183c40';
      for (let x = -80 - ((cameraX * .64) % 96); x < VIEW_W + 96; x += 96) { ctx.fillRect(x, 548, 8, 36); ctx.fillRect(x + 8, 552, 64, 4); }
      ctx.fillStyle = zone > 1 ? '#d18c18' : '#18a7a2';
      for (let index = 0; index < 8; index += 1) { const x = ((index * 227 - cameraX * .38) % 1700 + 1700) % 1700 - 100; ctx.fillRect(x, 535 + (index % 2) * 12, 20, 4); }
      ctx.restore();

      ctx.save(); ctx.translate(-cameraX, 0);
      const activePlatforms = platforms.map((platform) => platform.moving ? { ...platform, y: (platform.baseY ?? platform.y) + Math.sin(elapsed * 1.45 + (platform.phase ?? 0)) * 72 } : platform);
      activePlatforms.forEach((platform) => {
        const px = Math.floor(platform.x / 4) * 4; const py = Math.floor(platform.y / 4) * 4;
        ctx.fillStyle = '#08191c'; ctx.fillRect(px, py, platform.w, platform.h);
        ctx.fillStyle = '#b96f14'; ctx.fillRect(px, py, platform.w, 20);
        ctx.fillStyle = '#f2b52b'; ctx.fillRect(px, py, platform.w, 8);
        ctx.fillStyle = '#fff0a8'; ctx.fillRect(px + 8, py + 2, Math.max(0, platform.w - 16), 2);
        ctx.fillStyle = '#071316'; for (let x = px + 18; x < px + platform.w - 8; x += 48) ctx.fillRect(x, py + 12, 5, 5);
        ctx.fillStyle = '#6f4213'; ctx.fillRect(px, py + 20, platform.w, 4);
        for (let x = px; x < px + platform.w; x += 32) for (let y = py + 24; y < py + platform.h; y += 24) {
          ctx.fillStyle = ((x + y) / 8) % 2 ? '#12363a' : '#17454a'; ctx.fillRect(x, y, 24, 16);
        }
        if (platform.h > 32) {
          ctx.fillStyle = '#09272b';
          for (let x = px + 12; x < px + platform.w - 20; x += 96) { ctx.fillRect(x, py + 34, 8, platform.h - 34); ctx.fillRect(x + 8, py + 38, 36, 6); }
        }
      });
      const drawSign = (x: number, y: number, text: string, accent: string) => {
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
        ctx.fillStyle = '#071316'; ctx.fillRect(spike.x, spike.y + 20, spike.w, 8);
        ctx.fillStyle = '#f06f52';
        for (let x = spike.x; x < spike.x + spike.w; x += 24) { ctx.beginPath(); ctx.moveTo(x, spike.y + 24); ctx.lineTo(x + 12, spike.y); ctx.lineTo(x + 24, spike.y + 24); ctx.closePath(); ctx.fill(); }
      });
      checkpoints.slice(1).forEach((x, index) => {
        const active = checkpointIndex > index;
        ctx.fillStyle = active ? '#f5d263' : '#527b7c'; ctx.fillRect(x - 4, 486, 8, 86); ctx.fillRect(x, 486, 42, 8);
        ctx.fillStyle = active ? '#ef6f52' : '#234d50'; ctx.fillRect(x + 8, 494, 30, 22);
      });
      sparks.forEach((spark, index) => {
        if (spark.taken) return;
        const bob = Math.round(Math.sin(elapsed * 5 + index) * 4 / 4) * 4;
        ctx.save(); ctx.translate(spark.x, spark.y + bob); const color = spark.secret ? '#78d7d2' : '#f5d263';
        ctx.fillStyle = '#071316'; ctx.fillRect(-12, -20, 24, 40); ctx.fillRect(-20, -12, 40, 24);
        ctx.fillStyle = color; ctx.fillRect(-8, -20, 16, 40); ctx.fillRect(-20, -8, 40, 16);
        ctx.fillStyle = '#fff8e9'; ctx.fillRect(-4, -8, 8, 16);
        if (Math.floor(elapsed * 6 + index) % 3 === 0) { ctx.fillRect(-24, -20, 4, 4); ctx.fillRect(20, 16, 4, 4); }
        ctx.restore();
      });
      enemies.forEach((enemy) => {
        if (!enemy.alive) return;
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
      ctx.fillStyle = '#071316'; ctx.fillRect(exitX, 414, 88, 24); ctx.fillStyle = '#f5d263'; ctx.font = 'bold 16px monospace'; ctx.fillText('EXIT', exitX + 20, 432);
      ctx.fillStyle = '#b96f14'; ctx.fillRect(exitX - 16, 440, 120, 180); ctx.fillStyle = '#f5d263'; ctx.fillRect(exitX - 4, 452, 96, 168);
      ctx.fillStyle = Math.floor(elapsed * 5) % 2 ? '#18a7a2' : '#78d7d2'; ctx.fillRect(exitX + 12, 468, 64, 152);
      ctx.fillStyle = '#071820'; ctx.fillRect(exitX + 28, 484, 32, 136);

      let spriteIndex = 0;
      if (player.invuln > 0 && Math.floor(elapsed * 12) % 2 === 0) ctx.globalAlpha = .35;
      if (screenRef.current === 'won') spriteIndex = 7;
      else if (player.dashTime > 0) spriteIndex = 5;
      else if (player.invuln > .9) spriteIndex = 6;
      else if (!player.grounded) spriteIndex = player.vy < 0 ? 3 : 4;
      else if (Math.abs(player.vx) > 80) spriteIndex = Math.floor(elapsed * 10) % 2 ? 1 : 2;
      if (spriteSheet.complete && spriteSheet.naturalWidth) {
        const drawH = spriteIndex === 5 ? 106 : 116;
        const drawW = drawH * (32 / 48);
        if (ghost.length > 1) {
          const ghostFrame = ghost[Math.min(ghost.length - 1, Math.max(0, Math.floor(elapsed / .12)))];
          if (ghostFrame && Math.abs(ghostFrame.x - player.x) < VIEW_W * 1.5) {
            ctx.save(); ctx.globalAlpha = .22; ctx.translate(ghostFrame.x + player.w / 2, ghostFrame.y + player.h); ctx.scale(player.facing, 1);
            ctx.drawImage(spriteSheet, 0, 0, 32, 48, -drawW / 2, -116, drawW, 116); ctx.restore(); ctx.globalAlpha = 1;
          }
        }
        if (player.dashTime > 0) {
          for (let trail = 3; trail > 0; trail -= 1) {
            ctx.globalAlpha = .1 + trail * .08;
            ctx.save(); ctx.translate(player.x + player.w / 2 - player.facing * trail * 30, player.y + player.h); ctx.scale(player.facing, 1);
            ctx.drawImage(spriteSheet, 160, 0, 32, 48, -drawW / 2, -drawH, drawW, drawH); ctx.restore();
          }
          ctx.globalAlpha = 1;
        }
        ctx.save(); ctx.translate(player.x + player.w / 2, player.y + player.h); ctx.scale(player.facing, 1);
        ctx.drawImage(spriteSheet, spriteIndex * 32, 0, 32, 48, -drawW / 2, -drawH, drawW, drawH); ctx.restore();
      } else { ctx.fillStyle = '#f5d263'; ctx.fillRect(player.x, player.y, player.w, player.h); }
      ctx.globalAlpha = 1; ctx.restore();
    }

    function loop(now: number) {
      const dt = Math.min(.033, (now - last) / 1000);
      last = now;
      if (screenRef.current === 'playing') update(dt);
      draw();
      animation = requestAnimationFrame(loop);
    }
    animation = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(animation); stopMusic(); window.removeEventListener('keydown', keyDown); window.removeEventListener('keyup', keyUp); window.removeEventListener('blur', clearKeys); resetRef.current = null;
    };
  }, []);

  return (
    <main className="shell">
      <section className="game-frame" aria-label="Crestbound platform game starring Sunny">
        <canvas ref={canvasRef} className="game-canvas" width={320} height={180} tabIndex={0} aria-label="Platform game. Use arrows or A and D to move, Space to jump, and Shift to dash." />

        {screen !== 'title' && (
          <header className="hud">
            <div className="hud-brand"><span className="mini-sun">✦</span><strong>{course.short}</strong><i className={hud.dashReady ? 'ready' : ''}>{hud.dashReady ? 'DASH READY' : 'DASH CHARGING'}</i></div>
            <div className="hud-stats">
              <span><b>{'◆'.repeat(hud.lives)}</b><small>LIVES</small></span>
              <span><b>{hud.sparks}/{hud.total}</b><small>LIGHT</small></span>
              <span><b>{formatTime(hud.time)}</b><small>TIME</small></span>
            </div>
            <div className="hud-actions">
              <button type="button" onClick={toggleSound} aria-label={muted ? 'Turn sound on' : 'Mute sound'}>{muted ? 'MUTE' : '♪ ON'}</button>
              <button type="button" onClick={togglePause} aria-label={screen === 'paused' ? 'Resume game' : 'Pause game'}>{screen === 'paused' ? '▶' : 'Ⅱ'}</button>
            </div>
            <div className="route-meter" aria-label={`${Math.round(hud.progress / (WORLD_W - 265) * 100)} percent through the course`}><span style={{ width: `${Math.min(100, hud.progress / (WORLD_W - 265) * 100)}%` }} /></div>
          </header>
        )}

        {screen === 'title' && (
          <div className="title-screen">
            <div className="home-hero">
              <div className="sunny-lockup" aria-label="Sunny, the hero of Crestbound">
                <img className="sunny-hero" src="/sunny-home-pixel.svg" width="192" height="288" alt="Sunny, Crestbound's pixel-art hero" />
                <span>SUNNY</span>
              </div>
              <div className="title-card">
                <h1>Crestbound</h1>
                <p className="tagline">Run the skyline. Find the light. Beat Suncrest&apos;s time.</p>
                <div className="daily-course"><span>TODAY&apos;S COURSE</span><b>{course.name}</b><em>{modifier.name}</em></div>
                <button className="play-button" type="button" onClick={() => void startGame()}>Play Today&apos;s Run <span aria-hidden="true">▶</span></button>
                <div className="daily-glance"><span>{community.players} SUNCRESTERS TODAY</span><b>{entries[0] ? `#1 ${entries[0].name} · ${formatTime(entries[0].timeMs / 1000)}` : 'BE THE FIRST FINISHER'}</b></div>
                <div className="community-progress"><div><span>COMMUNITY LIGHT</span><b>{community.lights.toLocaleString()} / {community.goal.toLocaleString()}</b></div><progress value={Math.min(community.lights, community.goal)} max={community.goal} /><small>{Math.max(1, streak)} day personal streak</small></div>
                <div className="home-links"><button type="button" onClick={() => { setHomePanel('leaderboard'); track('leaderboard_open'); }}>Leaderboard</button><button type="button" onClick={() => setHomePanel('help')}>How to Play</button></div>
              </div>
            </div>
            {homePanel === 'leaderboard' && <aside className="leaderboard home-panel" aria-label="Crestbound leaderboard">
              <div className="board-heading"><span>TOP RUNS</span><small>{board === 'daily' ? 'TODAY' : board === 'weekly' ? 'THIS WEEK' : 'ALL TIME'}</small></div>
              <div className="board-tabs">
                {(['daily', 'weekly', 'all'] as Board[]).map((item) => <button className={board === item ? 'active' : ''} type="button" key={item} onClick={() => setBoard(item)}>{item === 'daily' ? 'TODAY' : item === 'weekly' ? 'WEEK' : 'ALL'}</button>)}
              </div>
              <ol className="board-list">
                {boardStatus === 'loading' && <li className="board-message">LOADING RUNS...</li>}
                {boardStatus === 'offline' && <li className="board-message">BOARD COMES ONLINE WHEN PUBLISHED.</li>}
                {boardStatus === 'ready' && entries.length === 0 && <li className="board-message">NO FINISHERS YET. CLAIM #1.</li>}
                {boardStatus === 'ready' && entries.slice(0, 7).map((entry) => <li key={`${entry.rank}-${entry.name}`}><b>#{entry.rank}</b><span>{entry.name}</span><time>{board === 'weekly' ? `${entry.points ?? 0} PT` : formatTime(entry.timeMs / 1000)}</time><small>{entry.sparks}◆</small></li>)}
              </ol>
              {community.playerRank && <div className="nearby-rivals"><b>YOUR NEARBY RIVALS // #{community.playerRank}</b>{community.nearby.map((entry) => <span key={`${entry.rank}-${entry.name}`}>#{entry.rank} {entry.name} <time>{formatTime(entry.timeMs / 1000)}</time></span>)}</div>}
              {community.recent.length > 0 && <p className="recent-finishers">JUST RAN: {community.recent.join(' · ')}</p>}
              <p>FASTEST VERIFIED TIME WINS. WEEKLY BOARD REWARDS CONSISTENCY. NICKNAMES ONLY.</p>
              <button className="panel-close" type="button" onClick={() => setHomePanel('none')}>Close</button>
            </aside>}
            {homePanel === 'help' && <aside className="how-to home-panel" aria-label="How to play Crestbound">
              <p className="kicker">READY, SUNNY?</p><h2>How to Play</h2>
              <div><b>RUN</b><span>Arrow keys / A D / touch arrows</span><b>JUMP</b><span>Space / touch JUMP · tap twice</span><b>DASH</b><span>Shift or X / touch DASH · recharges</span></div>
              <p>Touch controls appear automatically. Turn your phone sideways for the full course.</p>
              <button className="panel-close" type="button" onClick={() => setHomePanel('none')}>Got It</button>
            </aside>}
          </div>
        )}

        {screen === 'paused' && <div className="game-modal"><p>RUN PAUSED</p><h2>Catch your breath.</h2><button type="button" onClick={togglePause}>Resume</button><button className="secondary" type="button" onClick={() => setGameScreen('title')}>Quit Run</button></div>}
        {screen === 'over' && <div className="game-modal"><p>LIGHT LOST</p><h2>That route got you.</h2><p>Use the high paths, save your dash, and hit enemies from above.</p><button type="button" onClick={() => void startGame()}>Run It Back</button></div>}
        {screen === 'won' && (
          <div className="game-modal win-modal">
            <p>LIGHT RESTORED // {medalFor(hud.time)} MEDAL</p><h2>Skyline cleared.</h2>
            <div className="result-grid"><span><b>{formatTime(hud.time)}</b><small>FINISH</small></span><span><b>{hud.sparks}/{hud.total}</b><small>LIGHT</small></span><span><b>{hud.best ? formatTime(hud.best) : '—'}</b><small>BEST</small></span></div>
            {submitState !== 'saved' ? <form className="score-form" onSubmit={submitRun}>
              <label htmlFor="nickname">POST TO TODAY&apos;S BOARD</label>
              <div><input id="nickname" value={nickname} onChange={(event) => setNickname(event.target.value)} minLength={2} maxLength={12} pattern="[A-Za-z0-9 _-]{2,12}" placeholder="NICKNAME" autoComplete="nickname" /><button type="submit" disabled={submitState === 'saving' || !runIdRef.current}>{submitState === 'saving' ? 'SAVING...' : 'POST RUN'}</button></div>
              <small>Use a nickname, not your real name.{!runIdRef.current ? ' Online posting is unavailable for this run.' : ''}</small>
              {submitState === 'error' && <em>COULDN&apos;T POST. CHECK YOUR NICKNAME OR TRY AGAIN.</em>}
            </form> : <div className="rank-callout">RUN POSTED {rank ? `// TODAY #${rank}` : '// TO TODAY'}</div>}
            <button type="button" onClick={() => void startGame()}>Beat Your Time</button>
            <button className="secondary" type="button" onClick={() => { setGameScreen('title'); void loadBoard('daily'); }}>View Leaderboard</button>
          </div>
        )}

        {screen === 'playing' && (
          <><div className="rotate-prompt"><span aria-hidden="true">↻</span><strong>Turn Sideways to Run</strong><small>Crestbound plays in landscape so you can see the next jump and keep the controls clear.</small></div>{showDashCoach && <div className="dash-coach"><b>DASH IS YOUR EDGE</b><span>Press SHIFT or X — or tap DASH — to burst through hazards. The HUD tells you when it recharges.</span><button type="button" onClick={() => dismissDashCoach()}>GOT IT</button></div>}<div className="touch-controls" aria-label="Touch controls">
            <div><button type="button" aria-label="Move left" onPointerDown={(event) => beginPress('left', event)} onPointerUp={(event) => endPress('left', event)} onPointerCancel={(event) => endPress('left', event)} onLostPointerCapture={() => press('left', false)}>←</button><button type="button" aria-label="Move right" onPointerDown={(event) => beginPress('right', event)} onPointerUp={(event) => endPress('right', event)} onPointerCancel={(event) => endPress('right', event)} onLostPointerCapture={() => press('right', false)}>→</button></div>
            <div><button className="dash-control" type="button" aria-label="Dash" onPointerDown={(event) => beginPress('dash', event)} onPointerUp={(event) => endPress('dash', event)} onPointerCancel={(event) => endPress('dash', event)} onLostPointerCapture={() => press('dash', false)}>DASH</button><button className="jump-control" type="button" aria-label="Jump" onPointerDown={(event) => beginPress('jump', event)} onPointerUp={(event) => endPress('jump', event)} onPointerCancel={(event) => endPress('jump', event)} onLostPointerCapture={() => press('jump', false)}>JUMP</button></div>
          </div></>
        )}
      </section>
    </main>
  );
}
