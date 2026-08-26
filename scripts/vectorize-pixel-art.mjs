import fs from 'node:fs/promises';
import sharp from 'sharp';

const [input, output, title = 'Pixel art'] = process.argv.slice(2);
if (!input || !output) throw new Error('Usage: node scripts/vectorize-pixel-art.mjs input.png output.svg [title]');

const size = 418;
const { data, info } = await sharp(input)
  .resize(size, size, { fit: 'fill', kernel: sharp.kernel.nearest })
  .png({ palette: true, colours: 48, dither: 0 })
  .raw()
  .toBuffer({ resolveWithObject: true });

const rectangles = [];
let active = new Map();
for (let y = 0; y < info.height; y += 1) {
  const nextActive = new Map();
  let x = 0;
  while (x < info.width) {
    const offset = (y * info.width + x) * info.channels;
    const color = `#${data[offset].toString(16).padStart(2, '0')}${data[offset + 1].toString(16).padStart(2, '0')}${data[offset + 2].toString(16).padStart(2, '0')}`;
    let end = x + 1;
    while (end < info.width) {
      const next = (y * info.width + end) * info.channels;
      if (data[next] !== data[offset] || data[next + 1] !== data[offset + 1] || data[next + 2] !== data[offset + 2]) break;
      end += 1;
    }
    const width = end - x;
    const key = `${color}:${x}:${width}`;
    const previous = active.get(key);
    nextActive.set(key, previous ? { ...previous, height: previous.height + 1 } : { color, x, y, width, height: 1 });
    x = end;
  }
  for (const [key, rectangle] of active) if (!nextActive.has(key)) rectangles.push(rectangle);
  active = nextActive;
}
rectangles.push(...active.values());

const paths = new Map();
for (const rectangle of rectangles) {
  const segments = paths.get(rectangle.color) ?? [];
  segments.push(`M${rectangle.x} ${rectangle.y}h${rectangle.width}v${rectangle.height}H${rectangle.x}z`);
  paths.set(rectangle.color, segments);
}

const escapedTitle = title.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const body = [...paths.entries()].map(([fill, segments]) => `<path fill="${fill}" d="${segments.join('')}"/>`).join('');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1254" height="1254" viewBox="0 0 ${size} ${size}" preserveAspectRatio="xMidYMid meet" shape-rendering="crispEdges"><title>${escapedTitle}</title>${body}</svg>`;
await fs.writeFile(output, svg);
