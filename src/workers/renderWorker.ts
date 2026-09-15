import { VisualizerSettings } from "../types"
import {
  calculateCavaBarHeights,
  createCavaPlan,
  createCavaState,
  createCavaTimeDomainFrame,
} from "../utils/audioMath"

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
  const spectrumData: number[][] = []
  const plan = createCavaPlan(
    settings.barCount,
    sampleRate,
    settings.minFreq,
    settings.maxFreq,
  )
  const cavaState = createCavaState(settings.barCount)
  const dt = 1 / renderFps

  for (let i = 0; i < totalFrames; i++) {
    const endSample = Math.floor(((i + 1) * sampleRate) / renderFps)
    const timeData = createCavaTimeDomainFrame(
      channelData,
      endSample,
      plan.bassFftSize,
    )
    const frameHeights = calculateCavaBarHeights(
      timeData,
      plan,
      cavaState,
      settings,
      dt,
    )

    spectrumData.push(frameHeights)
    if (spectrumData.length % 30 === 0) {
      ;(self as any).postMessage({ type: "PROGRESS", payload: i / totalFrames })
    }
  }
  return spectrumData
}
