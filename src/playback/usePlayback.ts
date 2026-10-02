import { useCallback, useEffect, useState } from "react";
import { tokenMs } from "../stage/motion";

/** One step lasts long enough for the flowchart line to travel and the node to settle. */
const stepMs = () => tokenMs("--motion-duration-xxlong") * 2;

export function usePlayback(length: number) {
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const clamp = useCallback((index: number) => Math.max(0, Math.min(Math.max(0, length - 1), index)), [length]);

  useEffect(() => { setCurrent((index) => clamp(index)); if (length < 2) setPlaying(false); }, [clamp, length]);
  useEffect(() => {
    if (!playing) return;
    const interval = stepMs() / speed;
    if (!interval) return;
    const timer = window.setInterval(() => setCurrent((index) => {
      if (index >= length - 1) { setPlaying(false); return index; }
      return index + 1;
    }), interval);
    return () => clearInterval(timer);
  }, [length, playing, speed]);

  const atEnd = current >= length - 1;
  return {
    current,
    playing,
    speed,
    setCurrent: (index: number) => setCurrent(clamp(index)),
    setSpeed,
    // Playing from the last step replays from the start.
    toggle: () => {
      if (!playing && atEnd && length > 1) setCurrent(0);
      setPlaying((value) => !value);
    },
    back: () => setCurrent((index) => clamp(index - 1)),
    forward: () => setCurrent((index) => clamp(index + 1)),
    first: () => setCurrent(0),
    last: () => setCurrent(clamp(length - 1)),
    pause: () => setPlaying(false),
    reset: () => { setCurrent(0); setPlaying(false); },
  };
}
