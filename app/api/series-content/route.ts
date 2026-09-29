import { NextResponse } from 'next/server';
import { activeSeriesForDay } from '@/app/series-routes';
import { parseMessageDetails, parseSeriesMessages } from '@/lib/suncrest-messages';

function localDay() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
}

export async function GET(request: Request) {
  const active = activeSeriesForDay(localDay());
  if (!active) return NextResponse.json({ active: false });
  const requestedWeekId = new URL(request.url).searchParams.get('weekId');
  const requestedIndex = requestedWeekId ? active.series.weeks.findIndex((week) => week.id === requestedWeekId) : active.weekIndex;
  if (requestedIndex < 0 || requestedIndex > active.weekIndex) return NextResponse.json({ active: true, available: false }, { status: 404 });
  const selectedWeek = active.series.weeks[requestedIndex];
  try {
    if (!active.series.seriesUrl) return NextResponse.json({ active: true, available: false });
    const seriesResponse = await fetch(active.series.seriesUrl, { headers: { 'User-Agent': 'Crestbound/1.0 (+https://suncrest.org)' } });
    if (!seriesResponse.ok) throw new Error('Series page unavailable');
    const summaries = parseSeriesMessages(await seriesResponse.text());
    const summary = summaries.find((message) => message.date === selectedWeek.sunday);
    if (!summary) return NextResponse.json({ active: true, available: false });
    const messageResponse = await fetch(summary.url, { headers: { 'User-Agent': 'Crestbound/1.0 (+https://suncrest.org)' } });
    if (!messageResponse.ok) throw new Error('Message page unavailable');
    return NextResponse.json({ active: true, available: true, message: parseMessageDetails(await messageResponse.text(), summary) });
  } catch {
    return NextResponse.json({ active: true, available: false });
  }
}
