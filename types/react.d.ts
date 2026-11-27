import type { CSSProperties } from 'react';
import type { MountOptions } from './index';

export interface HotDogRunProps extends Omit<MountOptions, 'active'> {
  className?: string;
  style?: CSSProperties;
  /** Pause or resume the game. Default false. */
  paused?: boolean;
}

/** Options are read once, on mount; change `key` to restart with new ones. */
export function HotDogRun(props: HotDogRunProps): JSX.Element;
export default HotDogRun;
