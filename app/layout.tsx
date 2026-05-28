import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import Script from 'next/script'
import { SwRegistration } from '@/components/SwRegistration'
import './globals.css'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: { default: 'StockDan', template: '%s — StockDan' },
  description: 'Gestão de insumos agrícolas para múltiplas fazendas.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'StockDan',
  },
  icons: {
    icon: [
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192.png',   sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png',   sizes: '512x512', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#22c55e',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="h-full bg-gray-950 text-gray-100">
        {/*
          beforeInteractive garante execução ANTES do React hidratar —
          captura o evento beforeinstallprompt que Chrome dispara logo no load.
        */}
        <Script id="pwa-capture" strategy="beforeInteractive">{`
          window.addEventListener('beforeinstallprompt', function(e) {
            e.preventDefault();
            window.__deferredPrompt = e;
          });
        `}</Script>
        <SwRegistration />
        {children}
      </body>
    </html>
  )
}
