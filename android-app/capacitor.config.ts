import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.aray.booth',
  appName: 'ARAY',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  android: {
    allowMixedContent: true
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1000,
      backgroundColor: '#0F0B1A',
      showSpinner: false
    },
    Camera: {
      permissions: ['camera']
    }
  }
}

export default config
