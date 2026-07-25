import { classificationCacheKey, classifyDeterministic } from './classify-deterministic'

// Convenience: classify from location strings (Remote work mode by default,
// since this is the remote board).
function classify(locations: string[], workMode: string | null = 'Remote') {
  return classifyDeterministic({ locations, workMode })
}

describe('classifyDeterministic — global', () => {
  it('treats worldwide/anywhere as global, eligible to everyone, no escalation', () => {
    for (const label of ['Remote (Worldwide)', 'Anywhere', 'Work from anywhere', 'Fully distributed']) {
      const { verdict, escalate } = classify([label])
      expect(verdict.scope).toBe('global')
      expect(verdict.eligibleCountries).toBeNull()
      expect(verdict.confidence).toBeGreaterThanOrEqual(0.9)
      expect(escalate).toBe(false)
    }
  })

  it('keeps a global role but badges a US-timezone overlap constraint', () => {
    const { verdict, escalate } = classify(['Remote worldwide, must overlap with PST'])
    expect(verdict.scope).toBe('global')
    expect(verdict.timezoneConstraint).toBe('us_hours')
    expect(escalate).toBe(false)
  })
})

describe('classifyDeterministic — Europe / EMEA', () => {
  it('resolves Europe and EMEA to the full European set', () => {
    for (const label of ['Remote - Europe', 'EMEA', 'Pan-European']) {
      const { verdict, escalate } = classify([label])
      expect(verdict.scope).toBe('region')
      expect(verdict.eligibleCountries).toContain('DE')
      expect(verdict.eligibleCountries).toContain('GB') // UK counts as Europe here
      expect(escalate).toBe(false)
    }
  })
})

describe('classifyDeterministic — EU / EEA is narrower than Europe', () => {
  it('EU excludes the UK, Switzerland, Norway', () => {
    const { verdict } = classify(['Remote (EU)'])
    expect(verdict.scope).toBe('region')
    expect(verdict.eligibleCountries).toContain('DE')
    expect(verdict.eligibleCountries).not.toContain('GB')
    expect(verdict.eligibleCountries).not.toContain('CH')
    expect(verdict.restricted).toBe(false) // bare "EU" is not a hard restriction
  })

  it('"EU only" is a hard restriction', () => {
    const { verdict } = classify(['EU only'])
    expect(verdict.restricted).toBe(true)
    expect(verdict.restrictedTo).toContain('EU')
  })

  it('EEA adds Iceland/Norway back', () => {
    const { verdict } = classify(['EEA'])
    expect(verdict.eligibleCountries).toContain('NO')
    expect(verdict.eligibleCountries).toContain('IS')
  })
})

describe('classifyDeterministic — clusters', () => {
  it('expands DACH and Nordics to their members', () => {
    expect(classify(['DACH region']).verdict.eligibleCountries).toEqual(
      expect.arrayContaining(['DE', 'AT', 'CH']),
    )
    expect(classify(['Nordics']).verdict.eligibleCountries).toEqual(
      expect.arrayContaining(['SE', 'NO', 'DK', 'FI', 'IS']),
    )
  })
})

describe('classifyDeterministic — specific countries and cities', () => {
  it('maps a city-only posting to its country', () => {
    expect(classify(['Dublin']).verdict.eligibleCountries).toEqual(['IE'])
    expect(classify(['Berlin Office']).verdict.eligibleCountries).toEqual(['DE'])
    expect(classify(['Warszawa']).verdict.eligibleCountries).toEqual(['PL'])
  })

  it('collects multiple named countries', () => {
    const { verdict } = classify(['Berlin or Paris'])
    expect(verdict.scope).toBe('country')
    expect(verdict.eligibleCountries).toEqual(expect.arrayContaining(['DE', 'FR']))
  })

  it('does not mistake Belarus for a US ("us") match', () => {
    const { verdict } = classify(['Minsk, Belarus'])
    expect(verdict.scope).toBe('country')
    expect(verdict.eligibleCountries).toEqual(['BY'])
  })

  it('a bare country tag is contractor-plausible (not restricted)', () => {
    const { verdict, escalate } = classify(['Remote, Germany'])
    expect(verdict.scope).toBe('country')
    expect(verdict.restricted).toBe(false)
    expect(escalate).toBe(false)
  })

  it('"UK only" / "Germany only" is a confident hard filter', () => {
    for (const [label, iso] of [
      ['UK only', 'GB'],
      ['Germany only', 'DE'],
    ] as const) {
      const { verdict, escalate } = classify([label])
      expect(verdict.scope).toBe('country')
      expect(verdict.restricted).toBe(true)
      expect(verdict.restrictedTo).toContain(iso)
      expect(escalate).toBe(false)
    }
  })
})

describe('classifyDeterministic — non-European (asymmetric trust)', () => {
  it('hard-excludes only with explicit restriction language', () => {
    for (const label of ['US only', 'Remote — must be authorized to work in the US']) {
      const { verdict, escalate } = classify([label])
      expect(verdict.scope).toBe('non_eligible')
      expect(verdict.restricted).toBe(true)
      expect(verdict.eligibleCountries).toEqual([])
      expect(escalate).toBe(false)
    }
  })

  it('escalates a bare non-European tag instead of hard-excluding it', () => {
    const { verdict, escalate } = classify(['Remote (US)'])
    expect(verdict.scope).toBe('non_eligible')
    expect(verdict.restricted).toBe(false)
    expect(verdict.confidence).toBeLessThan(0.8)
    expect(escalate).toBe(true) // description may say "open worldwide"
  })

  it('lets a European signal win over a co-named non-European one, but escalates', () => {
    const { verdict, escalate } = classify(['US | Europe'])
    expect(verdict.scope).toBe('region')
    expect(verdict.eligibleCountries).toContain('DE')
    expect(verdict.confidence).toBeLessThanOrEqual(0.6)
    expect(escalate).toBe(true)
    expect(verdict.signals.join(' ')).toMatch(/non-European/i)
  })
})

describe('classifyDeterministic — unclear & empty', () => {
  it('shows a location-less remote posting as Europe-general, low confidence, escalated', () => {
    const { verdict, escalate } = classify([])
    expect(verdict.scope).toBe('region')
    expect(verdict.eligibleCountries).toContain('DE')
    expect(verdict.confidence).toBeLessThan(0.5)
    expect(escalate).toBe(true)
  })

  it('marks an unrecognized location as unclear and escalates', () => {
    const { verdict, escalate } = classify(['Mars Base Alpha'])
    expect(verdict.scope).toBe('unclear')
    expect(escalate).toBe(true)
  })
})

describe('classifyDeterministic — timezone & work mode', () => {
  it('badges European timezone without inventing a location', () => {
    const { verdict } = classify(['Remote (CET)'])
    expect(verdict.timezoneConstraint).toBe('european_hours')
  })

  it('derives the remote flag from work mode', () => {
    expect(classifyDeterministic({ locations: ['Europe'], workMode: 'Remote' }).verdict.remote).toBe(true)
    expect(classifyDeterministic({ locations: ['Europe'], workMode: 'On-Site' }).verdict.remote).toBe(false)
    expect(classifyDeterministic({ locations: ['Europe'] }).verdict.remote).toBeNull()
  })
})

describe('classificationCacheKey', () => {
  it('is stable across location order and equal work mode', () => {
    expect(classificationCacheKey({ locations: ['Berlin', 'Remote'], workMode: 'Remote' })).toBe(
      classificationCacheKey({ locations: ['Remote', 'Berlin'], workMode: 'Remote' }),
    )
  })

  it('changes when the classification-relevant fields change', () => {
    expect(classificationCacheKey({ locations: ['Berlin'], workMode: 'Remote' })).not.toBe(
      classificationCacheKey({ locations: ['Berlin'], workMode: 'On-Site' }),
    )
  })
})
