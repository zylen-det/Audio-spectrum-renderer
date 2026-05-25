import React, { useEffect } from "react"
import { motion, AnimatePresence } from "motion/react"
import { VisualizerSettings } from "../types"
import { RotateCcw } from "lucide-react"
import { SettingInput } from "./SettingInput"
import { DEFAULT_SETTINGS } from "../app/[lang]/App"
import { useI18n } from "../app/[lang]/i18nContext"
import { Range, getTrackBackground } from "react-range"
import { useUISettings } from "../app/[lang]/UISettingsContext"
import { isApplePlatform } from "../utils/platform"

interface FloatingControlsProps {
  isPlaying: boolean
  onTogglePlay: () => void
  onRender: () => void
  settings: VisualizerSettings
  onSettingsChange: (newSettings: VisualizerSettings) => void
  currentTime: number
  duration: number
  onSeek: (time: number) => void
  visible: boolean
}

export function FloatingControls({
  onRender,
  settings,
  onSettingsChange,
  currentTime,
  duration,
  visible,
}: FloatingControlsProps) {
  const { t: dict } = useI18n()
  const { uiOpacity, enableBlur } = useUISettings()
  const isApple = isApplePlatform()

  const handleSettingsChange = (newSettings: VisualizerSettings) => {
    if (isApple && newSettings.enableTransparentBg) {
      newSettings = { ...newSettings, enableTransparentBg: false }
    }
    onSettingsChange(newSettings)
  }

  useEffect(() => {
    if (isApple && settings.enableTransparentBg) {
      onSettingsChange({ ...settings, enableTransparentBg: false })
    }
  }, [])

  // --- settings helpers ---
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
    <div className="fixed top-0 left-0 w-full h-full z-30 pointer-events-none">
      <div className="absolute top-0 w-full pointer-events-auto duration-300 ease-in">
        <div className="absolute top-0 w-full flex flex-col items-center pointer-events-none px-2 sm:px-4">
          <AnimatePresence>
            <motion.div
              initial={{ y: "-105%" }}
              animate={{ y: visible ? 0 : "-105%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="pointer-events-auto border border-zinc-700 rounded-3xl p-12 sm:p-6 mt-12 sm:mt-0 shadow-2xl max-w-[1800px] w-full flex flex-col gap-3 sm:gap-4 backdrop-blur-md bg-zinc-950/80 max-h-[90vh] sm:max-h-none overflow-y-auto sm:overflow-visible"
            >
              {/* 頂部控制欄 - 手機垂直，桌面水平 */}
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-3 pb-3 sm:pb-4 border-b border-zinc-700 mt-2">
                <div className="flex flex-col">
                  <button
                    onClick={resetAllSettings}
                    className="text-xs sm:text-sm font-bold text-zinc-500 hover:text-white transition-colors flex items-center gap-1"
                  >
                    <RotateCcw size={14} className="sm:w-[14px] sm:h-[14px] w-3 h-3" />
                    {dict.controls.resetAll}
                  </button>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 sm:gap-8 sm:items-center bg-zinc-900/50 px-5 py-3 rounded-xl border border-zinc-700/50">
                  <div className="w-full sm:w-48">
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
                     <label className="relative flex items-center cursor-pointer gap-2 h-8">
                       <input
                         type="checkbox"
                         checked={settings.enableGreenScreen}
                         onChange={(e) => {
                           const checked = e.target.checked
                           handleSettingsChange({
                             ...settings,
                             enableGreenScreen: checked,
                             enableTransparentBg: checked ? false : settings.enableTransparentBg,
                           })
                         }}
                         disabled={isApple && settings.enableTransparentBg}
                         className="w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-white focus:ring-0 focus:ring-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
                       />
                       <span className="text-xs sm:text-sm text-zinc-300">
                         {dict.controls.enableGreenScgeen} ( #00FF00 )
                       </span>

                     </label>
                     <label className="relative flex items-center cursor-pointer gap-2 h-8">
                       <input
                         type="checkbox"
                         checked={settings.enableTransparentBg}
                         onChange={(e) => {
                           if (isApple) return
                           const checked = e.target.checked
                           handleSettingsChange({
                             ...settings,
                             enableTransparentBg: checked,
                             enableGreenScreen: checked ? false : settings.enableGreenScreen,
                           })
                         }}
                         disabled={isApple}
                         title={isApple ? "Not supported on iOS/macOS" : ""}
                         className="w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-white focus:ring-0 focus:ring-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
                       />
                       <span className="text-xs sm:text-sm text-zinc-300">
                         {dict.controls.enableTransparentBg} ( transparent )
                       </span>

                     </label>
                   </div>

                  <div className="w-full sm:w-56 space-y-2">
                    <label className="text-xs sm:text-sm font-bold text-zinc-500">
                      {dict.controls.encoder}
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
                        className="w-full bg-zinc-800/80 border border-zinc-700/80 rounded-lg pl-3 pr-8 py-1.5 text-xs sm:text-sm text-zinc-200 outline-none focus:border-white/20 transition-colors cursor-pointer appearance-none"
                      >
                        <option value="webcodecs-hw" disabled={typeof window !== "undefined" && !("VideoEncoder" in window)} title={typeof window !== "undefined" && !("VideoEncoder" in window) ? "WebCodecs unsupported in this browser." : dict.controls.encoderDescription.webcodecHardware} className={typeof window !== "undefined" && !("VideoEncoder" in window) ? "text-zinc-600" : ""}>
                          WebCodec (Hardware)
                        </option>
                        <option value="webcodecs-sw" disabled={typeof window !== "undefined" && !("VideoEncoder" in window)} title={typeof window !== "undefined" && !("VideoEncoder" in window) ? "WebCodecs unsupported in this browser." : dict.controls.encoderDescription.webcodecSoftware} className={typeof window !== "undefined" && !("VideoEncoder" in window) ? "text-zinc-600" : ""}>
                          WebCodec (Software)
                        </option>
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-zinc-500">
                        <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                          <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={onRender}
                    className="bg-white text-black px-6 sm:px-8 py-2 sm:py-2.5 text-xs sm:text-sm rounded-full font-bold hover:bg-zinc-200 transition-colors shadow-lg active:scale-95"
                  >
                    {dict.common.render}
                  </button>
                </div>
              </div>

              {/* 主要設置區域 - 手機單列，桌面多列 */}
              <div className="grid grid-cols-1 sm:grid-cols-8 gap-4 sm:gap-x-6 sm:gap-y-2 items-start">

                {/* 布局設置 */}
                <div className="sm:col-span-2 space-y-2">
                  <h3 className="text-xs sm:text-sm font-bold text-zinc-400 tracking-wider border-b border-zinc-700 pb-1 mb-2">
                    {dict.controls.sectionLayout}
                  </h3>
                  <div className="grid grid-cols-2 gap-x-3 sm:gap-x-6 gap-y-2">
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

                {/* 正向波形設置 */}
                <div className="space-y-2">
                  <h3 className="text-xs sm:text-sm font-bold text-zinc-400 tracking-wider border-b border-zinc-700 pb-1 mb-2">
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
                      <label className="text-xs sm:text-sm font-bold text-zinc-500">
                        {dict.controls.color}
                      </label>
                      <button onClick={() => resetSetting("positiveColor")} className="text-zinc-600 hover:text-zinc-400 transition-colors" title="Reset to default">
                        <RotateCcw size={12} />
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <input type="color" value={settings.positiveColor} onChange={(e) => updateSetting("positiveColor", e.target.value)} className="h-6 w-8 rounded cursor-pointer bg-transparent border-none" />
                      <input type="text" value={settings.positiveColor} onChange={(e) => updateSetting("positiveColor", e.target.value)} className="bg-zinc-800 text-xs sm:text-sm rounded px-2 py-1 w-full border border-zinc-700 text-zinc-300 font-mono h-6" />
                    </div>
                  </div>
                </div>

                {/* 負向波形設置 */}
                <div className="space-y-2">
                  <h3 className="text-xs sm:text-sm font-bold text-zinc-400 tracking-wider border-b border-zinc-700 pb-1 mb-2">
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
                      <label className="text-xs sm:text-sm font-bold text-zinc-500">
                        {dict.controls.color}
                      </label>
                      <button onClick={() => resetSetting("negativeColor")} className="text-zinc-600 hover:text-zinc-400 transition-colors" title="Reset to default">
                        <RotateCcw size={12} />
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <input type="color" value={settings.negativeColor} onChange={(e) => updateSetting("negativeColor", e.target.value)} className="h-6 w-8 rounded cursor-pointer bg-transparent border-none" />
                      <input type="text" value={settings.negativeColor} onChange={(e) => updateSetting("negativeColor", e.target.value)} className="bg-zinc-800 text-xs sm:text-sm rounded px-2 py-1 w-full border border-zinc-700 text-zinc-300 font-mono h-6" />
                    </div>
                  </div>
                </div>

                {/* 全局設置 */}
                <div className="sm:col-span-4 space-y-2">
                  <h3 className="text-xs sm:text-sm font-bold text-zinc-400 tracking-wider border-b border-zinc-700 pb-1 mb-2">
                    {dict.controls.sectionGlobal}
                  </h3>
                  <div className="grid grid-cols-2 gap-x-3 sm:gap-x-6 gap-y-2">
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

                  {/* 頻率範圍 */}
                  <div className="space-y-2 pt-2">
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                      <label className="text-xs sm:text-sm font-bold text-zinc-500">
                        {dict.controls.frequencyRange || "Frequency Range"}
                      </label>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          <button onClick={() => resetSetting("minFreq")} className="text-zinc-600 hover:text-zinc-400 transition-colors p-1" title="Reset to default">
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
                            className="w-16 bg-zinc-800/50 text-center outline-none text-xs sm:text-sm font-mono rounded px-2 py-1 border border-zinc-700/50 text-zinc-300"
                            min={20}
                            max={24000}
                          />
                          <span className="text-xs sm:text-sm text-zinc-500">Hz</span>
                        </div>
                        <span className="text-xs sm:text-sm text-zinc-500">-</span>
                        <div className="flex items-center gap-2">
                          <button onClick={() => resetSetting("maxFreq")} className="text-zinc-600 hover:text-zinc-400 transition-colors p-1" title="Reset to default">
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
                            className="w-16 bg-zinc-800/50 text-center outline-none text-xs sm:text-sm font-mono rounded px-2 py-1 border border-zinc-700/50 text-zinc-300"
                            min={20}
                            max={24000}
                          />
                          <span className="text-xs sm:text-sm text-zinc-500">Hz</span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-2">
                      <Range
                        draggableTrack
                        values={[settings.minFreq || 20, settings.maxFreq || 16000]}
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
                                  values: [settings.minFreq || 20, settings.maxFreq || 16000],
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
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}