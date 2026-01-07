# TODO: Remove Quantity from Program Purchase Logic

## Backend Changes
- [x] Update Cart model to remove quantity field
- [x] Modify cart.js add route to always set quantity to 1 and prevent duplicates
- [x] Remove update quantity route from cart.js
- [x] Update orders.js to remove quantity from order items and simplify calculations
- [x] Update Order model to remove quantity field

## Test Updates
- [ ] Update cart.test.js to match new logic (remove quantity tests)
- [ ] Update checkout-flow.test.js to remove quantity handling
- [ ] Update other relevant test files

## Frontend Updates
- [x] Update public/js/cart.js to remove quantity UI and handlers
- [ ] Update public/js/checkout.js to remove quantity handling
- [ ] Update other frontend JS files as needed

## Verification
- [ ] Run tests to ensure changes work
- [ ] Check frontend UI for quantity inputs to remove
