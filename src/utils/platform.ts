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

// Transparent-WebM capability probe lives in ./vp9Support (shared with the
// render worker). It tests what the pipeline actually needs — plain VP9 +
// WebGL2 — NOT browser-native VideoEncoder(alpha:"keep"), which Chrome
// rejects even though the mediabunny dual-encode path works fine there.
export { checkVp9AlphaSupport, supportsVp9Alpha } from "./vp9Support"
