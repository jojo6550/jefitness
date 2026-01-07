import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.jefitness.app',
  appName: 'JE Fitness',
  webDir: 'www',
  // Specify the URL for serving during development
  server: {
    androidScheme: 'https',
    hostname: 'localhost',
    iosScheme: 'capacitor',
    cleartext: true // Allow cleartext (HTTP) for local development
  },
  // Define any plugins you'll use
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 3000
    }
  }
};

export default config;