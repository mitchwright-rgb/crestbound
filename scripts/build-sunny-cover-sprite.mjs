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

  const cleaned = removeChromaBackground(data, info.width, info.height);
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
