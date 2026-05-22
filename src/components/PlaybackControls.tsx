import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  Volume1,
  VolumeX,
} from "lucide-react";
import { useCallback } from "react";
import { useI18n } from "../app/[lang]/i18nContext";

interface PlaybackControlsProps {
  isPlaying: boolean;
  onTogglePlay: () => void;
  onNext: () => number | undefined;
  onPrev: () => number | undefined;
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  volume: number;
  onVolumeChange: (vol: number) => void;
  isMuted: boolean;
  onToggleMute: () => void;
  currentFileName?: string;
}

const formatTime = (t: number): string => {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

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
  const { t: dict } = useI18n();

  const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;

  const handlePrev = useCallback(() => {
    const idx = onPrev();
    if (idx !== undefined) return idx;
  }, [onPrev]);

  const handleNext = useCallback(() => {
    const idx = onNext();
    if (idx !== undefined) return idx;
  }, [onNext]);

  return (
    <div className="fixed bottom-2 sm:bottom-4 left-0 right-0 px-20">
      <div className="flex flex-col items-center gap-2 sm:gap-3 transition-all duration-300 ease-in w-full">
        {/* Playback + Volume row */}
        <div className="relative flex items-center w-full sm:w-[600px] mx-auto justify-end">
          {/* Playback buttons - centered */}
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1 sm:gap-2 rounded-full px-2 sm:px-3 shadow-lg">
            <button
              onClick={handlePrev}
              className="w-8 sm:w-10 h-8 sm:h-10 flex items-center justify-center rounded-full text-zinc-300 hover:text-white hover:bg-white/10 transition-all"
              title="上一首"
            >
              <SkipBack
                size={16}
                className="sm:w-5 sm:h-5 w-4 h-4"
                fill="currentColor"
              />
            </button>

            <button
              onClick={onTogglePlay}
              className="w-10 sm:w-12 h-10 sm:h-12 flex items-center justify-center rounded-full bg-white text-black hover:scale-105 active:scale-95 transition-transform"
            >
              {isPlaying ? (
                <Pause
                  size={18}
                  className="sm:w-[22px] sm:h-[22px] w-[18px] h-[18px]"
                  fill="#000000"
                />
              ) : (
                <Play
                  size={18}
                  className="sm:w-[22px] sm:h-[22px] w-[18px] h-[18px] ml-0.5"
                  fill="#000000"
                />
              )}
            </button>

            <button
              onClick={handleNext}
              className="w-8 sm:w-10 h-8 sm:h-10 flex items-center justify-center rounded-full text-zinc-300 hover:text-white hover:bg-white/10 transition-all"
              title="下一首"
            >
              <SkipForward
                size={16}
                className="sm:w-5 sm:h-5 w-4 h-4"
                fill="currentColor"
              />
            </button>
          </div>

          {/* Volume slider - right side */}
          <div className="flex items-center gap-1 sm:gap-2 rounded-full px-2 sm:px-3 py-1 shadow-lg translate-y-2 sm:translate-y-4 w-1/3 sm:w-auto">
            <button
              onClick={onToggleMute}
              className="w-6 sm:w-8 h-6 sm:h-8 flex items-center justify-center rounded-full text-zinc-300 hover:text-white hover:bg-white/10 transition-all flex-shrink-0"
            >
              {isMuted || volume === 0 ? (
                <VolumeX
                  size={14}
                  className="sm:w-[18px] sm:h-[18px] w-3.5 h-3.5"
                />
              ) : volume <= 0.6 ? (
                <Volume1
                  size={14}
                  className="sm:w-[18px] sm:h-[18px] w-3.5 h-3.5"
                />
              ) : (
                <Volume2
                  size={14}
                  className="sm:w-[18px] sm:h-[18px] w-3.5 h-3.5"
                />
              )}
            </button>

            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={isMuted ? 0 : volume}
              onChange={(e) => onVolumeChange(Number(e.target.value))}
              className="accent-white h-1 bg-zinc-700/60 rounded-lg appearance-none cursor-pointer hide-thumb slider-progress flex-1 sm:w-28 sm:flex-initial"
              style={{
                backgroundSize: `${(isMuted ? 0 : volume) * 100}% 100%`,
                background: `linear-gradient(to right, #ffffff ${(isMuted ? 0 : volume) * 100}%, #3f3f46 ${(isMuted ? 0 : volume) * 100}%)`,
              }}
            />
          </div>
        </div>

        {/* Progress Bar - bottom */}
        <div className="w-full sm:w-[600px] mx-auto space-y-1 sm:space-y-1.5">
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

          <div className="flex justify-between items-center text-[10px] sm:text-sm font-mono text-zinc-400 relative">
            <span className="shrink-0 text-[9px] sm:text-sm">
              {formatTime(currentTime)}
            </span>
            <span className="absolute left-1/2 -translate-x-1/2 text-zinc-200 font-sans truncate max-w-[calc(100vw-100px)] sm:max-w-[500px] tracking-wide text-[10px] sm:text-base px-2">
              {currentFileName || dict.drawer.noFiles}
            </span>
            <span className="shrink-0 text-[9px] sm:text-sm">
              {formatTime(duration)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
