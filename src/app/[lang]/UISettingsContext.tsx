import React, { createContext, useContext, useState, useEffect } from "react"
import { UISettings, DEFAULT_UI_SETTINGS } from "../../types"

interface UISettingsContextType extends UISettings {
  updateSetting: (key: keyof UISettings, value: any) => void
  resetSettings: () => void
}

const UISettingsContext = createContext<UISettingsContextType | null>(null)

export function UISettingsProvider({
  children,
  initialSettings,
}: {
  children: React.ReactNode
  initialSettings: UISettings
}) {
  const [settings, setSettings] = useState<UISettings>(initialSettings)

  useEffect(() => {
    // 嘗試從 localStorage 載入
    try {
      const saved = localStorage.getItem("uiSettings")
      if (saved) {
        const parsed = JSON.parse(saved)
        setSettings({ ...DEFAULT_UI_SETTINGS, ...parsed })
      }
    } catch (e) {
      console.warn("Failed to load UI settings from storage", e)
    }
  }, [])

  useEffect(() => {
    // 保存至 localStorage
    try {
      localStorage.setItem("uiSettings", JSON.stringify(settings))
    } catch (e) {
      console.warn("Failed to save UI settings", e)
    }
  }, [settings])

  const updateSetting = (key: keyof UISettings, value: any) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
    console.log(settings)
  }

  const resetSettings = () => {
    setSettings(DEFAULT_UI_SETTINGS)
  }

  return (
    <UISettingsContext.Provider value={{ ...settings, updateSetting, resetSettings }}>
      {children}
    </UISettingsContext.Provider>
  )
}

export const useUISettings = () => {
  const context = useContext(UISettingsContext)
  if (!context) {
    throw new Error("useUISettings must be used within UISettingsProvider")
  }
  return context
}