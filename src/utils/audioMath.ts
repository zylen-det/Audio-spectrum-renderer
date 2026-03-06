import { VisualizerSettings } from "../types"

export const FFT_SIZE = 4096
export const MIN_FREQ = 20
export const MAX_FREQ = 16000

export interface FrequencyBand {
  start: number
  end: number
}

export function generateFrequencyBands(
  barCount: number,
  sampleRate: number,
  fftSize: number = FFT_SIZE,
  minFreq: number = MIN_FREQ,
  maxFreq: number = MAX_FREQ,
): FrequencyBand[] {
  const bands: FrequencyBand[] = []
  for (let i = 0; i < barCount; i++) {
    const f0 = minFreq * Math.pow(maxFreq / minFreq, i / barCount)
    const f1 = minFreq * Math.pow(maxFreq / minFreq, (i + 1) / barCount)
    const b0 = Math.floor((f0 * fftSize) / sampleRate)
    const b1 = Math.max(b0 + 1, Math.floor((f1 * fftSize) / sampleRate))
    bands.push({ start: b0, end: b1 })
  }
  return bands
}

export function performFFT(real: Float32Array, imag: Float32Array) {
  const n = real.length
  let j = 0
  for (let i = 0; i < n; i++) {
    if (i < j) {
      ;[real[i], real[j]] = [real[j], real[i]]
      ;[imag[i], imag[j]] = [imag[j], imag[i]]
    }
    let m = n >> 1
    while (m >= 1 && j >= m) {
      j -= m
      m >>= 1
    }
    j += m
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len
    const wlenReal = Math.cos(angle)
    const wlenImag = Math.sin(angle)
    for (let i = 0; i < n; i += len) {
      let wReal = 1
      let wImag = 0
      for (let k = 0; k < len / 2; k++) {
        const uReal = real[i + k]
        const uImag = imag[i + k]
        const vReal =
          real[i + k + len / 2] * wReal - imag[i + k + len / 2] * wImag
        const vImag =
          real[i + k + len / 2] * wImag + imag[i + k + len / 2] * wReal
        real[i + k] = uReal + vReal
        imag[i + k] = uImag + vImag
        real[i + k + len / 2] = uReal - vReal
        imag[i + k + len / 2] = uImag - vImag
        const nextWReal = wReal * wlenReal - wImag * wlenImag
        wImag = wReal * wlenImag + wImag * wlenReal
        wReal = nextWReal
      }
    }
  }
}

let lastBarHeightsCall = performance.now()

export function calculateBarHeights(
  real: Float32Array,
  imag: Float32Array,
  bands: FrequencyBand[],
  settings: VisualizerSettings,
  currentHeights: number[],
  dt?: number,
): number[] {
  const fftSize = real.length
  const newHeights = [...currentHeights]

  if (dt === undefined) {
    const now = performance.now()
    dt = (now - lastBarHeightsCall) / 1000
    lastBarHeightsCall = now
  }
  if (!dt || dt <= 0) dt = 1 / 60

  const dtRatio = dt / (1 / (settings.referenceFps || 60))
  const ATTACK = 1 - Math.pow(1 - (settings.attack || 0.05), dtRatio)
  const DECAY = Math.pow(settings.decay || 0.92, dtRatio)
  const CONTRAST = settings.contrast || 1.2

  for (let b = 0; b < settings.barCount; b++) {
    const { start, end } = bands[b]
    let maxMag = 0
    const limit = Math.min(end, fftSize / 2)

    for (let bin = start; bin < limit; bin++) {
      const mag = Math.sqrt(real[bin] * real[bin] + imag[bin] * imag[bin])
      if (mag > maxMag) maxMag = mag
    }

    let target =
      Math.pow(maxMag, CONTRAST) * 0.007 * settings.barHeightMultiplier
    target = Math.max(0, target)

    const threshold = settings.softCeilingThreshold ?? 0.7
    const strength = settings.softCeilingStrength ?? 2.0
    if (target > threshold) {
      const excess = target - threshold
      const compressedExcess = (1 - Math.exp(-excess * strength)) / strength
      target = threshold + compressedExcess
    }

    if (target > newHeights[b]) {
      newHeights[b] += (target - newHeights[b]) * ATTACK
    } else {
      let nextValue = newHeights[b] * DECAY

      const maxDropRatio = 1
      if (newHeights[b] - nextValue > newHeights[b] * maxDropRatio) {
        nextValue = newHeights[b] * (1 - maxDropRatio)
      }

      newHeights[b] = nextValue
    }
    newHeights[b] = Math.max(0, newHeights[b])
  }
  return newHeights
}

export function calculateMagnitude(real: number, imag: number): number {
  return Math.sqrt(real * real + imag * imag)
}

export function getHanningWindowValue(index: number, fftSize: number): number {
  return 0.5 * (1 - Math.cos((2 * Math.PI * index) / (fftSize - 1)))
}

export function applyWindowingToFrame(
  timeData: Float32Array,
  fftSize: number = FFT_SIZE,
): { real: Float32Array; imag: Float32Array } {
  const real = new Float32Array(fftSize)
  const imag = new Float32Array(fftSize)

  for (let s = 0; s < fftSize; s++) {
    if (s < timeData.length) {
      const w = getHanningWindowValue(s, fftSize)
      real[s] = timeData[s] * w
    } else {
      real[s] = 0
    }
    imag[s] = 0
  }

  return { real, imag }
}

export function getMaxMagnitudeInBand(
  real: Float32Array,
  imag: Float32Array,
  startBin: number,
  endBin: number,
): number {
  let maxMag = 0
  const limit = Math.min(endBin, real.length / 2)

  for (let bin = startBin; bin < limit; bin++) {
    const mag = calculateMagnitude(real[bin], imag[bin])
    if (mag > maxMag) maxMag = mag
  }

  return maxMag
}
