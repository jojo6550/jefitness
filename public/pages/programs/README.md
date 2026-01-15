# Program Access Control

This directory contains program content pages that are protected by access control. Users must purchase a program before they can view its content.

## How It Works

### 1. Program Page Structure

Each program has:
- **Slug**: A unique identifier (e.g., `9_week_phased_strength_jamin_johnson`)
- **HTML File**: Located at `public/pages/programs/{slug}.html`
- **Database Record**: Stored in MongoDB with the same slug

### 2. Access Control Flow

When a user tries to access a program page:

1. **Authentication Check**: Verifies user has a valid JWT token
   - If not authenticated → Redirects to login page
   
2. **Ownership Verification**: Checks if user has purchased the program
   - API Call: `GET /api/v1/programs/user/access/{slug}`
   - Checks `user.purchasedPrograms` array
   
3. **Access Decision**:
   - **Has Access**: Shows program content
   - **No Access**: Shows "Access Denied" message and redirects to marketplace

### 3. Required Scripts

Every program page must include these scripts:

```html
<script src="../../js/api.config.js"></script>
<script src="../../js/program-access.js"></script>
```

- `api.config.js`: Defines API base URL
- `program-access.js`: Implements access control logic

### 4. API Endpoint

**Endpoint**: `GET /api/v1/programs/user/access/:slug`

**Headers**: 
```
Authorization: Bearer {token}
```

**Response**:
```json
{
  "success": true,
  "hasAccess": true,
  "slug": "9_week_phased_strength_jamin_johnson"
}
```

## Adding New Programs

To add a new program with access control:

### Step 1: Create Program in Database

Use the seed script or create manually:

```javascript
{
  title: "My New Program",
  slug: "my-new-program",  // Must match HTML filename
  author: "Author Name",
  goals: "Program goals...",
  description: "Detailed description...",
  tags: ["tag1", "tag2"],
  difficulty: "beginner|intermediate|advanced",
  duration: "8 weeks",
  stripeProductId: "prod_xxxxx",
  stripePriceId: "price_xxxxx",
  features: ["Feature 1", "Feature 2"],
  isActive: true
}
```

### Step 2: Create HTML Page

Create file at: `public/pages/programs/my-new-program.html`

**Template**:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>My New Program – JE Fitness</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css" rel="stylesheet">
    <link rel="stylesheet" href="../../styles/styles.css">
</head>

<body class="dashboard-page">
    <div id="navbar-placeholder-programme"></div>

    <main class="container my-5">
        <!-- Your program content here -->
    </main>

    <!-- Required scripts for access control -->
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
    <script src="../../js/navbar-loader.js" defer></script>
    <script src="../../js/logout.js" defer></script>
    <script src="../../js/api.config.js"></script>
    <script src="../../js/program-access.js"></script>
</body>
</html>
```

### Step 3: Add Environment Variables

Add Stripe IDs to `.env`:

```env
STRIPE_PROGRAM_PRODUCT_MY_NEW_PROGRAM=prod_xxxxx
STRIPE_PROGRAM_PRICE_MY_NEW_PROGRAM=price_xxxxx
```

### Step 4: Seed Database

Run the seed script:

```bash
node src/seedPrograms.js
```

## User Purchase Flow

1. User browses **Program Marketplace** (`/pages/program-marketplace.html`)
2. User clicks "Purchase" → Creates Stripe checkout session
3. After successful payment → Program added to `user.purchasedPrograms`
4. User can access program from **My Programs** (`/pages/my-programs.html`)
5. Clicking "View Program" → Opens program page with access granted

## Security Features

- **JWT Authentication**: All API calls require valid token
- **Server-side Validation**: Purchase verification happens on backend
- **Automatic Redirects**: Unauthenticated users redirected to login
- **Access Denied UI**: Clear messaging when access is denied
- **Token Expiration**: Expired tokens automatically cleared

## Testing Access Control

### Test with Access:
1. Login as user
2. Purchase program via marketplace
3. Navigate to program page directly or via "My Programs"
4. Should see program content

### Test without Access:
1. Login as user who hasn't purchased
2. Try to access program page directly
3. Should see "Access Denied" message
4. Automatically redirected to marketplace after 3 seconds

### Test without Authentication:
1. Clear localStorage (logout)
2. Try to access program page directly
3. Should redirect to login page
4. After login, redirected back to program page (if they have access)

## Troubleshooting

**Issue**: "Access Denied" even after purchase
- Check: Program slug matches HTML filename exactly
- Check: User's `purchasedPrograms` array in database
- Check: JWT token is valid and not expired

**Issue**: Page shows content before access check
- Ensure: Scripts are loaded in correct order
- Ensure: `program-access.js` runs on page load

**Issue**: Redirect loop
- Check: API endpoint is responding correctly
- Check: Token is being sent in Authorization header
- Clear browser cache and localStorage