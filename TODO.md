update files to follow the backend: Root Cause: The Subscription Mongoose model (src/models/Subscription.js) only stores active (boolean) and expiresAt (Date). However, multiple frontend files expect status (string: 'active', 'trialing', 'cancelled'), plan, currentPeriodEnd, and currentPeriodStart fields that don't exist in the database or API response.

