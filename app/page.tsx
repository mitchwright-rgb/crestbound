import CrestboundGame from './crestbound-game';
import { chicagoDayKey } from './game-rules';
import { effectiveDailyRoute } from '@/lib/daily-route-data';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const day = chicagoDayKey();
  const dailyRoute = await effectiveDailyRoute(day);
  return <CrestboundGame initialDay={day} initialDailyRoute={dailyRoute} />;
}
