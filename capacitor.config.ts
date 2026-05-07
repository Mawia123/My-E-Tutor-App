import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.peertutoringpro.app',
  appName: 'PeerTutoringPro',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
