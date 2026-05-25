import { FFmpeg } from "@ffmpeg/ffmpeg"
import { fetchFile } from "@ffmpeg/util"
import { VisualizerSettings, RenderTask } from "../types"

type UpdateProgressFn = (updates: {
    status?: RenderTask["status"],
    progress?: number,
    stageProgress?: Partial<RenderTask["stageProgress"]>,
    stageTimestamp?: { stage: keyof RenderTask["stageTimestamps"], type: 'start' | 'end' }
}) => void;

export async function runVideoRender(
    task: RenderTask,
    file: File,
    ffmpeg: FFmpeg,
    updateProgressOriginal: UpdateProgressFn,
): Promise<string> {
    const updateProgress: UpdateProgressFn = (updates) => {
        console.log("[Render State]", updates);
        updateProgressOriginal(updates);
    };

    updateProgress({ status: "analyzing", stageTimestamp: { stage: 'decoding', type: 'start' } })

    const ctx = new (window.AudioContext || (window as any).webkitAudioContext())
    const buffer = await ctx.decodeAudioData(await file.arrayBuffer())
    const duration = buffer.duration
    const sampleRate = buffer.sampleRate
    const channelData = buffer.getChannelData(0)
    ctx.close()

    updateProgress({ stageTimestamp: { stage: 'decoding', type: 'end' } })
    updateProgress({ stageTimestamp: { stage: 'rendering', type: 'start' } })

    const width = 1280
    const height = 720

    const isHardware = task.settings.encoder === "webcodecs-hw"

    const useWebM = task.settings.enableTransparentBg
    let resultUrl: string

    if (useWebM) {
        resultUrl = await renderWebM(
            task.settings,
            file,
            ffmpeg,
            channelData,
            sampleRate,
            duration,
            width,
            height,
            isHardware,
            updateProgress,
        )
    } else {
        resultUrl = await renderMP4(
            task.settings,
            file,
            ffmpeg,
            channelData,
            sampleRate,
            duration,
            width,
            height,
            isHardware,
            updateProgress,
        )
    }

    updateProgress({ status: "done", stageTimestamp: { stage: 'mixing', type: 'end' } })
    return resultUrl
}

async function renderMP4(
    settings: VisualizerSettings,
    audioFile: File,
    ffmpeg: FFmpeg,
    channelData: Float32Array,
    sampleRate: number,
    duration: number,
    width: number,
    height: number,
    preferHardware: boolean,
    updateProgress: UpdateProgressFn,
): Promise<string> {
    const worker = new Worker(
        new URL("../workers/videoWorker.ts", import.meta.url),
        { type: "module" }
    )

    const videoBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        worker.onmessage = (e) => {
            if (e.data.type === "RENDER_COMPLETE") {
                worker.terminate()
                resolve(e.data.payload)
            } else if (e.data.type === "PROGRESS") {
                const p = Math.round(e.data.payload * 100)
                updateProgress({
                    stageProgress: {
                        rendering: p
                    }
                })
            } else if (e.data.type === "ERROR") {
                worker.terminate()
                reject(new Error("Worker Error: " + e.data.payload))
            }
        }
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

    updateProgress({ stageTimestamp: { stage: 'rendering', type: 'end' } })
    updateProgress({ status: "encoding", stageTimestamp: { stage: 'mixing', type: 'start' } })

    await ffmpeg.writeFile("video_only.mp4", new Uint8Array(videoBuffer))
    await ffmpeg.writeFile("audio.ext", await fetchFile(audioFile))

    const onFFmpegProgress = ({ progress, time }: any) => {
        console.log("[FFmpeg HW] progress:", progress, "time:", time);
        if (progress >= 0 && progress <= 1) {
            updateProgress({ stageProgress: { mixing: Math.min(100, Math.max(0, Math.round(progress * 100))) } })
        } else if (time !== undefined && duration > 0) {
            const timeSeconds = typeof time === "number" ? time / 1000000 : 0;
            const fallbackProgress = timeSeconds / duration;
            updateProgress({ stageProgress: { mixing: Math.min(100, Math.max(0, Math.round(fallbackProgress * 100))) } })
        }
    }
    ffmpeg.on("progress", onFFmpegProgress)

    await ffmpeg.exec([
        "-i", "video_only.mp4",
        "-i", "audio.ext",
        "-c", "copy",
        "-map", "0:v:0",
        "-map", "1:a:0?",
        "-shortest",
        "final_hw.mp4"
    ])

    ffmpeg.off("progress", onFFmpegProgress)
    updateProgress({ stageProgress: { mixing: 100 } })

    const data = await ffmpeg.readFile("final_hw.mp4")
    return URL.createObjectURL(new Blob([(data as Uint8Array).buffer as any], { type: "video/mp4" }))
}

async function renderWebM(
    settings: VisualizerSettings,
    audioFile: File,
    ffmpeg: FFmpeg,
    channelData: Float32Array,
    sampleRate: number,
    duration: number,
    width: number,
    height: number,
    preferHardware: boolean,
    updateProgress: UpdateProgressFn,
): Promise<string> {
    const worker = new Worker(
        new URL("../workers/videoWorker.ts", import.meta.url),
        { type: "module" }
    )

    return new Promise<string>((resolve, reject) => {
        worker.onmessage = async (e) => {
            if (e.data.type === "FALLBACK_TO_MP4") {
                console.error('[Render] Unexpected VP9 fallback to MP4 on supported platform:', e.data.payload);
                return;
            }
            if (e.data.type === "RENDER_COMPLETE") {
                worker.terminate()
                const format = e.data.format as string
                const buffer = e.data.payload as ArrayBuffer

                if (format === "webm") {
                    const blob = new Blob([buffer], { type: "video/webm" })
                    resolve(URL.createObjectURL(blob))
                } else {
                    // VP9 not supported, fell back to H.264/MP4 – need FFmpeg muxing
                    console.warn("[Render] VP9 fallback, muxing with FFmpeg")
                    updateProgress({ stageTimestamp: { stage: 'rendering', type: 'end' } })
                    updateProgress({ status: "encoding", stageTimestamp: { stage: 'mixing', type: 'start' } })

                    try {
                        const url = await muxWithFFmpeg(ffmpeg, audioFile, buffer, updateProgress, duration)
                        resolve(url)
                    } catch (err: any) {
                        reject(err)
                    }
                }
            } else if (e.data.type === "PROGRESS") {
                const p = Math.round(e.data.payload * 100)
                updateProgress({
                    stageProgress: { rendering: p }
                })
            } else if (e.data.type === "ERROR") {
                worker.terminate()
                reject(new Error("Worker Error: " + e.data.payload))
            }
        }
        worker.postMessage({
            type: "RENDER_VIDEO",
            payload: {
                channelData,
                sampleRate,
                duration,
                settings,
                width,
                height,
                isHardware: preferHardware,
            }
        }, [channelData.buffer])
    })
}

async function muxWithFFmpeg(
    ffmpeg: FFmpeg,
    audioFile: File,
    videoBuffer: ArrayBuffer,
    updateProgress: UpdateProgressFn,
    duration: number,
): Promise<string> {
    await ffmpeg.writeFile("video_only.mp4", new Uint8Array(videoBuffer))
    await ffmpeg.writeFile("audio.ext", await fetchFile(audioFile))

    const onProgress = ({ progress, time }: any) => {
        if (progress >= 0 && progress <= 1) {
            updateProgress({ stageProgress: { mixing: Math.min(100, Math.max(0, Math.round(progress * 100))) } })
        } else if (time !== undefined && duration > 0) {
            const timeSeconds = typeof time === "number" ? time / 1000000 : 0;
            const fallbackProgress = timeSeconds / duration;
            updateProgress({ stageProgress: { mixing: Math.min(100, Math.max(0, Math.round(fallbackProgress * 100))) } })
        }
    }
    ffmpeg.on("progress", onProgress)

    await ffmpeg.exec([
        "-i", "video_only.mp4",
        "-i", "audio.ext",
        "-c", "copy",
        "-map", "0:v:0",
        "-map", "1:a:0?",
        "-shortest",
        "final_hw.mp4"
    ])

    ffmpeg.off("progress", onProgress)
    updateProgress({ stageProgress: { mixing: 100 } })

    const data = await ffmpeg.readFile("final_hw.mp4")
    return URL.createObjectURL(new Blob([(data as Uint8Array).buffer as ArrayBuffer], { type: "video/mp4" }))
}