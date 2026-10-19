import type { IconType } from 'react-icons';
import { FiBookOpen, FiCode, FiCompass, FiHome, FiRefreshCw } from 'react-icons/fi';
import { LuGamepad2 } from 'react-icons/lu';
import type { PlaceId } from './places';

// Feather strokes, and Lucide's gamepad (Feather has none) for Play.
export const PLACE_ICON: Record<PlaceId, IconType> = {
  today: FiHome,
  learn: FiBookOpen,
  explore: FiCompass,
  practice: FiCode,
  play: LuGamepad2,
  review: FiRefreshCw,
};
