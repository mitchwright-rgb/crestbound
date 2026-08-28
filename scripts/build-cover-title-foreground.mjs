import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const variants = [
  {
    source: '../public/crestbound-square-background-v1.png',
    output: '../public/crestbound-square-title-foreground-v1.png',
    region: { left: 208, top: 666, width: 858, height: 238 },
  },
  {
    source: '../public/crestbound-landscape-background-v1.png',
    output: '../public/crestbound-landscape-title-foreground-v1.png',
    region: { left: 540, top: 184, width: 1092, height: 294 },
  },
];

for (const variant of variants) {
  const source = fileURLToPath(new URL(variant.source, import.meta.url));
  const output = fileURLToPath(new URL(variant.output, import.meta.url));
  const metadata = await sharp(source).metadata();
  if (!metadata.width || !metadata.height) throw new Error(`Missing dimensions for ${source}`);

  const { data, info } = await sharp(source)
    .extract(variant.region)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixelCount = info.width * info.height;
  const dark = new Uint8Array(pixelCount);

  // The generated cover art has a nearly-black connected title outline. Use
  // that component to derive the exact vertical silhouette instead of
  // compositing the old rectangular crop (which carried skyline pixels over
  // Sunny while he moved behind the wordmark).
  for (let pixel = 0, channel = 0; pixel < pixelCount; pixel += 1, channel += 3) {
    dark[pixel] = data[channel] < 40 && data[channel + 1] < 42 && data[channel + 2] < 45 ? 1 : 0;
  }

  const seen = new Uint8Array(pixelCount);
  const stack = new Int32Array(pixelCount);
  let titleComponent = [];

  for (let seed = 0; seed < pixelCount; seed += 1) {
    if (!dark[seed] || seen[seed]) continue;
    let stackLength = 0;
    stack[stackLength++] = seed;
    seen[seed] = 1;
    const component = [];

    while (stackLength) {
      const pixel = stack[--stackLength];
      component.push(pixel);
      const x = pixel % info.width;
      const y = Math.floor(pixel / info.width);
      const neighbors = [
        x ? pixel - 1 : -1,
        x + 1 < info.width ? pixel + 1 : -1,
        y ? pixel - info.width : -1,
        y + 1 < info.height ? pixel + info.width : -1,
      ];

      for (const neighbor of neighbors) {
        if (neighbor >= 0 && dark[neighbor] && !seen[neighbor]) {
          seen[neighbor] = 1;
          stack[stackLength++] = neighbor;
        }
      }
    }

    if (component.length > titleComponent.length) titleComponent = component;
  }

  if (!titleComponent.length) throw new Error(`Could not isolate the title outline in ${source}`);

  const minY = new Int32Array(info.width);
  const maxY = new Int32Array(info.width);
  minY.fill(0x7fffffff);
  maxY.fill(-1);

  for (const pixel of titleComponent) {
    const x = pixel % info.width;
    const y = Math.floor(pixel / info.width);
    minY[x] = Math.min(minY[x], y);
    maxY[x] = Math.max(maxY[x], y);
  }

  // Bridge only the tiny empty columns created by pixel-art highlights and
  // letter spacing; wide transparent gaps remain transparent.
  const originalMinY = Int32Array.from(minY);
  const originalMaxY = Int32Array.from(maxY);
  for (let x = 0; x < info.width; x += 1) {
    if (originalMaxY[x] >= 0) continue;
    let left = x - 1;
    let right = x + 1;
    while (left >= 0 && x - left <= 8 && originalMaxY[left] < 0) left -= 1;
    while (right < info.width && right - x <= 8 && originalMaxY[right] < 0) right += 1;
    if (left >= 0 && right < info.width && originalMaxY[left] >= 0 && originalMaxY[right] >= 0) {
      minY[x] = Math.min(originalMinY[left], originalMinY[right]);
      maxY[x] = Math.max(originalMaxY[left], originalMaxY[right]);
    }
  }

  const foregroundPixels = Buffer.alloc(pixelCount * 4);
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const pixel = y * info.width + x;
      const sourceChannel = pixel * 3;
      const outputChannel = pixel * 4;
      foregroundPixels[outputChannel] = data[sourceChannel];
      foregroundPixels[outputChannel + 1] = data[sourceChannel + 1];
      foregroundPixels[outputChannel + 2] = data[sourceChannel + 2];
      foregroundPixels[outputChannel + 3] = maxY[x] >= 0 && y >= minY[x] && y <= maxY[x] ? 255 : 0;
    }
  }

  const foreground = await sharp(foregroundPixels, {
    raw: { width: info.width, height: info.height, channels: 4 },
  }).png().toBuffer();
  await sharp({
    create: {
      width: metadata.width,
      height: metadata.height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: foreground, left: variant.region.left, top: variant.region.top }])
    .png({ compressionLevel: 9 })
    .toFile(output);
}

console.log('Created square and landscape title foreground layers.');
