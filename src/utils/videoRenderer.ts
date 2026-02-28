import { FFmpeg } from "@ffmpeg/ffmpeg"
import { fetchFile } from "@ffmpeg/util"
import { VisualizerSettings, RenderTask } from "../types"
import { drawFrame } from "./renderUtils"
import { generateASSHeader, generateASSFrame } from "./assUtils"

export async function runVideoRender(
    task: RenderTask,
    file: File,
    ffmpeg: FFmpeg,
    updateProgress: (updates: {
        status?: RenderTask["status"],
        progress?: number,
        stageProgress?: Partial<RenderTask["stageProgress"]>,
        stageTimestamp?: { stage: keyof RenderTask["stageTimestamps"], type: 'start' | 'end' }
    }) => void,
): Promise<string> {
    updateProgress({ status: "analyzing", stageTimestamp: { stage: 'decoding', type: 'start' } })

    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const buffer = await ctx.decodeAudioData(await file.arrayBuffer())
    updateProgress({ stageTimestamp: { stage: 'decoding', type: 'end' } })

    const channelData = buffer.getChannelData(0)
    const sampleRate = buffer.sampleRate
    const duration = buffer.duration

    let spectrumData: number[][] = []
    if (!task.settings.encoder.startsWith("webcodecs")) {
        updateProgress({ stageTimestamp: { stage: 'physics', type: 'start' } })
        spectrumData = await simulatePhysics(
            channelData,
            sampleRate,
            duration,
            task.settings,
            (p) => updateProgress({ stageProgress: { physics: p } })
        )
        updateProgress({ stageTimestamp: { stage: 'physics', type: 'end' } })
    }
    updateProgress({ status: "rendering_frames", stageTimestamp: { stage: 'rendering', type: 'start' } })

    const width = 1280
    const height = 720
    let videoBlobUrl = ""

    if (task.settings.encoder.startsWith("webcodecs")) {
        const isHardware = task.settings.encoder === "webcodecs-hw"
        videoBlobUrl = await renderWithWebCodecs(
            spectrumData,
            task.settings,
            file,
            ffmpeg,
            width,
            height,
            duration,
            isHardware,
            (p) => updateProgress({
                stageProgress: {
                    physics: p,
                    rendering: p
                }
            }),
        )
    } else {
        videoBlobUrl = await renderWithFFmpegSoftware(
            spectrumData,
            task.settings,
            file,
            ffmpeg,
            width,
            height,
            task.fileName,
            (p) => updateProgress({ stageProgress: { rendering: p } }),
        )
    }

    updateProgress({ stageTimestamp: { stage: 'rendering', type: 'end' } })
    updateProgress({ status: "encoding", stageTimestamp: { stage: 'mixing', type: 'start' } })
    await new Promise(r => setTimeout(r, 100))
    updateProgress({ status: "done", stageTimestamp: { stage: 'mixing', type: 'end' } })
    return videoBlobUrl
}

async function simulatePhysics(
    channelData: Float32Array,
    sampleRate: number,
    duration: number,
    settings: VisualizerSettings,
    onProgress: (percent: number) => void
): Promise<number[][]> {
    const worker = new Worker(
        new URL("../workers/renderWorker.ts", import.meta.url),
        { type: "module" },
    )

    return new Promise<number[][]>((resolve, reject) => {
        worker.onmessage = (e) => {
            if (e.data.type === "ANALYSIS_COMPLETE") {
                worker.terminate()
                resolve(e.data.payload)
            } else if (e.data.type === "PROGRESS") {
                onProgress(Math.round(e.data.payload * 100))
            } else if (e.data.type === "ERROR") {
                worker.terminate()
                reject(new Error(e.data.payload))
            }
        }
        worker.postMessage(
            {
                type: "ANALYZE_AUDIO",
                payload: {
                    channelData,
                    sampleRate,
                    duration,
                    settings,
                    renderFps: settings.renderFps,
                    simulationFps: 60,
                },
            },
            [channelData.buffer.slice(0)],
        )
    })
}

async function renderWithWebCodecs(
    spectrumData: number[][],
    settings: VisualizerSettings,
    audioFile: File,
    ffmpeg: FFmpeg,
    width: number,
    height: number,
    duration: number,
    preferHardware: boolean,
    onProgress: (percent: number) => void,
): Promise<string> {
    const worker = new Worker(
        new URL("../workers/videoWorker.ts", import.meta.url),
        { type: "module" }
    )

    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const buffer = await ctx.decodeAudioData(await audioFile.arrayBuffer())
    const channelData = buffer.getChannelData(0)
    const sampleRate = buffer.sampleRate
    ctx.close()

    const videoBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        worker.onmessage = (e) => {
            if (e.data.type === "RENDER_COMPLETE") {
                worker.terminate()
                resolve(e.data.payload)
            } else if (e.data.type === "PROGRESS") {
                onProgress(Math.round(e.data.payload * 100))
            } else if (e.data.type === "ERROR") {
                worker.terminate()
                reject(new Error("Worker Error: " + e.data.payload))
            }
        }
        console.log(settings.decay)
        worker.postMessage({
            type: "RENDER_VIDEO",
            payload: {
                channelData,
                sampleRate,
                duration,
                settings,
                width,
                height,
                isHardware: preferHardware
            }
        }, [channelData.buffer])
    })

    onProgress(0.6)

    await ffmpeg.writeFile("video_only.mp4", new Uint8Array(videoBuffer))
    await ffmpeg.writeFile("audio.ext", await fetchFile(audioFile))

    onProgress(0.7)

    await ffmpeg.exec([
        "-i", "video_only.mp4",
        "-i", "audio.ext",
        "-c", "copy",
        "-map", "0:v:0",
        "-map", "1:a:0?",
        "-shortest",
        "final_hw.mp4"
    ])

    onProgress(0.9)
    const data = await ffmpeg.readFile("final_hw.mp4")
    return URL.createObjectURL(new Blob([(data as Uint8Array).buffer as any], { type: "video/mp4" }))
}

async function renderWithFFmpegSoftware(
    spectrumData: number[][],
    settings: VisualizerSettings,
    audioFile: File,
    ffmpeg: FFmpeg,
    width: number,
    height: number,
    fileName: string,
    onProgress: (percent: number) => void,
): Promise<string> {
    const fps = settings.renderFps || 30
    let assContent = generateASSHeader(width, height, fileName)

    for (let i = 0; i < spectrumData.length; i++) {
        const startTime = i / fps
        const endTime = (i + 1) / fps
        assContent += generateASSFrame(startTime, endTime, spectrumData[i], settings, width, height)
        if (i % 100 === 0) onProgress(Math.round((i / spectrumData.length) * 100))
    }

    const fontRes = await fetch("/Roboto.ttf")
    const fontBuffer = await fontRes.arrayBuffer()
    await ffmpeg.createDir("/fonts").catch(() => { })
    await ffmpeg.writeFile("/fonts/Roboto.ttf", new Uint8Array(fontBuffer))
    await ffmpeg.writeFile("audio.ext", await fetchFile(audioFile))
    await ffmpeg.writeFile("subtitles.ass", assContent)

    onProgress(0.5)

    await ffmpeg.exec([
        "-f", "lavfi",
        "-i", `color=c=black:s=${width}x${height}:r=${fps}`,
        "-i", "audio.ext",
        "-vf", "ass=subtitles.ass:fontsdir=/fonts",
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-shortest",
        "final_sw.mp4",
    ])

    onProgress(0.9)
    const data = await ffmpeg.readFile("final_sw.mp4")
    return URL.createObjectURL(new Blob([(data as Uint8Array).buffer as any], { type: "video/mp4" }))
}
