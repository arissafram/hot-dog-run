/** An image: a URL (same origin, CORS-enabled, or a data: URL). */
export type ImageSource = string;

export interface PlayerArt {
  run1?: ImageSource;
  run2?: ImageSource;
  jump?: ImageSource;
  /** Shown after a crash. */
  dead?: ImageSource;
  /** Height in px to draw the player at. Default: the images' own height. */
  height?: number;
}

export interface ObstacleArt {
  src: ImageSource;
  /** Height in px, or a [min, max] range picked at random. Keep it under ~70 so it can be jumped. Default [40, 60]. */
  height?: number | [number, number];
  /** How often it's picked relative to the others in its list. Default 1. */
  weight?: number;
}

export interface MountOptions {
  /** Player frames. Any you leave out use the default hot dog. */
  player?: PlayerArt;
  /** Regular obstacles. A list replaces the default grills. */
  obstacles?: Array<ImageSource | ObstacleArt>;
  /** Special obstacles: the first at 60 points, the second at 120, then mixed in often after 160. A list replaces the default; [] turns them off. */
  specials?: Array<ImageSource | ObstacleArt>;
  /** localStorage key for the high score. Default 'hot-dog-run-hi'. */
  storageKey?: string;
  /** What listens for clicks and taps. Default: the element. */
  pointerTarget?: EventTarget;
  /** Stop Space and Up from also scrolling the page while a run is going. Default false. */
  captureKeys?: boolean;
  /** false starts the game paused. Default true. */
  active?: boolean;
  /** Testing only: run through obstacles without crashing. */
  invincible?: boolean;
}

export interface HotDogRunGame {
  /** Freezes the game and ignores input (e.g. while it's off screen). */
  pause(): void;
  resume(): void;
  /** Removes the canvas and every listener. */
  destroy(): void;
}

/** Runs Hot Dog Run inside `el`, sized to el (up to 800px wide, 288-360px tall). */
export function mount(el: HTMLElement, options?: MountOptions): HotDogRunGame;

/** The <hot-dog-run> element, registered when the package is imported. */
export class HotDogRunElement extends HTMLElement {
  pause(): void;
  resume(): void;
}

declare global {
  interface HTMLElementTagNameMap {
    'hot-dog-run': HotDogRunElement;
  }
}
