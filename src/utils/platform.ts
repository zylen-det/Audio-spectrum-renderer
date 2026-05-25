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
 * Detects if the browser supports VP9 with alpha channel encoding via WebCodecs.
 * This is used as a runtime check beyond just platform detection.
 */
export async function supportsVp9Alpha(): Promise<boolean> {
  if (typeof VideoEncoder === "undefined") return false

  const configs = [
    {
      codec: "vp0e.00.00.00.00",
      hardwareAcceleration: "prefer-hardware" as const,
    },
    {
      codec: "vp0e.00.00.00.00",
      hardwareAcceleration: "prefer-software" as const,
    },
  ]

  for (const cfg of configs) {
    try {
      const support = await VideoEncoder.isConfigSupported({
        ...cfg,
        width: 1280,
        height: 720,
        framerate: 60,
        bitrate: 5_000_000,
      })
      if (support.supported) return true
    } catch {
      continue
    }
  }

  return false
}
