import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Claims Dashboard — 5JS Auto Body',
  description: 'Shop claims tracker',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-stone-100">{children}</body>
    </html>
  )
}
