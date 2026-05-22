import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import Script from 'next/script'
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
      <body className="h-full bg-gray-950 text-gray-100">
        {/*
          beforeInteractive garante execução ANTES do React hidratar —
          captura o evento beforeinstallprompt que Chrome dispara logo no load.
        */}
        <Script id="pwa-capture" strategy="beforeInteractive">{`
          window.addEventListener('beforeinstallprompt', function(e) {
            e.preventDefault();
            window.__deferredPrompt = e;
            console.log('[PWA] beforeinstallprompt capturado');
          });
          console.log('[PWA] listener registrado');
        `}</Script>
        <SwRegistration />
        {children}
      </body>
    </html>
  )
}
