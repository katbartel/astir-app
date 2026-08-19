import { companyKey, jobFingerprint, normalizeForIdentity, parseDate } from './normalized-job'

describe('normalizeForIdentity', () => {
  it('lowercases, trims, and collapses punctuation and whitespace', () => {
    expect(normalizeForIdentity('  Senior Product   Manager — Growth ')).toBe(
      'senior product manager growth',
    )
  })

  it('strips diacritics', () => {
    expect(normalizeForIdentity('Développeur Sénior')).toBe('developpeur senior')
  })
})

describe('jobFingerprint', () => {
  it('is identical for the same opening posted through different providers', () => {
    const fromGreenhouse = jobFingerprint({
      companyName: 'GitLab',
      title: 'Senior Product Manager, Growth',
      location: 'Remote, Germany',
    })
    const fromWorkable = jobFingerprint({
      companyName: 'GitLab',
      title: 'Senior Product Manager – Growth',
      location: 'Remote – Germany',
    })
    expect(fromGreenhouse).toBe(fromWorkable)
  })

  it('differs for different companies with the same title', () => {
    expect(
      jobFingerprint({ companyName: 'GitLab', title: 'Product Manager', location: null }),
    ).not.toBe(jobFingerprint({ companyName: 'Stripe', title: 'Product Manager', location: null }))
  })

  it('keeps per-region postings with the same title apart', () => {
    expect(
      jobFingerprint({ companyName: 'Linear', title: 'Product Manager', location: 'Europe' }),
    ).not.toBe(
      jobFingerprint({
        companyName: 'Linear',
        title: 'Product Manager',
        location: 'North America',
      }),
    )
  })
})

describe('companyKey', () => {
  it('dedupes known company spelling variants', () => {
    expect(companyKey('Chilli Piper')).toBe(companyKey('Chili Piper'))
  })
})

describe('parseDate', () => {
  it('parses ISO strings and rejects junk', () => {
    expect(parseDate('2026-03-02')).toEqual(new Date('2026-03-02'))
    expect(parseDate('not a date')).toBeNull()
    expect(parseDate(undefined)).toBeNull()
    expect(parseDate('')).toBeNull()
  })
})
