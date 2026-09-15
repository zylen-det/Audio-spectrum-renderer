import { VisualizerSettings } from "../types"

// This analysis pipeline follows cavacore's MIT-licensed linear scaling,
// frequency distribution, automatic sensitivity, and smoothing behavior:
// https://github.com/karlstav/cava/blob/master/cavacore.c
// Cava uses a 4096-sample FFT for common 44.1/48 kHz audio and a second,
// double-sized FFT below 100 Hz. Keep this alias for callers that only need
// the common-rate size.
export const FFT_SIZE = 4096
export const MIN_FREQ = 50
export const MAX_FREQ = 10000

const CAVA_BASS_CUTOFF = 100
const INT16_SCALE = 32768

export interface FrequencyBand {
  start: number
  end: number
  useBassFft: boolean
}

export interface CavaPlan {
  barCount: number
  sampleRate: number
  fftSize: number
  bassFftSize: number
  bassCutoffBar: number
  bands: FrequencyBand[]
  equalizers: number[]
}

export interface CavaState {
  fall: number[]
  memory: number[]
  peak: number[]
  previous: number[]
  sensitivity: number
  sensitivityIsInitial: boolean
  frameRate: number
}

export function getCavaFftSize(sampleRate: number): number {
  let fftSize = 512

  if (sampleRate > 8125 && sampleRate <= 16250) fftSize *= 2
  else if (sampleRate > 16250 && sampleRate <= 32500) fftSize *= 4
  else if (sampleRate > 32500 && sampleRate <= 75000) fftSize *= 8
  else if (sampleRate > 75000 && sampleRate <= 150000) fftSize *= 16
  else if (sampleRate > 150000 && sampleRate <= 300000) fftSize *= 32
  else if (sampleRate > 300000) fftSize *= 64

  return fftSize
}

export function createCavaPlan(
  barCount: number,
  sampleRate: number,
  minFreq: number = MIN_FREQ,
  maxFreq: number = MAX_FREQ,
): CavaPlan {
  const fftSize = getCavaFftSize(sampleRate)
  const bassFftSize = fftSize * 2
  const nyquist = sampleRate / 2
  const lowerCutoff = Math.max(1, Math.min(minFreq, nyquist - 1))
  const upperCutoff = Math.max(
    lowerCutoff + 1,
    Math.min(maxFreq, nyquist),
  )
  const lowerBins = new Array<number>(barCount + 1).fill(0)
  const upperBins = new Array<number>(barCount + 1).fill(0)
  const cutoffFrequencies = new Array<number>(barCount + 1).fill(0)
  const frequencyConstant =
    Math.log10(lowerCutoff / upperCutoff) / (1 / (barCount + 1) - 1)
  const minimumBandwidth = sampleRate / bassFftSize

  let bassCutoffBar = 0
  let firstBar = true

  for (let n = 0; n < barCount + 1; n++) {
    const distribution =
      -frequencyConstant + ((n + 1) / (barCount + 1)) * frequencyConstant
    cutoffFrequencies[n] = upperCutoff * Math.pow(10, distribution)

    if (n > 0 && cutoffFrequencies[n - 1] >= cutoffFrequencies[n]) {
      cutoffFrequencies[n] = cutoffFrequencies[n - 1] + minimumBandwidth
    }

    let relativeCutoff = cutoffFrequencies[n] / nyquist
    if (cutoffFrequencies[n] < CAVA_BASS_CUTOFF) {
      lowerBins[n] = Math.floor(relativeCutoff * (bassFftSize / 2))
      bassCutoffBar++
      firstBar = bassCutoffBar <= 1
      lowerBins[n] = Math.min(lowerBins[n], bassFftSize / 2)
    } else {
      lowerBins[n] = Math.ceil(relativeCutoff * (fftSize / 2))
      if (n === bassCutoffBar) {
        firstBar = true
        if (n > 0) {
          upperBins[n - 1] =
            Math.floor(relativeCutoff * (bassFftSize / 2)) - 1
        }
      } else {
        firstBar = false
      }
      lowerBins[n] = Math.min(lowerBins[n], fftSize / 2)
    }

    if (n > 0) {
      if (!firstBar) {
        upperBins[n - 1] = lowerBins[n] - 1
        if (lowerBins[n] <= lowerBins[n - 1]) {
          const fftLimit = n < bassCutoffBar ? bassFftSize / 2 : fftSize / 2
          if (lowerBins[n - 1] + 1 < fftLimit + 1) {
            lowerBins[n] = lowerBins[n - 1] + 1
            upperBins[n - 1] = lowerBins[n] - 1
          }
        }
      } else if (upperBins[n - 1] < lowerBins[n - 1]) {
        upperBins[n - 1] = lowerBins[n - 1] + 1
      }
    }

    relativeCutoff =
      lowerBins[n] /
      (n < bassCutoffBar ? bassFftSize / 2 : fftSize / 2)
    cutoffFrequencies[n] = relativeCutoff * nyquist
  }

  const bands: FrequencyBand[] = []
  const equalizers: number[] = []
  for (let n = 0; n < barCount; n++) {
    const useBassFft = n < bassCutoffBar
    const bandWidth = upperBins[n] - lowerBins[n] + 1
    let equalizer = Math.pow(2, -28)
    equalizer *= Math.pow(cutoffFrequencies[n + 1], 0.85)
    equalizer /= Math.log2(useBassFft ? bassFftSize : fftSize)
    equalizer /= bandWidth

    bands.push({
      start: lowerBins[n],
      end: upperBins[n],
      useBassFft,
    })
    equalizers.push(equalizer)
  }

  return {
    barCount,
    sampleRate,
    fftSize,
    bassFftSize,
    bassCutoffBar,
    bands,
    equalizers,
  }
}

export function createCavaState(barCount: number): CavaState {
  return {
    fall: new Array(barCount).fill(0),
    memory: new Array(barCount).fill(0),
    peak: new Array(barCount).fill(0),
    previous: new Array(barCount).fill(0),
    sensitivity: 1,
    sensitivityIsInitial: true,
    frameRate: 75,
  }
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

export function calculateCavaBarHeights(
  timeData: Float32Array,
  plan: CavaPlan,
  state: CavaState,
  settings: Pick<
    VisualizerSettings,
    "autosens" | "noiseReduction" | "sensitivity"
  >,
  dt: number = 1 / 60,
): number[] {
  const safeDt = Number.isFinite(dt) && dt > 0 ? dt : 1 / 60
  const bassFrame = fitFrameToSize(timeData, plan.bassFftSize)
  const regularFrame = bassFrame.subarray(plan.bassFftSize - plan.fftSize)
  const bassSpectrum = fftFrame(bassFrame)
  const regularSpectrum = fftFrame(regularFrame)
  const output = new Array<number>(plan.barCount).fill(0)
  let silence = true

  for (let i = 0; i < timeData.length; i++) {
    if (timeData[i] !== 0) {
      silence = false
      break
    }
  }

  for (let n = 0; n < plan.barCount; n++) {
    const band = plan.bands[n]
    const spectrum = band.useBassFft ? bassSpectrum : regularSpectrum
    const limit = Math.min(band.end, spectrum.real.length / 2)
    let magnitudeSum = 0

    for (let bin = band.start; bin <= limit; bin++) {
      magnitudeSum += Math.hypot(spectrum.real[bin], spectrum.imag[bin])
    }

    // Web Audio supplies normalized floats while cava's linear path receives
    // signed 16-bit sample amplitudes.
    output[n] = magnitudeSum * INT16_SCALE * plan.equalizers[n]
    if (settings.autosens) output[n] *= state.sensitivity
  }

  const measuredFrameRate = 1 / safeDt
  state.frameRate -= state.frameRate / 64
  state.frameRate += measuredFrameRate / 64

  const noiseReduction = Math.min(100, Math.max(0, settings.noiseReduction)) / 100
  const frameRateModifier = 66 / state.frameRate
  const gravityModifier =
    noiseReduction > 0
      ? (Math.pow(frameRateModifier, 2.5) * 2) / noiseReduction
      : Number.POSITIVE_INFINITY
  const integralModifier = Math.pow(frameRateModifier, 0.1)
  let overshoot = false

  for (let n = 0; n < plan.barCount; n++) {
    if (output[n] < state.previous[n] && noiseReduction > 0.1) {
      output[n] =
        state.peak[n] *
        (1 - state.fall[n] * state.fall[n] * gravityModifier)
      output[n] = Math.max(0, output[n])
      state.fall[n] += 0.028
    } else {
      state.peak[n] = output[n]
      state.fall[n] = 0
    }

    state.previous[n] = output[n]
    output[n] =
      (state.memory[n] * noiseReduction) / integralModifier + output[n]
    state.memory[n] = output[n]

    if (settings.autosens && output[n] > 1) {
      overshoot = true
      output[n] = 1
    }
  }

  if (settings.autosens) {
    if (overshoot) {
      state.sensitivity *= 1 - 0.02 * frameRateModifier
      state.sensitivityIsInitial = false
    } else if (!silence) {
      state.sensitivity *= 1 + 0.001 * frameRateModifier
      if (state.sensitivityIsInitial) {
        state.sensitivity *= 1 + 0.1 * frameRateModifier
      }
    }
  }

  const userSensitivity = settings.autosens
    ? 1
    : Math.max(1, settings.sensitivity) / 100
  for (let n = 0; n < output.length; n++) {
    output[n] = Math.min(1, Math.max(0, output[n] * userSensitivity))
  }

  return output
}

export function createCavaTimeDomainFrame(
  channelData: Float32Array,
  endSample: number,
  frameSize: number,
): Float32Array {
  const frame = new Float32Array(frameSize)
  const safeEnd = Math.min(channelData.length, Math.max(0, endSample))
  const start = Math.max(0, safeEnd - frameSize)
  const samples = channelData.subarray(start, safeEnd)
  frame.set(samples, frameSize - samples.length)
  return frame
}

function fitFrameToSize(data: Float32Array, size: number): Float32Array {
  if (data.length === size) return data
  const frame = new Float32Array(size)
  const source = data.subarray(Math.max(0, data.length - size))
  frame.set(source, size - source.length)
  return frame
}

function fftFrame(timeData: Float32Array): {
  real: Float32Array
  imag: Float32Array
} {
  const { real, imag } = applyWindowingToFrame(timeData, timeData.length)
  performFFT(real, imag)
  return { real, imag }
}

export function calculateMagnitude(real: number, imag: number): number {
  return Math.hypot(real, imag)
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
      real[s] = timeData[s] * getHanningWindowValue(s, fftSize)
    }
  }

  return { real, imag }
}

export function getMaxMagnitudeInBand(
  real: Float32Array,
  imag: Float32Array,
  startBin: number,
  endBin: number,
): number {
  let maxMagnitude = 0
  const limit = Math.min(endBin, real.length / 2)

  for (let bin = startBin; bin < limit; bin++) {
    maxMagnitude = Math.max(
      maxMagnitude,
      calculateMagnitude(real[bin], imag[bin]),
    )
  }

  return maxMagnitude
}
