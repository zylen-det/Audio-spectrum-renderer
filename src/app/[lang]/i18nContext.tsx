import React, { createContext, useContext, useState, useEffect } from "react"
import type { Dictionary, Locale } from "../../i18n/dictionaries"
import { getDictionary } from "../../i18n/dictionaries"
import { setLocaleInStorage } from "../../utils/localeDetect"

interface I18nContextValue {
  locale: string
  t: Dictionary
  switchLocale: (newLocale: string) => void
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({
  children,
  initialLocale,
}: {
  children: React.ReactNode
  initialLocale: Locale
}) {
  const [locale, setLocale] = useState<Locale>(initialLocale)

  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-TW" : "en"
  }, [locale])

  const switchLocale = (newLocale: string) => {
    if (newLocale !== "en" && newLocale !== "zh") return
    if (newLocale === locale) return
    setLocale(newLocale)
    setLocaleInStorage(newLocale)
  }

  const t: Dictionary = getDictionary(locale)

  return (
    <I18nContext.Provider value={{ locale, t, switchLocale }}>
      {children}
    </I18nContext.Provider>
  )
}

export const useI18n = () => {
  const context = useContext(I18nContext)
  if (!context) {
    throw new Error("useI18n must be used within I18nProvider")
  }
  return context
}
