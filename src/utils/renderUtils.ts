import { VisualizerSettings } from "../types"
import { calculateBarGeometry } from "./visualizerMath"

export const drawFrame = (
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  data: number[],
  settings: VisualizerSettings,
  width: number,
  height: number,
  backgroundImage?: CanvasImageSource | null,
) => {
  const mode = settings.enableTransparentBg ? "transparent" : settings.enableGreenScreen ? "greenscreen" : "solid"
  if (settings.enableTransparentBg) {
    ctx.clearRect(0, 0, width, height)
  } else if (settings.enableGreenScreen) {
    ctx.fillStyle = "#00FF00"
    ctx.fillRect(0, 0, width, height)
  } else if (backgroundImage) {
    ctx.drawImage(backgroundImage, 0, 0, width, height)
    if (settings.backgroundBrightness < 1) {
      ctx.fillStyle = `rgba(0,0,0,${1 - settings.backgroundBrightness})`
      ctx.fillRect(0, 0, width, height)
    }
  } else {
    ctx.fillStyle = settings.backgroundColor || "#000"
    ctx.fillRect(0, 0, width, height)
  }

  if (!data) {
    console.warn("[drawFrame] data is null/undefined, mode:", mode)
    return
  }

  const { positiveBars, negativeBars } = calculateBarGeometry(
    data,
    settings,
    width,
    height,
  )

  if (positiveBars.length > 0) {
    ctx.fillStyle = settings.positiveColor
    ctx.beginPath()
    for (const bar of positiveBars) {
      if ((ctx as any).roundRect) {
        ;(ctx as any).roundRect(
          bar.x,
          bar.y,
          bar.width,
          bar.height,
          settings.cornerRadius,
        )
      } else {
        ctx.rect(bar.x, bar.y, bar.width, bar.height)
      }
    }
    ctx.fill()
  }

  if (negativeBars.length > 0) {
    ctx.fillStyle = settings.negativeColor
    ctx.beginPath()
    for (const bar of negativeBars) {
      if ((ctx as any).roundRect) {
        ;(ctx as any).roundRect(
          bar.x,
          bar.y,
          bar.width,
          bar.height,
          settings.cornerRadius,
        )
      } else {
        ctx.rect(bar.x, bar.y, bar.width, bar.height)
      }
    }
    ctx.fill()
  }

  // Log first call details
  if (typeof (ctx as any).__logged === "undefined") {
    ;(ctx as any).__logged = true
    console.log("[drawFrame] First frame:", {
      mode,
      dataLength: data?.length,
      dataFirst5: data?.slice(0, 5),
      positiveBars: positiveBars.length,
      negativeBars: negativeBars.length,
      positiveColor: settings.positiveColor,
      negativeColor: settings.negativeColor,
      backgroundColor: settings.backgroundColor,
      barCount: settings.barCount,
    })
    if (positiveBars.length > 0) {
      console.log("[drawFrame] First positive bar:", positiveBars[0])
    }
  }
}
