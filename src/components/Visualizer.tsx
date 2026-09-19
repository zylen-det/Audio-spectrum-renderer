import React, { useEffect, useRef } from "react"
import { VisualizerSettings } from "../types"
import { drawFrame } from "../utils/renderUtils"
import {
  calculateCavaBarHeights,
  createCavaPlan,
  createCavaState,
} from "../utils/audioMath"

interface VisualizerProps {
  settings: VisualizerSettings
  analyser: AnalyserNode | null
  isPlaying: boolean
}

export const Visualizer: React.FC<VisualizerProps> = ({
  settings,
  analyser,
  isPlaying,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>(0)
  const currentHeightsRef = useRef<number[]>([])
  const lastTimeRef = useRef<number>(performance.now())
  const backgroundImageRef = useRef<HTMLImageElement | null>(null)

  useEffect(() => {
    if (settings.backgroundImageUrl) {
      const img = new Image()
      img.onload = () => { backgroundImageRef.current = img }
      img.src = settings.backgroundImageUrl
    } else {
      backgroundImageRef.current = null
    }
  }, [settings.backgroundImageUrl])

  useEffect(() => {
    if (currentHeightsRef.current.length !== settings.barCount) {
      currentHeightsRef.current = new Array(settings.barCount).fill(0)
      const time = Date.now() / 1000
      for (let i = 0; i < settings.barCount; i++) {
        const val = Math.sin(i * 0.5 + time) * 0.05 + 0.1
        currentHeightsRef.current[i] = val
      }
    }
  }, [settings.barCount])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)

    const plan = createCavaPlan(
      settings.barCount,
      analyser?.context.sampleRate || 44100,
      settings.minFreq,
      settings.maxFreq,
    )
    const cavaState = createCavaState(settings.barCount)

    const render = (time: number) => {
      const dt = Math.min(0.1, (time - lastTimeRef.current) / 1000)
      lastTimeRef.current = time

      if (settings.enableTransparentBg) {
        ctx.clearRect(0, 0, rect.width, rect.height)
      } else if (settings.enableGreenScreen) {
        ctx.fillStyle = "#00FF00"
        ctx.fillRect(0, 0, rect.width, rect.height)
      } else {
        ctx.fillStyle = "#000" //hardcode black background for preview
        ctx.fillRect(0, 0, rect.width, rect.height)
      }

      if (isPlaying && analyser) {
        const timeData = new Float32Array(plan.bassFftSize)
        analyser.getFloatTimeDomainData(timeData)
        currentHeightsRef.current = calculateCavaBarHeights(
          timeData,
          plan,
          cavaState,
          settings,
          dt,
        )
      } else {
        const idleSpeed = dt * 10
        const idleTime = time / 1000
        for (let i = 0; i < settings.barCount; i++) {
          const val = Math.sin(i * 0.5 + idleTime) * 0.05 + 0.1
          const target = val
          currentHeightsRef.current[i] +=
            (target - currentHeightsRef.current[i]) * idleSpeed
        }
      }

      drawFrame(
        ctx,
        currentHeightsRef.current,
        settings,
        rect.width,
        rect.height,
        backgroundImageRef.current,
      )
      animationRef.current = requestAnimationFrame(render)
    }

    lastTimeRef.current = performance.now()
    animationRef.current = requestAnimationFrame(render)

    return () => cancelAnimationFrame(animationRef.current)
  }, [settings, analyser, isPlaying])

  return (
    <div className="w-full h-full flex items-center justify-center">
      <canvas
        ref={canvasRef}
        className="w-full h-full max-w-[1280px] max-h-[720px]"
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  )
}

export default Visualizer
