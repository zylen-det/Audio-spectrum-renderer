import { Pause, Play } from "lucide-react"

interface PlayButtonProps {
  onClick: () => void
  isPlaying: boolean
}

export function PlayButton({ onClick, isPlaying }: PlayButtonProps) {
  return (
    <button
      onClick={onClick}
      className="
        fixed bottom-8 left-1/2 -translate-x-1/2
        w-16 h-16
        bg-white
        rounded-full
        flex items-center justify-center
        shadow-lg
        hover:scale-105
        active:scale-95
        transition-transform
        z-70
      "
    >
      {isPlaying ? (
        <Pause className="text-black" fill="#000000" />
      ) : (
        <Play className="text-black ml-0.5" fill="#000000" />
      )}
    </button>
  )
}
