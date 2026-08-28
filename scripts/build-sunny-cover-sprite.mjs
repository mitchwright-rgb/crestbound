import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../art-source/sunny-cover-motion-source-v3.png', import.meta.url));
const output = fileURLToPath(new URL('../public/sunny-cover-motion-v3.png', import.meta.url));
const columns = 5;
const rows = 5;
const frameSize = 240;

const metadata = await sharp(source).metadata();
if (!metadata.width || !metadata.height) throw new Error('Sunny animation source has no dimensions.');

const sourceCellWidth = Math.floor(metadata.width / columns);
const sourceCellHeight = Math.floor(metadata.height / rows);

function removeChromaBackground(data, width, height) {
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4;
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    const magentaStrength = Math.min(red, blue) - green;

    // Remove the flat chroma fill and blended edge pixels while preserving white eyes and shoes.
    if (red > 150 && blue > 135 && magentaStrength > 42) {
      data[offset + 3] = 0;
      continue;
    }

    // Neutralize any final purple spill without softening the crisp pixel-art silhouette.
    if (blue > green + 26 && red > green + 30) {
      data[offset] = Math.max(0, red - Math.round((blue - green) * 0.55));
      data[offset + 2] = green;
    }
  }
  return data;
}

function keepLargestCharacter(data, width, height) {
  const pixels = width * height;
  const visited = new Uint8Array(pixels);
  let largest = [];

  for (let start = 0; start < pixels; start += 1) {
    if (visited[start] || data[start * 4 + 3] === 0) continue;
    const component = [];
    const queue = [start];
    visited[start] = 1;

    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const index = queue[cursor];
      component.push(index);
      const x = index % width;
      const y = Math.floor(index / width);
      for (let yy = Math.max(0, y - 1); yy <= Math.min(height - 1, y + 1); yy += 1) {
        for (let xx = Math.max(0, x - 1); xx <= Math.min(width - 1, x + 1); xx += 1) {
          const neighbor = yy * width + xx;
          if (visited[neighbor] || data[neighbor * 4 + 3] === 0) continue;
          visited[neighbor] = 1;
          queue.push(neighbor);
        }
      }
    }

    if (component.length > largest.length) largest = component;
  }

  const keep = new Uint8Array(pixels);
  for (const index of largest) keep[index] = 1;
  for (let index = 0; index < pixels; index += 1) {
    if (!keep[index]) data[index * 4 + 3] = 0;
  }
  return data;
}

const rendered = [];
for (let frame = 0; frame < columns * rows; frame += 1) {
  const column = frame % columns;
  const row = Math.floor(frame / columns);
  const { data, info } = await sharp(source)
    .extract({
      left: column * sourceCellWidth,
      top: row * sourceCellHeight,
      width: sourceCellWidth,
      height: sourceCellHeight,
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const cleaned = keepLargestCharacter(
    removeChromaBackground(data, info.width, info.height),
    info.width,
    info.height,
  );
  const frameBuffer = await sharp(cleaned, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .resize(frameSize, frameSize, { kernel: sharp.kernel.nearest })
    .png({ compressionLevel: 9, palette: true })
    .toBuffer();

  rendered.push({ input: frameBuffer, left: frame * frameSize, top: 0 });
}

await sharp({
  create: {
    width: frameSize * columns * rows,
    height: frameSize,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite(rendered)
  .png({ compressionLevel: 9, palette: true })
  .toFile(output);

console.log(`Created ${columns * rows} clean Sunny animation frames at ${output}`);
