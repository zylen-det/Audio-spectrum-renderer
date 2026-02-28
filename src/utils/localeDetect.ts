/**
 * Language detection from cookies, localStorage, and browser preferences
 * Priority: Cookies (NEXT_LOCALE) > localStorage > navigator.language > default 'en'
 */

export function getLocaleFromCookies(): string | null {
  const match = document.cookie.match(/NEXT_LOCALE=([^;]+)/)
  return match ? match[1] : null
}

export function getLocaleFromLocalStorage(): string | null {
  return localStorage.getItem("NEXT_LOCALE") || null
}

export function getLocaleFromBrowser(): string {
  const browserLang = navigator.language || navigator.languages?.[0] || "en"
  return browserLang.toLowerCase().includes("zh") ? "zh" : "en"
}

export function detectLocale(): string {
  // 1. Check cookies
  const cookieLocale = getLocaleFromCookies()
  if (cookieLocale && (cookieLocale === "zh" || cookieLocale === "en")) {
    return cookieLocale
  }

  // 2. Check localStorage
  const localStorageLocale = getLocaleFromLocalStorage()
  if (
    localStorageLocale &&
    (localStorageLocale === "zh" || localStorageLocale === "en")
  ) {
    return localStorageLocale
  }

  // 3. Check browser language
  const browserLocale = getLocaleFromBrowser()
  if (browserLocale === "zh" || browserLocale === "en") {
    return browserLocale
  }

  // 4. Default to 'en'
  return "en"
}

export function setLocaleInStorage(locale: "zh" | "en"): void {
  localStorage.setItem("NEXT_LOCALE", locale)
  document.cookie = `NEXT_LOCALE=${locale}; path=/; max-age=31536000`
}
