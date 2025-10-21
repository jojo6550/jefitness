# Performance Optimization TODO

## Image Optimization
- [x] Install image optimization tools (e.g., sharp for WebP conversion)
- [x] Convert hero.jpg to WebP format
- [x] Convert logo.jpg to WebP format
- [x] Update public/index.html to use <picture> elements with WebP sources and JPEG fallbacks
- [ ] Add lazy loading attribute to images not in viewport

## Minification
- [x] Install minification tools (uglify-js for JS, cssnano for CSS)
- [x] Add build scripts to package.json for minification
- [x] Minify public/styles/styles.css
- [x] Minify all JS files in public/js/ (app.js, auth.js, etc.)
- [x] Update HTML to reference minified files

## CDN for Assets
- [ ] Replace local video references in program pages with YouTube iframe embeds for CDN delivery
- [ ] Suggest uploading images to a CDN (e.g., Cloudinary) or use GitHub raw URLs for faster delivery
- [ ] Update image sources in HTML to use CDN URLs

## Testing and Verification
- [ ] Test site loading after optimizations
- [ ] Verify images load correctly with fallbacks
- [ ] Check minified files are served
- [ ] Confirm videos embed properly from YouTube
