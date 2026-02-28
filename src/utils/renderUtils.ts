import { VisualizerSettings } from "../types"
import { calculateBarGeometry } from "./visualizerMath"

export const drawFrame = (
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  data: number[],
  settings: VisualizerSettings,
  width: number,
  height: number,
) => {
  ctx.fillStyle = settings.backgroundColor
  ctx.fillRect(0, 0, width, height)

  if (!data) return

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
        ;(ctx as any).roundRect(bar.x, bar.y, bar.width, bar.height, settings.cornerRadius)
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
        ;(ctx as any).roundRect(bar.x, bar.y, bar.width, bar.height, settings.cornerRadius)
      } else {
        ctx.rect(bar.x, bar.y, bar.width, bar.height)
      }
    }
    ctx.fill()
  }
}
