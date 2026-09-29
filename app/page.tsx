import CrestboundGame from './crestbound-game';
import { chicagoDayKey } from './game-rules';
import { effectiveDailyRoute } from '@/lib/daily-route-data';
import { effectiveActiveSeriesForDay } from '@/lib/series-route-data';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const day = chicagoDayKey();
  const [dailyRoute, activeSeries] = await Promise.all([effectiveDailyRoute(day), effectiveActiveSeriesForDay(day)]);
  return <CrestboundGame initialDay={day} initialDailyRoute={dailyRoute} initialActiveSeries={activeSeries} />;
}
