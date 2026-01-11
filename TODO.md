# TODO: Remove Programs, Marketplace, and Unused Tests

## Step 1: Delete Programs-Related Files
- [ ] Delete src/models/Program.js
- [ ] Delete src/seedPrograms.js
- [ ] Delete public/js/my-programs.js
- [ ] Delete public/js/program-details.js
- [ ] Delete public/js/workout-programs.js
- [ ] Delete public/pages/my-programs.html
- [ ] Delete public/pages/program-details.html
- [ ] Delete public/pages/workout-programs.html
- [ ] Delete public/pages/programs/ directory

## Step 2: Delete Marketplace-Related Files
- [ ] Delete public/js/marketplace.js
- [ ] Delete public/pages/marketplace.html

## Step 3: Delete Tests Directory
- [ ] Delete tests/ directory

## Step 4: Edit Referenced Files to Remove Links/Routes
- [x] Edit public/js/router.js to remove marketplace and programs routes
- [x] Edit public/js/navigation.js to remove marketplace and programs navigation items
- [x] Edit www/pages/partials/navbar.html to remove marketplace link
- [x] Edit public/pages/dashboard.html to remove marketplace link
- [x] Edit public/js/my-programs.js to remove marketplace references
- [x] Edit public/js/program-details.js to remove marketplace references

## Step 5: Edit package.json
- [x] Remove "seed:programs" script from package.json

## Step 6: Verification
- [ ] Verify no broken references remain
- [ ] Test the application to ensure functionality is intact
