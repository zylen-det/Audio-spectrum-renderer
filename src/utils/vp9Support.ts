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
    return support.supported
  } catch {
    return false
  }
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
    const [hardware, software] = await Promise.all([
      probeVp9(width, height, framerate, "prefer-hardware"),
      probeVp9(width, height, framerate, "prefer-software"),
    ])
    result = { hardware, software }
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
