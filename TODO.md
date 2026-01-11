# Program Payments Implementation TODO

## Completed Tasks
- [x] Add PROGRAM_PRODUCT_IDS configuration in stripe.js
- [x] Create createProgramCheckoutSession function in stripe.js
- [x] Add program checkout endpoint in programs.js
- [x] Update exports in stripe.js to include new functions
- [x] Add program purchase checkout session endpoint
- [x] Update webhook handler to assign programs after successful payment

## Remaining Tasks
- [ ] Add program purchase history tracking
- [ ] Test the program purchase flow
- [ ] Update frontend to use the new checkout endpoint

## Environment Variables Needed
Set the following environment variables for each program:
- STRIPE_PROGRAM_{PROGRAM_SLUG} (e.g., STRIPE_PROGRAM_BEGINNER_WORKOUT for program with slug 'beginner-workout')

## Testing Checklist
- [ ] Create test program with product ID
- [ ] Test checkout session creation
- [ ] Test successful payment flow
- [ ] Test program assignment after payment
- [ ] Test error handling for invalid programs
- [ ] Test duplicate purchase prevention
