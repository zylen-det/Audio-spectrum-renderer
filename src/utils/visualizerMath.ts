import { VisualizerSettings } from "../types"

export interface BarGeometry {
  x: number
  y: number
  width: number
  height: number
  color: string
}

export interface FrameGeometry {
  positiveBars: BarGeometry[]
  negativeBars: BarGeometry[]
}

export const calculateBarGeometry = (
  data: number[],
  settings: VisualizerSettings,
  width: number,
  height: number,
): FrameGeometry => {
  const totalContentWidth = settings.spacing * settings.barCount
  const startX = (width - totalContentWidth) / 2
  const centerY = height / 2 - (settings.yOffset || 0)
  const maxBarHeight = height * 0.45

  const positiveBars: BarGeometry[] = []
  const negativeBars: BarGeometry[] = []

  for (let i = 0; i < data.length; i++) {
    const val = data[i]
    const x =
      startX + i * settings.spacing + (settings.spacing - settings.barWidth) / 2

    if (settings.positiveHeightScale > 0) {
      const hPos = Math.max(
        0,
        val * maxBarHeight * settings.positiveHeightScale,
      )
      if (hPos > 0.1) {
        positiveBars.push({
          x,
          y: centerY - hPos,
          width: settings.barWidth,
          height: hPos,
          color: settings.positiveColor,
        })
      }
    }

    if (settings.negativeHeightScale > 0) {
      const hNeg = Math.max(
        0,
        val * maxBarHeight * settings.negativeHeightScale,
      )
      if (hNeg > 0.1) {
        negativeBars.push({
          x,
          y: centerY,
          width: settings.barWidth,
          height: hNeg,
          color: settings.negativeColor,
        })
      }
    }
  }

  return { positiveBars, negativeBars }
}
