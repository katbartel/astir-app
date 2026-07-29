'use client'

import { useEffect, useState } from 'react'
import { MODE_KEY, applyMode, readMode, writeMode, type Mode } from '@/lib/theme'
import { MoonIcon, SunIcon } from './icons'

export function ThemeToggle() {
  const [mode, setMode] = useState<Mode>('light')
  const nextMode = mode === 'dark' ? 'light' : 'dark'

  useEffect(() => {
    const savedMode = readMode()
    setMode(savedMode)
    applyMode(savedMode)

    function onStorage(event: StorageEvent) {
      if (event.key === MODE_KEY) {
        const storedMode = readMode()
        setMode(storedMode)
        applyMode(storedMode)
      }
    }

    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  function toggleMode() {
    setMode(nextMode)
    writeMode(nextMode)
  }

  return (
    <button
      className="round-icon theme-toggle"
      type="button"
      aria-label={nextMode === 'dark' ? 'Switch to dusk mode' : 'Switch to light mode'}
      data-tooltip={nextMode === 'dark' ? 'Dusk mode' : 'Light mode'}
      onClick={toggleMode}
    >
      {mode === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  )
}
