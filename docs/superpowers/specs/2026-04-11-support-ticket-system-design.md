# Support Ticket System — Design Spec
**Date:** 2026-04-11  
**Status:** Approved

---

## Overview

Users need a way to report bugs, suggest features, and raise issues directly to admins from within the app. This design adds a full support ticket system: a dedicated `/support` page for users, an admin tickets view inside the existing admin panel, email notifications in both directions, and rate limiting to prevent abuse.

---

## Architecture

### New Files

| File | Purpose |
|------|---------|
| `src/models/SupportTicket.js` | Mongoose schema |
| `src/routes/tickets.js` | API routes (user + admin) |
| `src/controllers/ticketController.js` | Business logic |
| `public/pages/support.html` | User-facing support page |
| `public/js/support.js` | Frontend logic for support page |
| `public/styles/support.css` | Page-specific styles |

### Modified Files

| File | Change |
|------|--------|
| `src/middleware/rateLimiter.js` | Add `ticketSubmitLimiter` (5/7-days, user-keyed) |
| `src/services/email.js` | Add `sendNewTicketAdmin`, `sendTicketReceived`, `sendTicketFulfilled` |
| `src/server.js` | Register `/api/v1/tickets` route |
| `public/pages/admin.html` | Add "Tickets" sidebar nav item + tickets view section |
| `public/js/admin-dashboard.js` | Add tickets view render logic |
| `public/pages/dashboard.html` | Add "Support" link in user navbar |

---

## Data Model

**`src/models/SupportTicket.js`**

```js
{
  userId:      ObjectId ref 'User', required, indexed
  subject:     String, required, trim, maxlength: 120
  description: String, required, trim, maxlength: 2000
  category:    enum ['bug-report', 'feature-request', 'billing-issue', 'account-issue', 'general-inquiry'], required
  status:      enum ['draft', 'submitted', 'seen', 'resolved'], default: 'draft'
  adminNote:   String, optional, trim, maxlength: 1000
  seenAt:      Date (set when admin first opens ticket)
  resolvedAt:  Date (set when marked resolved)
  timestamps:  true  // auto createdAt, updatedAt
}
```

**Indexes:**
- `{ userId: 1, createdAt: -1 }` — user history + rate limit count queries
- `{ status: 1, createdAt: -1 }` — admin filtered views

**Status lifecycle:** `draft → submitted → seen → resolved`

- `draft` — saved but not sent; editable; does not consume rate limit
- `submitted` — sent to admin; triggers admin email; consumes 1 rate limit slot
- `seen` — auto-set when admin opens ticket detail
- `resolved` — set by admin; triggers fulfillment email to user

---

## Rate Limiting

Rate limiting for ticket submission is enforced **in the controller** (not as route middleware) because the intent (draft vs submit) is determined by the request body, which is only available after parsing.

**Strategy:** In `ticketController.js`, when `status === 'submitted'` is requested (on POST or PATCH), count the user's submitted tickets in the past 7 days using a DB query. If count ≥ 5, return a 429 response immediately before any write.

```js
const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
const count = await SupportTicket.countDocuments({
  userId: req.user.id,
  status: { $in: ['submitted', 'seen', 'resolved'] },
  createdAt: { $gte: sevenDaysAgo }
});
if (count >= 5) throw new AppError('You have reached the 5 ticket limit for this week. Please try again later.', 429);
```

- Draft saves never trigger this check
- The `{ userId, createdAt }` compound index makes this count query fast
- Response on limit hit: `{ success: false, error: { message: '...', status: 429 } }`
- Frontend shows remaining count and reset date based on oldest submitted ticket's `createdAt + 7 days`

---

## API Routes

Registered in `src/server.js` as:
```js
app.use('/api/v1/tickets', require('./routes/tickets'));
```

Middleware chain follows codebase standard: `auth → requireDataProcessingConsent → checkDataRestriction → apiLimiter → versioning`

### User Routes (`/api/v1/tickets`)

All require `auth` middleware.

| Method | Path | Middleware | Description |
|--------|------|-----------|-------------|
| `POST` | `/` | `auth`, `ticketSubmitLimiter` (if submitting) | Create ticket (draft or submit) |
| `GET` | `/` | `auth` | Get own tickets, paginated |
| `GET` | `/:id` | `auth` | Get single own ticket |
| `PATCH` | `/:id` | `auth`, `ticketSubmitLimiter` (if transitioning to submitted) | Edit draft or submit |
| `DELETE` | `/:id` | `auth` | Delete own draft only |

### Admin Routes (`/api/v1/tickets/admin`)

All require `auth + requireAdmin`.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | List all tickets; query params: `status`, `category`, `page`, `limit` |
| `GET` | `/:id` | Get ticket detail; auto-sets `seen` + `seenAt` if status was `submitted` |
| `PATCH` | `/:id/status` | Update status to `resolved`; accepts optional `adminNote` body field |

### Request / Response Shapes

**POST `/api/v1/tickets`**
```js
// Request
{ subject, description, category, status: 'draft' | 'submitted' }

// Response 201
{ success: true, data: { ticket } }
```

**PATCH `/api/v1/tickets/:id/status`** (admin)
```js
// Request
{ status: 'resolved', adminNote?: string }

// Response 200
{ success: true, data: { ticket } }
```

---

## Email Notifications

All added to `src/services/email.js` following the existing `sendEmail()` pattern.

| Function | Trigger | Recipient |
|----------|---------|-----------|
| `sendNewTicketAdmin(admins, ticket, user)` | User submits a ticket | All users with `role: 'admin'` |
| `sendTicketReceived(to, userName, ticket)` | User submits a ticket | The submitting user |
| `sendTicketFulfilled(to, userName, ticket)` | Admin marks resolved | The ticket owner |

**`sendNewTicketAdmin` email content:**
- Subject: `New Support Ticket: <subject>`
- Body: User name, user email, category, subject, description, submission timestamp, link to `/admin`

**`sendTicketReceived` email content:**
- Subject: `We received your ticket: <subject>`
- Body: Confirmation that the ticket was received, ticket summary, note that they'll be notified when resolved

**`sendTicketFulfilled` email content:**
- Subject: `Your ticket has been resolved: <subject>`
- Body: Ticket subject, admin note (if any), thank you message

Admin recipients are fetched at submit time: `User.find({ role: 'admin' }, 'email firstName').lean()`

---

## Frontend — User Support Page (`/support`)

**`public/pages/support.html`** — follows the same structure as `subscriptions.html` and `dashboard.html`: Bootstrap 5.3.3, Google Fonts (Outfit/Rajdhani), Bootstrap Icons, `dist/styles.css`, `styles/styles.css`.

**Page sections:**

1. **Hero header** — "Support" title, subtitle "Have an issue or idea? Let us know.", unread status summary if tickets exist
2. **Ticket form card** — visible by default if no tickets exist, toggled by "New Ticket" button otherwise
   - Category dropdown (5 options)
   - Subject input (maxlength 120, character counter)
   - Description textarea (maxlength 2000, character counter)
   - "Save Draft" button (gray) — saves without submitting
   - "Submit Ticket" button (indigo/primary) — submits; disabled + tooltip if rate limit reached
3. **My Tickets section** — list of user's own tickets
   - Each ticket shows: status pill, category badge, subject, date, chevron to expand description
   - Draft tickets show an "Edit" and "Delete" action
   - Submitted/seen/resolved tickets are read-only

**Status pill colors** (matching admin panel pill classes):
- `draft` → `.pill-gray`
- `submitted` → `.pill-blue` (new class, `#1e3a5f` bg / `#60a5fa` text)
- `seen` → `.pill-yellow`
- `resolved` → `.pill-green`

**Rate limit UI:** On page load, fetch ticket count for the past 7 days. If ≥ 5, disable submit button and show: "You've used all 5 tickets for this week. Resets on \<date\>."

---

## Frontend — Admin Tickets View

**`public/pages/admin.html`** changes:
- Add sidebar nav item: `<button class="nav-item" data-view="tickets"><i class="bi bi-ticket-fill nav-icon"></i><span class="nav-label">Tickets</span></button>`
- Add unread badge next to label (count of `submitted` tickets)

**Tickets view** rendered by new section in `public/js/admin-dashboard.js`:

1. **Topbar** — "Support Tickets" title + submitted count badge
2. **Filter row** — filter pills: All / Submitted / Seen / Resolved / Draft; category filter dropdown; search input (subject/user name)
3. **Tickets table** — columns:
   - User (avatar initial + name + email)
   - Category (badge)
   - Subject (truncated to 60 chars)
   - Status (pill)
   - Submitted date
   - Actions ("View" button)
4. **Ticket detail modal** — opens on "View":
   - User info: name, email
   - Category, submitted date
   - Subject (full)
   - Description (full, scrollable)
   - Admin note textarea (editable)
   - Status action button:
     - If `submitted` or `seen`: "Mark as Resolved" (green button)
     - If `resolved`: shows resolved timestamp + admin note (read-only)
   - Auto-marks `seen` when modal opens (fires PATCH silently if status was `submitted`)

---

## Navigation

- Add "Support" link to the user dashboard navbar (`public/pages/dashboard.html`) pointing to `/support`
- The support page uses `role-guard.js` to ensure only authenticated users can access it (redirect to `/login` if not authenticated)

---

## Error Handling

All controller functions wrapped with `asyncHandler`. Custom error classes used:
- `ValidationError` — missing/invalid fields
- `NotFoundError` — ticket not found
- `AuthorizationError` — user trying to access another user's ticket
- `AppError(message, 429)` — rate limit exceeded (also handled by middleware)

---

## Testing

1. **User flow:** Create draft → verify not emailed, not rate-limited. Submit → verify admin email sent, rate limit counter incremented. Submit 5 more → verify 6th is blocked with 429.
2. **Admin flow:** Open ticket → verify status auto-advances to `seen`. Mark resolved → verify user receives fulfillment email, `resolvedAt` is set, admin note saved.
3. **Authorization:** Attempt to fetch another user's ticket → expect 403. Attempt to delete a submitted ticket → expect 400.
4. **Rate limit reset:** After 7 days (or manually clear rate limit store) → verify submission works again.
5. **Email:** Verify `sendNewTicketAdmin` is called with all admin users' emails. Verify `sendTicketFulfilled` is called only on `resolved` transition.
