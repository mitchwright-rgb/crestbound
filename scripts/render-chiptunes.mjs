import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { musicTrackForCourse } from '../app/game-rules.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sampleRate = 22050;
const loops = 4;

function voice(type, phase) {
  const cycle = phase % 1;
  if (type === 'square') return cycle < .5 ? 1 : -1;
  if (type === 'triangle') return 1 - 4 * Math.abs(cycle - .5);
  return Math.sin(cycle * Math.PI * 2);
}

function renderTrack(track) {
  const stepSeconds = track.tempoMs / 1000;
  const totalSteps = track.melody.length * loops;
  const totalSamples = Math.ceil(totalSteps * stepSeconds * sampleRate);
  const samples = new Int16Array(totalSamples);
  let noise = 0x51f15e;

  for (let index = 0; index < totalSamples; index += 1) {
    const time = index / sampleRate;
    const absoluteStep = Math.floor(time / stepSeconds);
    const step = absoluteStep % track.melody.length;
    const inStep = (time % stepSeconds) / stepSeconds;
    const leadFrequency = track.melody[step];
    const bassFrequency = track.bass[Math.floor(step / 4) % track.bass.length];
    const leadEnvelope = Math.min(1, inStep * 22) * Math.max(0, 1 - Math.max(0, inStep - .68) / .32);
    const bassEnvelope = Math.max(0, 1 - (step % 4) / 4) * .55;
    const lead = leadFrequency ? voice(track.lead, time * leadFrequency) * leadEnvelope * .42 : 0;
    const bass = voice(track.bassVoice, time * bassFrequency) * bassEnvelope * .28;
    noise = (noise * 1664525 + 1013904223) >>> 0;
    const hat = step % 2 === 1 && inStep < .08 ? ((noise / 0xffffffff) * 2 - 1) * (1 - inStep / .08) * .09 : 0;
    const kickPhase = inStep * stepSeconds;
    const kick = step % 4 === 0 && kickPhase < .09 ? Math.sin(kickPhase * Math.PI * 2 * (92 - kickPhase * 480)) * (1 - kickPhase / .09) * .18 : 0;
    samples[index] = Math.max(-32767, Math.min(32767, Math.round((lead + bass + hat + kick) * 32767)));
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

await mkdir(resolve(root, 'public/audio'), { recursive: true });
for (let course = 0; course < 3; course += 1) {
  const track = musicTrackForCourse(course);
  await writeFile(resolve(root, `public${track.src}`), renderTrack(track));
}
