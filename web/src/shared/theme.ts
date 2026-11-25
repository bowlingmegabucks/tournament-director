export type ThemePreference = 'system' | 'light' | 'dark'

const themeStorageKey = 'tournament-director-theme'

export function getThemePreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(themeStorageKey)
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    // Theme choices are optional; keep following the system when storage is unavailable.
  }
  return 'system'
}

export function applyThemePreference(preference: ThemePreference): void {
  document.documentElement.dataset.theme = preference
}

export function initializeTheme(): void {
  applyThemePreference(getThemePreference())
}

export function saveThemePreference(preference: Exclude<ThemePreference, 'system'>): void {
  try {
    localStorage.setItem(themeStorageKey, preference)
  } catch {
    // The choice still applies for this page even when it cannot persist.
  }
  applyThemePreference(preference)
}
