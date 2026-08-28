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

  const foreground = await sharp(source).extract(variant.region).png().toBuffer();
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
