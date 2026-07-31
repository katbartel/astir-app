import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Bricolage_Grotesque, Instrument_Sans } from 'next/font/google'
import { ApplicationsProvider } from '@/components/applications/ApplicationsProvider'
import { DevAgentation } from '@/components/DevAgentation'
import { LoginView } from '@/components/LoginView'
import { Tooltips } from '@/components/Tooltips'
import { UserProvider } from '@/components/UserProvider'
import { getInitialApplications } from '@/lib/applications-server'
import { getCurrentUser } from '@/lib/auth'
import './globals.css'

const displayFont = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: 'variable',
  axes: ['opsz'],
  variable: '--font-bricolage',
})

const bodyFont = Instrument_Sans({
  subsets: ['latin'],
  weight: 'variable',
  style: ['normal', 'italic'],
  variable: '--font-instrument',
})

export const metadata: Metadata = {
  title: 'Astir, Today',
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  // Both hit the backend with the session cookie; run them together so the
  // applications fetch does not add a second round trip to time-to-first-byte.
  const [user, initialApplications] = await Promise.all([
    getCurrentUser(),
    getInitialApplications(),
  ])

  return (
    <html
      lang="en"
      className={`${displayFont.variable} ${bodyFont.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var m=localStorage.getItem('astir.mode');if(m==='dark'){document.documentElement.dataset.theme='dusk';document.documentElement.style.colorScheme='dark'}else{document.documentElement.style.colorScheme='light'}}catch(e){}",
          }}
        />
      </head>
      <body>
        {user ? (
          <UserProvider user={user}>
            <ApplicationsProvider initialApplications={initialApplications}>
              {children}
            </ApplicationsProvider>
          </UserProvider>
        ) : (
          <LoginView />
        )}
        <Tooltips />
        <DevAgentation />
      </body>
    </html>
  )
}
