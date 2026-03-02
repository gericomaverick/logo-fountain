# Settings & Checkout Name Capture Smoke Test

## Preconditions
- App running locally.
- Stripe webhook forwarding enabled for `checkout.session.completed`.
- Test user can sign in.

## 1) Checkout captures first/last name
1. Go to `/pricing` and start checkout.
2. Confirm Stripe Checkout requires:
   - Email
   - First name (custom field)
   - Last name (custom field)
3. Complete payment with test card.

Expected:
- Redirect to success page.
- Webhook processes successfully.
- A `Profile` record for purchaser exists with `firstName`, `lastName`, and `fullName` populated.

## 2) Dashboard welcome
1. Sign in as purchaser.
2. Visit `/dashboard`.

Expected:
- See `Welcome, <FirstName>` above project list when first name is present.

## 3) Settings page read/update
1. Visit `/settings` while authenticated.
2. Confirm first/last values are prefilled from profile.
3. Change first and last name and click **Save changes**.
4. Refresh page.

Expected:
- Saved values persist.
- `GET /api/profile` returns updated values.
- `PUT /api/profile` updates `firstName`, `lastName`, and recomputed `fullName`.

## 4) Auth guard
1. Sign out.
2. Call `GET /api/profile`.

Expected:
- Returns `401 UNAUTHORIZED`.
