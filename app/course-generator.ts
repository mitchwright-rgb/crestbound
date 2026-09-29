import type { ModifierId } from './game-rules';
import type { RouteConditionId } from '@/lib/daily-route';

export type Platform = { x: number; y: number; w: number; h: number; moving?: boolean; phase?: number; baseY?: number };
export type Spark = { x: number; y: number; taken?: boolean; secret?: boolean; storm?: boolean };
export type Enemy = { x: number; y: number; minX: number; maxX: number; speed: number; dir: number; alive: boolean };
export type RallyPoint = { x: number; y: number; triggered?: boolean };
export type CourseData = { platforms: Platform[]; spikeZones: Array<{ x: number; y: number; w: number }>; sparkSeed: Spark[]; enemySeed: Enemy[]; checkpoints: number[]; rallyPoints?: RallyPoint[] };

const SECTION_W = 760;
const SECTION_COUNT = 20;
const CHECKPOINTS = [270, 2400, 4680, 7720, 10000, 12300];
const CHECKPOINT_CLEARANCE = 72;

function randomUnit(seed: number, courseIndex: number, section: number, channel: number) {
  let value = (seed | 0) ^ Math.imul(courseIndex + 11, 0x45d9f3b) ^ Math.imul(section + 17, 0x27d4eb2d) ^ Math.imul(channel + 23, 0x165667b1);
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

function elevated(platforms: Platform[], x: number, y: number, w: number, moving = false, phase = 0) {
  platforms.push({ x, y, w, h: 24, moving, phase, baseY: moving ? y : undefined });
}

export function buildSeededCourse(courseIndex: number, modifierId: ModifierId, seed: number, conditionId: RouteConditionId = 'standard'): CourseData {
  const platforms: Platform[] = [];
  const spikeZones: Array<{ x: number; y: number; w: number }> = [];
  const sparkSeed: Spark[] = [];
  const enemySeed: Enemy[] = [];

  for (let section = 0; section < SECTION_COUNT; section += 1) {
    const x = section * SECTION_W;
    const pattern = Math.floor(randomUnit(seed, courseIndex, section, 0) * 4);
    const widthSets = courseIndex === 0 ? [690, 610, 540, 650] : courseIndex === 1 ? [560, 470, 390, 520] : [700, 610, 520, 650];
    const width = section === SECTION_COUNT - 1 ? 960 : widthSets[(pattern + section) % widthSets.length];
    platforms.push({ x, y: 620, w: width, h: 120 });
    sparkSeed.push({ x: x + 104, y: 554 });

    if (courseIndex === 0) {
      // Goldline mixes readable stairs, high-road shortcuts, and occasional moving links.
      if (pattern === 0) {
        elevated(platforms, x + 190, 500, 190);
        elevated(platforms, x + 430, 392, 180);
      } else if (pattern === 1) {
        elevated(platforms, x + 120, 430, 180);
        elevated(platforms, x + 390, 330, 170, section % 3 === 1, section * .53);
      } else if (pattern === 2) {
        elevated(platforms, x + 250, 520, 170, true, section * .41);
        elevated(platforms, x + 490, 410, 160);
      } else {
        elevated(platforms, x + 100, 505, 170);
        elevated(platforms, x + 335, 405, 180);
        elevated(platforms, x + 565, 315, 145);
      }
      if (section > 0 && section % 4 === 2) spikeZones.push({ x: x + 150, y: 596, w: Math.min(130, width - 220) });
    } else if (courseIndex === 1) {
      // Crosswind favors long aerial chains and moving platforms over safe ground.
      const highY = 300 + (pattern % 2) * 38;
      elevated(platforms, x + 105, 470 - (pattern % 2) * 38, 165, section % 3 === 1, section * .47);
      elevated(platforms, x + 335, 370 - (pattern % 3) * 26, 170, section % 2 === 0, section * .69);
      elevated(platforms, x + 555, highY, 145, pattern !== 0, section * .31);
      if (pattern === 3) elevated(platforms, x + 245, 255, 135, true, section * .83);
      if (section > 0 && section % 3 === 2 && width > 440) spikeZones.push({ x: x + 190, y: 596, w: 105 });
    } else {
      // Night Shift alternates low tunnels, hazard lanes, and enemy-heavy upper escapes.
      if (pattern === 0) {
        elevated(platforms, x + 135, 470, 270);
        elevated(platforms, x + 470, 350, 170);
      } else if (pattern === 1) {
        elevated(platforms, x + 90, 390, 190);
        elevated(platforms, x + 370, 500, 230);
      } else if (pattern === 2) {
        elevated(platforms, x + 180, 520, 175);
        elevated(platforms, x + 420, 410, 175, section % 5 === 0, section * .57);
      } else {
        elevated(platforms, x + 95, 485, 150);
        elevated(platforms, x + 310, 385, 160);
        elevated(platforms, x + 535, 285, 150);
      }
      if (section > 0 && section % 2 === 0) spikeZones.push({ x: x + 285, y: 596, w: Math.min(pattern % 2 ? 100 : 145, width - 340) });
    }

    const sectionPlatforms = platforms.filter((platform) => platform.x >= x && platform.x < x + SECTION_W && platform.y < 600);
    if (conditionId === 'moving_city' && section > 0 && sectionPlatforms.length) {
      const movingPlatform = sectionPlatforms[(section + pattern) % sectionPlatforms.length];
      movingPlatform.moving = true;
      movingPlatform.baseY = movingPlatform.y;
      movingPlatform.phase = section * .71 + pattern;
    }
    sectionPlatforms.forEach((platform, platformIndex) => {
      sparkSeed.push({ x: platform.x + platform.w / 2, y: platform.y - 50, secret: platformIndex === sectionPlatforms.length - 1 && section % 4 === 1 });
    });

    if (conditionId === 'light_rush' && section > 0) {
      const bonusPlatform = sectionPlatforms[section % Math.max(1, sectionPlatforms.length)];
      sparkSeed.push(bonusPlatform
        ? { x: bonusPlatform.x + Math.min(bonusPlatform.w - 35, 58 + (section % 3) * 36), y: bonusPlatform.y - 50, secret: section % 4 === 0 }
        : { x: x + Math.min(width - 70, 320), y: 554 });
    }
    if (conditionId === 'hidden_light' && section > 0 && sectionPlatforms.length) {
      const highest = [...sectionPlatforms].sort((a, b) => a.y - b.y)[0];
      sparkSeed.push({ x: highest.x + Math.max(36, highest.w - 44), y: highest.y - 78, secret: true });
    }

    const enemyFrequency = courseIndex === 2 ? 1 : courseIndex === 1 ? 2 : 3;
    if (section > 0 && section % enemyFrequency === 0 && width >= 470) {
      const enemyX = x + Math.min(width - 90, 270 + pattern * 45);
      enemySeed.push({ x: enemyX, y: 570, minX: x + 60, maxX: x + width - 60, speed: 110 + courseIndex * 34 + (section % 4) * 16, dir: section % 2 ? -1 : 1, alive: true });
    }
    if (conditionId === 'rooftop_rumble' && section > 0 && section % 2 === 1 && width >= 470) {
      const enemyX = x + Math.min(width - 100, 165 + pattern * 42);
      enemySeed.push({ x: enemyX, y: 570, minX: x + 70, maxX: x + width - 70, speed: 138 + courseIndex * 24 + (section % 3) * 18, dir: section % 2 ? -1 : 1, alive: true });
    }
    if (conditionId === 'storm_chase' && section > 0 && section % 2 === 0 && width >= 470) {
      const enemyX = x + Math.min(width - 92, 210 + pattern * 48);
      enemySeed.push({ x: enemyX, y: 570, minX: x + 60, maxX: x + width - 60, speed: 185 + courseIndex * 22 + (section % 3) * 20, dir: section % 4 ? -1 : 1, alive: true });
      sparkSeed.push({ x: Math.max(x + 110, enemyX - 76), y: 535, storm: true });
    }
  }

  if (conditionId === 'checkpoint_charge') {
    CHECKPOINTS.slice(1, -1).forEach((checkpoint, index) => sparkSeed.push({ x: checkpoint + 92, y: 535 - (index % 2) * 42, storm: true }));
  }

  if (modifierId === 'sparkstorm') {
    const candidates = sparkSeed.filter((spark) => spark.y < 540 && !spark.secret);
    const step = Math.max(1, Math.floor(candidates.length / 16));
    for (let index = 0; index < candidates.length && index / step < 16; index += step) {
      const source = candidates[index];
      sparkSeed.push({ x: source.x + 34, y: source.y - 30, storm: true });
    }
  }

  return {
    platforms,
    spikeZones: spikeZones.filter((spike) => spike.w >= 60 && !CHECKPOINTS.some((checkpoint) => checkpoint + CHECKPOINT_CLEARANCE > spike.x && checkpoint - CHECKPOINT_CLEARANCE < spike.x + spike.w)),
    sparkSeed: sparkSeed.sort((a, b) => a.x - b.x),
    enemySeed,
    checkpoints: CHECKPOINTS,
  };
}

export function courseSignature(course: CourseData) {
  return course.platforms.map((platform) => `${platform.x}:${platform.y}:${platform.w}:${platform.moving ? 1 : 0}`).join('|');
}

export function maximumGroundGap(course: CourseData) {
  const ground = course.platforms.filter((platform) => platform.y >= 600).sort((a, b) => a.x - b.x);
  let maximum = 0;
  for (let index = 1; index < ground.length; index += 1) maximum = Math.max(maximum, ground[index].x - (ground[index - 1].x + ground[index - 1].w));
  return maximum;
}

export function checkpointIsSupported(course: CourseData, checkpoint: number) {
  return course.platforms.some((platform) => platform.y >= 600 && checkpoint >= platform.x && checkpoint <= platform.x + platform.w - 40);
}

export function checkpointHasClearLanding(course: CourseData, checkpoint: number) {
  return !course.spikeZones.some((spike) => checkpoint + CHECKPOINT_CLEARANCE > spike.x && checkpoint - CHECKPOINT_CLEARANCE < spike.x + spike.w);
}
