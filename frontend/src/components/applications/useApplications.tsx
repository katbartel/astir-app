'use client'

import { useContext } from 'react'
import {
  ApplicationsContext,
  type ApplicationsContextValue,
} from './ApplicationsProvider'

// Shared data + mutations for the Home, Pipeline and All applications screens.
// The state itself lives in ApplicationsProvider (mounted once in the root
// layout) so it survives route changes; this is just the read side. Screens
// render the returned `overlay` node once (snackbar + hired modal).
export function useApplications(): ApplicationsContextValue {
  const value = useContext(ApplicationsContext)
  if (!value) {
    throw new Error('useApplications must be used inside ApplicationsProvider')
  }
  return value
}
