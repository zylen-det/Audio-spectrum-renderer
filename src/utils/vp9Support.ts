import {
  BufferTarget,
  CanvasSource,
  Output,
  WebMOutputFormat,
} from "mediabunny"

/**
 * Shared probe for "can this browser run the transparent WebM pipeline?".
 *
 * What the pipeline ACTUALLY needs (see videoWorker + mediabunny
 * ColorAlphaSplitter): plain VP9 encode (Profile 0) + WebGL2. Mediabunny
 * splits color/alpha itself and dual-encodes with `alpha: "discard"`, so
 * browser-native `VideoEncoder(alpha: "keep")` support is NOT required —
 * probing for it (as we used to) is a false negative on Chrome, which
 * rejects `alpha: "keep"` outright while handling this pipeline fine.
 *
 * "HW availability" verdict rule (agreed 2026-09-18):
 * `isConfigSupported` alone is not trustworthy in either direction —
 * it can report HW support that fails at real encode time (driver /
 * session / dual-GPU issues → worker falls back to MP4), and a static
 * probe never exercises the mediabunny dual-encode path the worker
 * actually uses. So each lane is judged by:
 *   static `isConfigSupported` passes  AND  a real 1-frame mediabunny
 *   `CanvasSource(vp9, alpha:"keep")` trial encode succeeds
 * (output finalizes, byte size above threshold). The static check is
 * still required for the HW lane: a `prefer-hardware` trial that
 * succeeds could otherwise be a silent software fallback, which the
 * static check (honest `false` on Chrome = really no HW) filters out.
 *
 * Usable from both the main thread (UI gating) and the render worker.
 */

export interface Vp9AlphaSupport {
  hardware: boolean
  software: boolean
}

// Plain VP9 Profile 0 8-bit 4:2:0 — the baseline every software/hardware
// VP9 encoder supports; mediabunny negotiates the exact profile itself.
const VP9_PROBE_CODEC = "vp09.00.10.08"
const VP9_PROBE_BITRATE = 5_000_000

let webgl2Cache: boolean | null = null
const supportCache = new Map<string, Vp9AlphaSupport>()

async function probeVp9(
  width: number,
  height: number,
  framerate: number,
  accel: "prefer-hardware" | "prefer-software",
): Promise<boolean> {
  try {
    if (typeof VideoEncoder === "undefined") return false
    const support = await VideoEncoder.isConfigSupported({
      codec: VP9_PROBE_CODEC,
      width,
      height,
      framerate,
      bitrate: VP9_PROBE_BITRATE,
      hardwareAcceleration: accel,
    } as VideoEncoderConfig)
    return support.supported === true
  } catch {
    return false
  }
}

// Real 1-frame encode through the exact pipeline the worker uses
// (mediabunny CanvasSource with vp9 + alpha:"keep" into WebM).
// Returns true only if configure + encode + finalize all succeed and
// the muxed output is larger than a header-only file.
// Runs at the requested render size: encoder capability is
// resolution-dependent, and 1 frame is cheap enough (~100-200ms).
// A rejection/timeout (e.g. no HW session, driver failure) = unavailable.
const TRIAL_TIMEOUT_MS = 20_000
const TRIAL_MIN_BYTES = 256

async function trialEncodeOneFrame(
  width: number,
  height: number,
  framerate: number,
  accel: "prefer-hardware" | "prefer-software",
): Promise<boolean> {
  const run = (async (): Promise<boolean> => {
    try {
      if (typeof VideoEncoder === "undefined" || typeof OffscreenCanvas === "undefined") return false

      const canvas = new OffscreenCanvas(width, height)
      const ctx = canvas.getContext("2d", { alpha: true })
      if (!ctx) return false
      // Non-trivial frame with real alpha content (an empty/fully
      // opaque frame could take encoder fast paths).
      ctx.clearRect(0, 0, width, height)
      ctx.fillStyle = "rgba(255,255,255,0.9)"
      ctx.fillRect(0, 0, width / 2, height)
      ctx.fillStyle = "rgba(0,0,0,0.25)"
      ctx.fillRect(width / 2, 0, width / 2, height)

      const target = new BufferTarget()
      const output = new Output({ target, format: new WebMOutputFormat() })
      const source = new CanvasSource(canvas, {
        codec: "vp9",
        bitrate: 500_000,
        alpha: "keep",
        hardwareAcceleration: accel,
        keyFrameInterval: 1,
      })
      output.addVideoTrack(source)
      await output.start()
      await source.add(0, 1 / framerate)
      source.close()
      await output.finalize()
      const bytes = (target as unknown as { buffer?: ArrayBuffer }).buffer?.byteLength ?? 0
      return bytes > TRIAL_MIN_BYTES
    } catch {
      return false
    }
  })()
  const timeout = new Promise<boolean>((resolve) => {
    setTimeout(() => resolve(false), TRIAL_TIMEOUT_MS)
  })
  return Promise.race([run, timeout])
}

export function hasWebGL2(): boolean {
  if (webgl2Cache !== null) return webgl2Cache
  let ok = false
  try {
    if (typeof OffscreenCanvas !== "undefined") {
      ok = !!new OffscreenCanvas(1, 1).getContext("webgl2")
    } else if (typeof document !== "undefined") {
      ok = !!document.createElement("canvas").getContext("webgl2")
    }
  } catch {
    ok = false
  }
  webgl2Cache = ok
  return ok
}

export async function checkVp9AlphaSupport(opts?: {
  width?: number
  height?: number
  framerate?: number
}): Promise<Vp9AlphaSupport> {
  const width = opts?.width ?? 1280
  const height = opts?.height ?? 720
  const framerate = opts?.framerate ?? 30
  const key = `${width}x${height}@${framerate}`
  const cached = supportCache.get(key)
  if (cached) return cached

  let result: Vp9AlphaSupport = { hardware: false, software: false }
  // No WebGL2 → mediabunny's ColorAlphaSplitter can't run → no transparency.
  if (hasWebGL2()) {
    // Layer 1: fast static screen. A `prefer-hardware → false` is an
    // honest "no HW" (Chrome); lanes failing here skip the trial.
    const [staticHw, staticSw] = await Promise.all([
      probeVp9(width, height, framerate, "prefer-hardware"),
      probeVp9(width, height, framerate, "prefer-software"),
    ])
    // Layer 2: real 1-frame encode through the exact pipeline the
    // worker uses. Catches driver/session failures that static
    // probing misses (would otherwise surface as FALLBACK_TO_MP4).
    const [trialHw, trialSw] = await Promise.all([
      staticHw ? trialEncodeOneFrame(width, height, framerate, "prefer-hardware") : Promise.resolve(false),
      staticSw ? trialEncodeOneFrame(width, height, framerate, "prefer-software") : Promise.resolve(false),
    ])
    result = { hardware: trialHw, software: trialSw }
  }
  supportCache.set(key, result)
  return result
}

/**
 * Returns true if transparent WebM is expected to work via the
 * mediabunny dual-encode path on this browser.
 */
export async function supportsVp9Alpha(opts?: {
  width?: number
  height?: number
  framerate?: number
}): Promise<boolean> {
  const result = await checkVp9AlphaSupport(opts)
  return result.hardware || result.software
}
