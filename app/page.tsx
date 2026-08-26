'use client';

/* eslint-disable @next/next/no-img-element -- game sprites are rendered directly into canvas */

import { useEffect, useRef, useState } from 'react';

type Screen = 'title' | 'playing' | 'paused' | 'won' | 'over';
type Hud = { sparks: number; total: number; lives: number; time: number; best: number | null; checkpoint: number };
type Platform = { x: number; y: number; w: number; h: number; moving?: boolean; phase?: number; baseY?: number };
type Spark = { x: number; y: number; taken?: boolean; secret?: boolean };
type Enemy = { x: number; y: number; minX: number; maxX: number; speed: number; dir: number; alive: boolean };

const WORLD_W = 7800;
const VIEW_W = 1280;
const VIEW_H = 720;

const platforms: Platform[] = [
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

const spikeZones = [
  { x: 1120, y: 596, w: 130 }, { x: 1675, y: 596, w: 65 }, { x: 4070, y: 596, w: 150 },
  { x: 5030, y: 596, w: 160 }, { x: 5290, y: 596, w: 175 }, { x: 6480, y: 596, w: 130 }, { x: 6850, y: 596, w: 130 },
];

const sparkSeed: Spark[] = [
  { x: 345, y: 450 }, { x: 650, y: 360 }, { x: 1030, y: 565 }, { x: 1370, y: 360 }, { x: 1585, y: 275, secret: true },
  { x: 2055, y: 430 }, { x: 2385, y: 500 }, { x: 2590, y: 400 }, { x: 2795, y: 295 }, { x: 3030, y: 390 },
  { x: 3420, y: 400 }, { x: 3685, y: 305, secret: true }, { x: 4125, y: 435 }, { x: 4400, y: 335 }, { x: 4895, y: 450 },
  { x: 5195, y: 355 }, { x: 5480, y: 270, secret: true }, { x: 5800, y: 430 }, { x: 6040, y: 355 }, { x: 6445, y: 445 },
  { x: 6745, y: 350 }, { x: 7045, y: 260, secret: true }, { x: 7340, y: 390 }, { x: 7500, y: 545 },
];

const enemySeed: Enemy[] = [
  { x: 1180, y: 570, minX: 970, maxX: 1660, speed: 95, dir: 1, alive: true },
  { x: 2040, y: 570, minX: 1830, maxX: 2240, speed: 125, dir: -1, alive: true },
  { x: 4180, y: 570, minX: 3970, maxX: 4610, speed: 150, dir: 1, alive: true },
  { x: 4920, y: 570, minX: 4740, maxX: 5580, speed: 170, dir: -1, alive: true },
  { x: 6690, y: 570, minX: 6250, maxX: 7100, speed: 185, dir: 1, alive: true },
];

const checkpoints = [120, 2180, 4780];

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = (seconds % 60).toFixed(1).padStart(4, '0');
  return `${minutes}:${remainder}`;
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const screenRef = useRef<Screen>('title');
  const inputRef = useRef({ left: false, right: false, jump: false, dash: false });
  const resetRef = useRef<(() => void) | null>(null);
  const [screen, setScreen] = useState<Screen>('title');
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  const [hud, setHud] = useState<Hud>({ sparks: 0, total: sparkSeed.length, lives: 3, time: 0, best: null, checkpoint: 0 });
  const audioRef = useRef<AudioContext | null>(null);

  useEffect(() => { mutedRef.current = muted; }, [muted]);
  useEffect(() => {
    const stored = window.localStorage.getItem('crestbound-best');
    if (stored) setHud((current) => ({ ...current, best: Number(stored) }));
  }, []);

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
    screenRef.current = next;
    setScreen(next);
  }

  function startGame() {
    resetRef.current?.();
    setGameScreen('playing');
    requestAnimationFrame(() => canvasRef.current?.focus());
  }

  function togglePause() {
    if (screenRef.current === 'playing') setGameScreen('paused');
    else if (screenRef.current === 'paused') setGameScreen('playing');
  }

  function press(control: keyof typeof inputRef.current, active: boolean) {
    inputRef.current[control] = active;
    if (active) canvasRef.current?.focus();
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    const sprites = Array.from({ length: 8 }, (_, index) => {
      const image = new Image();
      image.src = `/sunny-frame-${index}.png`;
      return image;
    });
    const keys = new Set<string>();
    const player = { x: 120, y: 510, w: 50, h: 88, vx: 0, vy: 0, grounded: false, jumps: 0, dashTime: 0, dashCooldown: 0, facing: 1, invuln: 0 };
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

    const tone = sound;
    const overlap = (ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number) => ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
    const resetPosition = () => {
      player.x = checkpoints[checkpointIndex]; player.y = 500; player.vx = 0; player.vy = 0; player.invuln = 1.5;
    };
    const hurt = () => {
      if (player.invuln > 0) return;
      lives -= 1;
      tone('hit');
      if (lives <= 0) {
        setGameScreen('over');
      } else resetPosition();
    };
    const reset = () => {
      player.x = 120; player.y = 500; player.vx = 0; player.vy = 0; player.invuln = 0; player.jumps = 0;
      sparks = sparkSeed.map((item) => ({ ...item }));
      enemies = enemySeed.map((item) => ({ ...item }));
      lives = 3; collected = 0; elapsed = 0; cameraX = 0; checkpointIndex = 0; jumpBuffer = 0; coyote = 0; previousJump = false; previousDash = false;
      setHud((current) => ({ sparks: 0, total: sparkSeed.length, lives: 3, time: 0, best: current.best, checkpoint: 0 }));
    };
    resetRef.current = reset;

    function keyDown(event: KeyboardEvent) {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(event.code)) event.preventDefault();
      keys.add(event.code);
      if (event.code === 'KeyP' || event.code === 'Escape') togglePause();
      if (event.code === 'KeyM') setMuted((value) => !value);
      if ((event.code === 'Space' || event.code === 'ArrowUp' || event.code === 'KeyW') && !event.repeat) jumpBuffer = 0.14;
    }
    function keyUp(event: KeyboardEvent) { keys.delete(event.code); }
    window.addEventListener('keydown', keyDown, { passive: false });
    window.addEventListener('keyup', keyUp);

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
      player.invuln = Math.max(0, player.invuln - dt);
      player.dashCooldown = Math.max(0, player.dashCooldown - dt);
      player.dashTime = Math.max(0, player.dashTime - dt);
      jumpBuffer = Math.max(0, jumpBuffer - dt);
      coyote = player.grounded ? 0.12 : Math.max(0, coyote - dt);
      const input = inputState();
      const direction = Number(input.right) - Number(input.left);
      if (direction) player.facing = direction;
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
        player.dashTime = 0.17; player.dashCooldown = 0.82; player.vx = player.facing * 900; player.vy *= 0.18; tone('dash');
      }
      previousJump = input.jump;
      previousDash = input.dash;
      if (player.dashTime <= 0) player.vy += 1850 * dt;
      player.vy = Math.min(player.vy, 980);

      const activePlatforms = platforms.map((platform) => {
        if (!platform.moving) return platform;
        return { ...platform, y: (platform.baseY ?? platform.y) + Math.sin(elapsed * 1.45 + (platform.phase ?? 0)) * 72 };
      });
      player.x += player.vx * dt;
      for (const platform of activePlatforms) {
        if (!overlap(player.x, player.y, player.w, player.h, platform.x, platform.y, platform.w, platform.h)) continue;
        if (player.vx > 0) player.x = platform.x - player.w;
        else if (player.vx < 0) player.x = platform.x + platform.w;
        player.vx *= -0.05;
      }
      const previousBottom = player.y + player.h;
      player.y += player.vy * dt;
      player.grounded = false;
      for (const platform of activePlatforms) {
        if (!overlap(player.x, player.y, player.w, player.h, platform.x, platform.y, platform.w, platform.h)) continue;
        if (player.vy >= 0 && previousBottom <= platform.y + 18) {
          player.y = platform.y - player.h; player.vy = 0; player.grounded = true; player.jumps = 0;
        } else if (player.vy < 0) { player.y = platform.y + platform.h; player.vy = 20; }
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
      if (player.x > 7535) {
        const best = Number(window.localStorage.getItem('crestbound-best')) || Infinity;
        if (elapsed < best) window.localStorage.setItem('crestbound-best', String(elapsed));
        tone('win'); setGameScreen('won');
      }
      cameraX += (Math.max(0, Math.min(WORLD_W - VIEW_W, player.x - 390)) - cameraX) * Math.min(1, dt * 5.5);
      if (elapsed - lastHud > 0.08) {
        lastHud = elapsed;
        const stored = window.localStorage.getItem('crestbound-best');
        setHud({ sparks: collected, total: sparks.length, lives, time: elapsed, best: stored ? Number(stored) : null, checkpoint: checkpointIndex });
      }
    }

    function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number) {
      ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); ctx.fill();
    }

    function draw() {
      const ctx = context;
      const gradient = ctx.createLinearGradient(0, 0, 0, VIEW_H);
      gradient.addColorStop(0, '#071b25'); gradient.addColorStop(.56, '#15434a'); gradient.addColorStop(1, '#0a2022');
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.save();
      for (let index = 0; index < 70; index += 1) {
        const x = ((index * 193 - cameraX * .08) % 1500 + 1500) % 1500 - 100;
        const y = 45 + ((index * 83) % 290);
        const glow = index % 9 === 0 ? 2.7 : 1.2;
        ctx.fillStyle = index % 9 === 0 ? '#f5d263' : '#9ac5c4';
        ctx.globalAlpha = index % 9 === 0 ? .9 : .45;
        ctx.beginPath(); ctx.arc(x, y, glow, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#f2b52b'; ctx.shadowColor = '#f2b52b'; ctx.shadowBlur = 45; ctx.beginPath(); ctx.arc(1060 - cameraX * .03, 125, 68, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
      for (let layer = 0; layer < 2; layer += 1) {
        const parallax = layer ? .32 : .17;
        const baseY = layer ? 505 : 430;
        ctx.fillStyle = layer ? '#102f34' : '#173c42';
        for (let index = -1; index < 18; index += 1) {
          const x = index * 120 - ((cameraX * parallax) % 120);
          const h = 80 + ((index * 47 + layer * 31) % 150);
          ctx.fillRect(x, baseY - h, 92, h + 220);
          ctx.fillStyle = layer ? '#2c5558' : '#315c60';
          for (let wx = 15; wx < 80; wx += 25) for (let wy = baseY - h + 18; wy < baseY - 12; wy += 28) ctx.fillRect(x + wx, wy, 7, 10);
          ctx.fillStyle = layer ? '#102f34' : '#173c42';
        }
      }
      ctx.restore();

      ctx.save(); ctx.translate(-cameraX, 0);
      const activePlatforms = platforms.map((platform) => platform.moving ? { ...platform, y: (platform.baseY ?? platform.y) + Math.sin(elapsed * 1.45 + (platform.phase ?? 0)) * 72 } : platform);
      activePlatforms.forEach((platform) => {
        ctx.fillStyle = '#0e292c'; roundedRect(ctx, platform.x, platform.y, platform.w, platform.h, 8);
        ctx.fillStyle = '#d99a1d'; roundedRect(ctx, platform.x, platform.y, platform.w, Math.min(14, platform.h), 6);
        ctx.fillStyle = '#f4ca4f'; ctx.fillRect(platform.x + 8, platform.y + 3, platform.w - 16, 3);
        if (platform.h > 40) { ctx.strokeStyle = '#1b4245'; ctx.lineWidth = 3; for (let x = platform.x + 28; x < platform.x + platform.w; x += 46) { ctx.beginPath(); ctx.moveTo(x, platform.y + 25); ctx.lineTo(x - 15, platform.y + platform.h); ctx.stroke(); } }
      });
      spikeZones.forEach((spike) => {
        ctx.fillStyle = '#f06f52';
        for (let x = spike.x; x < spike.x + spike.w; x += 24) { ctx.beginPath(); ctx.moveTo(x, spike.y + 24); ctx.lineTo(x + 12, spike.y); ctx.lineTo(x + 24, spike.y + 24); ctx.closePath(); ctx.fill(); }
      });
      checkpoints.slice(1).forEach((x, index) => {
        const active = checkpointIndex > index;
        ctx.strokeStyle = active ? '#f5d263' : '#527b7c'; ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(x, 536, 32, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = active ? '#f5d263' : '#234d50'; ctx.beginPath(); ctx.arc(x, 536, 7, 0, Math.PI * 2); ctx.fill();
      });
      sparks.forEach((spark, index) => {
        if (spark.taken) return;
        const pulse = 1 + Math.sin(elapsed * 4 + index) * .12;
        ctx.save(); ctx.translate(spark.x, spark.y); ctx.scale(pulse, pulse); ctx.rotate(elapsed * .9 + index);
        ctx.shadowColor = spark.secret ? '#78d7d2' : '#f5d263'; ctx.shadowBlur = 18;
        ctx.strokeStyle = spark.secret ? '#78d7d2' : '#f5d263'; ctx.lineWidth = 5; ctx.beginPath(); ctx.ellipse(0, 0, 15, 25, .7, 0, Math.PI * 2); ctx.stroke();
        ctx.rotate(1.6); ctx.beginPath(); ctx.ellipse(0, 0, 10, 22, .7, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      });
      enemies.forEach((enemy) => {
        if (!enemy.alive) return;
        ctx.save(); ctx.translate(enemy.x, enemy.y); ctx.shadowColor = '#ef6f52'; ctx.shadowBlur = 18;
        ctx.fillStyle = '#172528'; ctx.strokeStyle = '#ef6f52'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0, 0, 25, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ef6f52'; ctx.fillRect(enemy.dir > 0 ? 4 : -15, -5, 11, 7); ctx.restore();
      });
      ctx.save(); ctx.translate(7545, 505); ctx.strokeStyle = '#f5d263'; ctx.shadowColor = '#f5d263'; ctx.shadowBlur = 25;
      for (let ring = 0; ring < 5; ring += 1) { ctx.lineWidth = 6 - ring * .7; ctx.beginPath(); ctx.ellipse(Math.sin(ring) * 6, 40, 45 + ring * 8, 90 + ring * 6, ring * .28 + elapsed * .12, 0, Math.PI * 2); ctx.stroke(); }
      ctx.restore();

      let spriteIndex = 0;
      if (player.invuln > 0 && Math.floor(elapsed * 12) % 2 === 0) ctx.globalAlpha = .35;
      if (screenRef.current === 'won') spriteIndex = 7;
      else if (player.dashTime > 0) spriteIndex = 5;
      else if (player.invuln > .9) spriteIndex = 6;
      else if (!player.grounded) spriteIndex = player.vy < 0 ? 3 : 4;
      else if (Math.abs(player.vx) > 80) spriteIndex = Math.floor(elapsed * 10) % 2 ? 1 : 2;
      const sprite = sprites[spriteIndex];
      if (sprite.complete && sprite.naturalWidth) {
        const drawH = spriteIndex === 5 ? 100 : 126;
        const drawW = drawH * (sprite.naturalWidth / sprite.naturalHeight);
        ctx.save(); ctx.translate(player.x + player.w / 2, player.y + player.h); ctx.scale(player.facing, 1);
        ctx.shadowColor = 'rgb(0 0 0 / 35%)'; ctx.shadowBlur = 10; ctx.drawImage(sprite, -drawW / 2, -drawH, drawW, drawH); ctx.restore();
      } else { ctx.fillStyle = '#f5d263'; roundedRect(ctx, player.x, player.y, player.w, player.h, 20); }
      ctx.globalAlpha = 1; ctx.restore();

      const vignette = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, 260, VIEW_W / 2, VIEW_H / 2, 780);
      vignette.addColorStop(0, 'transparent'); vignette.addColorStop(1, 'rgb(0 0 0 / 38%)'); ctx.fillStyle = vignette; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
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
      cancelAnimationFrame(animation); window.removeEventListener('keydown', keyDown); window.removeEventListener('keyup', keyUp); resetRef.current = null;
    };
  }, []);

  return (
    <main className="shell">
      <section className="game-frame" aria-label="Sunny Crestbound platform game">
        <canvas ref={canvasRef} className="game-canvas" width={VIEW_W} height={VIEW_H} tabIndex={0} aria-label="Platform game. Use arrows or A and D to move, Space to jump, and Shift to dash." />

        {screen !== 'title' && (
          <header className="hud">
            <div className="hud-brand"><span className="mini-sun">✦</span><strong>CRESTBOUND</strong></div>
            <div className="hud-stats">
              <span><b>{'◆'.repeat(hud.lives)}</b><small>LIVES</small></span>
              <span><b>{hud.sparks}/{hud.total}</b><small>LIGHT</small></span>
              <span><b>{formatTime(hud.time)}</b><small>TIME</small></span>
            </div>
            <div className="hud-actions">
              <button type="button" onClick={() => setMuted((value) => !value)} aria-label={muted ? 'Turn sound on' : 'Mute sound'}>{muted ? '🔇' : '🔊'}</button>
              <button type="button" onClick={togglePause} aria-label={screen === 'paused' ? 'Resume game' : 'Pause game'}>{screen === 'paused' ? '▶' : 'Ⅱ'}</button>
            </div>
          </header>
        )}

        {screen === 'title' && (
          <div className="title-card">
            <p className="kicker">SUNCREST GAMES</p>
            <h1>Sunny: <span>Crestbound</span></h1>
            <p>The city&apos;s light has fractured across the skyline. Run it down before the dark closes in.</p>
            <button type="button" onClick={startGame}>Start Run <span aria-hidden="true">→</span></button>
            <div className="control-hint"><span>← → / A D</span> Move <span>SPACE</span> Double jump <span>SHIFT / X</span> Dash</div>
            <p className="controller-note">Keyboard, gamepad, and touch supported.</p>
          </div>
        )}

        {screen === 'paused' && <div className="game-modal"><p>RUN PAUSED</p><h2>Catch your breath.</h2><button type="button" onClick={togglePause}>Resume</button><button className="secondary" type="button" onClick={() => setGameScreen('title')}>Quit Run</button></div>}
        {screen === 'over' && <div className="game-modal"><p>LIGHT LOST</p><h2>That route got you.</h2><p>Use the high paths, save your dash, and hit enemies from above.</p><button type="button" onClick={startGame}>Run It Back</button></div>}
        {screen === 'won' && (
          <div className="game-modal win-modal">
            <p>LIGHT RESTORED</p><h2>Skyline cleared.</h2>
            <div className="result-grid"><span><b>{formatTime(hud.time)}</b><small>FINISH</small></span><span><b>{hud.sparks}/{hud.total}</b><small>LIGHT</small></span><span><b>{hud.best ? formatTime(hud.best) : '—'}</b><small>BEST</small></span></div>
            <button type="button" onClick={startGame}>Beat Your Time</button>
          </div>
        )}

        {screen === 'playing' && (
          <div className="touch-controls" aria-label="Touch controls">
            <div><button type="button" aria-label="Move left" onPointerDown={() => press('left', true)} onPointerUp={() => press('left', false)} onPointerCancel={() => press('left', false)}>←</button><button type="button" aria-label="Move right" onPointerDown={() => press('right', true)} onPointerUp={() => press('right', false)} onPointerCancel={() => press('right', false)}>→</button></div>
            <div><button className="dash-control" type="button" aria-label="Dash" onPointerDown={() => press('dash', true)} onPointerUp={() => press('dash', false)} onPointerCancel={() => press('dash', false)}>DASH</button><button className="jump-control" type="button" aria-label="Jump" onPointerDown={() => press('jump', true)} onPointerUp={() => press('jump', false)} onPointerCancel={() => press('jump', false)}>JUMP</button></div>
          </div>
        )}
      </section>
    </main>
  );
}
