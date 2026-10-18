import { NextResponse } from 'next/server';
import { findSeriesUrl, parseMessageDetails, parseSeriesMessages } from '@/lib/suncrest-messages';
import { effectiveActiveSeriesForDay } from '@/lib/series-route-data';

function localDay() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
}

export async function GET(request: Request) {
  const active = await effectiveActiveSeriesForDay(localDay());
  if (!active) return NextResponse.json({ active: false });
  const requestedWeekId = new URL(request.url).searchParams.get('weekId');
  const requestedIndex = requestedWeekId ? active.series.weeks.findIndex((week) => week.id === requestedWeekId) : active.weekIndex;
  if (requestedIndex < 0 || requestedIndex > active.weekIndex) return NextResponse.json({ active: true, available: false }, { status: 404 });
  const selectedWeek = active.series.weeks[requestedIndex];
  const fetchSuncrest = (url: string) => fetch(url, {
    cache: 'no-store',
    headers: { 'User-Agent': 'Crestbound/1.0 (+https://suncrest.org)' },
  });
  try {
    if (selectedWeek.messageUrl) {
      const messageResponse = await fetchSuncrest(selectedWeek.messageUrl);
      if (!messageResponse.ok) throw new Error('Message page unavailable');
      const summary = { title: selectedWeek.title, date: selectedWeek.sunday, speaker: '', url: selectedWeek.messageUrl };
      return NextResponse.json({ active: true, available: true, message: parseMessageDetails(await messageResponse.text(), summary) });
    }
    let seriesUrl = active.series.seriesUrl;
    if (!seriesUrl || seriesUrl === active.series.messageUrl) {
      const indexResponse = await fetchSuncrest(active.series.messageUrl);
      if (!indexResponse.ok) throw new Error('Message index unavailable');
      seriesUrl = findSeriesUrl(await indexResponse.text(), active.series.name);
    }
    if (!seriesUrl) return NextResponse.json({ active: true, available: false });
    const seriesResponse = await fetchSuncrest(seriesUrl);
    if (!seriesResponse.ok) throw new Error('Series page unavailable');
    const summaries = parseSeriesMessages(await seriesResponse.text());
    const summary = summaries.find((message) => message.date === selectedWeek.sunday);
    if (!summary) return NextResponse.json({ active: true, available: false });
    const messageResponse = await fetchSuncrest(summary.url);
    if (!messageResponse.ok) throw new Error('Message page unavailable');
    return NextResponse.json({ active: true, available: true, message: parseMessageDetails(await messageResponse.text(), summary) });
  } catch {
    return NextResponse.json({ active: true, available: false });
  }
}
