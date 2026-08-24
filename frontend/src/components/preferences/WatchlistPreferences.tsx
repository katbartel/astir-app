'use client'

import { useEffect, useState, type KeyboardEvent } from 'react'

type Preferences = {
  keywords: string[]
  excludedKeywords: string[]
  workModes: string[]
  contractTypes: string[]
  terms: string[]
  languages: string[]
  industryNoGos: string[]
  hiringRegions: string[]
}

const CONTRACT_TYPE_OPTIONS = ['FTE', 'Freelance', 'Contract']
const TERM_OPTIONS = ['Short term', 'Long term']

function TagListInput({
  id,
  values,
  placeholder,
  onChange,
}: {
  id: string
  values: string[]
  placeholder: string
  onChange: (values: string[]) => void
}) {
  const [draft, setDraft] = useState('')

  function commitDraft() {
    const value = draft.trim()
    setDraft('')
    if (!value || values.some((item) => item.toLowerCase() === value.toLowerCase())) {
      return
    }
    onChange([...values, value])
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      commitDraft()
    } else if (event.key === 'Backspace' && !draft && values.length) {
      onChange(values.slice(0, -1))
    }
  }

  return (
    <div className="tag-input">
      {values.map((value) => (
        <span className="tag-chip" key={value}>
          {value}
          <button
            type="button"
            aria-label={`Remove ${value}`}
            onClick={() => onChange(values.filter((item) => item !== value))}
          >
            ×
          </button>
        </span>
      ))}
      <input
        id={id}
        value={draft}
        placeholder={values.length ? 'Add more…' : placeholder}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commitDraft}
      />
    </div>
  )
}

type KeywordMode = 'is' | 'isNot'

// Keyword chips carry an "is / is not" toggle: "is" terms must appear in a
// title to match, "is not" terms filter a title out even if it also hits an
// "is" term. Stored as two arrays (keywords / excludedKeywords) but edited as
// one ordered list of chips.
function KeywordListInput({
  keywords,
  excludedKeywords,
  onChange,
}: {
  keywords: string[]
  excludedKeywords: string[]
  onChange: (keywords: string[], excludedKeywords: string[]) => void
}) {
  const [draft, setDraft] = useState('')
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  const items: { term: string; mode: KeywordMode }[] = [
    ...keywords.map((term) => ({ term, mode: 'is' as KeywordMode })),
    ...excludedKeywords.map((term) => ({ term, mode: 'isNot' as KeywordMode })),
  ]

  function emit(next: { term: string; mode: KeywordMode }[]) {
    onChange(
      next.filter((item) => item.mode === 'is').map((item) => item.term),
      next.filter((item) => item.mode === 'isNot').map((item) => item.term),
    )
  }

  function commitDraft() {
    const value = draft.trim()
    setDraft('')
    if (!value || items.some((item) => item.term.toLowerCase() === value.toLowerCase())) {
      return
    }
    emit([...items, { term: value, mode: 'is' }])
  }

  function setMode(index: number, mode: KeywordMode) {
    emit(items.map((item, idx) => (idx === index ? { ...item, mode } : item)))
    setOpenIndex(null)
  }

  function removeAt(index: number) {
    emit(items.filter((_, idx) => idx !== index))
    setOpenIndex(null)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      commitDraft()
    } else if (event.key === 'Backspace' && !draft && items.length) {
      removeAt(items.length - 1)
    }
  }

  return (
    // Input sits on top; entered keywords stack below it as chips.
    <div className="tag-input kw-input">
      <input
        id="pref-keywords"
        className="kw-field"
        value={draft}
        placeholder={items.length ? 'Add more…' : 'e.g. Product Manager'}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commitDraft}
      />
      {items.length ? (
        <div className="kw-chip-list">
          {items.map((item, index) => (
            <span className={`kw-chip${item.mode === 'isNot' ? ' exclude' : ''}`} key={item.term}>
              <span className="kw-chip-term">{item.term}</span>
              <span className="kw-chip-toggle-wrap">
                <button
                  type="button"
                  className="kw-chip-toggle"
                  aria-haspopup="listbox"
                  aria-expanded={openIndex === index}
                  onClick={() => setOpenIndex(openIndex === index ? null : index)}
                >
                  {item.mode === 'isNot' ? 'is not' : 'is'}
                </button>
                {openIndex === index ? (
                  <>
                    <button
                      type="button"
                      className="kw-popover-backdrop"
                      aria-hidden="true"
                      tabIndex={-1}
                      onClick={() => setOpenIndex(null)}
                    />
                    <span className="kw-popover" role="listbox">
                      <button
                        type="button"
                        role="option"
                        aria-selected={item.mode === 'is'}
                        className={`kw-popover-opt${item.mode === 'is' ? ' sel' : ''}`}
                        onClick={() => setMode(index, 'is')}
                      >
                        is
                      </button>
                      <button
                        type="button"
                        role="option"
                        aria-selected={item.mode === 'isNot'}
                        className={`kw-popover-opt${item.mode === 'isNot' ? ' sel' : ''}`}
                        onClick={() => setMode(index, 'isNot')}
                      >
                        is not
                      </button>
                    </span>
                  </>
                ) : null}
              </span>
              <button
                type="button"
                className="kw-chip-x"
                aria-label={`Remove ${item.term}`}
                onClick={() => removeAt(index)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function OptionToggles({
  options,
  values,
  label,
  onChange,
}: {
  options: string[]
  values: string[]
  label: string
  onChange: (values: string[]) => void
}) {
  function toggle(option: string) {
    onChange(
      values.includes(option) ? values.filter((item) => item !== option) : [...values, option],
    )
  }

  return (
    <div className="option-toggles" role="group" aria-label={label}>
      {options.map((option) => {
        const on = values.includes(option)
        return (
          <button
            key={option}
            type="button"
            className={`option-toggle${on ? ' on' : ''}`}
            aria-pressed={on}
            onClick={() => toggle(option)}
          >
            {option}
          </button>
        )
      })}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="prefs-field">
      <div className="prefs-field-label">{label}</div>
      {hint ? <div className="prefs-field-hint">{hint}</div> : null}
      {children}
    </div>
  )
}

export function WatchlistPreferences() {
  const [prefs, setPrefs] = useState<Preferences | null>(null)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  useEffect(() => {
    let cancelled = false
    fetch('/api/users/me/watchlist-preferences')
      .then((response) => {
        if (!response.ok) {
          throw new Error('Failed to load preferences')
        }
        return response.json() as Promise<Preferences>
      })
      .then((data) => {
        if (!cancelled) {
          setPrefs(data)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus('error')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  function update(patch: Partial<Preferences>) {
    setPrefs((current) => (current ? { ...current, ...patch } : current))
    setStatus('idle')
  }

  async function save() {
    if (!prefs) {
      return
    }
    setStatus('saving')
    const response = await fetch('/api/users/me/watchlist-preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prefs),
    })
    setStatus(response.ok ? 'saved' : 'error')
  }

  return (
    <section className="screen">
      <div className="page-head">
        <h1>Job preferences</h1>
      </div>
      {!prefs ? (
        <p className="prefs-loading">{status === 'error' ? 'Could not load preferences.' : 'Loading…'}</p>
      ) : (
        <div className="prefs-card">
          <Field
            label="Keywords"
            hint="Role titles to match. Toggle a chip to “is not” to exclude it — e.g. keep “Product Manager” but drop “Principal Product Manager.”"
          >
            <KeywordListInput
              keywords={prefs.keywords}
              excludedKeywords={prefs.excludedKeywords}
              onChange={(keywords, excludedKeywords) => update({ keywords, excludedKeywords })}
            />
          </Field>
          <Field label="Contract type">
            <OptionToggles
              label="Contract type"
              options={CONTRACT_TYPE_OPTIONS}
              values={prefs.contractTypes}
              onChange={(contractTypes) => update({ contractTypes })}
            />
          </Field>
          <Field label="Term">
            <OptionToggles
              label="Term"
              options={TERM_OPTIONS}
              values={prefs.terms}
              onChange={(terms) => update({ terms })}
            />
          </Field>
          <Field label="Languages you speak fluently" hint="Roles requiring these languages are a match.">
            <TagListInput
              id="pref-languages"
              values={prefs.languages}
              placeholder="e.g. English"
              onChange={(languages) => update({ languages })}
            />
          </Field>
          <Field
            label="Industry no-goes"
            hint="Non-negotiables — industries you never want to see roles from."
          >
            <TagListInput
              id="pref-nogoes"
              values={prefs.industryNoGos}
              placeholder="e.g. gambling"
              onChange={(industryNoGos) => update({ industryNoGos })}
            />
          </Field>
          <Field label="Hiring in" hint="Only show roles from companies hiring in these places.">
            <TagListInput
              id="pref-regions"
              values={prefs.hiringRegions}
              placeholder="e.g. Poland"
              onChange={(hiringRegions) => update({ hiringRegions })}
            />
          </Field>
          <div className="prefs-actions">
            <button className="btn solid" type="button" disabled={status === 'saving'} onClick={save}>
              {status === 'saving' ? 'Saving…' : 'Save changes'}
            </button>
            {status === 'saved' ? <span className="prefs-status">Saved</span> : null}
            {status === 'error' ? (
              <span className="prefs-status error">Something went wrong. Try again.</span>
            ) : null}
          </div>
        </div>
      )}
    </section>
  )
}
