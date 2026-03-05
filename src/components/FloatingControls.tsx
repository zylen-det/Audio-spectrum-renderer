import React, { useState } from "react"
import { motion, AnimatePresence } from "motion/react"
import { VisualizerSettings } from "../types"
import { Play, Pause, RotateCcw, Pin, PinOff } from "lucide-react"
import { SettingInput } from "./SettingInput"
import { DEFAULT_SETTINGS } from "../app/[lang]/App"
import { useI18n } from "../app/[lang]/i18nContext"
import { Range, getTrackBackground } from "react-range"

interface FloatingControlsProps {
  isPlaying: boolean
  onTogglePlay: () => void
  onRender: () => void
  settings: VisualizerSettings
  onSettingsChange: (newSettings: VisualizerSettings) => void
  currentTime: number
  duration: number
  onSeek: (time: number) => void
  currentFileName?: string
}

export const FloatingControls = ({
  isPlaying,
  onTogglePlay,
  onRender,
  settings,
  onSettingsChange,
  currentTime,
  duration,
  onSeek,
  currentFileName,
}: FloatingControlsProps) => {
  const { t: dict } = useI18n()
  const [isHovering, setIsHovering] = useState(false)
  const [isPinned, setIsPinned] = useState(false)

  const updateSetting = <K extends keyof VisualizerSettings>(
    key: K,
    value: VisualizerSettings[K],
  ) => {
    const newSettings = { ...settings, [key]: value }

    if (key === "barCount") {
      const count = value as number
      newSettings.spacing = newSettings.totalWidth / count
    } else if (key === "totalWidth") {
      const total = value as number
      newSettings.spacing = total / newSettings.barCount
    } else if (key === "spacing") {
      const space = value as number
      newSettings.totalWidth = space * newSettings.barCount
    }
    onSettingsChange(newSettings)
  }

  const resetSetting = <K extends keyof VisualizerSettings>(key: K) => {
    if (DEFAULT_SETTINGS[key] !== undefined) {
      updateSetting(key, DEFAULT_SETTINGS[key] as VisualizerSettings[K])
    }
  }

  const resetAllSettings = () => {
    const newSettings = { ...settings }
    Object.keys(DEFAULT_SETTINGS).forEach((key) => {
      const k = key as keyof VisualizerSettings
      // @ts-ignore
      newSettings[k] = DEFAULT_SETTINGS[k]
    })
    onSettingsChange(newSettings)
  }

  const formatTime = (t: number) => {
    const m = Math.floor(t / 60)
    const s = Math.floor(t % 60)
    return `${m}:${s.toString().padStart(2, "0")}`
  }

  const progressPercentage = ((currentTime - 0) * 100) / ((duration || 100) - 0)

  const updateFrequencyRange = (vals: number[]) => {
    const newSettings = { ...settings, minFreq: vals[0], maxFreq: vals[1] }
    onSettingsChange(newSettings)
  }

  return (
    <div
      className="fixed bottom-0 left-0 w-full flex flex-col items-center justify-end pointer-events-none z-60"
      style={{ height: "100vh" }}
    >
      <div
        className="relative w-full flex flex-col items-center pointer-events-auto after:absolute after:bottom-0 after:w-full after:h-[100px] after:bg-transparent after:-z-10"
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >
        <AnimatePresence>
          {
            <motion.div
              initial={{ y: 420 }}
              animate={{ y: isHovering || isPinned ? 0 : 420 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="bg-zinc-950/20 backdrop-blur-sm border border-zinc-800 rounded-3xl p-6 shadow-2xl max-w-[1800px] flex flex-col gap-4 -mb-9"
            >
              <div className="w-full space-y-2">
                <div className="flex justify-between items-center text-xs font-mono text-zinc-400 relative">
                  <span>{formatTime(currentTime)}</span>
                  <span className="absolute left-1/2 -translate-x-1/2 text-zinc-200 font-sans truncate max-w-[1000px] tracking-wide">
                    {currentFileName || dict.drawer.noFiles}
                  </span>
                  <span>{formatTime(duration)}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max={duration || 100}
                  value={currentTime}
                  onChange={(e) => {
                    onSeek(Number(e.target.value))
                  }}
                  style={{ backgroundSize: `${progressPercentage}% 100%` }}
                  className="w-full accent-white h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer hover:h-2 hide-thumb slider-progress"
                />
              </div>

              <div className="grid grid-cols-8 gap-x-6 gap-y-2 items-start">
                <div className="col-span-2 space-y-2">
                  <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider border-b border-zinc-700 pb-1 mb-2">
                    {dict.controls.sectionLayout}
                  </h3>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                    <SettingInput
                      label={dict.controls.barCount}
                      value={settings.barCount}
                      onChange={(v) => updateSetting("barCount", v)}
                      onReset={() => resetSetting("barCount")}
                      min={4}
                      max={128}
                      unit=""
                    />

                    <SettingInput
                      title={dict.controls.spacing_title}
                      label={dict.controls.spacing}
                      value={settings.spacing}
                      onChange={(v) => updateSetting("spacing", v)}
                      onReset={() => resetSetting("spacing")}
                      min={0}
                      max={100}
                      step={0.5}
                      unit="px"
                    />

                    <SettingInput
                      title={dict.controls.barWidth_title}
                      label={dict.controls.barWidth}
                      value={settings.barWidth}
                      onChange={(v) => updateSetting("barWidth", v)}
                      onReset={() => resetSetting("barWidth")}
                      min={1}
                      max={100}
                      unit="px"
                    />

                    <SettingInput
                      title={dict.controls.totalWidth_title}
                      label={dict.controls.totalWidth}
                      value={settings.totalWidth}
                      onChange={(v) => updateSetting("totalWidth", v)}
                      onReset={() => resetSetting("totalWidth")}
                      min={400}
                      max={1920}
                      step={10}
                      unit="px"
                    />
                    <SettingInput
                      title={dict.controls.yOffset_title}
                      label={dict.controls.yOffset}
                      value={settings.yOffset || 0}
                      onChange={(v) => updateSetting("yOffset", v)}
                      onReset={() => resetSetting("yOffset")}
                      min={-300}
                      max={300}
                      step={10}
                      unit="px"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider border-b border-zinc-700 pb-1 mb-2">
                    {dict.controls.sectionPositiveWave}
                  </h3>

                  <SettingInput
                    label={dict.controls.heightScale}
                    value={settings.positiveHeightScale}
                    onChange={(v) => updateSetting("positiveHeightScale", v)}
                    onReset={() => resetSetting("positiveHeightScale")}
                    min={0}
                    max={3}
                    step={0.1}
                    unit="x"
                  />

                  <div className="space-y-2 pt-1">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-bold text-zinc-500 uppercase">
                        {dict.controls.color}
                      </label>
                      <button
                        onClick={() => resetSetting("positiveColor")}
                        className="text-zinc-600 hover:text-zinc-400 transition-colors"
                        title="Reset to default"
                      >
                        <RotateCcw size={12} />
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={settings.positiveColor}
                        onChange={(e) =>
                          updateSetting("positiveColor", e.target.value)
                        }
                        className="h-6 w-8 rounded cursor-pointer bg-transparent border-none"
                      />
                      <input
                        type="text"
                        value={settings.positiveColor}
                        onChange={(e) =>
                          updateSetting("positiveColor", e.target.value)
                        }
                        className="bg-zinc-800 text-xs rounded px-2 py-1 w-full border border-zinc-700 text-zinc-300 font-mono h-6"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider border-b border-zinc-700 pb-1 mb-2">
                    {dict.controls.sectionNegativeWave}
                  </h3>

                  <SettingInput
                    label={dict.controls.heightScale}
                    value={settings.negativeHeightScale}
                    onChange={(v) => updateSetting("negativeHeightScale", v)}
                    onReset={() => resetSetting("negativeHeightScale")}
                    min={0}
                    max={3}
                    step={0.1}
                    unit="x"
                  />

                  <div className="space-y-2 pt-1">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-bold text-zinc-500 uppercase">
                        {dict.controls.color}
                      </label>
                      <button
                        onClick={() => resetSetting("negativeColor")}
                        className="text-zinc-600 hover:text-zinc-400 transition-colors"
                        title="Reset to default"
                      >
                        <RotateCcw size={12} />
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={settings.negativeColor}
                        onChange={(e) =>
                          updateSetting("negativeColor", e.target.value)
                        }
                        className="h-6 w-8 rounded cursor-pointer bg-transparent border-none"
                      />
                      <input
                        type="text"
                        value={settings.negativeColor}
                        onChange={(e) =>
                          updateSetting("negativeColor", e.target.value)
                        }
                        className="bg-zinc-800 text-xs rounded px-2 py-1 w-full border border-zinc-700 text-zinc-300 font-mono h-6"
                      />
                    </div>
                  </div>
                </div>

                <div className="col-span-4 space-y-2">
                  <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider border-b border-zinc-700 pb-1 mb-2">
                    {dict.controls.sectionGlobal}
                  </h3>
                  <div className="grid grid-cols-4 gap-x-6 gap-y-2">
                    <SettingInput
                      title={dict.controls.gain_title}
                      label={dict.controls.gain}
                      value={settings.barHeightMultiplier}
                      onChange={(v) => updateSetting("barHeightMultiplier", v)}
                      onReset={() => resetSetting("barHeightMultiplier")}
                      min={0.1}
                      max={5}
                      step={0.1}
                      unit="x"
                    />

                    <SettingInput
                      title={dict.controls.cornerRadius_title}
                      label={dict.controls.cornerRadius}
                      value={settings.cornerRadius}
                      onChange={(v) => updateSetting("cornerRadius", v)}
                      onReset={() => resetSetting("cornerRadius")}
                      min={0}
                      max={25}
                      unit="px"
                    />

                    <SettingInput
                      title={dict.controls.contrast_title}
                      label={dict.controls.contrast}
                      value={settings.contrast || 1.2}
                      onChange={(v) => updateSetting("contrast", v)}
                      onReset={() => resetSetting("contrast")}
                      min={0.1}
                      max={3.0}
                      step={0.1}
                      unit=""
                    />
                    <SettingInput
                      title={dict.controls.referenceFps_title}
                      label={dict.controls.referenceFps}
                      value={settings.referenceFps ?? 144}
                      onChange={(v) => updateSetting("referenceFps", v)}
                      onReset={() => resetSetting("referenceFps")}
                      min={30}
                      max={240}
                      step={1}
                      unit="fps"
                    />
                    <SettingInput
                      title={dict.controls.attack_title}
                      label={dict.controls.attack}
                      value={settings.attack || 0.05}
                      onChange={(v) => updateSetting("attack", v)}
                      onReset={() => resetSetting("attack")}
                      min={0.01}
                      max={1.0}
                      step={0.01}
                      unit=""
                    />

                    <SettingInput
                      title={dict.controls.decay_title}
                      label={dict.controls.decay}
                      value={settings.decay || 0.92}
                      onChange={(v) => updateSetting("decay", v)}
                      onReset={() => resetSetting("decay")}
                      min={0.01}
                      max={0.99}
                      step={0.01}
                      unit=""
                    />

                    <SettingInput
                      title={dict.controls.ceiling_title}
                      label={dict.controls.ceiling}
                      value={settings.softCeilingThreshold ?? 0.7}
                      onChange={(v) => updateSetting("softCeilingThreshold", v)}
                      onReset={() => resetSetting("softCeilingThreshold")}
                      min={0.1}
                      max={1.5}
                      step={0.05}
                    />
                    <SettingInput
                      title={dict.controls.strength_title}
                      label={dict.controls.strength}
                      value={settings.softCeilingStrength ?? 2.0}
                      onChange={(v) => updateSetting("softCeilingStrength", v)}
                      onReset={() => resetSetting("softCeilingStrength")}
                      min={0.1}
                      max={10.0}
                      step={0.1}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-bold text-zinc-500 uppercase">
                        {dict.controls.frequencyRange || "Frequency Range"}
                      </label>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => resetSetting("minFreq")}
                            className="text-zinc-600 hover:text-zinc-400 transition-colors p-1"
                            title="Reset to default"
                          >
                            <RotateCcw size={12} />
                          </button>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={settings.minFreq || 20}
                            onChange={(e) =>
                              updateFrequencyRange([
                                Number(e.target.value) || 20,
                                settings.maxFreq || 16000,
                              ])
                            }
                            className="w-16 bg-zinc-800/50 text-center outline-none text-xs font-mono rounded px-2 py-1 border border-zinc-700/50 text-zinc-300"
                            min={20}
                            max={24000}
                          />
                          <span className="text-xs text-zinc-500">Hz</span>
                        </div>

                        <span className="text-xs text-zinc-500">-</span>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => resetSetting("maxFreq")}
                            className="text-zinc-600 hover:text-zinc-400 transition-colors p-1"
                            title="Reset to default"
                          >
                            <RotateCcw size={12} />
                          </button>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={settings.maxFreq || 16000}
                            onChange={(e) =>
                              updateFrequencyRange([
                                settings.minFreq || 20,
                                Number(e.target.value) || 16000,
                              ])
                            }
                            className="w-16 bg-zinc-800/50 text-center outline-none text-xs font-mono rounded px-2 py-1 border border-zinc-700/50 text-zinc-300"
                            min={20}
                            max={24000}
                          />
                          <span className="text-xs text-zinc-500">Hz</span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-2">
                      <Range
                        draggableTrack
                        values={[
                          settings.minFreq || 20,
                          settings.maxFreq || 16000,
                        ]}
                        step={1}
                        min={20}
                        max={24000}
                        onChange={updateFrequencyRange}
                        renderTrack={({ props, children }) => (
                          <div
                            onMouseDown={props.onMouseDown}
                            onTouchStart={props.onTouchStart}
                            style={{
                              ...props.style,
                              height: "36px",
                              display: "flex",
                              width: "100%",
                            }}
                          >
                            <div
                              ref={props.ref}
                              style={{
                                height: "6px",
                                width: "100%",
                                borderRadius: "4px",
                                background: getTrackBackground({
                                  values: [
                                    settings.minFreq || 20,
                                    settings.maxFreq || 16000,
                                  ],
                                  colors: ["#27272a", "#9f9fa9", "#27272a"],
                                  min: 20,
                                  max: 24000,
                                }),
                                alignSelf: "center",
                              }}
                            >
                              {children}
                            </div>
                          </div>
                        )}
                        renderThumb={({ props, isDragged }) => (
                          <div
                            {...props}
                            key={props.key}
                            style={{
                              ...props.style,
                              height: "24px",
                              width: "24px",
                              borderRadius: "100%",
                              backgroundColor: "#FFF",
                              display: "flex",
                              justifyContent: "center",
                              alignItems: "center",
                            }}
                          ></div>
                        )}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-end pt-4 border-t border-zinc-800 mt-2">
                <div className="flex gap-8 items-center bg-zinc-900/50 px-5 py-3 rounded-xl border border-zinc-800/50">
                  <div className="w-48">
                    <SettingInput
                      label={dict.controls.renderFps}
                      value={settings.renderFps || 60}
                      onChange={(v) => updateSetting("renderFps", v)}
                      onReset={() => resetSetting("renderFps")}
                      min={1}
                      max={60}
                      step={1}
                      unit="fps"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase">
                      {dict.controls.greenScreen || "導出綠幕"}
                    </label>
                    <label className="relative flex items-center cursor-pointer gap-2 h-8">
                      <input
                        type="checkbox"
                        checked={settings.backgroundColor == "#00FF00"}
                        onChange={(e) => {
                          updateSetting(
                            "backgroundColor",
                            e.target.checked ? "#00FF00" : "",
                          )
                        }}
                        className="w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-white focus:ring-0 focus:ring-offset-0"
                      />
                      <span className="text-xs text-zinc-300">
                        {dict.controls.enable} ( #00FF00 )
                      </span>
                    </label>
                  </div>
                  <div className="w-56 space-y-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase flex items-center gap-2">
                      {dict.controls.encoder}
                      {typeof window !== "undefined" &&
                        !("VideoEncoder" in window) && (
                          <span className="text-[10px] text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded">
                            Unsupported
                          </span>
                        )}
                    </label>
                    <div className="relative">
                      <select
                        value={settings.encoder || "webcodecs-hw"}
                        onChange={(e) =>
                          updateSetting(
                            "encoder",
                            e.target.value as VisualizerSettings["encoder"],
                          )
                        }
                        className="w-full bg-zinc-800/80 border border-zinc-700/80 rounded-lg pl-3 pr-8 py-1.5 text-xs text-zinc-200 outline-none focus:border-white/20 transition-colors cursor-pointer appearance-none"
                      >
                        <option
                          value="webcodecs-hw"
                          disabled={
                            typeof window !== "undefined" &&
                            !("VideoEncoder" in window)
                          }
                          title={
                            typeof window !== "undefined" &&
                            !("VideoEncoder" in window)
                              ? "WebCodecs unsupported in this browser."
                              : dict.controls.encoderDescription
                                  .webcodecHardware
                          }
                          className={
                            typeof window !== "undefined" &&
                            !("VideoEncoder" in window)
                              ? "text-zinc-600"
                              : ""
                          }
                        >
                          WebCodec (Hardware)
                        </option>
                        <option
                          value="webcodecs-sw"
                          disabled={
                            typeof window !== "undefined" &&
                            !("VideoEncoder" in window)
                          }
                          title={
                            typeof window !== "undefined" &&
                            !("VideoEncoder" in window)
                              ? "WebCodecs unsupported in this browser."
                              : dict.controls.encoderDescription
                                  .webcodecSoftware
                          }
                          className={
                            typeof window !== "undefined" &&
                            !("VideoEncoder" in window)
                              ? "text-zinc-600"
                              : ""
                          }
                        >
                          WebCodec (Software)
                        </option>
                        <option
                          value="ffmpeg"
                          title={dict.controls.encoderDescription.ffmpeg}
                        >
                          FFmpeg
                        </option>
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-zinc-500">
                        <svg
                          className="fill-current h-4 w-4"
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                        >
                          <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-4 pb-1">
                  <div className="flex gap-4">
                    <button
                      onClick={resetAllSettings}
                      className="text-xs font-bold text-zinc-500 hover:text-white uppercase transition-colors flex items-center gap-1"
                    >
                      <RotateCcw size={14} />
                      {dict.controls.resetAll}
                    </button>
                    <button
                      onClick={() => setIsPinned(!isPinned)}
                      className={`text-xs font-bold uppercase transition-colors flex items-center gap-1 ${
                        isPinned
                          ? "text-white"
                          : "text-zinc-500 hover:text-white"
                      }`}
                    >
                      {isPinned ? <PinOff size={14} /> : <Pin size={14} />}
                      {isPinned ? "Unpin" : "Pin"}
                    </button>
                  </div>
                  <button
                    onClick={onRender}
                    className="bg-white text-black px-8 py-2.5 rounded-full font-bold text-sm hover:bg-zinc-200 transition-colors shadow-lg active:scale-95"
                  >
                    {dict.common.render}
                  </button>
                </div>
              </div>
            </motion.div>
          }
        </AnimatePresence>

        <div className="relative z-50">
          <button
            onClick={onTogglePlay}
            className="w-16 h-16 bg-white -translate-y-[40px]  rounded-full flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-transform"
          >
            {isPlaying ? (
              <Pause className="text-black" fill="#000000" />
            ) : (
              <Play className="text-black ml-0.5" fill="#000000" />
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export default FloatingControls
