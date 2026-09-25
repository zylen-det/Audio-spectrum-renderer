export const MIN_TRIM_SPAN = 0.1;

export interface TrimRange {
  start: number;
  end: number;
}

/** Normalize raw trimStart/trimEnd (seconds) against duration.
 *  trimEnd <= 0 or > duration means "full length".
 *  Always returns start < end within [0, duration].
 */
export function resolveTrimRange(
  trimStart: number,
  trimEnd: number,
  duration: number,
): TrimRange {
  if (!(duration > 0)) return { start: 0, end: 0 };

  let s = Number.isFinite(trimStart) && trimStart > 0 ? trimStart : 0;
  let e =
    Number.isFinite(trimEnd) && trimEnd > 0 ? Math.min(trimEnd, duration) : duration;
  s = Math.min(Math.max(0, s), duration);
  e = Math.min(Math.max(0, e), duration);

  if (e - s < MIN_TRIM_SPAN) {
    s = Math.max(0, e - MIN_TRIM_SPAN);
    e = Math.min(duration, s + MIN_TRIM_SPAN);
    if (e - s < 0) {
      s = 0;
      e = duration;
    }
  }
  return { start: s, end: e };
}

/** Split float seconds into display { mm, ss } rounded to integer seconds. */
export function splitSecsForDisplay(totalSeconds: number): {
  mm: number;
  ss: number;
} {
  const r = Math.max(0, Math.round(totalSeconds));
  return { mm: Math.floor(r / 60), ss: r % 60 };
}
