import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Toaster } from 'react-hot-toast'
import MobileNavigationProvider from '@/components/MobileNavigationProvider'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'StreamHub - Your Entertainment Hub',
  description: 'Watch Movies, Series, and Live TV - All in One Place',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" />
      </head>
      <body className={inter.className}>
        <MobileNavigationProvider>
          {children}
        </MobileNavigationProvider>
        <Toaster position="top-right" />
      </body>
    </html>
  )
}
