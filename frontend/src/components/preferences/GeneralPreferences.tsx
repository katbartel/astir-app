'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { CameraIcon } from '../icons'
import { MenuScrim, useMenuModality } from '../applications/menuModality'
import { useUser } from '../UserProvider'
import { AvatarCropper } from './AvatarCropper'

type Mode = 'light' | 'dark'
const MODE_KEY = 'astir.mode'

// The Mode toggle is presentational for now: it remembers the user's choice in
// localStorage but does not yet repaint the app (see the theming follow-up).
function readMode(): Mode {
  if (typeof window === 'undefined') {
    return 'light'
  }
  try {
    return window.localStorage.getItem(MODE_KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export function GeneralPreferences() {
  const user = useUser()
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const avatarMenuRef = useRef<HTMLDivElement>(null)

  const [name, setName] = useState(user.name)
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl)
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('light')

  // Read the persisted mode on mount to avoid a server/client mismatch.
  useEffect(() => {
    setMode(readMode())
  }, [])

  useMenuModality(avatarMenuOpen, avatarMenuRef, setAvatarMenuOpen)

  function closeCropper() {
    if (cropSrc) {
      URL.revokeObjectURL(cropSrc)
    }
    setCropSrc(null)
  }

  function pickAvatar(file: File | undefined) {
    if (!file) {
      return
    }
    setStatus('idle')
    setCropSrc(URL.createObjectURL(file))
  }

  // Changes are saved automatically. The name we send is always the current
  // valid one, so an avatar-only change never overwrites the saved name.
  async function persist(patch: { name: string; avatarUrl: string | null }) {
    setStatus('saving')
    const response = await fetch('/api/users/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (!response.ok) {
      setStatus('error')
      return
    }
    setStatus('saved')
    router.refresh()
  }

  // On blur: a blank / whitespace-only name reverts to the saved one; a real
  // change is saved.
  function commitName() {
    const trimmed = name.trim()
    if (!trimmed) {
      setName(user.name)
      setStatus('idle')
      return
    }
    setName(trimmed)
    if (trimmed !== user.name) {
      persist({ name: trimmed, avatarUrl })
    }
  }

  function commitAvatar(next: string | null) {
    setAvatarUrl(next)
    persist({ name: name.trim() || user.name, avatarUrl: next })
  }

  // With no photo the avatar acts as an upload button; with one it opens a
  // Change / Remove menu.
  function onAvatarClick() {
    if (avatarUrl) {
      setAvatarMenuOpen((open) => !open)
    } else {
      fileInputRef.current?.click()
    }
  }

  function chooseMode(next: Mode) {
    setMode(next)
    try {
      window.localStorage.setItem(MODE_KEY, next)
    } catch {
      // localStorage unavailable; the choice just won't persist across reloads.
    }
  }

  return (
    <section className="screen">
      <div className="page-head">
        <h1>General</h1>
      </div>
      <div className="prefs-card">
        <div className="prefs-row">
          <span className="prefs-row-label">Avatar</span>
          <div
            className={`prefs-avatar-control menu-wrap${avatarMenuOpen ? ' open' : ''}`}
            ref={avatarMenuRef}
          >
            <button
              className="prefs-avatar-button"
              type="button"
              onClick={onAvatarClick}
              aria-haspopup={avatarUrl ? 'menu' : undefined}
              aria-expanded={avatarUrl ? avatarMenuOpen : undefined}
              aria-label={avatarUrl ? 'Change or remove your avatar' : 'Add an avatar'}
            >
              {avatarUrl ? (
                <img className="prefs-avatar" src={avatarUrl} alt="Your avatar" referrerPolicy="no-referrer" />
              ) : (
                <span className="prefs-avatar" aria-hidden="true" />
              )}
              <span className="prefs-avatar-overlay" aria-hidden="true">
                <CameraIcon />
              </span>
            </button>
            {avatarUrl ? (
              <span className="watch-menu prefs-avatar-menu" role="menu" onClick={() => setAvatarMenuOpen(false)}>
                <button type="button" role="menuitem" onClick={() => fileInputRef.current?.click()}>
                  Change
                </button>
                <button type="button" role="menuitem" onClick={() => commitAvatar(null)}>
                  Remove
                </button>
              </span>
            ) : null}
            {avatarMenuOpen ? <MenuScrim onClose={() => setAvatarMenuOpen(false)} /> : null}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => {
              pickAvatar(event.target.files?.[0])
              event.target.value = ''
            }}
          />
        </div>

        <div className="prefs-row">
          <label className="prefs-row-label" htmlFor="general-name">
            Name
          </label>
          <input
            id="general-name"
            className="prefs-row-input"
            value={name}
            onChange={(event) => {
              setName(event.target.value)
              setStatus('idle')
            }}
            onBlur={commitName}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.currentTarget.blur()
              }
            }}
            maxLength={120}
            autoComplete="name"
          />
        </div>

        <div className="prefs-row">
          <span className="prefs-row-label">Mode</span>
          <div className="prefs-mode-toggle" role="radiogroup" aria-label="Appearance">
            <button
              type="button"
              role="radio"
              aria-checked={mode === 'light'}
              className={`prefs-mode-option${mode === 'light' ? ' on' : ''}`}
              onClick={() => chooseMode('light')}
            >
              Light
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={mode === 'dark'}
              className={`prefs-mode-option${mode === 'dark' ? ' on' : ''}`}
              onClick={() => chooseMode('dark')}
            >
              Dark
            </button>
          </div>
        </div>

        {status === 'error' ? (
          <span className="prefs-status prefs-autosave error" role="alert">
            Couldn’t save. Try again.
          </span>
        ) : null}
      </div>
      {cropSrc ? (
        <AvatarCropper
          imageUrl={cropSrc}
          onCancel={closeCropper}
          onError={() => {
            closeCropper()
            setStatus('error')
          }}
          onConfirm={(dataUrl) => {
            commitAvatar(dataUrl)
            closeCropper()
          }}
        />
      ) : null}
    </section>
  )
}
