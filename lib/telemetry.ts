const allowedKeys = new Set(['mode', 'modifierId', 'reason', 'lives', 'checkpoint', 'progress', 'elapsedMs', 'orientation', 'device', 'seriesId', 'weekId', 'signatureCount', 'score', 'lights', 'lightTotal']);

export function normalizeEventMetadata(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const normalized: Record<string, string | number> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!allowedKeys.has(key)) continue;
    if (typeof entry === 'number' && Number.isFinite(entry)) normalized[key] = Math.round(entry);
    else if (typeof entry === 'string' && entry.length <= 32) normalized[key] = entry;
  }
  return Object.keys(normalized).length ? JSON.stringify(normalized) : null;
}
