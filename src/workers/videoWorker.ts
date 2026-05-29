import {
  Output,
  BufferTarget,
  Mp4OutputFormat,
  WebMOutputFormat,
  CanvasSource,
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

  console.log("[MP4] Starting H.264 MP4 render pipeline", {
    fps,
    width,
    height,
    duration,
    sampleRate,
    isHardware,
    enableTransparentBg: settings.enableTransparentBg,
    channelDataLength: channelData.length,
    barCount: settings.barCount,
  })

  const codecCandidates: string[] = [
    "avc1.640028",
    "avc1.64001F",
    "avc1.4D4020",
    "avc1.4D401F",
    "avc1.42E01F",
    "avc1.42001e",
  ]

  console.log("[MP4] H.264 codec candidates:", codecCandidates)
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
    console.log("[MP4] Checking codec:", codec, "hwAccel:", config.hardwareAcceleration)
    const support = await VideoEncoder.isConfigSupported(config)
    console.log("[MP4] Codec support result:", codec, support.supported, support.config)
    if (support.supported) {
      encoderConfig = config
      console.log("[MP4] Selected codec:", codec)
      break
    }
  }

  if (!encoderConfig && isHardware) {
    console.log("[MP4] No HW codec found, trying software fallback")
    for (const codec of codecCandidates) {
      const config: VideoEncoderConfig = {
        codec,
        width,
        height,
        framerate: fps,
        bitrate: 5_000_000,
        hardwareAcceleration: "prefer-software",
      }
      console.log("[MP4] Checking SW codec:", codec)
      const support = await VideoEncoder.isConfigSupported(config)
      console.log("[MP4] SW codec support result:", codec, support.supported)
      if (support.supported) {
        encoderConfig = config
        console.log("[MP4] Selected SW codec:", codec)
        break
      }
    }
  }

  if (!encoderConfig) {
    throw new Error("No supported H.264 profile found in worker.")
  }

  console.log("[MP4] Accepted H.264 config: ", encoderConfig)

  const target = new BufferTarget()
  const output = new Output({
    target,
    format: new Mp4OutputFormat({ fastStart: "in-memory" }),
  })

  const videoSource = new EncodedVideoPacketSource("avc")
  output.addVideoTrack(videoSource)

  await output.start()

  console.log("[MP4] Setting up mediabunny MP4 output")
  let encoderError: Error | null = null
  let encodedChunks = 0
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      encodedChunks++
      if (encodedChunks % 30 === 0) {
        console.log("[MP4] VideoEncoder output chunk #" + encodedChunks, "size:", chunk?.byteLength, "timestamp:", chunk?.timestamp)
      }
      const packet = EncodedPacket.fromEncodedChunk(chunk)
      videoSource.add(packet, meta as any).catch((e) => {
        console.error("[MP4] videoSource.add error:", e)
        encoderError = e
      })
    },
    error: (e) => {
      console.error("[MP4] VideoEncoder error: ", e)
      encoderError = e
    },
  })
  encoder.configure(encoderConfig as VideoEncoderConfig)
  console.log("[MP4] VideoEncoder configured:", encoderConfig)

  const offscreen = new OffscreenCanvas(width, height)
  const ctx = offscreen.getContext("2d")
  if (!ctx) throw new Error("Worker: Could not get OffscreenCanvas context")
  console.log("[MP4] OffscreenCanvas context acquired")

  let bgImage: ImageBitmap | null = null
  if (settings.backgroundImageUrl && !settings.enableGreenScreen && !settings.enableTransparentBg) {
    try {
      const resp = await fetch(settings.backgroundImageUrl)
      const blob = await resp.blob()
      bgImage = await createImageBitmap(blob)
    } catch (err) {
      console.warn("[MP4] Failed to load background image:", err)
    }
  }

  const fftSize = FFT_SIZE
  console.log("[MP4] Generating frequency bands, barCount:", settings.barCount)
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
  console.log("[MP4] Starting video frame loop, totalFrames:", totalFrames)

  for (let i = 0; i < totalFrames; i++) {
    if (encoderError) {
      console.error("[MP4] encoderError at frame", i, encoderError)
      throw new Error("[MP4] encoderError: " + String(encoderError))
    }

    const centerSample = Math.floor((i * sampleRate) / fps)
    const startSample = Math.max(0, centerSample - fftSize / 2)

    const timeData = new Float32Array(fftSize)
    for (let s = 0; s < fftSize; s++) {
      const idx = startSample + s
      if (idx < channelData.length) {
        timeData[s] = channelData[idx]
      }
    }

    if (i === 0) {
      console.log("[MP4] First frame: centerSample:", centerSample, "startSample:", startSample, "non-zero samples:", timeData.filter(v => v !== 0).length)
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

    if (i === 0) {
      console.log("[MP4] First frame heights (first 5):", frameHeights.slice(0, 5), "max:", Math.max(...frameHeights))
    }

    drawFrame(
      ctx as unknown as CanvasRenderingContext2D,
      frameHeights,
      settings,
      width,
      height,
      bgImage,
    )

    const frame = new VideoFrame(offscreen, {
      timestamp: (i * 1_000_000) / fps,
      duration: 1_000_000 / fps,
    })

    if (i === 0) {
      console.log("[MP4] First VideoFrame format:", frame.format, "codedWidth:", frame.codedWidth, "codedHeight:", frame.codedHeight)
    }

    const keyFrame = i % (fps * 2) === 0

    if ((encoder as any).encodeQueueSize > 15) {
      await new Promise((r) => setTimeout(r, 10))
    }

    encoder.encode(frame, { keyFrame })
    frame.close()

    if (i % 30 === 0) {
      onProgress(i / totalFrames)
    }

    if (i % 100 === 0) {
      console.log("[MP4] Frame progress:", i, "/", totalFrames, "queueSize:", (encoder as any).encodeQueueSize)
    }
  }

  console.log("[MP4] Frame loop complete, flushing encoder. Encoded chunks:", encodedChunks)
  await encoder.flush()
  console.log("[MP4] Encoder flushed, closing")
  encoder.close()
  console.log("[MP4] Closing videoSource")
  videoSource.close()
  console.log("[MP4] Finalizing output...")
  await output.finalize()
  const bufferSize = (target as any).buffer?.byteLength || 0
  console.log("[MP4] Output finalized, buffer size:", bufferSize, "bytes")

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

  console.log("[WebM] Starting VP9+Opus WebM render pipeline", {
    fps,
    width,
    height,
    duration,
    sampleRate,
    isHardware,
    enableTransparentBg: settings.enableTransparentBg,
    channelDataLength: channelData.length,
    barCount: settings.barCount,
  })

  // Quick upfront VP9+alpha support check for early fallback
  const vp9SupportChecks: { codec: string; hw: "prefer-hardware" | "prefer-software" }[] = []
  if (isHardware) {
    vp9SupportChecks.push(
      { codec: "vp09.03.10.08.02.01.01.01.01", hw: "prefer-hardware" },
      { codec: "vp09.03.10.08", hw: "prefer-hardware" },
      { codec: "vp09.00.10.08", hw: "prefer-hardware" },
    )
  }
  vp9SupportChecks.push(
    { codec: "vp09.03.10.08.02.01.01.01.01", hw: "prefer-software" },
    { codec: "vp09.03.10.08", hw: "prefer-software" },
    { codec: "vp09.00.10.08", hw: "prefer-software" },
  )

  let vp9CodecString: string | null = null
  let vp9HardwareAccel: "prefer-hardware" | "prefer-software" | null = null
  for (const { codec, hw } of vp9SupportChecks) {
    console.log("[WebM] Checking support for", codec, hw)
    try {
      const support = await VideoEncoder.isConfigSupported({
        codec,
        width,
        height,
        framerate: fps,
        bitrate: 5_000_000,
        hardwareAcceleration: hw,
        alpha: "keep",
      } as VideoEncoderConfig)
      if (support.supported) {
        vp9CodecString = (support.config as any).codec as string
        vp9HardwareAccel = hw
        console.log("[WebM] VP9+alpha supported:", vp9CodecString, hw)
        break
      }
    } catch {
      // skip
    }
  }

  if (!vp9CodecString) {
    console.warn("[WebM] VP9 Profile 3 not supported, falling back to H.264/MP4 (no alpha)")
    ;(self as any).postMessage({
      type: "FALLBACK_TO_MP4",
      payload: {
        reason: "VP9 Profile 3 codec not supported",
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

  // Create OffscreenCanvas with alpha channel enabled
  console.log("[WebM] Creating OffscreenCanvas", width, "x", height)
  const offscreen = new OffscreenCanvas(width, height)
  const ctx = offscreen.getContext("2d", { alpha: true })
  if (!ctx) throw new Error("Worker: Could not get OffscreenCanvas context")
  console.log("[WebM] OffscreenCanvas context acquired")

  let bgImage: ImageBitmap | null = null
  if (settings.backgroundImageUrl && !settings.enableGreenScreen && !settings.enableTransparentBg) {
    try {
      const resp = await fetch(settings.backgroundImageUrl)
      const blob = await resp.blob()
      bgImage = await createImageBitmap(blob)
    } catch (err) {
      console.warn("[WebM] Failed to load background image:", err)
    }
  }

  // Set up mediabunny WebM output
  const target = new BufferTarget()
  const output = new Output({
    target,
    format: new WebMOutputFormat(),
  })

  // CanvasSource handles VP9 codec negotiation, alpha splitting (via WebGL2 ColorAlphaSplitter),
  // and dual encoding (color + alpha) internally — producing proper AlphaMode=1 in the WebM header
  // Use codec string and hardware acceleration from upfront support check
  const canvasSource = new CanvasSource(offscreen, {
    codec: "vp9",
    bitrate: 5_000_000,
    alpha: "keep",
    hardwareAcceleration: vp9HardwareAccel ?? "prefer-software",
    keyFrameInterval: 2,
    fullCodecString: vp9CodecString,
  })
  output.addVideoTrack(canvasSource)

  const audioSource = new EncodedAudioPacketSource("opus")
  output.addAudioTrack(audioSource)

  console.log("[WebM] mediabunny output created, starting...")
  await output.start()
  console.log("[WebM] mediabunny output started")

  let audioEncoderError: Error | null = null

  // Audio encoder — encode all PCM data to Opus packets before video loop
  console.log("[WebM] Starting Opus audio encoding, sampleRate:", sampleRate, "total samples:", channelData.length)
  const audioEncoder = new AudioEncoder({
    output: (chunk, meta) => {
      console.log("[WebM] AudioEncoder output chunk size:", chunk?.byteLength, "timestamp:", chunk?.timestamp)
      const packet = EncodedPacket.fromEncodedChunk(chunk)
      audioSource.add(packet, meta as any).catch((e) => {
        console.error("[WebM] audioSource.add error:", e)
        audioEncoderError = e
      })
    },
    error: (e) => {
      console.error("[WebM] AudioEncoder error: ", e)
      audioEncoderError = e
    },
  })
  audioEncoder.configure({
    codec: "opus",
    sampleRate,
    numberOfChannels: 1,
    bitrate: 128000,
  })

  // Feed all audio samples in chunks — copy data to avoid transferring channelData.buffer
  const opusFrameSize = 960
  let audioSampleOffset = 0
  let audioChunkCount = 0
  while (audioSampleOffset < channelData.length) {
    if (audioEncoderError) throw new Error("[WebM] AudioEncoder error: " + String(audioEncoderError))
    const remaining = channelData.length - audioSampleOffset
    const frameSize = Math.min(opusFrameSize, remaining)
    const slice = new Float32Array(channelData.buffer, audioSampleOffset * 4, frameSize)
    const copy = new Float32Array(slice)
    const audioData = new AudioData({
      format: "f32",
      sampleRate,
      numberOfFrames: frameSize,
      numberOfChannels: 1,
      timestamp: (audioSampleOffset / sampleRate) * 1_000_000,
      data: copy,
      transfer: [copy.buffer],
    })
    audioEncoder.encode(audioData)
    audioData.close()
    audioSampleOffset += frameSize
    audioChunkCount++
    if (audioChunkCount % 100 === 0) {
      console.log("[WebM] Audio encoding progress:", Math.round(audioSampleOffset / channelData.length * 100) + "%")
    }
  }

  console.log("[WebM] Audio encoding complete, flushing. Total chunks:", audioChunkCount)
  await audioEncoder.flush()
  audioEncoder.close()
  console.log("[WebM] Audio encoder done")

  const totalFrames = Math.ceil(duration * fps)
  console.log("[WebM] Starting VP9 video encoding, totalFrames:", totalFrames)

  // FFT setup
  const fftSize = FFT_SIZE
  console.log("[WebM] Generating frequency bands, barCount:", settings.barCount, "FFT_SIZE:", fftSize)
  const bands = generateFrequencyBands(
    settings.barCount,
    sampleRate,
    fftSize,
    settings.minFreq,
    settings.maxFreq,
  )
  let currentHeights = new Array(settings.barCount).fill(0)
  const dt = 1 / fps

  console.log("[WebM] Starting video frame loop, totalFrames:", totalFrames, "fps:", fps)

  for (let i = 0; i < totalFrames; i++) {
    const centerSample = Math.floor((i * sampleRate) / fps)
    const startSample = Math.max(0, centerSample - fftSize / 2)

    const timeData = new Float32Array(fftSize)
    for (let s = 0; s < fftSize; s++) {
      const idx = startSample + s
      if (idx < channelData.length) {
        timeData[s] = channelData[idx]
      }
    }

    if (i === 0) {
      console.log("[WebM] First frame: centerSample:", centerSample, "startSample:", startSample, "non-zero samples:", timeData.filter(v => v !== 0).length)
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

    if (i === 0) {
      console.log("[WebM] First frame heights (first 5):", frameHeights.slice(0, 5), "max:", Math.max(...frameHeights))
    }

    drawFrame(
      ctx as unknown as CanvasRenderingContext2D,
      frameHeights,
      settings,
      width,
      height,
      bgImage,
    )

    // CanvasSource internally creates a VideoFrame, handles color/alpha splitting,
    // dual encoding, and passes proper alpha side data to the muxer
    await canvasSource.add(i / fps, 1 / fps)

    if (i % 30 === 0) {
      onProgress(i / totalFrames)
    }

    if (i % 100 === 0) {
      console.log("[WebM] Frame progress:", i, "/", totalFrames)
    }
  }

  console.log("[WebM] Video frame loop complete, closing sources")
  canvasSource.close()
  console.log("[WebM] Closing audioSource")
  audioSource.close()
  console.log("[WebM] Finalizing output...")
  await output.finalize()
  const bufferSize = (target as any).buffer?.byteLength || 0
  console.log("[WebM] Output finalized, buffer size:", bufferSize, "bytes")

  return { buffer: (target as any).buffer!, format: "webm" }
}
