import type { CourseData, Enemy, Platform, Spark } from './course-generator';

const SECTION_W = 760;
const SECTION_COUNT = 20;
const CHECKPOINTS = [270, 2400, 4680, 7720, 10000, 12300];
const CHECKPOINT_CLEARANCE = 78;

function randomUnit(seed: number, weekIndex: number, section: number, channel: number) {
  let value = (seed | 0) ^ Math.imul(weekIndex + 31, 0x45d9f3b) ^ Math.imul(section + 43, 0x27d4eb2d) ^ Math.imul(channel + 59, 0x165667b1);
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}
function elevated(platforms: Platform[], x: number, y: number, w: number, moving = false, phase = 0) {
  platforms.push({ x, y, w, h: 24, moving, phase, baseY: moving ? y : undefined });
}

export function buildSeriesCourse(weekIndex: number, seed: number): CourseData {
  const platforms: Platform[] = [];
  const spikeZones: CourseData['spikeZones'] = [];
  const sparkSeed: Spark[] = [];
  const enemySeed: Enemy[] = [];

  for (let section = 0; section < SECTION_COUNT; section += 1) {
    const x = section * SECTION_W;
    const pattern = (Math.floor(randomUnit(seed, weekIndex, section, 0) * 5) + weekIndex) % 5;
    const groundWidths = [670, 585, 520, 625, 555];
    const width = section === SECTION_COUNT - 1 ? 960 : groundWidths[(pattern + section) % groundWidths.length];
    platforms.push({ x, y: 620, w: width, h: 120 });
    sparkSeed.push({ x: x + 104, y: 554 });

    // Each week gets a distinct rooftop grammar while retaining the same
    // checkpoint and recovery guarantees.
    if (pattern === 0) {
      elevated(platforms, x + 105, 500, 165);
      elevated(platforms, x + 330, 405, 185);
      elevated(platforms, x + 565, 315, 125);
    } else if (pattern === 1) {
      elevated(platforms, x + 130, 430, 210, section % 2 === 0, section * .47);
      elevated(platforms, x + 430, 350, 205);
    } else if (pattern === 2) {
      elevated(platforms, x + 90, 490, 145);
      elevated(platforms, x + 285, 325, 230, true, section * .63);
      elevated(platforms, x + 570, 470, 130);
    } else if (pattern === 3) {
      elevated(platforms, x + 120, 370, 155);
      elevated(platforms, x + 350, 470, 175);
      elevated(platforms, x + 575, 290, 120, section % 3 === 1, section * .79);
    } else {
      elevated(platforms, x + 175, 520, 170);
      elevated(platforms, x + 390, 420, 170);
      elevated(platforms, x + 590, 340, 110);
    }

    if (section > 0 && (section + weekIndex) % 3 === 1 && width > 500) {
      spikeZones.push({ x: x + 250, y: 596, w: 104 + (pattern % 2) * 24 });
    }

    const elevatedPlatforms = platforms.filter((platform) => platform.x >= x && platform.x < x + SECTION_W && platform.y < 600);
    elevatedPlatforms.forEach((platform, platformIndex) => {
      sparkSeed.push({
        x: platform.x + platform.w / 2,
        y: platform.y - 50,
        secret: platformIndex === elevatedPlatforms.length - 1 && (section + weekIndex) % 4 === 2,
      });
    });

    if (section > 0 && (section + weekIndex) % 2 === 0 && width >= 500) {
      const enemyX = x + Math.min(width - 86, 245 + pattern * 42);
      enemySeed.push({ x: enemyX, y: 570, minX: x + 60, maxX: x + width - 60, speed: 125 + weekIndex * 8 + (section % 4) * 15, dir: section % 2 ? -1 : 1, alive: true });
    }
  }

  // Explicit checkpoint pads preserve the recovery guarantees even when a
  // week's ground pattern places a gap nearby.
  CHECKPOINTS.forEach((checkpoint) => {
    if (!platforms.some((platform) => platform.y >= 600 && checkpoint >= platform.x && checkpoint <= platform.x + platform.w - 40)) {
      platforms.push({ x: checkpoint - 70, y: 620, w: 230, h: 120 });
    }
  });

  const rallyPoints = [4, 9, 14].map((section) => {
    const targetX = section * SECTION_W + 370;
    const surface = platforms
      .filter((platform) => targetX >= platform.x && targetX <= platform.x + platform.w)
      .sort((a, b) => a.y - b.y)[0];
    return { x: targetX, y: (surface?.y ?? 620) - 54 };
  });

  return {
    platforms: platforms.sort((a, b) => a.x - b.x || a.y - b.y),
    spikeZones: spikeZones.filter((spike) => !CHECKPOINTS.some((checkpoint) => checkpoint + CHECKPOINT_CLEARANCE > spike.x && checkpoint - CHECKPOINT_CLEARANCE < spike.x + spike.w)),
    sparkSeed: sparkSeed.sort((a, b) => a.x - b.x),
    enemySeed,
    checkpoints: CHECKPOINTS,
    rallyPoints,
  };
}

// Kept as an alias so stored Declarations tests and old imports remain compatible.
export const buildDeclarationsCourse = buildSeriesCourse;
