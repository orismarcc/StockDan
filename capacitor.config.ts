import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId:   'br.stockdan.app',
  appName: 'StockDan',
  // webDir não é usado com server.url, mas o Capacitor exige o campo
  webDir:  'public',
  server: {
    // Carrega o app em produção diretamente do Vercel.
    // Atualizações de código não exigem re-publicação do APK.
    url:       'https://stockdan-app.vercel.app',
    cleartext: false,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    SplashScreen: {
      launchShowDuration:        1500,
      backgroundColor:           '#030712',
      androidSplashResourceName: 'splash',
      showSpinner:               false,
      androidScaleType:          'CENTER_CROP',
    },
    StatusBar: {
      style:           'Dark',
      backgroundColor: '#030712',
    },
  },
}

export default config
