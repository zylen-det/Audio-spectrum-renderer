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
  encoder: "webcodecs-hw" | "webcodecs-sw" | "ffmpeg"
  softCeilingThreshold: number
  softCeilingStrength: number
  referenceFps: number
  minFreq: number
  maxFreq: number
}

export type RenderStage =
  | "idle"
  | "analyzing"
  | "rendering_frames"
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
    physics: number
    rendering: number
    mixing: number
  }
  stageTimestamps: {
    decoding?: { start: number; end?: number }
    physics?: { start: number; end?: number }
    rendering?: { start: number; end?: number }
    mixing?: { start: number; end?: number }
  }
  resultUrl?: string
  error?: string
  createdAt: number
}
