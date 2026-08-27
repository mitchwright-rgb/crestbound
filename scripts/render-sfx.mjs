import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sampleRate = 22050;

function oscillator(type, phase) {
  const cycle = phase % 1;
  if (type === 'square') return cycle < .5 ? 1 : -1;
  if (type === 'triangle') return 1 - 4 * Math.abs(cycle - .5);
  if (type === 'saw') return cycle * 2 - 1;
  return Math.sin(cycle * Math.PI * 2);
}

function noteFrequency(note, time) {
  if (typeof note.frequency === 'function') return note.frequency(time / note.duration);
  return note.frequency;
}

function render(notes, duration, noiseAmount = 0) {
  const totalSamples = Math.ceil(duration * sampleRate);
  const samples = new Int16Array(totalSamples);
  let noise = 0x751c47;

  for (let index = 0; index < totalSamples; index += 1) {
    const time = index / sampleRate;
    let mixed = 0;
    for (const note of notes) {
      const local = time - note.start;
      if (local < 0 || local >= note.duration) continue;
      const attack = Math.min(1, local / Math.min(.012, note.duration * .2));
      const release = Math.max(0, 1 - local / note.duration);
      const envelope = attack * release * release;
      mixed += oscillator(note.type ?? 'square', local * noteFrequency(note, local)) * envelope * (note.gain ?? .42);
    }
    noise = (noise * 1664525 + 1013904223) >>> 0;
    const hiss = ((noise / 0xffffffff) * 2 - 1) * noiseAmount * Math.max(0, 1 - time / duration);
    samples[index] = Math.max(-32767, Math.min(32767, Math.round((mixed + hiss) * 32767)));
  }

  const dataBytes = samples.length * 2;
  const wav = Buffer.alloc(44 + dataBytes);
  wav.write('RIFF', 0); wav.writeUInt32LE(36 + dataBytes, 4); wav.write('WAVE', 8);
  wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(dataBytes, 40);
  for (let index = 0; index < samples.length; index += 1) wav.writeInt16LE(samples[index], 44 + index * 2);
  return wav;
}

const effects = {
  jump: {
    duration: .19,
    notes: [{ start: 0, duration: .19, type: 'square', gain: .38, frequency: (progress) => 245 + progress * 470 }],
  },
  dash: {
    duration: .2,
    noise: .11,
    notes: [
      { start: 0, duration: .2, type: 'saw', gain: .28, frequency: (progress) => 235 - progress * 145 },
      { start: .02, duration: .14, type: 'square', gain: .14, frequency: (progress) => 430 - progress * 250 },
    ],
  },
  light: {
    duration: .28,
    notes: [
      { start: 0, duration: .11, frequency: 740, gain: .3 },
      { start: .065, duration: .12, frequency: 988, gain: .32 },
      { start: .13, duration: .15, frequency: 1245, gain: .34 },
    ],
  },
  fall: {
    duration: .48,
    notes: [
      { start: 0, duration: .48, type: 'square', gain: .31, frequency: (progress) => 540 - progress * 445 },
      { start: .03, duration: .4, type: 'triangle', gain: .16, frequency: (progress) => 360 - progress * 270 },
    ],
  },
  hurt: {
    duration: .28,
    noise: .12,
    notes: [
      { start: 0, duration: .16, type: 'square', gain: .35, frequency: (progress) => 205 - progress * 105 },
      { start: .055, duration: .2, type: 'saw', gain: .22, frequency: (progress) => 145 - progress * 65 },
    ],
  },
  checkpoint: {
    duration: .43,
    notes: [
      { start: 0, duration: .16, frequency: 392, gain: .27 },
      { start: .1, duration: .18, frequency: 587, gain: .29 },
      { start: .2, duration: .23, frequency: 784, gain: .32 },
    ],
  },
  win: {
    duration: .95,
    notes: [
      { start: 0, duration: .2, frequency: 392, gain: .26 },
      { start: .11, duration: .2, frequency: 523, gain: .27 },
      { start: .22, duration: .22, frequency: 659, gain: .29 },
      { start: .34, duration: .24, frequency: 784, gain: .3 },
      { start: .5, duration: .45, frequency: 1047, gain: .34 },
      { start: .5, duration: .45, type: 'triangle', frequency: 523, gain: .2 },
    ],
  },
};

await mkdir(resolve(root, 'public/audio'), { recursive: true });
for (const [name, effect] of Object.entries(effects)) {
  await writeFile(resolve(root, `public/audio/sfx-${name}.wav`), render(effect.notes, effect.duration, effect.noise ?? 0));
}
