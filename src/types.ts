export interface AudioFile {
  id: string
  file: File
  name: string
  size: number
  duration: number
  url: string
}

export interface VisualizerSettings {
  barCount: number
  barWidth: number
  barHeightMultiplier: number
  cornerRadius: number
  totalWidth: number
  spacing: number
  color: string
  backgroundColor: string
  positiveHeightScale: number
  negativeHeightScale: number
  positiveColor: string
  negativeColor: string
  decay: number
  attack: number
  contrast: number
  yOffset: number
  renderFps: number
  encoder: "webcodecs-hw" | "webcodecs-sw"
  softCeilingThreshold: number
  softCeilingStrength: number
  referenceFps: number
  minFreq: number
  maxFreq: number
  enableGreenScreen: boolean
  enableTransparentBg: boolean
  exportFormat: "mp4" | "webm" | "gif"
}

export interface UISettings {
  uiOpacity: number // 0-1, 1 為完全不透明
  enableBlur: boolean // 是否啟用背景模糊
}

export const DEFAULT_UI_SETTINGS: UISettings = {
  uiOpacity: 1,
  enableBlur: true,
}

export type RenderStage =
  | "idle"
  | "analyzing"
  | "encoding"
  | "done"
  | "error"

export interface RenderTask {
  id: string
  fileId: string
  fileName: string
  settings: VisualizerSettings
  status: RenderStage
  progress: number
  stageProgress: {
    rendering: number
    mixing: number
  }
  stageTimestamps: {
    decoding?: { start: number; end?: number }
    rendering?: { start: number; end?: number }
    mixing?: { start: number; end?: number }
  }
  resultUrl?: string
  resultFormat?: "mp4" | "webm" | "gif"
  error?: string
  createdAt: number
}
