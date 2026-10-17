import { useEffect, useRef, useState, type ReactElement } from 'react';
import { MotionSurface } from '@/components/ui/presence';
import { motionTokens } from '@/lib/cojeev-motion/choreography';
import { useMotionVisibility } from '@/lib/cojeev-motion/use-motion-visibility';

export function ScrollReveal({ children, delay = 0, duration = 0.7, active, onComplete }: { children: ReactElement; delay?: number; duration?: number; active?: boolean; onComplete?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const { enabled, inView } = useMotionVisibility(ref);
  const [phase, setPhase] = useState<'waiting' | 'playing' | 'done'>('waiting');
  useEffect(() => {
    if (phase === 'waiting' && (active ?? inView)) setPhase(enabled ? 'playing' : 'done');
    else if (phase === 'playing' && !enabled) setPhase('done');
  }, [enabled, inView, phase, active]);
  useEffect(() => { if (phase === 'done') onComplete?.(); }, [phase, onComplete]);

  return <MotionSurface
    asChild
    ref={ref}
    preset="soften"
    initial={false}
    data-scroll-reveal={phase}
    onFocusCapture={() => setPhase('done')}
    animate={enabled && phase === 'playing'
      ? { '--entrance-opacity': [0, 1], '--presence-y': ['22px', '0px'], '--presence-blur': ['2px', '0px'] }
      : { '--presence-y': '0px', '--presence-blur': '0px' }}
    transition={{ type: 'tween', duration, delay, ease: [...motionTokens.ease.enter] }}
    onAnimationComplete={() => { if (phase === 'playing') setPhase('done'); }}
  >{children}</MotionSurface>;
}
