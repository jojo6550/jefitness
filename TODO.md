
● BLOAT ANALYSIS                           
                                                                                                                                           
  Subscriptions - Backend (subscriptionController.js)                                                                                      
                                                                                                                                             Issues:                                                                                                                                  
                                                                                                                                             1. Unused getBillingEnv() helper (20-22) — defined but never called                                                                        2. computeDaysLeft() wrapper (15-17) — one line passes to another; skip the wrapper                                                        3. Repeated email date formatting — lines 613-620, 643-649 identical patterns; extract helper                                            
  4. Invoice mapping redundancy (311-324) — logic could be 4 lines instead of 14                                                           
  5. SubscriptionService missing API_BASE — uses global API_BASE (lines 16, 23, 35, 42, 56) but it's not defined; should use
  window.ApiConfig.getAPI_BASE()
  6. cancelQueuedPlan exports twice (340-345) — module.exports both full object AND individual exports; pick one

  ---
  Subscriptions - Frontend (subscriptions.js)

  Issues:

  1. safeShow/safeHide (49-59) — null checks are fine but called inline everywhere; keep but usage is OK
  2. Date parsing/formatting happens 5+ times — parseDate() and safeFormatDate() exist but duplicated in renderActiveSubscriptionSummary   
  (349-350) vs renderPlans (198)
  3. Modal + event delegation (666-698) — pattern is clean, not bloated
  4. Redundant checks (445-448) — loadUserSubscriptions() called inside selectPlan() which already loads data; unnecessary

  ---
  Appointments - Backend (appointments.js)

  Major issues:

  1. File is 990 lines — split into service layer (business logic) + route handler
  2. Email notification code 4x duplicated:
    - Lines 609-635 (booking confirmation)
    - Lines 638-665 (trainer individual notification)
    - Lines 796-810 (cancellation client)
    - Lines 816-830 (cancellation trainer)
    - Lines 834-862 (update client/trainer)
    - Extract: sendApptEmailsForAction(appt, action, clientName, trainerName, dateStr)
  3. Date normalization 2x:
    - Lines 486-491 (POST)
    - Lines 523-526 (same logic again)
    - Extract: normalizeAppointmentDate(date)
  4. Appointment.populate() pattern 3x:
    - Lines 594-595 (POST)
    - Lines 737-741 (PUT)
    - Lines 890-894 (DELETE)
    - Extract helper or use pre-save hook
  5. Trainer name formatting 2x identical:
    - Lines 744-751 (PUT)
    - Lines 897-904 (DELETE)
    - Make a helper: extractApptNames(appointment)
  6. Permission check awkward (452-458):
  const clientIdStr = appointment.clientId?._id?.toString();
  const trainerIdStr = appointment.trainerId?._id?.toString();
  if (!clientIdStr && !trainerIdStr) return 404;
  if (clientIdStr !== req.user.id && trainerIdStr !== req.user.id) return 403;
  6. Better:
  const isOwner = [appointment.clientId?._id, appointment.trainerId?._id]
    .some(id => id?.toString() === req.user.id);
  if (!isOwner) return res.status(403).json({ msg: 'Access denied' });
  7. Status transition rules appear twice (714-721 trainers, 723-729 clients) — extract validation helper

  ---
  Appointments - Model (Appointment.js)

  Index bloat:

  - Line 41: { date: 1, time: 1 }
  - Line 46: { trainerId: 1, date: 1 }
  - Line 50: { trainerId: 1, date: 1, time: 1 } ← supersedes lines 41+46

  Keep only:
  - Line 41 (single-field for date queries)
  - Line 42 (trainer lookups)
  - Line 43 (client lookups)
  - Line 46 (trainer+date pairs)
  - Line 48 (client+date pairs)
  - Remove line 47 (trainerId, status) — rarely queried together
  - Remove line 50 — unique constraint at end already covers this

  ---
  Quick Wins (1-2 min):

  1. Delete getBillingEnv()
  2. Inline computeDaysLeft() — just call daysLeftUntil() directly
  3. Fix SubscriptionService API_BASE reference
  4. Remove redundant module exports at bottom of subscriptionController
  5. Drop unused indexes (47, 50 in Appointment schema)
