import { VisualizerSettings } from "../types"
import { FFT_SIZE, generateFrequencyBands, performFFT as performFFTCore, calculateBarHeights, applyWindowingToFrame } from "../utils/audioMath"

(self as any).onmessage = async (e: MessageEvent) => {
  const { type, payload } = e.data

  if (type === "ANALYZE_AUDIO") {
    const { channelData, sampleRate, duration, settings, renderFps = 30, simulationFps = 60 } = payload
    try {
      const spectrumData = await performFFT(
        channelData,
        sampleRate,
        duration,
        settings,
        renderFps
      )
      ;(self as any).postMessage({ type: "ANALYSIS_COMPLETE", payload: spectrumData })
    } catch (err: any) {
      ;(self as any).postMessage({ type: "ERROR", payload: err.message })
    }
  }
}

async function performFFT(
  channelData: Float32Array,
  sampleRate: number,
  duration: number,
  settings: VisualizerSettings,
  renderFps: number,
) {
  const totalFrames = Math.ceil(duration * renderFps)
  const fftSize = FFT_SIZE
  const spectrumData: number[][] = []

  let currentHeights = new Array(settings.barCount).fill(0)
  const bands = generateFrequencyBands(settings.barCount, sampleRate, fftSize, settings.minFreq, settings.maxFreq)
  const dt = 1 / renderFps

  for (let i = 0; i < totalFrames; i++) {
    const centerSample = Math.floor((i * sampleRate) / renderFps)
    const startSample = Math.max(0, centerSample - fftSize / 2)
    const timeData = new Float32Array(fftSize)
    for (let s = 0; s < fftSize; s++) {
      const idx = startSample + s
      if (idx < channelData.length) {
        timeData[s] = channelData[idx]
      }
    }

    const { real, imag } = applyWindowingToFrame(timeData, fftSize)
    performFFTCore(real, imag)
    currentHeights = calculateBarHeights(real, imag, bands, settings, currentHeights, dt)
    const frameHeights = currentHeights

    spectrumData.push(frameHeights)
    if (spectrumData.length % 30 === 0) {
      ;(self as any).postMessage({ type: "PROGRESS", payload: i / totalFrames })
    }
  }
  return spectrumData
}
