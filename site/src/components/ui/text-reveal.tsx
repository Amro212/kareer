"use client";
import * as React from "react";
import { animate } from "motion";
import { cn } from "@/lib/utils";
import { useMotionVisibility } from "@/lib/cojeev-motion/use-motion-visibility";
import { motionTokens, trackMotion } from "@/lib/cojeev-motion/choreography";
import { measureTextLines, type TextLine } from "@/lib/cojeev/text-lines";

export type TextRevealProps = Omit<React.HTMLAttributes<HTMLElement>, "children"> & {
  text: string;
  as?: "span" | "p" | "h1" | "h2" | "h3";
  /** Change this value to deliberately replay the reveal. */
  replayKey?: string | number;
  variant?: "rise" | "fade" | "soften" | "fold" | "bloom" | "scale" | "settle";
  /** Lines use the browser's actual wrapping; graphemes keep emoji and marks intact. */
  split?: "word" | "grapheme" | "text" | "line";
  /** Milliseconds between units. The total delay is capped for long text. */
  stagger?: number;
  direction?: "up" | "down";
  duration?: number;
  /** Site extension: coordinate groups with actual playback, not estimated delays. */
  onRevealStateChange?: (state: 'waiting' | 'playing' | 'done') => void;
};

function useTextLines(element: HTMLElement | null, text: string, active: boolean) {
  const [result, setResult] = React.useState<{ element: HTMLElement; text: string; lines: TextLine[] | null } | null>(null);
  React.useLayoutEffect(() => {
    const measure = element?.querySelector<HTMLElement>("[data-reveal-measure]");
    if (!active || !element || !measure) return;
    let disposed = false;
    let frame = 0;
    let measuredStyle = "";
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (disposed || !element.getBoundingClientRect().width) return;
        const style = getComputedStyle(measure);
        const signature = [measure.clientWidth, style.font, style.fontFamily, style.fontWeight, style.fontSize, style.fontStretch, style.fontVariationSettings, style.fontFeatureSettings, style.letterSpacing, style.wordSpacing, style.lineHeight, style.textTransform, style.textIndent, style.direction].join("|");
        if (signature === measuredStyle) return;
        measuredStyle = signature;
        const lines = measureTextLines(measure, text);
        setResult(previous => previous?.element === element && previous.text === text && JSON.stringify(previous.lines) === JSON.stringify(lines) ? previous : { element, text, lines });
      });
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(measure);
    // Typography can change its break points without changing the row count or
    // measured box size. Observe authored ancestor styles as well as geometry.
    const styles = new MutationObserver(schedule);
    for (let parent: HTMLElement | null = element; parent; parent = parent.parentElement) styles.observe(parent, { attributes: true });
    const fontsChanged = () => { measuredStyle = ""; schedule(); };
    document.fonts?.addEventListener("loadingdone", fontsChanged);
    void document.fonts?.ready.then(() => { if (!disposed) fontsChanged(); });
    window.addEventListener("resize", schedule, { passive: true });
    schedule();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      styles.disconnect();
      document.fonts?.removeEventListener("loadingdone", fontsChanged);
      window.removeEventListener("resize", schedule);
    };
  }, [active, text, element]);
  return result?.text === text && result.element === element ? result : null;
}

/** A bounded entrance. Text stays readable after playback, interruption, and without motion or JavaScript. */
export function TextReveal({ text, as: Tag = "span", replayKey = 0, variant = "rise", split = "word", stagger = 35, direction = "up", duration = 480, onRevealStateChange, className, ...props }: TextRevealProps) {
  const [phase, setPhase] = React.useState<'waiting' | 'playing' | 'done'>('waiting');
  React.useEffect(() => { onRevealStateChange?.(phase); }, [phase, onRevealStateChange]);
  const host = React.useRef<HTMLElement>(null);
  const [mountedElement, setMountedElement] = React.useState<HTMLElement | null>(null);
  const setHost = React.useCallback((element: HTMLElement | null) => { host.current = element; setMountedElement(element); }, []);
  const { enabled, inView } = useMotionVisibility(host, mountedElement);
  const played = React.useRef<string | null>(null);
  const token = JSON.stringify([text, replayKey, variant, split, direction]);
  const lineResult = useTextLines(mountedElement, text, split === "line");
  const segmenter = React.useMemo(() => new Intl.Segmenter(undefined, { granularity: "grapheme" }), []);
  React.useEffect(() => {
    if (!inView || !host.current) return;
    if (split === "line" && !lineResult) return;
    if (played.current === token) { setPhase('done'); return; }
    played.current = token;
    if (!enabled) { setPhase('done'); return; }
    const words = Array.from(host.current.querySelectorAll<HTMLElement>("[data-reveal-unit]"));
    if (!words.length) { setPhase('done'); return; }
    const milliseconds = Number.isFinite(duration) ? Math.min(1500, Math.max(0, duration)) : 480;
    if (milliseconds === 0) { setPhase('done'); return; }
    const requestedStep = Number.isFinite(stagger) ? Math.min(120, Math.max(0, stagger)) / 1000 : motionTokens.stagger;
    // Compress the entire sequence evenly, so long headings don't finish in a
    // single pile-up once the delay ceiling has been reached.
    const step = Math.min(requestedStep, .6 / Math.max(1, words.length - 1));
    const sign = direction === "up" ? 1 : -1;
    const scaled = variant === "bloom" || variant === "scale" || variant === "settle";
    const distance = variant === "settle" ? .12 : .28;
    const scale = variant === "bloom" ? [.86, 1.025, 1] : variant === "scale" ? [.96, 1] : variant === "settle" ? [1.04, 1] : [1, 1];
    setPhase('playing');
    let cancelled = false;
    const controls = animate(words, {
      "--reveal-opacity": [0, 1],
      "--reveal-y": variant !== "fade" && (!scaled || variant === "settle") ? [`${distance * sign}em`, "0em"] : ["0em", "0em"],
      "--reveal-blur": variant === "soften" ? ["5px", "0px"] : ["0px", "0px"],
      "--reveal-fold": variant === "fold" ? [`${-45 * sign}deg`, "0deg"] : ["0deg", "0deg"],
      "--reveal-scale": scale,
    }, {
      duration: milliseconds / 1000,
      delay: index => index * step,
      ease: [...motionTokens.ease.settle],
      "--reveal-scale": { inherit: true, times: variant === "bloom" ? [0, .7, 1] : [0, 1] },
    });
    const stop = trackMotion(controls);
    void controls.then(() => { if (!cancelled) setPhase('done'); });
    return () => {
      cancelled = true;
      stop();
      // Settle through the same Motion values so its queued render cannot
      // overwrite an inline cleanup with a half-revealed word on the next frame.
      const mounted = words.filter(word => word.isConnected);
      if (mounted.length) animate(mounted, { "--reveal-opacity": 1, "--reveal-y": "0em", "--reveal-blur": "0px", "--reveal-fold": "0deg", "--reveal-scale": 1 }, { duration: 0 });
    };
  }, [token, enabled, inView, duration, variant, stagger, direction, split, lineResult]);
  return <Tag {...props} ref={setHost} data-slot="text-reveal" data-reveal-state={phase} data-reveal-variant={variant} data-reveal-split={split} data-line-state={split === "line" ? !lineResult ? "measuring" : lineResult.lines ? "ready" : "prose" : undefined} data-motion-quiet={!enabled || !inView} className={cn("v-text-reveal", className)}>
    <span className="v-text-reveal__accessible">{text}</span>
    {split === "line" && <span aria-hidden="true" data-reveal-measure="">{text}</span>}
    <span aria-hidden="true" data-reveal-visual="">{split === "line" ? lineResult?.lines ? lineResult.lines.map(line => <span key={`${line.start}:${line.end}`} data-reveal-unit="" data-reveal-line="">{line.text || "\u200b"}</span>) : text : split === "text" ? text && <span data-reveal-unit="">{text}</span> : text.split(/(\s+)/).map((word, index) => !word || /^\s+$/.test(word) ? word : <span key={index} data-reveal-word="" {...(split === "word" ? { "data-reveal-unit": "" } : {})}>{split === "word" ? word : Array.from(segmenter.segment(word), ({ segment }, i) => <span key={i} data-reveal-unit="">{segment}</span>)}</span>)}</span>
  </Tag>;
}
