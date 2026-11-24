"use client";

import { useEffect, useRef, useState } from "react";

type PerfSong = {
  title: string;
  artist: string | null;
  lyrics: string;
  chorus: string | null;
};

// Full-screen auto-scrolling "performance" view for singing along.
export default function Teleprompter({
  song,
  onClose,
}: {
  song: PerfSong;
  onClose: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const lastRef = useRef<number>(0);
  const accRef = useRef<number>(0); // sub-pixel accumulator

  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<number>(() => {
    try {
      const s = Number(localStorage.getItem("perf-speed"));
      return s >= 8 && s <= 300 ? s : 40;
    } catch {
      return 40;
    }
  });
  const [fontSize, setFontSize] = useState<number>(() => {
    try {
      const s = Number(localStorage.getItem("perf-font"));
      return s >= 18 && s <= 80 ? s : 32;
    } catch {
      return 32;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("perf-speed", String(speed));
    } catch {}
  }, [speed]);
  useEffect(() => {
    try {
      localStorage.setItem("perf-font", String(fontSize));
    } catch {}
  }, [fontSize]);

  // Auto-scroll loop (pixels per second = speed).
  useEffect(() => {
    lastRef.current = 0;
    function step(ts: number) {
      const el = scrollRef.current;
      if (el && playing) {
        if (!lastRef.current) lastRef.current = ts;
        const dt = (ts - lastRef.current) / 1000;
        lastRef.current = ts;
        accRef.current += speed * dt;
        const whole = Math.floor(accRef.current);
        if (whole >= 1) {
          accRef.current -= whole;
          el.scrollTop += whole;
          if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1) {
            setPlaying(false);
          }
        }
      } else {
        lastRef.current = ts;
      }
      rafRef.current = requestAnimationFrame(step);
    }
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, speed]);

  // Keep the screen awake during a performance (where supported).
  useEffect(() => {
    let lock: { release: () => void } | null = null;
    const request = async () => {
      try {
        const nav = navigator as Navigator & {
          wakeLock?: { request: (t: string) => Promise<{ release: () => void }> };
        };
        lock = (await nav.wakeLock?.request("screen")) ?? null;
      } catch {}
    };
    request();
    const onVis = () => {
      if (document.visibilityState === "visible") request();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      try {
        lock?.release();
      } catch {}
    };
  }, []);

  function restart() {
    const el = scrollRef.current;
    if (el) el.scrollTop = 0;
    accRef.current = 0;
    setPlaying(true);
  }

  return (
    <div className="tp-overlay">
      <div
        className="tp-scroll"
        ref={scrollRef}
        onClick={() => setPlaying((p) => !p)}
      >
        <div className="tp-inner" style={{ fontSize: `${fontSize}px` }}>
          <div className="tp-title">
            {song.title}
            {song.artist ? ` — ${song.artist}` : ""}
          </div>
          {song.chorus && <div className="tp-chorus">{song.chorus}</div>}
          <div className="tp-lyrics">{song.lyrics}</div>
          <div className="tp-end">● ● ●</div>
        </div>
      </div>

      <div className="tp-controls" onClick={(e) => e.stopPropagation()}>
        <button className="tp-btn" onClick={onClose} title="סגור">
          ✕
        </button>
        <button className="tp-btn" onClick={restart} title="התחל מחדש">
          ⟲
        </button>
        <button
          className="tp-btn tp-play"
          onClick={() => setPlaying((p) => !p)}
          title={playing ? "עצור" : "נגן"}
        >
          {playing ? "⏸" : "▶"}
        </button>

        <div className="tp-group">
          <button
            className="tp-btn"
            onClick={() => setSpeed((s) => Math.max(8, s - 6))}
            title="איטי יותר"
          >
            🐢
          </button>
          <span className="tp-val">קצב {speed}</span>
          <button
            className="tp-btn"
            onClick={() => setSpeed((s) => Math.min(300, s + 6))}
            title="מהיר יותר"
          >
            🐇
          </button>
        </div>

        <div className="tp-group">
          <button
            className="tp-btn"
            onClick={() => setFontSize((f) => Math.max(18, f - 2))}
            title="טקסט קטן יותר"
          >
            א−
          </button>
          <button
            className="tp-btn"
            onClick={() => setFontSize((f) => Math.min(80, f + 2))}
            title="טקסט גדול יותר"
          >
            א+
          </button>
        </div>
      </div>

      <input
        className="tp-slider"
        type="range"
        min={8}
        max={300}
        step={2}
        value={speed}
        onChange={(e) => setSpeed(Number(e.target.value))}
        aria-label="קצב גלילה"
      />
    </div>
  );
}
