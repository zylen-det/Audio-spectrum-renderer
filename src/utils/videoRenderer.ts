import { FFmpeg } from "@ffmpeg/ffmpeg"
import { fetchFile } from "@ffmpeg/util"
import { VisualizerSettings, RenderTask } from "../types"
import { resolveTrimRange } from "./trimRange"

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
): Promise<{ url: string; format: "mp4" | "webm" | "gif" }> {
    const updateProgress: UpdateProgressFn = (updates) => {
        console.log("[Render State]", updates);
        updateProgressOriginal(updates);
    };

    console.log("[Render] runVideoRender called", {
        fileName: file.name,
        encoder: task.settings.encoder,
        enableTransparentBg: task.settings.enableTransparentBg,
        enableGreenScreen: task.settings.enableGreenScreen,
        positiveColor: task.settings.positiveColor,
        backgroundColor: task.settings.backgroundColor,
        barCount: task.settings.barCount,
        renderFps: task.settings.renderFps,
    })

    updateProgress({ status: "analyzing", stageTimestamp: { stage: 'decoding', type: 'start' } })

    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const buffer = await ctx.decodeAudioData(await file.arrayBuffer())
    const fullDuration = buffer.duration
    const sampleRate = buffer.sampleRate
    const fullChannelData = buffer.getChannelData(0)
    ctx.close()

    console.log("[Render] Audio decoded", { duration: fullDuration, sampleRate, channelDataLength: fullChannelData.length, numberOfChannels: buffer.numberOfChannels })

    // Trim to export/preview range. Falls back to full length when unset.
    const trim = resolveTrimRange(
        task.settings.trimStart ?? 0,
        task.settings.trimEnd ?? -1,
        fullDuration,
    )
    const isTrimmed = trim.start > 1e-3 || trim.end < fullDuration - 1e-3
    const duration = trim.end - trim.start
    const startSample = Math.floor(trim.start * sampleRate)
    const endSample = Math.min(fullChannelData.length, Math.ceil(trim.end * sampleRate))
    const channelData = isTrimmed
        ? fullChannelData.slice(startSample, endSample)
        : fullChannelData
    const audioTrimArgs = isTrimmed
        ? ["-ss", trim.start.toFixed(3), "-t", duration.toFixed(3)]
        : []

    console.log("[Render] Trim range", { ...trim, isTrimmed, duration })

    updateProgress({ stageTimestamp: { stage: 'decoding', type: 'end' } })
    updateProgress({ stageTimestamp: { stage: 'rendering', type: 'start' } })

    const width = 1280
    const height = 720

    const isHardware = task.settings.encoder === "webcodecs-hw"
    const format = task.settings.exportFormat || "mp4"

    console.log("[Render] Render config", { format, isHardware, width, height })

    let result: { url: string; format: "mp4" | "webm" | "gif" }

    switch (format) {
        case "gif":
            console.log("[Render] Starting GIF render path")
            result = await renderGif(
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
            break
        case "webm":
            console.log("[Render] Starting WebM render path")
            result = await renderWebM(
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
                audioTrimArgs,
            )
            break
        default: // "mp4"
            console.log("[Render] Starting MP4 render path")
            result = await renderMP4(
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
                audioTrimArgs,
            )
            break
    }

    console.log("[Render] Render complete, url:", result.url, "format:", result.format)
    updateProgress({ status: "done", stageTimestamp: { stage: 'mixing', type: 'end' } })
    return result
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
    audioTrimArgs: string[],
): Promise<{ url: string; format: "mp4" }> {
    console.log("[MP4] renderMP4 called", { duration, sampleRate, preferHardware, channelDataLength: channelData.length })
    const worker = new Worker(
        new URL("../workers/videoWorker.ts", import.meta.url),
        { type: "module" }
    )

    console.log("[MP4] Sending RENDER_VIDEO to worker")
    const videoBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        worker.onmessage = (e) => {
            console.log("[MP4] Worker message:", e.data.type, e.data.type === "RENDER_COMPLETE" ? { format: e.data.format, bufferSize: e.data.payload?.byteLength } : "")
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
                console.error("[MP4] Worker error:", e.data.payload)
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

    console.log("[MP4] Got video buffer from worker, size:", videoBuffer?.byteLength, "bytes")

    updateProgress({ stageTimestamp: { stage: 'rendering', type: 'end' } })
    updateProgress({ status: "encoding", stageTimestamp: { stage: 'mixing', type: 'start' } })

    console.log("[MP4] Writing files to FFmpeg virtual filesystem")
    await ffmpeg.writeFile("video_only.mp4", new Uint8Array(videoBuffer))
    await ffmpeg.writeFile("audio.ext", await fetchFile(audioFile))
    console.log("[MP4] Files written, starting FFmpeg mux")

    const onFFmpegProgress = ({ progress, time }: any) => {
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
        ...audioTrimArgs,
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
    const url = URL.createObjectURL(new Blob([(data as Uint8Array).buffer as any], { type: "video/mp4" }))
    console.log("[MP4] Final MP4 file size:", (data as Uint8Array).byteLength, "bytes, url:", url)
    return { url, format: "mp4" }
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
    audioTrimArgs: string[],
): Promise<{ url: string; format: "mp4" | "webm" }> {
    console.log("[WebM] renderWebM called", { duration, sampleRate, preferHardware, channelDataLength: channelData.length })
    const worker = new Worker(
        new URL("../workers/videoWorker.ts", import.meta.url),
        { type: "module" }
    )

    return new Promise<{ url: string; format: "mp4" | "webm" }>((resolve, reject) => {
        worker.onmessage = async (e) => {
            console.log("[WebM] Worker message:", e.data.type, 
                e.data.type === "RENDER_COMPLETE" ? { format: e.data.format, bufferSize: e.data.payload?.byteLength } :
                e.data.type === "FALLBACK_TO_MP4" ? { payload: e.data.payload } :
                e.data.type === "PROGRESS" ? { progress: e.data.payload } :
                e.data.type === "ERROR" ? { error: e.data.payload } :
                "")

            if (e.data.type === "FALLBACK_TO_MP4") {
                console.warn('[WebM] VP9 fallback to MP4 triggered:', e.data.payload);
                return;
            }
            if (e.data.type === "RENDER_COMPLETE") {
                worker.terminate()
                const format = e.data.format as "mp4" | "webm"
                const buffer = e.data.payload as ArrayBuffer
                console.log("[WebM] RENDER_COMPLETE, format:", format, "bufferSize:", buffer?.byteLength, "bytes")

                if (format === "webm") {
                    console.log("[WebM] Creating WebM blob directly. Buffer size:", buffer?.byteLength)
                    const blob = new Blob([buffer], { type: "video/webm" })
                    const url = URL.createObjectURL(blob)
                    console.log("[WebM] WebM blob created, size:", blob.size, "bytes, url:", url)
                    updateProgress({ stageTimestamp: { stage: 'rendering', type: 'end' } })
                    updateProgress({ status: "encoding", stageTimestamp: { stage: 'mixing', type: 'start' } })
                    updateProgress({ stageProgress: { mixing: 100 } })
                    resolve({ url, format: "webm" })
                } else {
                    // VP9 not supported, fell back to H.264/MP4 – need FFmpeg muxing
                    console.warn("[WebM] VP9 not supported, muxing MP4 fallback with FFmpeg. Buffer size:", buffer?.byteLength)
                    updateProgress({ stageTimestamp: { stage: 'rendering', type: 'end' } })
                    updateProgress({ status: "encoding", stageTimestamp: { stage: 'mixing', type: 'start' } })

                    try {
                        const { url, format } = await muxWithFFmpeg(ffmpeg, audioFile, buffer, updateProgress, duration, audioTrimArgs)
                        console.log("[WebM] FFmpeg mux complete, url:", url)
                        resolve({ url, format })
                    } catch (err: any) {
                        console.error("[WebM] FFmpeg mux error:", err)
                        reject(err)
                    }
                }
            } else if (e.data.type === "PROGRESS") {
                const p = Math.round(e.data.payload * 100)
                updateProgress({
                    stageProgress: { rendering: p }
                })
            } else if (e.data.type === "ERROR") {
                console.error("[WebM] Worker error:", e.data.payload)
                worker.terminate()
                reject(new Error("Worker Error: " + e.data.payload))
            }
        }
        console.log("[WebM] Sending RENDER_VIDEO to worker")
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

async function renderGif(
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
): Promise<{ url: string; format: "gif" }> {
    const useTransparentBg = settings.enableTransparentBg
    const fps = Math.min(settings.renderFps || 30, 15)

    console.log("[GIF] renderGif called", { duration, sampleRate, useTransparentBg, fps })

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
                updateProgress({
                    stageProgress: { rendering: Math.round(e.data.payload * 100) }
                })
            } else if (e.data.type === "ERROR") {
                worker.terminate()
                reject(new Error("Worker Error: " + e.data.payload))
            } else if (e.data.type === "FALLBACK_TO_MP4") {
                console.warn('[GIF] VP9 fallback to MP4 triggered')
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

    console.log("[GIF] Got video buffer from worker, size:", videoBuffer?.byteLength, "bytes")

    updateProgress({ stageTimestamp: { stage: 'rendering', type: 'end' } })
    updateProgress({ status: "encoding", stageTimestamp: { stage: 'mixing', type: 'start' } })

    const inputExt = useTransparentBg ? "webm" : "mp4"
    await ffmpeg.writeFile(`input.${inputExt}`, new Uint8Array(videoBuffer))

    let filter: string
    if (useTransparentBg) {
        filter = `fps=${fps},split[s0][s1];[s0]palettegen=max_colors=256[p];[s1][p]paletteuse=alpha_threshold=128`
    } else {
        filter = `fps=${fps},scale=${width}:${height}:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=256[p];[s1][p]paletteuse=dither=bayer`
    }

    console.log("[GIF] FFmpeg filter:", filter)

    const onProgress = ({ progress, time }: any) => {
        if (progress >= 0 && progress <= 1) {
            updateProgress({ stageProgress: { mixing: Math.min(100, Math.max(0, Math.round(progress * 100))) } })
        } else if (time !== undefined && duration > 0) {
            const timeSeconds = typeof time === "number" ? time / 1000000 : 0
            const fallbackProgress = timeSeconds / duration
            updateProgress({ stageProgress: { mixing: Math.min(100, Math.max(0, Math.round(fallbackProgress * 100))) } })
        }
    }
    ffmpeg.on("progress", onProgress)

    const decoderArgs = useTransparentBg ? ["-c:v", "libvpx-vp9"] : []

    await ffmpeg.exec([
        ...decoderArgs,
        "-i", `input.${inputExt}`,
        "-vf", filter,
        "-loop", "0",
        "output.gif"
    ])

    ffmpeg.off("progress", onProgress)
    updateProgress({ stageProgress: { mixing: 100 } })

    const data = await ffmpeg.readFile("output.gif")
    const url = URL.createObjectURL(new Blob([(data as Uint8Array).buffer as any], { type: "image/gif" }))
    console.log("[GIF] Final GIF file size:", (data as Uint8Array).byteLength, "bytes, url:", url)
    return { url, format: "gif" }
}

async function muxWithFFmpeg(
    ffmpeg: FFmpeg,
    audioFile: File,
    videoBuffer: ArrayBuffer,
    updateProgress: UpdateProgressFn,
    duration: number,
    audioTrimArgs: string[],
): Promise<{ url: string; format: "mp4" }> {
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
        ...audioTrimArgs,
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
    const url = URL.createObjectURL(new Blob([(data as Uint8Array).buffer as ArrayBuffer], { type: "video/mp4" }))
    return { url, format: "mp4" }
}