import { Play, Pause, SkipBack, SkipForward, Volume2, Volume1, VolumeX } from "lucide-react"
import { useCallback } from "react"
import { useI18n } from "../app/[lang]/i18nContext"

interface PlaybackControlsProps {
  isPlaying: boolean
  onTogglePlay: () => void
  onNext: () => number | undefined
  onPrev: () => number | undefined
  currentTime: number
  duration: number
  onSeek: (time: number) => void
  volume: number
  onVolumeChange: (vol: number) => void
  isMuted: boolean
  onToggleMute: () => void
  currentFileName?: string
}

const formatTime = (t: number): string => {
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

export function PlaybackControls({
  isPlaying,
  onTogglePlay,
  onNext,
  onPrev,
  currentTime,
  duration,
  onSeek,
  volume,
  onVolumeChange,
  isMuted,
  onToggleMute,
  currentFileName,
}: PlaybackControlsProps) {
  const { t: dict } = useI18n()

  const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0

  const handlePrev = useCallback(() => {
    const idx = onPrev()
    if (idx !== undefined) return idx
  }, [onPrev])

  const handleNext = useCallback(() => {
    const idx = onNext()
    if (idx !== undefined) return idx
  }, [onNext])

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2">
      <div
        className={`
          flex flex-col items-center gap-3
          transition-all duration-300 ease-in

        `}
      >
        {/* Playback + Volume row */}
        <div className="relative flex items-center w-[600px] justify-end">
          {/* Playback buttons - centered */}
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full px-3 shadow-lg">
            <button
              onClick={handlePrev}
              className="
                w-10 h-10 flex items-center justify-center
                rounded-full
                text-zinc-300 hover:text-white
                hover:bg-white/10
                transition-all
              "
              title="上一首"
            >
              <SkipBack size={20} fill="currentColor" />
            </button>

            <button
              onClick={onTogglePlay}
              className="
                w-12 h-12 flex items-center justify-center
                rounded-full
                bg-white text-black
                hover:scale-105
                active:scale-95
                transition-transform
              "
            >
              {isPlaying ? (
                <Pause size={22} fill="#000000" />
              ) : (
                <Play size={22} fill="#000000" className="ml-0.5" />
              )}
            </button>

            <button
              onClick={handleNext}
              className="
                w-10 h-10 flex items-center justify-center
                rounded-full
                text-zinc-300 hover:text-white
                hover:bg-white/10
                transition-all
              "
              title="下一首"
            >
              <SkipForward size={20} fill="currentColor" />
            </button>
          </div>

          {/* Volume slider - right side */}
          <div className="flex items-center gap-2 rounded-full px-3 py-1.5 shadow-lg translate-y-4">
            <button
              onClick={onToggleMute}
              className="
                w-8 h-8 flex items-center justify-center
                rounded-full
                text-zinc-300 hover:text-white
                hover:bg-white/10
                transition-all
              "
            >
              {isMuted || volume === 0 ? (
                <VolumeX size={18} />
              ) : volume <= 0.6 ? (
                <Volume1 size={18} />
              ) : (
                <Volume2 size={18} />
              )}
            </button>

            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={isMuted ? 0 : volume}
              onChange={(e) => onVolumeChange(Number(e.target.value))}
              className="
                w-28 accent-white h-1 bg-zinc-700/60 rounded-lg
                appearance-none cursor-pointer
                hide-thumb slider-progress
              "
              style={{
                backgroundSize: `${(isMuted ? 0 : volume) * 100}% 100%`,
                background: `linear-gradient(to right, #ffffff ${(isMuted ? 0 : volume) * 100}%, #3f3f46 ${(isMuted ? 0 : volume) * 100}%)`,
              }}
            />
          </div>
        </div>

        {/* Progress Bar - bottom */}
        <div className="w-[600px] space-y-1.5">
          <input
            type="range"
            min="0"
            max={duration || 1}
            value={currentTime}
            onChange={(e) => onSeek(Number(e.target.value))}
            className="w-full accent-white h-1 bg-zinc-700/60 rounded-lg appearance-none cursor-pointer hover:h-1.5 transition-all hide-thumb slider-progress"
            style={{
              backgroundSize: `${progressPercentage}% 100%`,
              background: `linear-gradient(to right, #ffffff ${progressPercentage}%, #3f3f46 ${progressPercentage}%)`,
            }}
          />
          <div className="flex justify-between items-center test-sm font-mono text-zinc-400 relative">
            <span>{formatTime(currentTime)}</span>
            <span className="absolute left-1/2 -translate-x-1/2 text-zinc-200 font-sans truncate max-w-[500px] tracking-wide">
              {currentFileName || dict.drawer.noFiles}
            </span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
