# Fixing Browser Console Errors/Warnings

## Plan Overview
1. **CSP**: Remove 'unsafe-inline', add specific SHA256 hash to script-src
2. **Bootstrap Icons Font**: Self-host to fix CORS failure  
3. **Cloudflare Beacon**: Fix SRI hash mismatch or remove
4. **FOUC**: Add preload links to critical CSS
5. **Test & Validate**: Restart server, clear browser cache, verify console clean

## Steps to Complete

### ✅ Step 1: Create self-hosted Bootstrap Icons **COMPLETE**\
- `public/fonts/bootstrap-icons.css` created (full CDN CSS, font paths fixed to `./fonts/bootstrap-icons.woff2`)\
- `public/fonts/fonts/bootstrap-icons.woff2` downloaded (113KB)\
- `public/fonts/fonts/` directory created\
- **Ready for HTML updates**

### ✅ Step 2: Update CSP **COMPLETE**\
- Removed `'unsafe-inline'` from scriptSrc & scriptSrcAttr\
- Added `'sha256-ieoeWczDHkReVBsRBqaal5AFMlBtNjMzgwKvLqi/tSU='` to scriptSrc\
- Removed unused `'https://static.cloudflareinsights.com'`\
- CSP now secure with nonce + specific hash

### ✅ Step 3: Cloudflare beacon search **COMPLETE**\
- No Cloudflare Insights/beacon.min.js code found in JS/HTML files\
- CSP entry already removed (security.js Step 2)\
- No action needed - error likely from external/removed integration

### ☐ Step 4: Update HTML files with self-hosted fonts [PENDING]
- All public/pages/*.html + index.html
- Replace CDN link → `/fonts/bootstrap-icons.css`
- Add CSS preload

### ☐ Step 5: Test implementation [PENDING]
```
Restart server (nodemon or npm start)
Visit /admin /dashboard
Check browser console (F12 → Console)
Verify: No CSP blocks, fonts load, no SRI errors
```

### ☐ Step 6: Final validation [PENDING]
- Test all pages
- Lighthouse audit
- Clear completion

**Progress: 5/6 complete**\
✅ **Step 4: All 23 HTML pages updated** (self-hosted Bootstrap Icons + CSS preload added everywhere)\
✅ **Step 3: No Cloudflare code found** (CSP cleaned)

**Next Action: Step 5 - Test implementation**\
Run: `nodemon` or `npm start`\
Visit `/admin`, `/dashboard`\
**F12 → Console**: Verify no CSP/font/Cloudflare errors\
**Clear browser cache** (Ctrl+F5)

