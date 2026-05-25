import {
  Output,
  BufferTarget,
  Mp4OutputFormat,
  WebMOutputFormat,
  EncodedVideoPacketSource,
  EncodedAudioPacketSource,
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

interface RenderPayload {
  channelData: Float32Array
  sampleRate: number
  duration: number
  settings: VisualizerSettings
  width: number
  height: number
  isHardware: boolean
}

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
    } = payload as RenderPayload

    try {
      const result = await runVideoProcessing(
        channelData,
        sampleRate,
        duration,
        settings,
        width,
        height,
        isHardware,
        (p) => (self as any).postMessage({ type: "PROGRESS", payload: p }),
      )
        ; (self as any).postMessage(
          { type: "RENDER_COMPLETE", payload: result.buffer, format: result.format },
          [result.buffer],
        )
    } catch (err: any) {
      ; (self as any).postMessage({ type: "ERROR", payload: err.message })
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
): Promise<{ buffer: ArrayBuffer; format: string }> {
  const fps = settings.renderFps || 60
  const useTransparentBg = settings.enableTransparentBg

  if (useTransparentBg) {
    return runVideoProcessingWithWebM(
      channelData,
      sampleRate,
      duration,
      settings,
      width,
      height,
      isHardware,
      onProgress,
    )
  }

  return runVideoProcessingWithMP4(
    channelData,
    sampleRate,
    duration,
    settings,
    width,
    height,
    isHardware,
    onProgress,
  )
}

async function runVideoProcessingWithMP4(
  channelData: Float32Array,
  sampleRate: number,
  duration: number,
  settings: VisualizerSettings,
  width: number,
  height: number,
  isHardware: boolean,
  onProgress: (percent: number) => void,
): Promise<{ buffer: ArrayBuffer; format: string }> {
  const fps = settings.renderFps || 60

  const codecCandidates: string[] = [
    "avc1.640028",
    "avc1.64001F",
    "avc1.4D4020",
    "avc1.4D401F",
    "avc1.42E01F",
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

  console.log("[WebCodecs] Accepted config (MP4): ", encoderConfig)

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

  return { buffer: (target as any).buffer!, format: "mp4" }
}

async function runVideoProcessingWithWebM(
  channelData: Float32Array,
  sampleRate: number,
  duration: number,
  settings: VisualizerSettings,
  width: number,
  height: number,
  isHardware: boolean,
  onProgress: (percent: number) => void,
): Promise<{ buffer: ArrayBuffer; format: string }> {
  const fps = settings.renderFps || 60

  // VP9 codec negotiation: try multiple profiles, hardware -> software fallback
  const vp9CodecCandidates: string[] = [
    "vp09.00.10.08", // VP9 profile 0, level 1.0, 8-bit
    "vp09.00.10.08.01.01.01.01.00", // VP9 profile 0, full range

  ]
  let encoderConfig: VideoEncoderConfig | null = null

  if (isHardware) {
    for (const codec of vp9CodecCandidates) {
      const config: VideoEncoderConfig = {
        codec,
        width,
        height,
        framerate: fps,
        bitrate: 5_000_000,
        hardwareAcceleration: "prefer-hardware",
      }
      try {
        const support = await VideoEncoder.isConfigSupported(config)
        if (support.supported) {
          encoderConfig = config
          break
        }
      } catch {
        continue
      }
    }
  }

  if (!encoderConfig) {
    for (const codec of vp9CodecCandidates) {
      const config: VideoEncoderConfig = {
        codec,
        width,
        height,
        framerate: fps,
        bitrate: 5_000_000,
        hardwareAcceleration: "prefer-software",
      }
      try {
        const support = await VideoEncoder.isConfigSupported(config)
        if (support.supported) {
          encoderConfig = config
          break
        }
      } catch {
        continue
      }
    }
  }

    if (!encoderConfig) {
      console.warn("[WebCodecs] VP9 not supported, falling back to H.264/MP4")
      ;(self as any).postMessage({
        type: "FALLBACK_TO_MP4",
        payload: {
          reason: "VP9 codec not supported",
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
        },
      })
      return runVideoProcessingWithMP4(
        channelData,
        sampleRate,
        duration,
        settings,
        width,
        height,
        false,
        onProgress,
      )
    }


  console.log("[WebCodecs] Accepted config (WebM): ", encoderConfig)

  // Set up mediabunny WebM output with both video and audio tracks
  const target = new BufferTarget()
  const output = new Output({
    target,
    format: new WebMOutputFormat(),
  })

  const videoSource = new EncodedVideoPacketSource("vp9")
  output.addVideoTrack(videoSource)

  const audioSource = new EncodedAudioPacketSource("opus")
  output.addAudioTrack(audioSource)

  await output.start()

  let encoderError: Error | null = null

  // Audio encoder - encode all PCM data to Opus packets before video loop
  const audioEncoder = new AudioEncoder({
    output: (chunk, meta) => {
      const packet = EncodedPacket.fromEncodedChunk(chunk)
      audioSource.add(packet, meta as any).catch((e) => {
        encoderError = e
      })
    },
    error: (e) => {
      encoderError = e
      console.error("Worker AudioEncoder error: ", e)
    },
  })
  audioEncoder.configure({
    codec: "opus",
    sampleRate,
    numberOfChannels: 1,
    bitrate: 128000,
  })

  // Feed all audio samples in chunks
  const opusFrameSize = 960 // Opus frames are 20ms at 48kHz
  let audioSampleOffset = 0
  while (audioSampleOffset < channelData.length) {
    if (encoderError) throw encoderError
    const remaining = channelData.length - audioSampleOffset
    const frameSize = Math.min(opusFrameSize, remaining)
    const slice = new Float32Array(channelData.buffer, audioSampleOffset * 4, frameSize)
    const audioData = new AudioData({
      format: "f32",
      sampleRate,
      numberOfFrames: frameSize,
      numberOfChannels: 1,
      timestamp: (audioSampleOffset / sampleRate) * 1_000_000,
      data: slice,
      transfer: [slice.buffer],
    })
    audioEncoder.encode(audioData)
    audioData.close()
    audioSampleOffset += frameSize
  }

  await audioEncoder.flush()
  audioEncoder.close()
  audioSource.close()

  // Video encoder
  const videoEncoder = new VideoEncoder({
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
  videoEncoder.configure(encoderConfig as VideoEncoderConfig)

  // Video frame loop
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

    if ((videoEncoder as any).encodeQueueSize > 15) {
      await new Promise((r) => setTimeout(r, 10))
    }

    videoEncoder.encode(frame, { keyFrame })
    frame.close()

    if (i % 30 === 0) {
      onProgress(i / totalFrames)
    }
  }

  await videoEncoder.flush()
  videoEncoder.close()
  videoSource.close()
  await output.finalize()

  return { buffer: (target as any).buffer!, format: "webm" }
}
