// React entry (hot-dog-run/react): <HotDogRun />, a thin wrapper around mount().
// React and the game bundle stay external, so neither is shipped twice.
import { createElement, useEffect, useRef } from 'react';
import { mount } from 'hot-dog-run';

/**
 * Props are mount()'s options plus className, style and paused. Options are
 * read once, when the game starts; change the `key` prop to restart with new ones.
 */
export function HotDogRun({ className, style, paused = false, ...options }) {
  const boxRef = useRef(null);
  const gameRef = useRef(null);
  const optionsRef = useRef(options);

  useEffect(() => {
    const game = mount(boxRef.current, { ...optionsRef.current, active: !paused });
    gameRef.current = game;
    return () => {
      game.destroy();
      gameRef.current = null;
    };
  }, []);

  useEffect(() => {
    const game = gameRef.current;
    if (!game) return;
    if (paused) game.pause();
    else game.resume();
  }, [paused]);

  return createElement('div', {
    ref: boxRef,
    className,
    style: { maxWidth: 800, height: 360, ...style }
  });
}

export default HotDogRun;
