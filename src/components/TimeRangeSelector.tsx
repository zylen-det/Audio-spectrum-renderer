import React, { useEffect, useMemo, useRef, useState } from "react";
import { MIN_TRIM_SPAN, splitSecsForDisplay } from "../utils/trimRange";

interface TimeRangeSelectorProps {
  audioBuffer: AudioBuffer | null;
  currentTime: number;
  duration: number;
  rangeStart: number;
  rangeEnd: number;
  onRangeChange: (start: number, end: number) => void;
  onSeek: (time: number) => void;
}

interface Peak {
  min: number;
  max: number;
}

const NUM_PEAKS = 1200;

// End holder release jumps to 5s before the end edge so the boundary can
// be auditioned (a jump to exactly end would loop back instantly while
// playing and show nothing while paused at the loop point).
const END_RELEASE_LEAD = 5;

export function TimeRangeSelector({
  audioBuffer,
  currentTime,
  duration,
  rangeStart,
  rangeEnd,
  onRangeChange,
  onSeek,
}: TimeRangeSelectorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  // One active gesture at a time (second finger ignored).
  const dragIdRef = useRef<number | null>(null);
  // Static base-waveform cache: rebuilt only when peaks/size change,
  // so redraws during drag are a cheap blit + highlight pass.
  const baseRef = useRef<{ peaks: Peak[]; w: number; h: number; canvas: HTMLCanvasElement } | null>(null);

  // One-finger gesture tracking on window. Detaches before onUp runs, so a
  // throwing onUp can never wedge the drag state.
  const trackGesture = (
    e: React.PointerEvent,
    onMove: (ev: PointerEvent) => void,
    onUp: () => void,
  ) => {
    if (dragIdRef.current !== null) return;
    const id = e.pointerId;
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      onMove(ev);
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      dragIdRef.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      onUp();
    };
    dragIdRef.current = id;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  // Mirror latest props for window-level move/up handlers.
  const liveRef = useRef({
    duration,
    onRangeChange,
    onSeek,
  });
  liveRef.current = {
    duration,
    onRangeChange,
    onSeek,
  };

  const disabled = !audioBuffer || !(duration > 0);

  // Peaks computed once per audio buffer — no extra decode.
  const peaks = useMemo<Peak[] | null>(() => {
    if (!audioBuffer) return null;
    const ch = audioBuffer.getChannelData(0);
    const step = Math.max(1, Math.floor(ch.length / NUM_PEAKS));
    const arr: Peak[] = new Array(NUM_PEAKS);
    for (let i = 0; i < NUM_PEAKS; i++) {
      const s = i * step;
      const e = Math.min(s + step, ch.length);
      let min = 0;
      let max = 0;
      for (let j = s; j < e; j++) {
        const v = ch[j];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      arr[i] = { min, max };
    }
    return arr;
  }, [audioBuffer]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      setSize({ w: rect.width, h: rect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Waveform render: blit cached base + highlight active range.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks || size.w === 0 || size.h === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const width = Math.round(size.w * dpr);
    const height = Math.round(size.h * dpr);
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let base = baseRef.current;
    if (!base || base.peaks !== peaks || base.w !== width || base.h !== height) {
      const off = document.createElement("canvas");
      off.width = width;
      off.height = height;
      const bctx = off.getContext("2d");
      if (bctx) {
        const centerY = height / 2;
        const amp = (height / 2) * 0.85;
        const step = width / (peaks.length - 1);
        bctx.fillStyle = "#27272a";
        bctx.beginPath();
        for (let i = 0; i < peaks.length; i++) {
          const x = i * step;
          const y = centerY - peaks[i].max * amp;
          if (i === 0) bctx.moveTo(x, y);
          else bctx.lineTo(x, y);
        }
        for (let i = peaks.length - 1; i >= 0; i--) {
          const x = i * step;
          const y = centerY - peaks[i].min * amp;
          bctx.lineTo(x, y);
        }
        bctx.closePath();
        bctx.fill();
      }
      base = { peaks, w: width, h: height, canvas: off };
      baseRef.current = base;
    }

    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(base.canvas, 0, 0);

    // Active range highlight.
    if (duration > 0) {
      const centerY = height / 2;
      const amp = (height / 2) * 0.85;
      const step = width / (peaks.length - 1);
      const startX = (rangeStart / duration) * width;
      const endX = (rangeEnd / duration) * width;
      ctx.save();
      ctx.beginPath();
      ctx.rect(startX, 0, Math.max(1, endX - startX), height);
      ctx.clip();
      const grad = ctx.createLinearGradient(0, 0, 0, height);
      grad.addColorStop(0, "#fafafa");
      grad.addColorStop(0.5, "#d4d4d8");
      grad.addColorStop(1, "#a1a1aa");
      ctx.fillStyle = grad;
      ctx.beginPath();
      for (let i = 0; i < peaks.length; i++) {
        const x = i * step;
        const y = centerY - peaks[i].max * amp;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      for (let i = peaks.length - 1; i >= 0; i--) {
        const x = i * step;
        const y = centerY - peaks[i].min * amp;
        ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }, [peaks, rangeStart, rangeEnd, duration, size]);

  const ratioToTime = (ratio: number) =>
    Math.min(Math.max(0, ratio), 1) * liveRef.current.duration;

  const trackArea = (el: HTMLElement, clientX: number) => {
    const rect = el.getBoundingClientRect();
    return { rect, ratio: (clientX - rect.left) / rect.width };
  };

  // Start holder: drag resizes the start edge, release jumps to the new start.
  const onLeftDown = (e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    const el = containerRef.current;
    if (!el) return;
    const s0 = rangeStart;
    const e0 = rangeEnd;
    const x0 = e.clientX;
    let last = s0;
    trackGesture(
      e,
      (ev) => {
        const live = liveRef.current;
        const { rect } = trackArea(el, ev.clientX);
        const ns = Math.min(
          Math.max(0, s0 + ((ev.clientX - x0) / rect.width) * live.duration),
          e0 - MIN_TRIM_SPAN,
        );
        last = ns;
        live.onRangeChange(ns, e0);
      },
      () => {
        liveRef.current.onSeek(last);
      },
    );
  };

  // End holder: drag resizes the end edge, release jumps to the new end.
  const onRightDown = (e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    const el = containerRef.current;
    if (!el) return;
    const s0 = rangeStart;
    const e0 = rangeEnd;
    const x0 = e.clientX;
    let last = e0;
    trackGesture(
      e,
      (ev) => {
        const live = liveRef.current;
        const { rect } = trackArea(el, ev.clientX);
        const ne = Math.max(
          Math.min(
            live.duration,
            e0 + ((ev.clientX - x0) / rect.width) * live.duration,
          ),
          s0 + MIN_TRIM_SPAN,
        );
        last = ne;
        live.onRangeChange(s0, ne);
      },
      () => {
        const live = liveRef.current;
        live.onSeek(Math.max(s0, last - END_RELEASE_LEAD));
      },
    );
  };

  // Brush body: drag moves the whole section, release jumps to the new start.
  const onBodyDown = (e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    const el = containerRef.current;
    if (!el) return;
    const s0 = rangeStart;
    const e0 = rangeEnd;
    const span = e0 - s0;
    const x0 = e.clientX;
    const y0 = e.clientY;
    let last = s0;
    let moved = false;
    trackGesture(
      e,
      (ev) => {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 4) moved = true;
        const live = liveRef.current;
        const { rect } = trackArea(el, ev.clientX);
        const delta = ((ev.clientX - x0) / rect.width) * live.duration;
        let ns = s0 + delta;
        let ne = e0 + delta;
        if (ns < 0) {
          ns = 0;
          ne = span;
        }
        if (ne > live.duration) {
          ne = live.duration;
          ns = live.duration - span;
        }
        last = ns;
        live.onRangeChange(ns, ne);
      },
      () => {
        if (moved) liveRef.current.onSeek(last);
      },
    );
  };

  // Background: press/drag scrubs playback directly.
  const onBackgroundDown = (e: React.PointerEvent) => {
    if (disabled) return;
    const el = containerRef.current;
    if (!el) return;
    e.preventDefault();
    const seekAt = (clientX: number) => {
      const { ratio } = trackArea(el, clientX);
      liveRef.current.onSeek(ratioToTime(ratio));
    };
    seekAt(e.clientX);
    trackGesture(
      e,
      (ev) => seekAt(ev.clientX),
      () => {},
    );
  };

  const playheadPct =
    duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;
  const brushLeftPct = duration > 0 ? (rangeStart / duration) * 100 : 0;
  const brushWidthPct =
    duration > 0 ? ((rangeEnd - rangeStart) / duration) * 100 : 0;

  const startDisp = splitSecsForDisplay(rangeStart);
  const endDisp = splitSecsForDisplay(rangeEnd);

  const commitStart = (mm: number, ss: number) => {
    const total = mm * 60 + ss;
    const s = Math.min(Math.max(0, total), rangeEnd - MIN_TRIM_SPAN);
    onRangeChange(s, rangeEnd);
  };
  const commitEnd = (mm: number, ss: number) => {
    const total = mm * 60 + ss;
    const e = Math.max(Math.min(duration, total), rangeStart + MIN_TRIM_SPAN);
    onRangeChange(rangeStart, e);
  };

  return (
    <div className={disabled ? "opacity-50 pointer-events-none" : ""}>
      <div
        ref={containerRef}
        onPointerDown={onBackgroundDown}
        className="relative h-20 sm:h-24 bg-zinc-950 cursor-pointer select-none touch-none"
      >
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />

        {/* Selection brush */}
        {duration > 0 && (
          <div
            onPointerDown={onBodyDown}
            className="absolute top-0 bottom-0 border-x-2 border-zinc-100 bg-zinc-100/10 cursor-grab active:cursor-grabbing"
            style={{ left: `${brushLeftPct}%`, width: `${brushWidthPct}%` }}
          >
            <div
              onPointerDown={onLeftDown}
              className="group absolute right-full top-0 bottom-0 w-7 cursor-ew-resize"
            >
              <div className="absolute right-0 top-0 bottom-0 w-4 bg-zinc-100 border-y border-l border-zinc-900/80 rounded-l-md opacity-90 group-hover:opacity-100 group-hover:bg-white transition-all" />
            </div>
            <div
              onPointerDown={onRightDown}
              className="group absolute left-full top-0 bottom-0 w-7 cursor-ew-resize"
            >
              <div className="absolute left-0 top-0 bottom-0 w-4 bg-zinc-100 border-y border-r border-zinc-900/80 rounded-r-md opacity-90 group-hover:opacity-100 group-hover:bg-white transition-all" />
            </div>
          </div>
        )}

        {/* Playhead (shared progress state) */}
        <div
          className="absolute top-0 bottom-0 w-0 pointer-events-none"
          style={{ left: `${playheadPct}%` }}
        >
          <div className="absolute -top-0 left-1/2 -translate-x-1/2 w-3 h-3 bg-zinc-100 rounded-b-md" />
          <div className="w-[2px] h-full bg-zinc-100 -translate-x-1/2 shadow-[0_0_8px_rgba(255,255,255,0.7)]" />
        </div>
      </div>

      {/* mm:ss / mm:ss numeric row */}
      <div className="flex items-center justify-center gap-1.5 mt-2">
        <TimeCell value={startDisp.mm} onCommit={(v) => commitStart(v, startDisp.ss)} disabled={disabled} />
        <span className="text-zinc-500 text-xs sm:text-sm font-mono">:</span>
        <TimeCell value={startDisp.ss} onCommit={(v) => commitStart(startDisp.mm, v)} disabled={disabled} />
        <span className="text-zinc-500 text-xs sm:text-sm font-mono mx-2">/</span>
        <TimeCell value={endDisp.mm} onCommit={(v) => commitEnd(v, endDisp.ss)} disabled={disabled} />
        <span className="text-zinc-500 text-xs sm:text-sm font-mono">:</span>
        <TimeCell value={endDisp.ss} onCommit={(v) => commitEnd(endDisp.mm, v)} disabled={disabled} />
      </div>
    </div>
  );
}

function TimeCell({
  value,
  onCommit,
  disabled,
}: {
  value: number;
  onCommit: (v: number) => void;
  disabled: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? String(value).padStart(2, "0");

  return (
    <input
      type="text"
      inputMode="numeric"
      value={shown}
      disabled={disabled}
      onFocus={() => setDraft(String(value).padStart(2, "0"))}
      onChange={(e) => {
        if (/^\d{0,3}$/.test(e.target.value)) setDraft(e.target.value);
      }}
      onBlur={() => {
        if (draft !== null && draft !== "") {
          const parsed = parseInt(draft, 10);
          if (!Number.isNaN(parsed)) onCommit(parsed);
        }
        setDraft(null);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className="w-12 bg-zinc-800/50 text-center outline-none text-xs sm:text-sm font-mono rounded px-1 py-1 border border-zinc-700/50 text-zinc-200 focus:border-zinc-500 transition-colors disabled:opacity-50"
    />
  );
}
