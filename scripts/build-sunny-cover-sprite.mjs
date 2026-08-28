import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../art-source/sunny-platformer-key-poses-v1.png', import.meta.url));
const output = fileURLToPath(new URL('../public/sunny-cover-motion-v1.png', import.meta.url));
const cell = 220;
const frames = [
  { name: 'run-a', left: 650, top: 30, width: 285, height: 285 },
  { name: 'run-b', left: 940, top: 35, width: 285, height: 285 },
  { name: 'launch', left: 455, top: 330, width: 285, height: 275 },
  { name: 'jump', left: 1215, top: 25, width: 290, height: 300 },
  { name: 'airborne', left: 745, top: 330, width: 300, height: 275 },
  { name: 'land', left: 220, top: 605, width: 315, height: 245 },
  { name: 'wave', left: 575, top: 590, width: 315, height: 255 },
  { name: 'thumbs', left: 950, top: 570, width: 315, height: 275 },
];

function isBackground(data, index) {
  const offset = index * 4;
  const red = data[offset];
  const green = data[offset + 1];
  const blue = data[offset + 2];
  return red > 218 && green > 214 && blue > 210 && Math.max(red, green, blue) - Math.min(red, green, blue) < 34;
}

function isolateCharacter(data, width, height) {
  const count = width * height;
  const exterior = new Uint8Array(count);
  const queue = [];
  const enqueue = (index) => {
    if (index < 0 || index >= count || exterior[index] || !isBackground(data, index)) return;
    exterior[index] = 1;
    queue.push(index);
  };

  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const index = queue[cursor];
    const x = index % width;
    const y = Math.floor(index / width);
    if (x > 0) enqueue(index - 1);
    if (x + 1 < width) enqueue(index + 1);
    if (y > 0) enqueue(index - width);
    if (y + 1 < height) enqueue(index + width);
  }

  const opaque = new Uint8Array(count);
  for (let index = 0; index < count; index += 1) opaque[index] = exterior[index] ? 0 : 1;

  const visited = new Uint8Array(count);
  let largest = [];
  for (let start = 0; start < count; start += 1) {
    if (!opaque[start] || visited[start]) continue;
    const component = [];
    const componentQueue = [start];
    visited[start] = 1;
    for (let cursor = 0; cursor < componentQueue.length; cursor += 1) {
      const index = componentQueue[cursor];
      component.push(index);
      const x = index % width;
      const y = Math.floor(index / width);
      for (let yy = Math.max(0, y - 1); yy <= Math.min(height - 1, y + 1); yy += 1) {
        for (let xx = Math.max(0, x - 1); xx <= Math.min(width - 1, x + 1); xx += 1) {
          const neighbor = yy * width + xx;
          if (!opaque[neighbor] || visited[neighbor]) continue;
          visited[neighbor] = 1;
          componentQueue.push(neighbor);
        }
      }
    }
    if (component.length > largest.length) largest = component;
  }

  const keep = new Uint8Array(count);
  for (const index of largest) keep[index] = 1;
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  for (let index = 0; index < count; index += 1) {
    data[index * 4 + 3] = keep[index] ? 255 : 0;
    if (!keep[index]) continue;
    const x = index % width;
    const y = Math.floor(index / width);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { data, bounds: { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 } };
}

const rendered = [];
for (const frame of frames) {
  const { data, info } = await sharp(source)
    .extract({ left: frame.left, top: frame.top, width: frame.width, height: frame.height })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const isolated = isolateCharacter(data, info.width, info.height);
  const character = await sharp(isolated.data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .extract(isolated.bounds)
    .resize({ width: 94, height: 94, fit: 'inside', withoutEnlargement: false })
    .resize({ width: 188, height: 188, fit: 'inside', kernel: sharp.kernel.nearest })
    .png()
    .toBuffer({ resolveWithObject: true });
  rendered.push({
    input: character.data,
    left: rendered.length * cell + Math.round((cell - character.info.width) / 2),
    top: cell - character.info.height - 8,
  });
}

await sharp({ create: { width: cell * frames.length, height: cell, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite(rendered)
  .png({ compressionLevel: 9 })
  .toFile(output);

console.log(`Created ${frames.length} Sunny animation frames at ${output}`);
