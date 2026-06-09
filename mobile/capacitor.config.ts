import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.microcapital.cobranza',
  appName: 'Microcapital Cobranza',
  webDir: 'www',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    Geolocation: {
      // Permisos solicitados en tiempo de ejecución
    },
  },
};

export default config;
