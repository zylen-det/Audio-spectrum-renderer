import React, { useEffect } from "react"
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useParams,
  useLocation,
  useNavigate,
} from "react-router-dom"
import { I18nProvider } from "./app/[lang]/i18nContext"
import { UISettingsProvider } from "./app/[lang]/UISettingsContext"
import App from "./app/[lang]/App"
import { detectLocale } from "./utils/localeDetect"

function RootRedirect() {
  const navigate = useNavigate()

  useEffect(() => {
    const detectedLocale = detectLocale()
    navigate(`/${detectedLocale}`, { replace: true })
  }, [navigate])

  return null
}

function LangWrapper() {
  const { lang } = useParams<{ lang: string }>()
  const locale = lang === "zh" ? "zh" : "en"
  return (
    <I18nProvider initialLocale={locale}>
      <UISettingsProvider initialSettings={{ uiOpacity: 1, enableBlur: true }}>
        <App />
      </UISettingsProvider>
    </I18nProvider>
  )
}

export function Router() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/:lang/*" element={<LangWrapper />} />
      </Routes>
    </BrowserRouter>
  )
}
