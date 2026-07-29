import { parseBulkCompanies } from './remote-companies.service'

describe('parseBulkCompanies', () => {
  it('parses one company per line', () => {
    const { entries, invalid } = parseBulkCompanies('GitLab\nAutomattic\nZapier')
    expect(entries).toEqual([
      { name: 'GitLab', careersUrl: undefined },
      { name: 'Automattic', careersUrl: undefined },
      { name: 'Zapier', careersUrl: undefined },
    ])
    expect(invalid).toEqual([])
  })

  it('parses "Name, url" on a single line', () => {
    const { entries } = parseBulkCompanies('GitLab, https://job-boards.greenhouse.io/gitlab')
    expect(entries).toEqual([
      { name: 'GitLab', careersUrl: 'https://job-boards.greenhouse.io/gitlab' },
    ])
  })

  it('merges a URL on its own line onto the company above it', () => {
    const { entries, invalid } = parseBulkCompanies('Linear\nhttps://linear.app/careers')
    expect(entries).toEqual([{ name: 'Linear', careersUrl: 'https://linear.app/careers' }])
    expect(invalid).toEqual([])
  })

  it('catches scheme-less and path-style careers URLs', () => {
    const { entries } = parseBulkCompanies('Elastic\nelastic.co/about/careers')
    expect(entries).toEqual([{ name: 'Elastic', careersUrl: 'elastic.co/about/careers' }])
  })

  it('does not overwrite a URL the company already has', () => {
    const { entries, invalid } = parseBulkCompanies(
      'Linear, https://linear.app/jobs\nhttps://linear.app/careers',
    )
    expect(entries).toEqual([{ name: 'Linear', careersUrl: 'https://linear.app/jobs' }])
    expect(invalid).toEqual(['https://linear.app/careers'])
  })

  it('marks a leading URL with no company above it as invalid instead of a junk company', () => {
    const { entries, invalid } = parseBulkCompanies('https://linear.app/careers')
    expect(entries).toEqual([])
    expect(invalid).toEqual(['https://linear.app/careers'])
  })

  it('keeps plain domain-style names as company names', () => {
    const { entries, invalid } = parseBulkCompanies('cal.com\nGhost.org')
    expect(entries).toEqual([
      { name: 'cal.com', careersUrl: undefined },
      { name: 'Ghost.org', careersUrl: undefined },
    ])
    expect(invalid).toEqual([])
  })

  it('ignores blank lines', () => {
    const { entries } = parseBulkCompanies('\nGitLab\n\n  \nZapier\n')
    expect(entries).toEqual([
      { name: 'GitLab', careersUrl: undefined },
      { name: 'Zapier', careersUrl: undefined },
    ])
  })
})
