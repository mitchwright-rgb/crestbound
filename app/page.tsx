import CrestboundGame from './crestbound-game';
import { chicagoDayKey } from './game-rules';

export const dynamic = 'force-dynamic';

export default function Page() {
  return <CrestboundGame initialDay={chicagoDayKey()} />;
}
