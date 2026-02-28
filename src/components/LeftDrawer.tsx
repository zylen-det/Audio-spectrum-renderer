import React from "react"
import { motion } from "motion/react"
import { AudioFile } from "../types"
import { Trash2, Music, Upload, Clock, HardDrive } from "lucide-react"
import { useI18n } from "../app/[lang]/i18nContext"

interface LeftDrawerProps {
  files: AudioFile[]
  currentFileId: string | null
  onSelect: (file: AudioFile) => void
  onDelete: (id: string) => void
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void
  isOpen: boolean
  setIsOpen: (v: boolean) => void
}

export const LeftDrawer: React.FC<LeftDrawerProps> = ({
  files,
  currentFileId,
  onSelect,
  onDelete,
  onUpload,
  isOpen,
  setIsOpen,
}) => {
  const { t: dict } = useI18n()
  return (
    <motion.div
      className="fixed top-0 left-0 h-full bg-zinc-950/80 backdrop-blur-md border-r border-zinc-800 z-50 flex flex-col w-80"
      initial={{ x: -320 }}
      animate={{ x: isOpen ? 0 : -320 }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="absolute top-1/2 -right-8 w-8 h-16 bg-zinc-800 rounded-r-xl flex items-center justify-center border-y border-r border-zinc-700 hover:bg-zinc-700 transition-colors"
      >
        <div className="w-1 h-8 bg-zinc-500 rounded-full" />
      </button>

      <div className="p-6 border-b border-zinc-800">
        <h2 className="text-xl font-bold mb-4 tracking-tight">{dict.drawer.audioFiles}</h2>
        <label className="flex items-center justify-center gap-2 w-full bg-white text-black font-bold py-3 rounded-xl cursor-pointer hover:bg-zinc-200 transition-colors">
          <Upload size={18} />
          <span>{dict.common.upload}</span>
          <input
            type="file"
            accept="audio/*"
            onChange={onUpload}
            className="hidden"
          />
        </label>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {files.length === 0 && (
          <div className="text-center text-zinc-500 py-12 text-sm">
            {dict.drawer.noFiles}
          </div>
        )}
        {files.map((file) => (
          <div
            key={file.id}
            onClick={() => onSelect(file)}
            className={`group p-3 rounded-xl border transition-all cursor-pointer relative ${currentFileId === file.id
                ? "bg-zinc-900 border-zinc-700"
                : "bg-transparent border-transparent hover:bg-zinc-800/50"
              }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${currentFileId === file.id
                    ? "bg-zinc-600 text-white"
                    : "bg-zinc-800 text-zinc-500"
                  }`}
              >
                <Music size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <h3
                  className={`text-sm font-medium w-[20ch] truncate ${currentFileId === file.id ? "text-white" : "text-zinc-300"}`}
                >
                  {file.name}
                </h3>
                <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500">
                  <span className="flex items-center gap-1">
                    <Clock size={10} />
                    {formatTime(file.duration)}
                  </span>
                  <span className="flex items-center gap-1 pl-3">
                    <HardDrive size={10} />
                    {(file.size / (1024 * 1024)).toFixed(1)}MB
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation()
                onDelete(file.id)
              }}
              className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-500/20 hover:text-red-400 rounded-md transition-all text-zinc-500"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </motion.div>
  )
}

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}
