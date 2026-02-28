import {
  Output,
  BufferTarget,
  Mp4OutputFormat,
  EncodedVideoPacketSource,
  EncodedPacket,
} from "mediabunny"
import { VisualizerSettings } from "../types"
import { drawFrame } from "../utils/renderUtils"
import {
  FFT_SIZE,
  generateFrequencyBands,
  performFFT,
  calculateBarHeights,
  applyWindowingToFrame,
} from "../utils/audioMath"

(self as any).onmessage = async (e: MessageEvent) => {
  const { type, payload } = e.data

  if (type === "RENDER_VIDEO") {
    const {
      channelData,
      sampleRate,
      duration,
      settings,
      width,
      height,
      isHardware,
    } = payload

    try {
      const videoBuffer = await runVideoProcessing(
        channelData,
        sampleRate,
        duration,
        settings,
        width,
        height,
        isHardware,
        (p) => (self as any).postMessage({ type: "PROGRESS", payload: p }),
      )
      ;(self as any).postMessage(
        { type: "RENDER_COMPLETE", payload: videoBuffer },
        [videoBuffer],
      )
    } catch (err: any) {
      ;(self as any).postMessage({ type: "ERROR", payload: err.message })
    }
  }
}

async function runVideoProcessing(
  channelData: Float32Array,
  sampleRate: number,
  duration: number,
  settings: VisualizerSettings,
  width: number,
  height: number,
  isHardware: boolean,
  onProgress: (percent: number) => void,
): Promise<ArrayBuffer> {
  const fps = settings.renderFps || 60

  const codecCandidates = [
    "avc1.4D4020",
    "avc1.4D401F",
    "avc1.42E01F",
    "avc1.640028",
    "avc1.42001e",
  ]

  let encoderConfig: VideoEncoderConfig | null = null
  for (const codec of codecCandidates) {
    const config: VideoEncoderConfig = {
      codec,
      width,
      height,
      framerate: fps,
      bitrate: 5_000_000,
      hardwareAcceleration: isHardware ? "prefer-hardware" : "prefer-software",
    }
    const support = await VideoEncoder.isConfigSupported(config)
    if (support.supported) {
      encoderConfig = config
      break
    }
  }

  if (!encoderConfig && isHardware) {
    for (const codec of codecCandidates) {
      const config: VideoEncoderConfig = {
        codec,
        width,
        height,
        framerate: fps,
        bitrate: 5_000_000,
        hardwareAcceleration: "prefer-software",
      }
      const support = await VideoEncoder.isConfigSupported(config)
      if (support.supported) {
        encoderConfig = config
        break
      }
    }
  }

  if (!encoderConfig) {
    throw new Error("No supported H.264 profile found in worker.")
  }

  const target = new BufferTarget()
  const output = new Output({
    target,
    format: new Mp4OutputFormat({ fastStart: "in-memory" }),
  })

  const videoSource = new EncodedVideoPacketSource("avc")
  output.addVideoTrack(videoSource)

  await output.start()

  let encoderError: Error | null = null
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      const packet = EncodedPacket.fromEncodedChunk(chunk)
      videoSource.add(packet, meta as any).catch((e) => {
        encoderError = e
      })
    },
    error: (e) => {
      encoderError = e
      console.error("Worker VideoEncoder error: ", e)
    },
  })
  encoder.configure(encoderConfig as VideoEncoderConfig)

  const offscreen = new OffscreenCanvas(width, height)
  const ctx = offscreen.getContext("2d")
  if (!ctx) throw new Error("Worker: Could not get OffscreenCanvas context")

  const fftSize = FFT_SIZE
  const bands = generateFrequencyBands(
    settings.barCount,
    sampleRate,
    fftSize,
    settings.minFreq,
    settings.maxFreq,
  )
  let currentHeights = new Array(settings.barCount).fill(0)
  const dt = 1 / fps

  const totalFrames = Math.ceil(duration * fps)

  for (let i = 0; i < totalFrames; i++) {
    if (encoderError) throw encoderError

    const centerSample = Math.floor((i * sampleRate) / fps)
    const startSample = Math.max(0, centerSample - fftSize / 2)

    const timeData = new Float32Array(fftSize)
    for (let s = 0; s < fftSize; s++) {
      const idx = startSample + s
      if (idx < channelData.length) {
        timeData[s] = channelData[idx]
      }
    }

    const { real, imag } = applyWindowingToFrame(timeData, fftSize)
    performFFT(real, imag)
    currentHeights = calculateBarHeights(
      real,
      imag,
      bands,
      settings,
      currentHeights,
      dt,
    )
    const frameHeights = currentHeights

    drawFrame(
      ctx as unknown as CanvasRenderingContext2D,
      frameHeights,
      settings,
      width,
      height,
    )

    const frame = new VideoFrame(offscreen, {
      timestamp: (i * 1_000_000) / fps,
      duration: 1_000_000 / fps,
    })
    const keyFrame = i % (fps * 2) === 0

    if ((encoder as any).encodeQueueSize > 15) {
      await new Promise((r) => setTimeout(r, 10))
    }

    encoder.encode(frame, { keyFrame })
    frame.close()

    if (i % 30 === 0) {
      onProgress(i / totalFrames)
    }
  }

  await encoder.flush()
  encoder.close()
  videoSource.close()
  await output.finalize()

  return (target as any).buffer!
}
