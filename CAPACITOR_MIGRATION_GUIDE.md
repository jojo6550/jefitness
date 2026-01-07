# JE Fitness Mobile App - Capacitor Migration Guide

Complete step-by-step guide to convert your Node.js + Express website into an Android and iOS mobile app using Capacitor.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Step 1: Install Capacitor & Dependencies](#step-1-install-capacitor--dependencies)
3. [Step 2: Initialize Capacitor Project](#step-2-initialize-capacitor-project)
4. [Step 3: Configure Capacitor for Web Assets](#step-3-configure-capacitor-for-web-assets)
5. [Step 4: Set Up Android Platform](#step-4-set-up-android-platform)
6. [Step 5: Set Up iOS Platform](#step-5-set-up-ios-platform)
7. [Step 6: Handle Multi-Page Routing](#step-6-handle-multi-page-routing)
8. [Step 7: Configure API Endpoints](#step-7-configure-api-endpoints)
9. [Step 8: Build & Run on Emulators](#step-8-build--run-on-emulators)
10. [Step 9: Test on Physical Devices](#step-9-test-on-physical-devices)
11. [Step 10: Handle CSP & WebView Issues](#step-10-handle-csp--webview-issues)
12. [Troubleshooting](#troubleshooting)
13. [Production Deployment](#production-deployment)

---

## Prerequisites

Before starting, ensure you have:

- **Node.js** v16+ and npm installed
- **Java Development Kit (JDK)** 11+ for Android
- **Android Studio** installed (for Android SDK, emulator, and build tools)
- **Xcode** 14+ (for iOS development - Mac only)
- **Xcode Command Line Tools** (`xcode-select --install`)
- **CocoaPods** (for iOS dependencies: `sudo gem install cocoapods`)
- **Git** installed

### Verify Installation

```powershell
# Windows PowerShell commands
node --version
npm --version
java -version
```

For macOS (iOS development):
```bash
xcode-select --version
pod --version
```

---

## Step 1: Install Capacitor & Dependencies

Add Capacitor and required packages to your project.

### Command

```powershell
# Install Capacitor core, CLI, and platform plugins
npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios
```

### Updated Package.json Scripts

Add these scripts to your `package.json` for easy mobile app management:

```json
{
  "scripts": {
    "dev": "nodemon",
    "test": "jest --setupFilesAfterEnv ./tests/setup.js --runInBand",
    "start": "node src/server.js",
    "build:css": "tailwindcss -i ./public/styles/tailwind.css -o ./public/dist/styles.css --watch",
    "seed:programs": "node src/seedPrograms.js",
    "cache:bust": "node scripts/bust-cache.js",
    "test:unit": "jest tests/models tests/middleware tests/routes --coverage",
    "test:integration": "jest tests/integration --coverage",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage --coverageDirectory=coverage",
    "test:verbose": "jest --verbose",
    "cap:init": "npx cap init",
    "cap:add:android": "npx cap add android",
    "cap:add:ios": "npx cap add ios",
    "cap:sync": "npx cap sync",
    "cap:build:android": "npx cap open android",
    "cap:build:ios": "npx cap open ios",
    "cap:copy": "npx cap copy",
    "app:dev": "npm run dev & npm run cap:sync",
    "app:build:android": "npm run cap:sync && npx cap build android",
    "app:build:ios": "npm run cap:sync && npx cap build ios"
  }
}
```

---

## Step 2: Initialize Capacitor Project

### Create capacitor.config.ts

Create a new file at the project root: `capacitor.config.ts`

```typescript
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
```

### Optional: Create capacitor.config.json (if not using TypeScript)

```json
{
  "appId": "com.jefitness.app",
  "appName": "JE Fitness",
  "webDir": "www",
  "server": {
    "androidScheme": "https",
    "hostname": "localhost",
    "iosScheme": "capacitor",
    "cleartext": true
  },
  "plugins": {
    "SplashScreen": {
      "launchAutoHide": true,
      "launchShowDuration": 3000
    }
  }
}
```

---

## Step 3: Configure Capacitor for Web Assets

### Step 3a: Create www Folder & Copy Assets

Capacitor uses a `www` folder for web assets. We'll set this up to use your `public` folder:

```powershell
# Create the www directory
mkdir www

# Copy all public files to www (one-time setup)
Copy-Item -Path "public\*" -Destination "www" -Recurse -Force

# For future updates, you can sync using Capacitor
npx cap copy
```

### Step 3b: Update www/index.html

Modify your main HTML file to include Capacitor's JavaScript bridge:

**www/index.html** (add this before closing `</head>` tag):

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="ie=edge">
    <title>JE Fitness</title>
    
    <!-- Bootstrap CSS from CDN -->
    <link href="https://cdnjs.cloudflare.com/ajax/libs/bootstrap/5.3.0/css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="css/styles.css">
    
    <!-- Capacitor Core JS - ADD THIS LINE -->
    <script src="capacitor/capacitor.js"></script>
    <script src="capacitor/init.js"></script>
</head>
<body>
    <!-- Your existing HTML content -->
    
    <!-- Bootstrap JS from CDN -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/bootstrap/5.3.0/js/bootstrap.bundle.min.js"></script>
    <script src="js/app.js"></script>
</body>
</html>
```

### Step 3c: Update All HTML Pages

For each HTML page in `www/pages/` (dashboard.html, profile.html, etc.), add the Capacitor scripts:

```html
<!-- Add to all HTML pages in www/pages/ -->
<script src="../capacitor/capacitor.js"></script>
<script src="../capacitor/init.js"></script>
```

Adjust the relative path based on the file's location (e.g., `../` for pages in a subdirectory).

---

## Step 4: Set Up Android Platform

### Step 4a: Add Android to Capacitor Project

```powershell
npx cap add android
```

This creates an `android` folder with the Android Studio project structure.

### Step 4b: Configure Android Permissions

Edit **android/app/src/main/AndroidManifest.xml**:

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application>
        <activity
            android:name="MainActivity"
            android:label="@string/app_name"
            android:theme="@style/AppTheme"
            android:launchMode="singleTask">
        </activity>
    </application>

    <!-- Network Permissions -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

    <!-- Location Permissions (if needed) -->
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />

    <!-- Camera Permissions (if needed) -->
    <uses-permission android:name="android.permission.CAMERA" />

    <!-- Storage Permissions (Android 10+) -->
    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
</manifest>
```

### Step 4c: Configure API Endpoint in Android

Edit **android/app/src/main/res/values/strings.xml**:

```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">JE Fitness</string>
    <string name="api_base_url">http://10.0.2.2:10000</string> <!-- 10.0.2.2 is the host machine IP in Android emulator -->
</resources>
```

### Step 4d: Build for Android

#### Option 1: Using Android Studio (Recommended for First Build)

```powershell
# Open Android Studio with the Android project
npx cap open android
```

In Android Studio:
1. Click "Build" → "Build Bundle(s) / APK(s)" → "Build APK(s)"
2. Wait for the build to complete
3. Connect an Android device via USB or open an emulator
4. Click "Run" → "Run 'app'" to deploy

#### Option 2: Using Command Line

```powershell
# Copy latest web assets to Android
npx cap copy android

# Build APK for testing (debug build)
cd android; gradlew assembleDebug; cd ..

# Build release APK (production)
cd android; gradlew assembleRelease; cd ..
```

---

## Step 5: Set Up iOS Platform

### Step 5a: Add iOS to Capacitor Project (macOS Only)

```bash
npx cap add ios
```

### Step 5b: Configure iOS Permissions

Edit **ios/App/App/Info.plist**:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <!-- Network -->
    <key>NSBonjourServices</key>
    <array>
        <string>_http._tcp</string>
        <string>_https._tcp</string>
    </array>

    <!-- Camera (if needed) -->
    <key>NSCameraUsageDescription</key>
    <string>This app needs access to your camera for fitness tracking.</string>

    <!-- Location (if needed) -->
    <key>NSLocationWhenInUseUsageDescription</key>
    <string>This app needs your location for fitness tracking features.</string>

    <!-- Local Network (iOS 14+) -->
    <key>NSLocalNetworkUsageDescription</key>
    <string>This app needs access to your local network to connect to your fitness devices.</string>
    <key>NSBonjourServices</key>
    <array>
        <string>_http._tcp</string>
    </array>
</dict>
</plist>
```

### Step 5c: Configure API Endpoint in iOS

Edit **ios/App/App/ViewController.swift** or use a config file:

Create **ios/App/App/Config.swift**:

```swift
import Foundation

struct AppConfig {
    static let apiBaseURL: String = {
        #if DEBUG
        return "http://localhost:10000" // Development
        #else
        return "https://api.jefitness.com" // Production
        #endif
    }()
}
```

### Step 5d: Build for iOS

#### Using Xcode (Recommended)

```bash
# Open Xcode with the iOS project
npx cap open ios
```

In Xcode:
1. Select "App" scheme
2. Select target device (simulator or connected device)
3. Click Product → Build or Run
4. Wait for build to complete

#### Using Command Line

```bash
# Copy latest web assets to iOS
npx cap copy ios

# Build for simulator
cd ios/App; xcodebuild -scheme App -destination 'generic/platform=iOS Simulator'; cd ../../

# Build for device (requires provisioning profile)
cd ios/App; xcodebuild -scheme App -destination 'generic/platform=iOS'; cd ../../
```

---

## Step 6: Handle Multi-Page Routing

### Challenge: Capacitor Serves from /www Root

Your app currently has pages like:
- `www/index.html` (home)
- `www/pages/dashboard.html`
- `www/pages/profile.html`
- `www/pages/admin-dashboard.html`

In the browser, you can access these directly. In Capacitor, routing must be handled differently.

### Solution 1: Use Client-Side Routing (Recommended)

Create **www/js/router.js**:

```javascript
class Router {
  constructor() {
    this.routes = {
      '/': 'index.html',
      '/dashboard': 'pages/dashboard.html',
      '/profile': 'pages/profile.html',
      '/admin': 'pages/admin-dashboard.html',
      '/schedule': 'pages/schedule.html',
      '/services': 'pages/services.html'
    };
    this.currentPage = null;
    this.init();
  }

  init() {
    // Handle initial route
    const path = window.location.pathname || '/';
    this.navigate(path);

    // Handle browser back/forward
    window.addEventListener('popstate', (e) => {
      this.navigate(e.state?.path || '/');
    });

    // Handle link clicks
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a[data-route]');
      if (link) {
        e.preventDefault();
        const route = link.getAttribute('href');
        this.navigate(route);
      }
    });
  }

  async navigate(path) {
    if (this.currentPage === path) return;

    const filePath = this.routes[path] || 'index.html';
    
    try {
      const response = await fetch(filePath);
      if (!response.ok) throw new Error(`Failed to load ${filePath}`);
      
      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      // Extract body content
      const newContent = doc.body.innerHTML;
      document.body.innerHTML = newContent;
      
      // Update browser history
      window.history.pushState({ path }, '', path);
      this.currentPage = path;
      
      // Reinitialize scripts for the new page
      this.reinitScripts(doc);
      
    } catch (error) {
      console.error('Navigation error:', error);
      document.body.innerHTML = '<h1>404 - Page not found</h1>';
    }
  }

  reinitScripts(doc) {
    // Reinitialize Bootstrap components
    const scripts = doc.querySelectorAll('script[src*="app.js"], script[src*="dashboard.js"]');
    scripts.forEach(script => {
      const newScript = document.createElement('script');
      newScript.src = script.src;
      newScript.async = true;
      document.body.appendChild(newScript);
    });
  }
}

// Initialize router when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.router = new Router();
});
```

### Solution 2: Update HTML Navigation Links

In all your HTML files, update navigation links to use the router:

```html
<!-- Old approach (web) -->
<a href="pages/dashboard.html">Dashboard</a>

<!-- New approach (mobile-friendly) -->
<a href="/dashboard" data-route>Dashboard</a>
<a href="/profile" data-route>Profile</a>
<a href="/admin" data-route>Admin Dashboard</a>
```

### Solution 3: Create a Navigation Component

Create **www/js/navigation.js**:

```javascript
class Navigation {
  constructor() {
    this.menuItems = [
      { label: 'Home', route: '/', icon: 'home' },
      { label: 'Dashboard', route: '/dashboard', icon: 'dashboard' },
      { label: 'Profile', route: '/profile', icon: 'person' },
      { label: 'Schedule', route: '/schedule', icon: 'calendar' },
      { label: 'Services', route: '/services', icon: 'fitness' },
      { label: 'Admin', route: '/admin', icon: 'settings', roleRequired: 'admin' }
    ];
    this.currentUser = this.getCurrentUser();
  }

  getCurrentUser() {
    try {
      return JSON.parse(localStorage.getItem('user'));
    } catch {
      return null;
    }
  }

  getVisibleMenuItems() {
    return this.menuItems.filter(item => {
      if (item.roleRequired && this.currentUser?.role !== item.roleRequired) {
        return false;
      }
      return true;
    });
  }

  render() {
    const items = this.getVisibleMenuItems();
    return `
      <nav class="navbar navbar-expand-lg navbar-dark bg-dark">
        <div class="container">
          <a class="navbar-brand" href="/" data-route>JE Fitness</a>
          <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
            <span class="navbar-toggler-icon"></span>
          </button>
          <div class="collapse navbar-collapse" id="navbarNav">
            <ul class="navbar-nav ms-auto">
              ${items.map(item => `
                <li class="nav-item">
                  <a class="nav-link" href="${item.route}" data-route>${item.label}</a>
                </li>
              `).join('')}
            </ul>
          </div>
        </div>
      </nav>
    `;
  }
}

// Initialize navigation
document.addEventListener('DOMContentLoaded', () => {
  const navbar = document.querySelector('nav') || document.body.querySelector('nav.navbar');
  if (!navbar) {
    const nav = new Navigation();
    document.body.insertAdjacentHTML('afterbegin', nav.render());
  }
});
```

---

## Step 7: Configure API Endpoints

### Challenge: Capacitor Apps Access APIs Differently

- **Browser**: `http://localhost:10000/api/auth`
- **Mobile Emulator**: `http://10.0.2.2:10000/api/auth` (Android) or `http://localhost:10000/api/auth` (iOS)
- **Mobile Device**: `http://<YOUR_MACHINE_IP>:10000/api/auth`
- **Production**: `https://api.jefitness.com/api/auth`

### Solution: Create API Configuration Module

Create **www/js/api.config.js**:

```javascript
class ApiConfig {
  static getBaseURL() {
    const env = this.getEnvironment();
    
    switch(env) {
      case 'ANDROID_EMULATOR':
        return 'http://10.0.2.2:10000';
      case 'IOS_SIMULATOR':
      case 'BROWSER':
        return 'http://localhost:10000';
      case 'MOBILE_DEVICE':
        return this.getMobileDeviceURL();
      case 'PRODUCTION':
        return 'https://api.jefitness.com';
      default:
        return 'http://localhost:10000';
    }
  }

  static getEnvironment() {
    // Check if running in Capacitor
    if (window.Capacitor && window.Capacitor.isNativePlatform()) {
      const platform = window.Capacitor.getPlatform();
      
      if (platform === 'android') {
        return 'ANDROID_EMULATOR';
      } else if (platform === 'ios') {
        return 'IOS_SIMULATOR';
      }
      
      // Check if on actual device
      if (this.isPhysicalDevice()) {
        return 'MOBILE_DEVICE';
      }
    }
    
    // Check if production
    if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      return 'PRODUCTION';
    }
    
    return 'BROWSER';
  }

  static isPhysicalDevice() {
    // Check if device info indicates physical device
    return navigator.userAgent.includes('Mobile') && !this.isEmulator();
  }

  static isEmulator() {
    return navigator.userAgent.includes('Emulator') || 
           navigator.userAgent.includes('Simulator');
  }

  static getMobileDeviceURL() {
    // Fallback: prompt user or use stored IP
    const savedIP = localStorage.getItem('device_server_ip');
    if (savedIP) {
      return `http://${savedIP}:10000`;
    }
    
    // Try to detect local network IP
    const hostname = window.location.hostname;
    if (hostname && hostname !== 'localhost') {
      return `http://${hostname}:10000`;
    }
    
    return 'http://localhost:10000';
  }

  static setDeviceServerIP(ip) {
    localStorage.setItem('device_server_ip', ip);
  }
}

// Usage in your API calls
class API {
  static async request(endpoint, options = {}) {
    const baseURL = ApiConfig.getBaseURL();
    const url = `${baseURL}${endpoint}`;
    
    try {
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getToken()}`,
          ...options.headers
        },
        ...options
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error(`API Error: ${endpoint}`, error);
      throw error;
    }
  }

  static getToken() {
    return localStorage.getItem('token') || '';
  }

  // Auth endpoints
  static auth = {
    login: (email, password) => API.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    }),
    
    register: (userData) => API.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData)
    }),
    
    logout: () => API.request('/api/auth/logout', {
      method: 'POST'
    })
  };

  // Clients endpoints
  static clients = {
    getAll: () => API.request('/api/clients'),
    
    getOne: (id) => API.request(`/api/clients/${id}`),
    
    create: (data) => API.request('/api/clients', {
      method: 'POST',
      body: JSON.stringify(data)
    })
  };

  // Logs endpoints
  static logs = {
    getAll: () => API.request('/api/logs'),
    
    create: (data) => API.request('/api/logs', {
      method: 'POST',
      body: JSON.stringify(data)
    })
  };

  // Users endpoints
  static users = {
    getProfile: () => API.request('/api/users/profile'),
    
    updateProfile: (data) => API.request('/api/users/profile', {
      method: 'PUT',
      body: JSON.stringify(data)
    })
  };

  // Programs endpoints
  static programs = {
    getAll: () => API.request('/api/programs'),
    
    getOne: (id) => API.request(`/api/programs/${id}`)
  };
}
```

### Update Your Existing API Calls

In **www/js/app.js**, **www/js/auth.js**, and other files, replace direct fetch calls:

```javascript
// OLD CODE
const response = await fetch('http://localhost:10000/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password })
});

// NEW CODE
const response = await API.auth.login(email, password);
```

---

## Step 8: Build & Run on Emulators

### Android Emulator

#### Step 1: Open Android Studio

```powershell
# If Android Studio is in PATH
studio

# Or open manually from your computer
# C:\Program Files\Android\Android Studio\bin\studio.exe
```

#### Step 2: Create Virtual Device

1. Click "Virtual Device Manager"
2. Click "Create Device"
3. Select device (e.g., "Pixel 5")
4. Select OS version (Android 12+)
5. Click "Finish"

#### Step 3: Start Emulator & Deploy App

```powershell
# Start the emulator from command line
emulator -avd Pixel_5_API_31 &

# Sync web files to Android
npx cap sync android

# Run on emulator
npx cap run android
```

#### Step 4: Test Backend Connection

In the emulator:
1. Open the app
2. Go to browser console (right-click → Inspect)
3. Run: `API.getBaseURL()` to verify correct URL
4. Test login to confirm backend connection

### iOS Simulator (macOS Only)

#### Step 1: Open Xcode

```bash
# Open iOS project in Xcode
npx cap open ios
```

#### Step 2: Select Simulator

In Xcode:
1. Click on "App" scheme selector (top-left)
2. Select desired simulator (e.g., "iPhone 15 Pro")
3. Click the play button or Product → Run

#### Step 3: Deploy App

```bash
# Sync web files to iOS
npx cap sync ios

# Build and run on simulator
npx cap run ios
```

---

## Step 9: Test on Physical Devices

### Android Physical Device

#### Prerequisites

- USB cable
- USB debugging enabled on device:
  1. Settings → About Phone
  2. Tap Build Number 7 times
  3. Settings → Developer Options → Enable USB Debugging

#### Steps

```powershell
# Connect device via USB

# Check if device is detected
adb devices

# Sync web files
npx cap sync android

# Deploy to device
npx cap run android

# Or open in Android Studio
npx cap open android
# Then select your device and click Run
```

### iOS Physical Device (macOS Only)

#### Prerequisites

- Apple Developer Account
- Provisioning profile
- Device registered in Apple Developer Console

#### Steps

```bash
# Connect device via USB

# Sync web files
npx cap sync ios

# Deploy to device
npx cap run ios
```

Or in Xcode:
1. Connect device via USB
2. Open the project in Xcode
3. Select your device from scheme selector
4. Click the play button

#### Troubleshooting iOS Device Deploy

```bash
# List connected iOS devices
xcrun xcode-select -p

# Reset build cache
rm -rf ~/Library/Developer/Xcode/DerivedData/*

# Trust your computer on the device
# Device → Settings → General → Device Management → Trust your computer
```

---

## Step 10: Handle CSP & WebView Issues

### Challenge: Content Security Policy (CSP)

Your backend has CSP headers that may block resources in the WebView.

### Solution 1: Update Backend CSP for Mobile

Edit **src/server.js** to allow Capacitor schema and local resources:

```javascript
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: [
        "'self'",
        "capacitor://",      // Allow Capacitor schema
        "file://"             // Allow file protocol for local files
      ],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",
        "capacitor://",
        "file://",
        "https://cdn.jsdelivr.net",
        "https://cdnjs.cloudflare.com"
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'",
        "capacitor://",
        "file://",
        "https://cdn.jsdelivr.net",
        "https://fonts.googleapis.com",
        "https://cdnjs.cloudflare.com"
      ],
      fontSrc: [
        "'self'",
        "capacitor://",
        "file://",
        "https://fonts.gstatic.com",
        "https://cdn.jsdelivr.net"
      ],
      imgSrc: [
        "'self'",
        "data:",
        "blob:",
        "capacitor://",
        "file://",
        "https://via.placeholder.com",
        "https://cdn.jsdelivr.net"
      ],
      connectSrc: [
        "'self'",
        "capacitor://",
        "file://",
        "http://localhost:10000",           // Development
        "http://10.0.2.2:10000",            // Android emulator
        "https://api.mailjet.com",
        "https://cdn.jsdelivr.net"
      ],
      mediaSrc: [
        "'self'",
        "capacitor://",
        "file://"
      ],
      manifestSrc: [
        "'self'",
        "capacitor://",
        "file://"
      ],
      frameSrc: [
        "capacitor://"
      ],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: []  // Allow HTTP in development
    }
  }
}));
```

### Solution 2: Handle Bootstrap & Font Loading

Create **www/js/loader.js**:

```javascript
class ResourceLoader {
  static async loadBootstrapCDN() {
    return new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://cdnjs.cloudflare.com/ajax/libs/bootstrap/5.3.0/css/bootstrap.min.css';
      link.crossOrigin = 'anonymous';
      link.onerror = () => {
        console.warn('Failed to load Bootstrap CSS, falling back to local copy');
        this.loadBootstrapLocal().then(resolve).catch(reject);
      };
      link.onload = resolve;
      document.head.appendChild(link);
    });
  }

  static async loadBootstrapLocal() {
    // Ensure you have a local copy at www/css/bootstrap.min.css
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'css/bootstrap.min.css';
    document.head.appendChild(link);
    return new Promise(resolve => setTimeout(resolve, 1000));
  }

  static async loadBootstrapJS() {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/bootstrap/5.3.0/js/bootstrap.bundle.min.js';
      script.crossOrigin = 'anonymous';
      script.onerror = () => {
        console.warn('Failed to load Bootstrap JS');
        resolve();
      };
      script.onload = resolve;
      document.body.appendChild(script);
    });
  }

  static async loadGoogleFonts() {
    const link = document.createElement('link');
    link.rel = 'preconnect';
    link.href = 'https://fonts.googleapis.com';
    document.head.appendChild(link);

    const link2 = document.createElement('link');
    link2.rel = 'preconnect';
    link2.href = 'https://fonts.gstatic.com';
    link2.crossOrigin = 'anonymous';
    document.head.appendChild(link2);
  }

  static async initialize() {
    try {
      await this.loadGoogleFonts();
      await this.loadBootstrapCDN();
      await this.loadBootstrapJS();
      document.body.classList.add('resources-loaded');
    } catch (error) {
      console.error('Resource loading error:', error);
    }
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => ResourceLoader.initialize());
} else {
  ResourceLoader.initialize();
}
```

Add this to **www/index.html** (before other scripts):

```html
<script src="js/loader.js"></script>
```

### Solution 3: Disable CSP in Development (Not Recommended for Production)

For testing purposes only, you can temporarily disable CSP:

```javascript
// In src/server.js - ONLY FOR DEVELOPMENT
if (process.env.NODE_ENV !== 'production') {
  app.use(helmet({
    contentSecurityPolicy: false,  // Disable CSP temporarily
    // ... rest of helmet config
  }));
}
```

---

## Troubleshooting

### Common Issues & Solutions

#### 1. **Blank Screen on App Launch**

**Problem**: App opens but shows blank screen.

**Solutions**:
```javascript
// Add debugging to www/js/app.js
console.log('App loaded');
console.log('Environment:', ApiConfig.getEnvironment());
console.log('API Base URL:', ApiConfig.getBaseURL());
```

Check browser console:
```javascript
// Open DevTools in the app
// Right-click → Inspect or use Capacitor DevTools
```

#### 2. **Cannot Connect to Backend API**

**Problem**: API calls fail with CORS or connection errors.

**Solutions**:

```powershell
# Test backend is running
curl http://localhost:10000/api/auth/login

# Android emulator IP issue
# Add to capacitor.config.ts
adb reverse tcp:10000 tcp:10000
```

Update backend CORS:
```javascript
// In src/server.js
app.use(cors({
  origin: ['http://localhost:10000', 'capacitor://localhost', 'ionic://localhost'],
  credentials: true
}));
```

#### 3. **Bootstrap Styles Not Loading**

**Problem**: App displays without Bootstrap styling.

**Solutions**:
```html
<!-- www/index.html: Add local Bootstrap CSS as fallback -->
<link rel="stylesheet" href="css/bootstrap.min.css">
<script src="js/loader.js"></script>
```

#### 4. **Images Not Displaying**

**Problem**: Images show as broken links.

**Solutions**:
```javascript
// Update image paths in HTML
<!-- OLD -->
<img src="images/logo.jpg">

<!-- NEW (absolute path from root) -->
<img src="/images/logo.jpg">
```

Or use a helper function:
```javascript
function getImagePath(filename) {
  return `/images/${filename}`;
}
```

#### 5. **Android Emulator Performance Issues**

**Problem**: Emulator runs very slowly.

**Solutions**:
```powershell
# Use hardware acceleration (if available)
emulator -avd Pixel_5_API_31 -gpu swiftshader_indirect

# Increase emulator RAM
emulator -avd Pixel_5_API_31 -memory 2048

# Use a Pixel device with lower API level
emulator -avd Pixel_5_API_30 -no-snapshot-load
```

#### 6. **App Crashes on iOS**

**Problem**: App crashes with no error message.

**Solutions** (in Xcode):
1. Product → Scheme → Edit Scheme
2. Run → Diagnostics → Enable all options
3. Run the app and check the console

Check logs:
```bash
# View iOS device logs
xcrun simctl openurl booted http://localhost
```

#### 7. **Hot Reload Not Working**

**Problem**: Changes to www files don't appear when running on emulator.

**Solutions**:
```powershell
# Manually sync and rebuild
npx cap sync android
npx cap run android

# Or on iOS
npx cap sync ios
npx cap run ios
```

---

## Production Deployment

### Step 1: Update Environment Variables

Create **production.env**:

```env
NODE_ENV=production
MONGO_URI=<production-mongodb-uri>
PORT=443
API_BASE_URL=https://api.jefitness.com
JWT_SECRET=<secure-random-secret>
```

### Step 2: Update Capacitor Config for Production

Edit **capacitor.config.ts**:

```typescript
const config: CapacitorConfig = {
  appId: 'com.jefitness.app',
  appName: 'JE Fitness',
  webDir: 'www',
  server: {
    url: 'https://jefitness.web.app',  // Use Firebase Hosting or your CDN
    cleartext: false  // Disable cleartext for production
  }
};
```

### Step 3: Build for Production

#### Android Release Build

```powershell
# Build signed release APK
cd android
gradlew bundleRelease
cd ..

# APK will be at: android\app\release\app-release.apk
# AAB will be at: android\app\release\app-release.aab
```

#### iOS Release Build

```bash
cd ios/App
xcodebuild -scheme App -configuration Release -derivedDataPath build
cd ../../

# Archive for App Store
xcodebuild -scheme App -configuration Release -archivePath build/app.xcarchive archive
```

### Step 4: Deploy to App Stores

#### Google Play Store (Android)

1. Create Google Play Developer Account ($25 one-time fee)
2. Upload APK/AAB to Google Play Console
3. Fill in store listing details
4. Submit for review

#### Apple App Store (iOS)

1. Create Apple Developer Account ($99/year)
2. Get provisioning profiles and certificates
3. Archive app in Xcode
4. Use Xcode's organizer to upload to App Store
5. Fill in store listing details
6. Submit for review

---

## Complete Setup Checklist

- [ ] Install Capacitor: `npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios`
- [ ] Create `capacitor.config.ts`
- [ ] Create `www` folder and copy `public` contents
- [ ] Add Capacitor scripts to all HTML files
- [ ] Create `api.config.js` for API management
- [ ] Update all API calls to use `API` class
- [ ] Create router for multi-page navigation
- [ ] Add Android platform: `npx cap add android`
- [ ] Add iOS platform: `npx cap add ios` (macOS only)
- [ ] Update CSP headers in backend
- [ ] Test on Android emulator
- [ ] Test on iOS simulator (macOS)
- [ ] Test on physical Android device
- [ ] Test on physical iOS device (macOS)
- [ ] Configure production environment variables
- [ ] Build release APK/AAB for Android
- [ ] Build release archive for iOS
- [ ] Submit to Google Play Store and Apple App Store

---

## Quick Reference: Common Commands

```powershell
# Development
npm run dev & npm run cap:sync

# Android
npm run cap:add:android
npm run cap:open android  # Opens Android Studio
npm run cap:build:android
npx cap run android

# iOS (macOS only)
npm run cap:add:ios
npm run cap:open ios  # Opens Xcode
npm run cap:build:ios
npx cap run ios

# General
npx cap copy                # Sync web files to platforms
npx cap sync                # Copy + install dependencies
npx cap sync android && npx cap run android

# Production
npm run app:build:android
npm run app:build:ios
```

---

## Additional Resources

- **Capacitor Documentation**: https://capacitorjs.com/docs
- **Capacitor Plugins**: https://capacitorjs.com/docs/plugins
- **Android Studio**: https://developer.android.com/studio
- **Xcode**: https://developer.apple.com/xcode/
- **Firebase Hosting**: https://firebase.google.com/docs/hosting
- **Google Play Console**: https://play.google.com/console
- **Apple App Store Connect**: https://appstoreconnect.apple.com

---

## Support & Next Steps

1. **Test the basic setup** with Android emulator first
2. **Monitor logs** in DevTools for errors
3. **Iterate on CSP** headers as needed for your specific assets
4. **Use platform-specific plugins** (Camera, Location, Push Notifications, etc.) as your app grows
5. **Implement auto-updates** using Capacitor's Live Update feature for seamless deployments

Good luck converting JE Fitness into a mobile app!
