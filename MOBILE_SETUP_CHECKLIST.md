# JE Fitness Mobile App - Setup Checklist

Quick reference checklist for converting the website to a mobile app using Capacitor.

## Prerequisites ✓
- [ ] Node.js v16+ installed
- [ ] npm installed
- [ ] Java Development Kit (JDK) 11+ for Android
- [ ] Android Studio installed with Android SDK
- [ ] Xcode 14+ (for iOS - macOS only)
- [ ] CocoaPods installed (for iOS)
- [ ] Git installed

## Step 1: Install Dependencies
- [ ] Run: `npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios`
- [ ] Verify installation: `npx cap --version`

## Step 2: Initialize Capacitor
- [ ] Create `capacitor.config.ts` at project root (template provided)
- [ ] Run: `npx cap init` (if using JSON config instead of TS)
- [ ] Update app ID: `com.jefitness.app`
- [ ] Update app name: `JE Fitness`
- [ ] Set web directory: `www`

## Step 3: Set Up Web Assets
- [ ] Create `www` folder at project root
- [ ] Copy all files from `public/` to `www/`:
  ```powershell
  Copy-Item -Path "public\*" -Destination "www" -Recurse -Force
  ```
- [ ] Add Capacitor scripts to all HTML files:
  ```html
  <script src="capacitor/capacitor.js"></script>
  <script src="capacitor/init.js"></script>
  ```
- [ ] Update image paths to use absolute URLs (e.g., `/images/logo.jpg`)
- [ ] Ensure all CSS and JS files are correctly linked

## Step 4: Add Support Scripts
- [ ] Copy `public/js/api.config.js` - API configuration for multiple environments
- [ ] Copy `public/js/router.js` - Client-side routing for multi-page navigation
- [ ] Copy `public/js/loader.js` - Resource loading with fallbacks
- [ ] Copy `public/js/navigation.js` - Navigation bar component
- [ ] Add these scripts to `www/index.html`:
  ```html
  <script src="js/loader.js"></script>
  <script src="js/api.config.js"></script>
  <script src="js/router.js"></script>
  <script src="js/navigation.js"></script>
  ```

## Step 5: Update Navigation Links
- [ ] Convert all `href` links to use data-route attribute:
  ```html
  <!-- OLD -->
  <a href="pages/dashboard.html">Dashboard</a>
  
  <!-- NEW -->
  <a href="/dashboard" data-route>Dashboard</a>
  ```
- [ ] Update all pages in `www/pages/` directory
- [ ] Test navigation in browser

## Step 6: Update API Calls
- [ ] Review all fetch calls in JavaScript files
- [ ] Replace with `API` class methods:
  ```javascript
  // OLD
  fetch('http://localhost:10000/api/auth/login', ...)
  
  // NEW
  API.auth.login(email, password)
  ```
- [ ] Update these files:
  - [ ] `public/js/auth.js`
  - [ ] `public/js/app.js`
  - [ ] `public/js/dashboard.js`
  - [ ] Other API-calling files

## Step 7: Update Backend Security (CSP & CORS)
- [ ] Open `src/server.js`
- [ ] Add capacitor://, file://, and local development URLs to CSP directives
- [ ] Use updated CORS configuration from `src/server-mobile-csp.js`
- [ ] Test backend with `npm start`

## Step 8: Set Up Android Platform
- [ ] Run: `npx cap add android`
- [ ] Verify `android/` folder created
- [ ] Edit `android/app/src/main/AndroidManifest.xml`:
  - [ ] Add INTERNET permission
  - [ ] Add other required permissions (CAMERA, LOCATION, etc.)
- [ ] Edit `android/app/src/main/res/values/strings.xml`:
  - [ ] Add API base URL: `<string name="api_base_url">http://10.0.2.2:10000</string>`

## Step 9: Set Up iOS Platform (macOS Only)
- [ ] Run: `npx cap add ios`
- [ ] Verify `ios/App/` folder created
- [ ] Edit `ios/App/App/Info.plist`:
  - [ ] Add NSBonjourServices
  - [ ] Add NSLocalNetworkUsageDescription
  - [ ] Add NSCameraUsageDescription (if needed)
  - [ ] Add NSLocationWhenInUseUsageDescription (if needed)

## Step 10: Create Android Emulator
- [ ] Open Android Studio
- [ ] Click "Virtual Device Manager"
- [ ] Create new device (e.g., Pixel 5)
- [ ] Select Android 12+ OS version
- [ ] Finish setup

## Step 11: Test on Android Emulator
- [ ] Start emulator from Android Studio
- [ ] Run: `npx cap sync android`
- [ ] Run: `npx cap run android`
- [ ] Or open Android Studio: `npx cap open android` and click Run
- [ ] Test login functionality
- [ ] Test navigation between pages
- [ ] Check console for errors: Right-click → Inspect

## Step 12: Test on iOS Simulator (macOS Only)
- [ ] Verify Xcode and CocoaPods installed
- [ ] Run: `npx cap sync ios`
- [ ] Run: `npx cap run ios`
- [ ] Or open Xcode: `npx cap open ios` and click the Play button
- [ ] Test app in simulator
- [ ] Check console for errors

## Step 13: Test on Physical Android Device
- [ ] Enable USB Debugging:
  - [ ] Settings → About Phone
  - [ ] Tap Build Number 7 times
  - [ ] Settings → Developer Options → USB Debugging
- [ ] Connect via USB
- [ ] Run: `adb devices` (verify device appears)
- [ ] Run: `npx cap run android`
- [ ] Test all major features

## Step 14: Test on Physical iOS Device (macOS Only)
- [ ] Register device in Apple Developer Console
- [ ] Download provisioning profile
- [ ] Connect device via USB
- [ ] Run: `npx cap run ios`
- [ ] Trust your computer on the device
- [ ] Test all major features

## Step 15: Optimize & Prepare for Production
- [ ] Update `capacitor.config.ts` for production URLs
- [ ] Set `cleartext: false` in server config
- [ ] Update API endpoints to production URLs
- [ ] Test error handling and edge cases
- [ ] Check console for warnings and errors
- [ ] Performance test on slow networks
- [ ] Test on various device sizes and orientations

## Step 16: Build for App Stores
- [ ] **Android Release Build**:
  - [ ] Run: `cd android && gradlew bundleRelease && cd ..`
  - [ ] Sign APK with release keystore
  - [ ] Generate App Bundle for Play Store
  
- [ ] **iOS Release Build** (macOS only):
  - [ ] Run: `npx cap open ios`
  - [ ] In Xcode: Product → Archive
  - [ ] Use Xcode Organizer to upload to App Store

## Step 17: Submit to App Stores
- [ ] **Google Play Store**:
  - [ ] Create Google Play Developer Account
  - [ ] Upload App Bundle (AAB)
  - [ ] Fill app store listing
  - [ ] Submit for review
  
- [ ] **Apple App Store** (macOS only):
  - [ ] Create Apple Developer Account
  - [ ] Upload IPA via Xcode Organizer
  - [ ] Fill app store listing
  - [ ] Submit for review

## Troubleshooting Quick Fixes
- [ ] **Blank Screen**: Check console logs (Right-click → Inspect)
- [ ] **API Connection Failed**: Verify backend is running (`npm start`)
- [ ] **Bootstrap Styles Missing**: Ensure CSS files are in `www/` folder
- [ ] **Images Not Showing**: Use absolute paths starting with `/`
- [ ] **Navigation Not Working**: Verify router.js is loaded and links use `data-route`
- [ ] **Android Emulator Slow**: Use `-gpu swiftshader_indirect` flag

## Quick Commands Reference

```powershell
# Development
npm run dev
npx cap sync

# Android Development
npx cap add android
npx cap open android
npx cap run android

# iOS Development (macOS)
npx cap add ios
npx cap open ios
npx cap run ios

# General
npx cap copy      # Sync web files
npx cap sync      # Copy + install dependencies
npx cap doctor    # Check environment setup

# Production Build
npm run app:build:android
npm run app:build:ios
```

## Resources
- Capacitor Docs: https://capacitorjs.com/docs
- Android Studio: https://developer.android.com/studio
- Xcode: https://developer.apple.com/xcode
- Google Play Console: https://play.google.com/console
- App Store Connect: https://appstoreconnect.apple.com

## Notes
- Keep backend running on port 10000 during mobile development
- Android emulator accesses localhost via `10.0.2.2`
- iOS simulator can access `localhost` directly
- Always run `npx cap sync` after web file changes
- Test on actual devices before app store submission

---

**Status**: Ready to start Capacitor setup!
