refactor subscriptions: one subscription document per user. should have 3 states, active, cancelled, trialing (no subscription)

subscription flow: user goes to subscription page and purchases subscription via stripe. upon payment, a subscription db doc is created to store their infromation. user is now in active state. a user can cancel the subscription and the account is now set to cancelled. upon expiration of a subscription, user's account is sent back to trialing (no subscription) rinse and repeat.

constraints: admin should still be able to add and remove subscriptions and override the days as seen in admin functions.

