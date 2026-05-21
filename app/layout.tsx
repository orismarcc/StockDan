import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { SwRegistration } from '@/components/SwRegistration'
import './globals.css'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: { default: 'StockDan', template: '%s — StockDan' },
  description: 'Gestão de insumos agrícolas',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'StockDan' },
  icons: { apple: '/icon-192.png' },
}

export const viewport: Viewport = {
  themeColor: '#22c55e',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <head>
        {/* Captura beforeinstallprompt antes do React hidratar */}
        <script dangerouslySetInnerHTML={{
          __html: `window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__deferredPrompt=e;});`
        }} />
      </head>
      <body className="h-full bg-gray-950 text-gray-100">
        <SwRegistration />
        {children}
      </body>
    </html>
  )
}
