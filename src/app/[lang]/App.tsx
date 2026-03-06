"use client"

import React, { useState, useEffect, useRef } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { Visualizer } from "../../components/Visualizer"
import { FloatingControls } from "../../components/FloatingControls"
import { LeftDrawer } from "../../components/LeftDrawer"
import { RightDrawer } from "../../components/RightDrawer"
import { useAudioPlayer } from "../../hooks/useAudio"
import { useI18n } from "./i18nContext"
import { AudioFile, RenderTask, VisualizerSettings } from "../../types"
import type { FFmpeg } from "@ffmpeg/ffmpeg"
import { fetchFile, toBlobURL } from "@ffmpeg/util"
import { generateASSHeader, generateASSFrame } from "../../utils/assUtils"
import { runVideoRender } from "../../utils/videoRenderer"
import { motion } from "motion/react"
import { PopOutButton } from "../../components/PopOutButton"
import { PlayButton } from "../../components/PlayButton"

export const DEFAULT_SETTINGS: VisualizerSettings = {
  barCount: 24,
  barWidth: 12,
  barHeightMultiplier: 1.0,
  cornerRadius: 4,
  totalWidth: 800,
  spacing: 800 / 24,
  color: "#ffffff",
  backgroundColor: "#000000",
  positiveHeightScale: 1.0,
  negativeHeightScale: 0.5,
  positiveColor: "#ffffff",
  negativeColor: "#2a2a2a",
  contrast: 1.0,
  attack: 0.26,
  decay: 0.93,
  yOffset: -30,
  renderFps: 60,
  encoder: "webcodecs-hw",
  softCeilingThreshold: 0.7,
  softCeilingStrength: 2.0,
  referenceFps: 144,
  minFreq: 20,
  maxFreq: 16000,
}

const RENDER_FPS = 30
const SIMULATION_FPS = 60
const WIDTH = 1280
const HEIGHT = 720

export default function App() {
  const { locale: lang, t: dict, switchLocale } = useI18n()
  const navigate = useNavigate()
  const location = useLocation()

  const [files, setFiles] = useState<AudioFile[]>([])
  const [currentFileId, setCurrentFileId] = useState<string | null>(null)
  const [settings, setSettings] = useState<VisualizerSettings>(DEFAULT_SETTINGS)
  const [leftOpen, setLeftOpen] = useState(false)
  const [rightOpen, setRightOpen] = useState(false)

  const {
    isPlaying,
    loadAudio,
    togglePlay,
    seek,
    currentTime,
    duration,
    analyser,
    audioBuffer,
  } = useAudioPlayer()

  const [queue, setQueue] = useState<RenderTask[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const ffmpegRef = useRef<FFmpeg | null>(null)
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false)
  const currentTaskIdRef = useRef<string | null>(null)
  const activeWorkerRef = useRef<Worker | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const { FFmpeg } = await import("@ffmpeg/ffmpeg")
        const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm"
        if (!ffmpegRef.current) {
          ffmpegRef.current = new FFmpeg()
        }
        const ffmpeg = ffmpegRef.current
        ffmpeg.on("log", ({ message }) => console.log("[FFmpeg]", message))

        ffmpeg.on("progress", ({ progress }) => {
          const taskId = currentTaskIdRef.current
          if (taskId) {
            const p = Math.round(progress * 100)
            setQueue((prev) =>
              prev.map((t) => {
                if (t.id !== taskId) return t
                const stage =
                  t.status === "rendering_frames" ? "rendering" : "mixing"
                return {
                  ...t,
                  progress: p,
                  stageProgress: { ...t.stageProgress, [stage]: p },
                }
              }),
            )
          }
        })

        await ffmpeg.load({
          coreURL: await toBlobURL(
            `${baseURL}/ffmpeg-core.js`,
            "text/javascript",
          ),
          wasmURL: await toBlobURL(
            `${baseURL}/ffmpeg-core.wasm`,
            "application/wasm",
          ),
        })
        setFfmpegLoaded(true)
      } catch (err) {
        console.error("FFmpeg load failed", err)
      }
    }
    load()
  }, [])

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // alert when queue
      if (queue.length > 0 || files.length > 0) {
        e.preventDefault()
        // routine, set returnValue
        e.returnValue = "工作進度不被保存"
        return e.returnValue
      }
    }

    window.addEventListener("beforeunload", handleBeforeUnload)

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload)
    }
  }, [queue.length, files.length])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const ctx = new (
      window.AudioContext || (window as any).webkitAudioContext
    )()
    const buffer = await file.arrayBuffer()
    const audioBuffer = await ctx.decodeAudioData(buffer)
    const duration = audioBuffer.duration
    ctx.close()

    const newFile: AudioFile = {
      id: crypto.randomUUID(),
      file,
      name: file.name,
      size: file.size,
      duration,
      url: URL.createObjectURL(file),
    }

    setFiles((prev) => [newFile, ...prev])
    if (!currentFileId) {
      handleSelectFile(newFile)
    }
  }

  const handleSelectFile = async (file: AudioFile) => {
    setCurrentFileId(file.id)
    await loadAudio(file.file)
  }

  const handleDeleteFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id))
    if (currentFileId === id) {
      setCurrentFileId(null)
    }
  }

  const handleAddToQueue = () => {
    if (!currentFileId) return
    const file = files.find((f) => f.id === currentFileId)
    if (!file) return

    const task: RenderTask = {
      id: crypto.randomUUID(),
      fileId: file.id,
      fileName: file.name,
      settings: { ...settings },
      status: "idle",
      progress: 0,
      stageProgress: {
        physics: 0,
        rendering: 0,
        mixing: 0,
      },
      stageTimestamps: {},
      createdAt: Date.now(),
    }

    setQueue((prev) => [...prev, task])
    setRightOpen(true)
  }

  useEffect(() => {
    const processNext = async () => {
      if (isProcessing || !ffmpegLoaded) return

      const nextTask = queue.find((t) => t.status === "idle")
      if (!nextTask) return

      const fileObj = files.find((f) => f.id === nextTask.fileId)
      if (!fileObj) {
        setQueue((prev) =>
          prev.map((t) =>
            t.id === nextTask.id
              ? { ...t, status: "error", error: "File not found" }
              : t,
          ),
        )
        return
      }

      setIsProcessing(true)

      try {
        await runRender(nextTask, fileObj.file)
      } catch (err: any) {
        setQueue((prev) =>
          prev.map((t) =>
            t.id === nextTask.id
              ? { ...t, status: "error", error: err.message }
              : t,
          ),
        )
      } finally {
        setIsProcessing(false)
      }
    }

    processNext()
  }, [queue, isProcessing, ffmpegLoaded, files])

  const updateTask = (id: string, updates: Partial<RenderTask>) => {
    setQueue((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    )
  }

  const runRender = async (task: RenderTask, file: File) => {
    const ffmpeg = ffmpegRef.current
    currentTaskIdRef.current = task.id

    try {
      const resultUrl = await runVideoRender(
        task,
        file,
        ffmpeg,
        (updates: any) => {
          const taskId = task.id
          setQueue((prev) =>
            prev.map((t) => {
              if (t.id !== taskId) return t
              const next = { ...t, ...updates }
              if (updates.stageProgress) {
                next.stageProgress = {
                  ...t.stageProgress,
                  ...updates.stageProgress,
                }
              }
              if (updates.stageTimestamp) {
                const { stage, type } = updates.stageTimestamp
                const now = Date.now()
                const currentTimestamps = { ...t.stageTimestamps }
                if (type === "start") {
                  currentTimestamps[stage] = { start: now }
                } else if (type === "end" && currentTimestamps[stage]) {
                  currentTimestamps[stage] = {
                    ...currentTimestamps[stage],
                    end: now,
                  }
                }
                next.stageTimestamps = currentTimestamps
              }
              return next
            }),
          )
        },
      )
      updateTask(task.id, { status: "done", progress: 100, resultUrl })
    } catch (error: any) {
      updateTask(task.id, { status: "error", error: error.message })
    } finally {
      currentTaskIdRef.current = null
    }
  }

  const handleCancelTask = async (taskId: string) => {
    if (currentTaskIdRef.current === taskId) {
      if (activeWorkerRef.current) {
        activeWorkerRef.current.terminate()
        activeWorkerRef.current = null
      }
      try {
        const ffmpeg = ffmpegRef.current
        await ffmpeg?.deleteFile("input.mp3").catch(() => {})
        await ffmpeg?.deleteFile("output.mp4").catch(() => {})
      } catch (e) {
        console.warn("Failed to clean up FFmpeg files on cancel", e)
      }

      setIsProcessing(false)
      currentTaskIdRef.current = null
    }

    setQueue((prev) => prev.filter((t) => t.id !== taskId))
  }

  return (
    <div className="relative w-full h-full overflow-hidden">
      <div className="absolute inset-0 z-0">
        <Visualizer
          settings={settings}
          analyser={analyser}
          isPlaying={isPlaying}
        />
      </div>

      <LeftDrawer
        files={files}
        currentFileId={currentFileId}
        onSelect={handleSelectFile}
        onDelete={handleDeleteFile}
        onUpload={handleUpload}
        isOpen={leftOpen}
        setIsOpen={setLeftOpen}
      />

      <RightDrawer
        queue={queue}
        isOpen={rightOpen}
        setIsOpen={setRightOpen}
        onCancel={handleCancelTask}
      />

      <FloatingControls
        isPlaying={isPlaying}
        onTogglePlay={togglePlay}
        onRender={handleAddToQueue}
        settings={settings}
        onSettingsChange={setSettings}
        currentTime={currentTime}
        duration={duration}
        onSeek={seek}
        currentFileName={files.find((f) => f.id === currentFileId)?.name}
      />

      <PopOutButton
        title={lang === "en" ? "Switch to Chinese" : "切換至英文"}
        onClick={() => {
          const nextLang = lang === "en" ? "zh" : "en"
          switchLocale(nextLang)
          // replace first segment of path
          const segments = location.pathname.split("/")
          segments[1] = nextLang
          navigate(segments.join("/"))
        }}
      >
        {lang === "zh" ? "中文" : "EN"}
      </PopOutButton>

      <PlayButton onClick={togglePlay} isPlaying={isPlaying}></PlayButton>
    </div>
  )
}
