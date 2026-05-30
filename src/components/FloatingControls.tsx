import React, { useEffect, useState, useCallback } from "react"
import { motion, AnimatePresence } from "motion/react"
import { VisualizerSettings } from "../types"
import { RotateCcw, ImagePlus, Trash2 } from "lucide-react"
import { SettingInput } from "./SettingInput"
import { DEFAULT_SETTINGS } from "../app/[lang]/App"
import { useI18n } from "../app/[lang]/i18nContext"
import { Range, getTrackBackground } from "react-range"
import { useUISettings } from "../app/[lang]/UISettingsContext"
import Cropper, { type Area, type Point } from "react-easy-crop"

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
  vp9Support?: { hardware: boolean; software: boolean }
}

export function FloatingControls({
  onRender,
  settings,
  onSettingsChange,
  currentTime,
  duration,
  visible,
  vp9Support,
}: FloatingControlsProps) {
  const { t: dict } = useI18n()
  const { uiOpacity, enableBlur } = useUISettings()
  const vp9Known = vp9Support !== undefined
  const transparentBgUnsupported = vp9Known && !vp9Support.hardware && !vp9Support.software
  const hwUnsupportedForTransparent = vp9Known && !vp9Support.hardware
  const swUnsupportedForTransparent = vp9Known && !vp9Support.software

  const [showCrop, setShowCrop] = useState(false)
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null)
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)

  const onCropComplete = useCallback((_: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels)
  }, [])

  const getCroppedImg = async (imageSrc: string, pixelCrop: Area): Promise<string> => {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = imageSrc
    })
    const canvas = document.createElement("canvas")
    canvas.width = 1280
    canvas.height = 720
    const ctx = canvas.getContext("2d")!
    ctx.drawImage(
      image,
      pixelCrop.x, pixelCrop.y,
      pixelCrop.width, pixelCrop.height,
      0, 0, 1280, 720,
    )
    return canvas.toDataURL("image/jpeg", 0.95)
  }

  const handleBackgroundUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || settings.enableGreenScreen || settings.enableTransparentBg) return
    const reader = new FileReader()
    reader.onload = () => {
      setCropImageSrc(reader.result as string)
      setShowCrop(true)
    }
    reader.readAsDataURL(file)
    e.target.value = ""
  }

  const handleCropApply = async () => {
    if (!cropImageSrc || !croppedAreaPixels) return
    const croppedDataUrl = await getCroppedImg(cropImageSrc, croppedAreaPixels)
    onSettingsChange({
      ...settings,
      backgroundImageUrl: croppedDataUrl,
      enableGreenScreen: false,
      enableTransparentBg: false,
    })
    setShowCrop(false)
    setCropImageSrc(null)
    setZoom(1)
    setCrop({ x: 0, y: 0 })
  }

  const handleRemoveBackground = () => {
    updateSetting("backgroundImageUrl", "")
  }

  const hasBackgroundImage = !!settings.backgroundImageUrl

  const handleSettingsChange = (newSettings: VisualizerSettings) => {
    if (transparentBgUnsupported && newSettings.enableTransparentBg) {
      newSettings = { ...newSettings, enableTransparentBg: false }
    }
    if (newSettings.enableTransparentBg) {
      if (newSettings.encoder === "webcodecs-hw" && hwUnsupportedForTransparent) {
        newSettings = { ...newSettings, encoder: "webcodecs-sw" }
      } else if (newSettings.encoder === "webcodecs-sw" && swUnsupportedForTransparent) {
        newSettings = { ...newSettings, encoder: "webcodecs-hw" }
      }
    }
    onSettingsChange(newSettings)
  }

  useEffect(() => {
    if (transparentBgUnsupported && settings.enableTransparentBg) {
      onSettingsChange({ ...settings, enableTransparentBg: false })
    }
    if (settings.enableTransparentBg && vp9Known) {
      if (settings.encoder === "webcodecs-hw" && hwUnsupportedForTransparent) {
        onSettingsChange({ ...settings, encoder: "webcodecs-sw" })
      } else if (settings.encoder === "webcodecs-sw" && swUnsupportedForTransparent) {
        onSettingsChange({ ...settings, encoder: "webcodecs-hw" })
      }
    }
  }, [vp9Known])

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
              className="pointer-events-auto border border-zinc-700 rounded-3xl p-12 sm:p-6 mt-6 sm:mt-0 shadow-2xl max-w-[1800px] w-full flex flex-col gap-3 sm:gap-4 backdrop-blur-md bg-zinc-950/80 max-h-[90vh] sm:max-h-none overflow-y-auto sm:overflow-visible"
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

                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 sm:items-center bg-zinc-900/50 px-5 py-3 rounded-xl border border-zinc-700/50">

                  {/* 背景圖片相關 - 垂直堆疊 */}
                  <div className={`flex flex-col gap-2 items-center ${settings.enableGreenScreen || settings.enableTransparentBg ? "opacity-30 pointer-events-none" : ""}`}>
                    {/* 背景圖片上傳 */}
                    <label className="flex items-center justify-center gap-1.5 bg-white/10 hover:bg-white/20 text-zinc-200 text-xs sm:text-sm rounded-lg px-3 py-2 cursor-pointer transition-colors whitespace-nowrap w-full">
                      <ImagePlus size={14} />
                      <span>{dict.controls.uploadBackground}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleBackgroundUpload}
                        className="hidden"
                      />
                    </label>

                    {/* 移除背景 */}
                    {hasBackgroundImage && (
                      <button
                        onClick={handleRemoveBackground}
                        className="flex items-center justify-center gap-1.5 bg-red-900/40 hover:bg-red-900/60 text-red-300 text-xs sm:text-sm rounded-lg px-3 py-2 transition-colors whitespace-nowrap w-full"
                      >
                        <Trash2 size={14} />
                        <span>Remove</span>
                      </button>
                    )}

                    {/* 背景亮度滑桿 */}
                    <div className={`flex items-center gap-2 ${hasBackgroundImage ? "" : "opacity-30 pointer-events-none"}`}>
                      <span className="text-xs sm:text-sm text-zinc-500 whitespace-nowrap">{dict.controls.backgroundBrightness}</span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={Math.round((settings.backgroundBrightness ?? 1) * 100)}
                        onChange={(e) => updateSetting("backgroundBrightness", Number(e.target.value) / 100)}
                        className="w-20 sm:w-24 h-1.5 rounded-full appearance-none cursor-pointer bg-zinc-700 accent-white [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
                      />
                    </div>
                  </div>

                  {/* 綠幕 / 透明背景 */}
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
                            backgroundImageUrl: checked ? "" : settings.backgroundImageUrl,
                          })
                        }}
                        disabled={hasBackgroundImage}
                        title={hasBackgroundImage ? "Disabled while background image is set" : ""}
                        className="w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-white focus:ring-0 focus:ring-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                      <span className="text-xs sm:text-sm text-zinc-300">
                        {dict.controls.enableGreenScgeen} (#00FF00)
                      </span>
                    </label>
                    <label className="relative flex items-center cursor-pointer gap-2 h-8">
                      <input
                        type="checkbox"
                        checked={settings.enableTransparentBg}
                        onChange={(e) => {
                          if (transparentBgUnsupported) return
                          const checked = e.target.checked
                          const newSettings = {
                            ...settings,
                            enableTransparentBg: checked,
                            enableGreenScreen: checked ? false : settings.enableGreenScreen,
                            backgroundImageUrl: checked ? "" : settings.backgroundImageUrl,
                          }
                          if (checked && settings.exportFormat === "mp4") {
                            newSettings.exportFormat = "gif"
                          }
                          handleSettingsChange(newSettings)
                        }}
                        disabled={transparentBgUnsupported || hasBackgroundImage}
                        title={hasBackgroundImage ? "Disabled while background image is set" : transparentBgUnsupported ? "Transparent background not supported in this browser" : ""}
                        className="w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-white focus:ring-0 focus:ring-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                      <span className="text-xs sm:text-sm text-zinc-300">
                        {dict.controls.enableTransparentBg} (firefox)
                      </span>
                    </label>
                  </div>

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
                        <option value="webcodecs-hw"
                          disabled={typeof window !== "undefined" && !("VideoEncoder" in window) || (settings.enableTransparentBg && hwUnsupportedForTransparent)}
                          title={typeof window !== "undefined" && !("VideoEncoder" in window) ? "WebCodecs unsupported in this browser." : settings.enableTransparentBg && hwUnsupportedForTransparent ? "Hardware VP9+alpha not supported" : dict.controls.encoderDescription.webcodecHardware}
                          className={typeof window !== "undefined" && !("VideoEncoder" in window) || (settings.enableTransparentBg && hwUnsupportedForTransparent) ? "text-zinc-600" : ""}>
                          WebCodec (Hardware)
                        </option>
                        <option value="webcodecs-sw"
                          disabled={typeof window !== "undefined" && !("VideoEncoder" in window) || (settings.enableTransparentBg && swUnsupportedForTransparent)}
                          title={typeof window !== "undefined" && !("VideoEncoder" in window) ? "WebCodecs unsupported in this browser." : settings.enableTransparentBg && swUnsupportedForTransparent ? "Software VP9+alpha not supported" : dict.controls.encoderDescription.webcodecSoftware}
                          className={typeof window !== "undefined" && !("VideoEncoder" in window) || (settings.enableTransparentBg && swUnsupportedForTransparent) ? "text-zinc-600" : ""}>
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

                  <div className="w-full sm:w-40 space-y-2">
                    <label className="text-xs sm:text-sm font-bold text-zinc-500">
                      {dict.controls.exportFormat}
                    </label>
                    <div className="relative">
                      <select
                        value={settings.exportFormat || "mp4"}
                        onChange={(e) =>
                          updateSetting(
                            "exportFormat",
                            e.target.value as VisualizerSettings["exportFormat"],
                          )
                        }
                        className="w-full bg-zinc-800/80 border border-zinc-700/80 rounded-lg pl-3 pr-8 py-1.5 text-xs sm:text-sm text-zinc-200 outline-none focus:border-white/20 transition-colors cursor-pointer appearance-none"
                      >
                        <option value="mp4" disabled={settings.enableTransparentBg} className={settings.enableTransparentBg ? "text-zinc-600" : ""}>
                          {dict.controls.formatMp4}
                        </option>
                        <option value="webm">
                          {dict.controls.formatWebm}
                        </option>
                        <option value="gif">
                          {dict.controls.formatGif}
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
                    className="bg-white text-black px-6 sm:px-8 py-4 sm:py-6 text-xs sm:text-sm rounded-full font-bold hover:bg-zinc-200 transition-colors shadow-lg active:scale-95"
                  >
                    {dict.common.render}
                  </button>
                </div>
              </div>

              {/* 裁剪對話框 - 全屏覆蓋 */}
              {showCrop && cropImageSrc && (
                <div className="fixed inset-0 z-50 bg-black/95 flex flex-col items-center justify-center rounded-4xl gap-4 p-4">
                  <div className="relative w-full max-w-[1200px] aspect-video rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-700">
                    <Cropper
                      image={cropImageSrc}
                      crop={crop}
                      zoom={zoom}
                      aspect={16 / 9}
                      onCropChange={setCrop}
                      onZoomChange={setZoom}
                      onCropComplete={onCropComplete}
                    />
                  </div>

                  {/* 垂直布局容器 */}
                  <div className="flex flex-col items-center gap-4">
                    {/* Zoom Slider - 內層1 */}
                    <div className="flex items-center gap-3 bg-zinc-800/80 px-6 py-3 rounded-full border border-zinc-700">
                      <span className="text-xs text-zinc-400 whitespace-nowrap">Zoom</span>
                      <input
                        type="range"
                        min={1}
                        max={3}
                        step={0.1}
                        value={zoom}
                        onChange={(e) => setZoom(Number(e.target.value))}
                        className="w-28 h-1.5 rounded-full appearance-none cursor-pointer bg-zinc-700 accent-white [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
                      />
                    </div>

                    {/* Cancel + Apply - 內層2 */}
                    <div className="flex items-center gap-4">
                      <button
                        onClick={() => {
                          setShowCrop(false)
                          setCropImageSrc(null)
                          setZoom(1)
                          setCrop({ x: 0, y: 0 })
                        }}
                        className="bg-zinc-800 text-zinc-300 px-8 py-3 text-sm rounded-full font-bold hover:bg-zinc-700 transition-colors border border-zinc-700 active:scale-95"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleCropApply}
                        className="bg-white text-black px-8 py-3 text-sm rounded-full font-bold hover:bg-zinc-200 transition-colors shadow-lg active:scale-95"
                      >
                        Apply
                      </button>
                    </div>
                  </div>
                </div>
              )}

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