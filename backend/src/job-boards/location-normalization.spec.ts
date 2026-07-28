import { normalizeListingLocations, normalizeLocationStrings } from './location-normalization'

describe('normalizeLocationStrings', () => {
  it('splits comma-glued anchored remote locations without splitting normal city-country pairs', () => {
    expect(
      normalizeLocationStrings([
        'Cologne / Remote from Germany,Cologne / remote from NRW,Cologne / remote from Berlin',
        'Berlin, Germany',
      ]),
    ).toEqual(['Cologne', 'Remote from Germany', 'remote from NRW', 'remote from Berlin', 'Berlin, Germany'])
  })

  it('normalizes listing primary location to the compact anchor', () => {
    expect(
      normalizeListingLocations({
        location: 'Cologne / Remote from Germany,Cologne / remote from Hamburg',
        locations: [],
      }),
    ).toEqual({
      location: 'Cologne',
      locations: ['Cologne', 'Remote from Germany', 'remote from Hamburg'],
    })
  })
})
