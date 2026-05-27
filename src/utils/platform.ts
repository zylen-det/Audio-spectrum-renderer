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

export interface Vp9AlphaSupport {
  hardware: boolean
  software: boolean
}

async function checkVp9ByAcceleration(
  accel: "prefer-hardware" | "prefer-software",
): Promise<boolean> {
  const candidates = [
    "vp09.03.10.08.02.01.01.01.01",
    "vp09.03.10.08",
    "vp09.00.10.08",
  ]
  for (const codec of candidates) {
    try {
      const support = await VideoEncoder.isConfigSupported({
        codec, width: 1280, height: 720,
        framerate: 30, bitrate: 5_000_000,
        hardwareAcceleration: accel,
        alpha: "keep",
      } as VideoEncoderConfig)
      if (support.supported) return true
    } catch { /* skip */ }
  }
  return false
}

/**
 * Checks VP9 Profile 3 + alpha support separately for hardware and software encoding.
 */
export async function checkVp9AlphaSupport(): Promise<Vp9AlphaSupport> {
  if (typeof VideoEncoder === "undefined") return { hardware: false, software: false }
  const [hardware, software] = await Promise.all([
    checkVp9ByAcceleration("prefer-hardware"),
    checkVp9ByAcceleration("prefer-software"),
  ])
  return { hardware, software }
}

/**
 * Returns true if VP9+alpha is supported via either hardware or software encoding.
 */
export async function supportsVp9Alpha(): Promise<boolean> {
  const result = await checkVp9AlphaSupport()
  return result.hardware || result.software
}
