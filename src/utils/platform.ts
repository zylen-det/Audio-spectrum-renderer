/**
 * Detects if the current platform is Apple (iOS or macOS).
 * Used to conditionally enable/disable features that have limited platform support.
 */
export function isApplePlatform(): boolean {
  if (typeof navigator === "undefined") return false

  const ua = navigator.userAgent
  const isIOS = /iPhone|iPad|iPod|Macintosh/.test(ua) || /Macintosh/i.test(ua)

  // More robust iPad detection (Safari on iPad reports Macintosh)
  const isiPad =
    "ontouchstart" in navigator &&
    /Macintosh/.test(ua) &&
    navigator.maxTouchPoints > 1

  return isIOS || isiPad
}

/**
 * Detects if the browser supports VP9 Profile 3 with alpha channel encoding via WebCodecs.
 * Uses the same codec strings and config as the actual rendering worker.
 */
export async function supportsVp9Alpha(): Promise<boolean> {
  if (typeof VideoEncoder === "undefined") return false

  const configs = [
    { codec: "vp09.03.10.08.02.01.01.01.01", hardwareAcceleration: "prefer-hardware" as const },
    { codec: "vp09.03.10.08", hardwareAcceleration: "prefer-hardware" as const },
    { codec: "vp09.00.10.08", hardwareAcceleration: "prefer-hardware" as const },
    { codec: "vp09.03.10.08.02.01.01.01.01", hardwareAcceleration: "prefer-software" as const },
    { codec: "vp09.03.10.08", hardwareAcceleration: "prefer-software" as const },
    { codec: "vp09.00.10.08", hardwareAcceleration: "prefer-software" as const },
  ]

  for (const { codec, hardwareAcceleration } of configs) {
    try {
      const support = await VideoEncoder.isConfigSupported({
        codec, width: 1280, height: 720,
        framerate: 30, bitrate: 5_000_000,
        hardwareAcceleration,
        alpha: "keep",
      } as VideoEncoderConfig)
      if (support.supported) return true
    } catch { /* skip */ }
  }

  return false
}
