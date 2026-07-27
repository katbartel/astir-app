'use client'

export type Mode = 'light' | 'dark'

export const MODE_KEY = 'astir.mode'

export function readMode(): Mode {
  if (typeof window === 'undefined') {
    return 'light'
  }
  try {
    return window.localStorage.getItem(MODE_KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export function applyMode(mode: Mode) {
  if (typeof document === 'undefined') {
    return
  }
  const root = document.documentElement
  if (mode === 'dark') {
    root.dataset.theme = 'dusk'
    root.style.colorScheme = 'dark'
  } else {
    delete root.dataset.theme
    root.style.colorScheme = 'light'
  }
}

export function writeMode(mode: Mode) {
  applyMode(mode)
  try {
    window.localStorage.setItem(MODE_KEY, mode)
  } catch {
    // localStorage unavailable, the choice just will not persist across reloads.
  }
}
