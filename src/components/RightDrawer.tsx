import React, { useState, useEffect } from "react"
import { motion, AnimatePresence } from "motion/react"
import { RenderTask } from "../types"
import { useI18n } from "../app/[lang]/i18nContext"
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  Download,
  Film,
  X,
  AlertTriangle,
  Logs,
} from "lucide-react"
import { MyDialog } from "../components/MyDialog";

interface RightDrawerProps {
  queue: RenderTask[]
  isOpen: boolean
  setIsOpen: (v: boolean) => void
  onCancel: (taskId: string) => void
  uiOpacity: number
  enableBlur: boolean
}

export const RightDrawer: React.FC<RightDrawerProps> = ({
  queue,
  isOpen,
  setIsOpen,
  onCancel,
  uiOpacity,
  enableBlur,
}) => {
  const { t: dict } = useI18n()
  const [taskToCancel, setTaskToCancel] = useState<string | null>(null)

  const handleCancelClick = (taskId: string) => {
    setTaskToCancel(taskId)
  }

  const confirmCancel = () => {
    if (taskToCancel) {
      onCancel(taskToCancel)
      setTaskToCancel(null)
    }
  }

  return (
    <>
      <motion.div
        className={`fixed top-0 right-0 h-full  border-l border-zinc-700 z-50 flex flex-col w-80 ${enableBlur ? 'backdrop-blur-md bg-zinc-950/80' : 'bg-zinc-950'}`}
        initial={{ x: 320 }}
        animate={{ x: isOpen ? 0 : 320 }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
      >
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="absolute top-4 -left-14 w-10 h-10 bg-zinc-800 rounded-xl flex items-center justify-center border-zinc-700  hover:bg-zinc-700 transition-colors"
        >
          <Logs className="w-6 h-6 bg-transparent" />
        </button>

        <div className="p-6 border-b border-zinc-700">
          <h2 className="text-xl font-bold tracking-tight">
            {dict.drawer.renderQueue}
          </h2>
          <p className="test-sm text-zinc-500 mt-1">{queue.length} tasks</p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {queue.length === 0 && (
            <div className="text-center text-zinc-500 py-12 text-base">
              {dict.drawer.noTasks}
            </div>
          )}
          {queue.map((task) => (
            <div
              key={task.id}
              className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-4 space-y-3 relative group"
            >
              <button
                onClick={() => handleCancelClick(task.id)}
                className="absolute -top-2 -right-2 p-1 bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white hover:bg-red-500 hover:border-red-500 rounded-full transition-all opacity-0 group-hover:opacity-100 shadow-md z-10"
                title={
                  ["done", "error"].includes(task.status)
                    ? "Remove from Queue"
                    : "Cancel Task"
                }
              >
                <X size={12} />
              </button>

              <div className="flex items-start justify-between pr-1">
                <div className="flex items-center gap-1 min-w-0">
                  <Film size={16} className="text-zinc-500 shrink-0" />
                  <h3 className="text-med font-medium w-[20ch] truncate text-zinc-200">
                    {task.fileName}
                  </h3>
                </div>
                <StatusIcon status={task.status} />
              </div>

              <div className="space-y-3 pt-1 pb-1">
                <StageItem
                  label="Decoding"
                  isActive={
                    task.status === "analyzing" &&
                    !task.stageTimestamps.decoding?.end
                  }
                  isDone={!!task.stageTimestamps.decoding?.end}
                  timestamps={task.stageTimestamps.decoding}
                />

                {task.settings.encoder === "ffmpeg" && (
                  <StageItem
                    label="Generating Frames"
                    progress={task.stageProgress.physics}
                    isActive={
                      task.status === "rendering_frames" &&
                      !task.stageTimestamps.physics?.end
                    }
                    isDone={!!task.stageTimestamps.physics?.end}
                    timestamps={task.stageTimestamps.physics}
                  />
                )}

                <StageItem
                  label="Rendering"
                  progress={task.stageProgress.rendering}
                  isActive={task.status === "rendering_frames"}
                  isDone={!!task.stageTimestamps.rendering?.end}
                  timestamps={task.stageTimestamps.rendering}
                />

                <StageItem
                  label="Mixing"
                  progress={task.stageProgress.mixing}
                  isActive={task.status === "encoding"}
                  isDone={!!task.stageTimestamps.mixing?.end}
                  timestamps={task.stageTimestamps.mixing}
                />
              </div>

              {task.status === "done" && task.resultUrl && (
                <a
                  href={task.resultUrl}
                  download={`spectrum-${task.fileName}.mp4`}
                  className="flex items-center justify-center gap-2 w-full bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 test-sm font-bold py-2 rounded-lg transition-colors"
                >
                  <Download size={14} />
                  {dict.common.done}
                </a>
              )}

              {task.status === "error" && (
                <p className="test-sm text-red-400 bg-red-500/10 p-2 rounded border border-red-500/20">
                  {task.error || "Unknown error"}
                </p>
              )}
            </div>
          ))}
        </div>
      </motion.div>

      <MyDialog isVisible={Boolean(taskToCancel)} handleClose={() => setTaskToCancel(null)}>
        <div className="flex flex-col items-center text-center gap-4">
          <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center text-red-500">
            <AlertTriangle size={24} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white mb-1">
              {queue.find((t) => t.id === taskToCancel)?.status ===
                "done" ||
                queue.find((t) => t.id === taskToCancel)?.status === "error"
                ? dict.drawer.removeTask
                : dict.drawer.cancelRendering}
            </h3>
            <p className="text-base text-zinc-400">
              {queue.find((t) => t.id === taskToCancel)?.status ===
                "done" ||
                queue.find((t) => t.id === taskToCancel)?.status === "error"
                ? dict.drawer.removeTaskConfirm
                : dict.drawer.cancelTaskConfirm}
            </p>
          </div>
          <div className="flex gap-3 w-full mt-2">
            <button
              onClick={() => setTaskToCancel(null)}
              className="flex-1 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium text-base transition-colors"
            >
              {dict.drawer.keepIt}
            </button>
            <button
              onClick={confirmCancel}
              className="flex-1 px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white font-medium text-base transition-colors"
            >
              {queue.find((t) => t.id === taskToCancel)?.status ===
                "done" ||
                queue.find((t) => t.id === taskToCancel)?.status === "error"
                ? dict.drawer.yesRemove
                : dict.drawer.yesCancel}
            </button>
          </div>
        </div>
      </MyDialog>
    </>
  )
}

const StageItem = ({
  label,
  progress,
  isActive,
  isDone,
  timestamps,
}: {
  label: string
  progress?: number
  isActive: boolean
  isDone: boolean
  timestamps?: { start: number; end?: number }
}) => {
  const [elapsed, setElapsed] = useState("00:00")

  useEffect(() => {
    let interval: any
    if (isActive && timestamps?.start && !isDone) {
      const diff = Date.now() - timestamps.start
      setElapsed(formatDuration(diff))

      interval = setInterval(() => {
        const diff = Date.now() - timestamps.start
        setElapsed(formatDuration(diff))
      }, 1000)
    } else if (timestamps?.start && timestamps?.end) {
      setElapsed(formatDuration(timestamps.end - timestamps.start))
    } else {
      setElapsed("00:00")
    }
    return () => clearInterval(interval)
  }, [isActive, isDone, timestamps])

  const displayLabel = isDone
    ? label === "Decoding"
      ? "Decoded"
      : label === "Generating Frames"
        ? "Generated"
        : label === "Rendering"
          ? "Rendered"
          : label === "Mixing"
            ? "Mixed"
            : label
    : label

  return (
    <div
      className={`space-y-1.5 transition-opacity duration-300 ${!isActive && !isDone ? "opacity-30" : "opacity-100"}`}
    >
      <div className="flex justify-between items-center text-[10px]   font-black tracking-widest">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className={`${isActive ? "text-zinc-100" : isDone ? "text-emerald-500" : "text-zinc-500"} flex items-center gap-1.5 truncate`}
          >
            {isDone ? (
              <CheckCircle2 size={10} />
            ) : (
              <div
                className={`w-1 h-1 rounded-full ${isActive ? "bg-zinc-100 animate-pulse" : "bg-zinc-600"}`}
              />
            )}
            {displayLabel}
          </span>
          {progress !== undefined && !isDone && (
            <span className={isActive ? "text-zinc-300" : "text-zinc-600"}>
              {progress}%
            </span>
          )}
        </div>
        <span
          className={`${isActive ? "text-zinc-100" : "text-zinc-500"} tabular-nums shrink-0`}
        >
          {elapsed}
        </span>
      </div>
      {progress !== undefined && !isDone && (
        <div className="h-1 bg-zinc-800/50 rounded-full overflow-hidden">
          <motion.div
            className={`h-full ${isActive ? "bg-zinc-200" : "bg-zinc-700"}`}
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ type: "spring", bounce: 0, duration: 0.5 }}
          />
        </div>
      )}
    </div>
  )
}

const formatDuration = (ms: number) => {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
}

const StatusIcon = ({ status }: { status: RenderTask["status"] }) => {
  switch (status) {
    case "idle":
      return <div className="w-4 h-4 rounded-full border-2 border-zinc-600" />
    case "analyzing":
    case "rendering_frames":
    case "encoding":
      return <Loader2 size={16} className="animate-spin text-zinc-200" />
    case "done":
      return <CheckCircle2 size={20} className="text-emerald-400" />
    case "error":
      return <AlertCircle size={16} className="text-red-400" />
    default:
      return null
  }
}

const formatStatus = (status: string) => {
  return status.replace("_", " ")
}

const getStatusColor = (status: string) => {
  switch (status) {
    case "done":
      return "bg-emerald-500"
    case "error":
      return "bg-red-500"
    default:
      return "bg-zinc-300"
  }
}
