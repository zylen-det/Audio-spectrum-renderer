/**
 * Shared probe for "can this browser actually encode H.264 with a
 * hardware preference?" (the opaque MP4 pipeline).
 *
 * Verdict rule (agreed 2026-09-18), mirroring vp9Support.ts:
 * each H.264 profile is judged by
 *   static `isConfigSupported(prefer-hardware)` passes  AND  a real
 *   1-frame `VideoEncoder` trial (configure + encode + flush) yields
 *   output.
 * A static-only `true` is not enough: `hardwareAcceleration` is a hint
 * the browser may silently ignore, and driver/session failures only
 * surface at real encode time.
 *
 * NOTE: unlike the transparent-WebM path, an MP4 HW miss is harmless —
 * the worker falls back to software H.264 internally and still outputs
 * a correct MP4 (see runVideoProcessingWithMP4). This probe exists so
 * the UI ("WebCodec (Hardware)" option) reflects reality instead of
 * offering HW that will silently run in software.
 *
 * Usable from both the main thread (UI gating) and the render worker.
 */

// Same candidate order as the MP4 pipeline in videoWorker.ts —
// high profiles first, Baseline last as the universal fallback.
export const H264_CODEC_CANDIDATES: string[] = [
  "avc1.640028",
  "avc1.64001F",
  "avc1.4D4020",
  "avc1.4D401F",
  "avc1.42E01F",
  "avc1.42001e",
]

const H264_PROBE_BITRATE = 5_000_000
const TRIAL_TIMEOUT_MS = 20_000

export interface H264HwSupport {
  /** True only if a prefer-hardware config really encoded 1 frame. */
  supported: boolean
  /** The H.264 profile that passed, or null when HW is unavailable. */
  codec: string | null
}

const supportCache = new Map<string, H264HwSupport>()

async function probeH264Static(
  codec: string,
  width: number,
  height: number,
  framerate: number,
): Promise<boolean> {
  try {
    if (typeof VideoEncoder === "undefined") return false
    const support = await VideoEncoder.isConfigSupported({
      codec,
      width,
      height,
      framerate,
      bitrate: H264_PROBE_BITRATE,
      hardwareAcceleration: "prefer-hardware",
    } as VideoEncoderConfig)
    return support.supported === true
  } catch {
    return false
  }
}

// Real 1-frame encode with the exact config the worker would use.
// Returns true only if configure + encode + flush succeed and at
// least one non-empty chunk comes out. A rejection (e.g. no HW
// session, driver failure) or timeout = unavailable.
async function trialEncodeH264OneFrame(
  codec: string,
  width: number,
  height: number,
  framerate: number,
): Promise<boolean> {
  const run = (async (): Promise<boolean> => {
    let chunks = 0
    let bytes = 0
    let encoderError: unknown = null
    let encoder: VideoEncoder | null = null
    try {
      if (
        typeof VideoEncoder === "undefined" ||
        typeof VideoFrame === "undefined" ||
        typeof OffscreenCanvas === "undefined"
      ) {
        return false
      }
      const canvas = new OffscreenCanvas(width, height)
      const ctx = canvas.getContext("2d")
      if (!ctx) return false
      // Non-trivial content so the encoder can't take empty-frame paths.
      ctx.fillStyle = "#000000"
      ctx.fillRect(0, 0, width, height)
      ctx.fillStyle = "#ffffff"
      ctx.fillRect(0, 0, width / 2, height)
      ctx.fillStyle = "#ff0000"
      ctx.fillRect(width / 4, height / 4, width / 2, height / 2)

      encoder = new VideoEncoder({
        output: (chunk) => {
          chunks++
          bytes += chunk.byteLength
        },
        error: (e) => {
          encoderError = e
        },
      })
      encoder.configure({
        codec,
        width,
        height,
        framerate,
        bitrate: H264_PROBE_BITRATE,
        hardwareAcceleration: "prefer-hardware",
      } as VideoEncoderConfig)
      const frame = new VideoFrame(canvas, {
        timestamp: 0,
        duration: 1_000_000 / framerate,
      })
      encoder.encode(frame, { keyFrame: true })
      frame.close()
      await encoder.flush()
      return encoderError === null && chunks > 0 && bytes > 0
    } catch {
      return false
    } finally {
      try {
        encoder?.close()
      } catch {
        // ignore — probe must never throw
      }
    }
  })()
  const timeout = new Promise<boolean>((resolve) => {
    setTimeout(() => resolve(false), TRIAL_TIMEOUT_MS)
  })
  return Promise.race([run, timeout])
}

export async function checkH264HwSupport(opts?: {
  width?: number
  height?: number
  framerate?: number
}): Promise<H264HwSupport> {
  // Fixed render size (see runVideoRender): capability is
  // resolution-dependent, and 1 frame is cheap enough.
  const width = opts?.width ?? 1280
  const height = opts?.height ?? 720
  const framerate = opts?.framerate ?? 30
  const key = `${width}x${height}@${framerate}`
  const cached = supportCache.get(key)
  if (cached) return cached

  let result: H264HwSupport = { supported: false, codec: null }
  // First HW-supported candidate (same order as the worker), then
  // prove it really encodes. A candidate passing static but failing
  // the trial falls through to the next one.
  for (const codec of H264_CODEC_CANDIDATES) {
    if (!(await probeH264Static(codec, width, height, framerate))) continue
    if (await trialEncodeH264OneFrame(codec, width, height, framerate)) {
      result = { supported: true, codec }
      break
    }
  }
  supportCache.set(key, result)
  return result
}
