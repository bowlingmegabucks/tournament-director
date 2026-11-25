import { useEffect, useState } from 'react'
import { getThemePreference, saveThemePreference, type ThemePreference } from './theme'

export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(getThemePreference)
  const [systemThemeQuery] = useState(() =>
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null,
  )
  const [systemIsDark, setSystemIsDark] = useState(() => systemThemeQuery?.matches ?? false)
  const isDark = preference === 'system' ? systemIsDark : preference === 'dark'

  // Stryker disable ArrayDeclaration: the query is made once, so [] and [systemThemeQuery] behave the same.
  useEffect(() => {
    if (!systemThemeQuery) return

    function updateSystemTheme(event: MediaQueryListEvent) {
      setSystemIsDark(event.matches)
    }

    systemThemeQuery.addEventListener('change', updateSystemTheme)
    return () => systemThemeQuery.removeEventListener('change', updateSystemTheme)
  }, [systemThemeQuery])
  // Stryker restore ArrayDeclaration

  function toggleTheme() {
    const nextPreference = isDark ? 'light' : 'dark'
    saveThemePreference(nextPreference)
    setPreference(nextPreference)
  }

  return { isDark, toggleTheme }
}
