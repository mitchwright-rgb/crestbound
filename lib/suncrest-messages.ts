export type MessageSummary = { title: string; date: string; speaker: string; url: string };
export type MessageDetails = MessageSummary & { description: string; discussionGuideUrl: string | null; readingGuideUrl: string | null };

const decode = (value: string) => value
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&#39;|&apos;/g, "'")
  .replace(/&quot;/g, '"')
  .replace(/&bull;|&bullet;/g, '•')
  .replace(/<[^>]+>/g, '')
  .replace(/\s+/g, ' ')
  .trim();

function dateKey(value: string) {
  const parsed = new Date(`${value} 12:00:00 UTC`);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

export function parseSeriesMessages(html: string): MessageSummary[] {
  return [...html.matchAll(/<a class="sp-media-item" href="([^"]+)">([\s\S]*?)<\/a>/g)].flatMap((match) => {
    const title = match[2].match(/class="sp-media-title">([\s\S]*?)<\/div>/)?.[1];
    const subtitle = match[2].match(/class="sp-media-subtitle">([\s\S]*?)<\/div>/)?.[1];
    if (!title || !subtitle) return [];
    const parts = decode(subtitle).split('•').map((part) => part.trim());
    return [{ title: decode(title), date: dateKey(parts[0]), speaker: parts[1] ?? '', url: new URL(match[1], 'https://suncrest.org').toString() }];
  });
}

export function parseMessageDetails(html: string, summary: MessageSummary): MessageDetails {
  const meta = html.match(/<meta name="description" content="([\s\S]*?)"\s*\/>/)?.[1] ?? '';
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1] ?? summary.url;
  const guide = (label: string) => html.match(new RegExp(`<a[^>]+href="([^"]+)"[^>]+data-label="${label}"`, 'i'))?.[1] ?? null;
  const description = decode(meta).replace(/([.!?])([A-Z])/g, '$1 $2');
  return { ...summary, url: decode(canonical), description, discussionGuideUrl: guide('Discussion Guide'), readingGuideUrl: guide('Reading Guide') };
}
