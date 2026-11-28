import { useEffect, useRef, useState, type ReactElement } from 'react';
import { MotionSurface } from '@/components/ui/presence';
import { motionTokens } from '@/lib/cojeev-motion/choreography';
import { useMotionVisibility } from '@/lib/cojeev-motion/use-motion-visibility';

export function ScrollReveal({ children, delay = 0 }: { children: ReactElement; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const { enabled, inView } = useMotionVisibility(ref);
  const [phase, setPhase] = useState<'waiting' | 'playing' | 'done'>('waiting');
  useEffect(() => {
    if (phase === 'waiting' && inView) setPhase(enabled ? 'playing' : 'done');
    else if (phase === 'playing' && !enabled) setPhase('done');
  }, [enabled, inView, phase]);

  const playing = enabled && phase === 'playing';
  return <MotionSurface
    asChild
    ref={ref}
    preset="soften"
    initial={false}
    data-scroll-reveal={phase}
    onFocusCapture={() => setPhase('done')}
    animate={playing
      ? { '--entrance-opacity': [0, 1], '--presence-y': ['22px', '0px'], '--presence-blur': ['2px', '0px'] }
      : { '--presence-y': '0px', '--presence-blur': '0px' }}
    transition={playing ? {
      type: 'tween', duration: 0.7, delay, ease: [...motionTokens.ease.enter],
      // Clear the blur early so text is sharp during the rest of the fade.
      '--presence-blur': { inherit: true, duration: motionTokens.duration.quick },
    } : { duration: 0 }}
    onAnimationComplete={() => { if (phase === 'playing') setPhase('done'); }}
  >{children}</MotionSurface>;
}
