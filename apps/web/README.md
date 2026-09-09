This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Stripe checkout entry point

### `GET /checkout/start?package_code=...`

Creates a Stripe Checkout Session for a selected package and redirects to Stripe.

- Allowed package codes: `essential` | `professional` | `complete`
- The server resolves `package_code` to a Stripe price ID via a server-side allowlist.
- Raw price IDs from clients are not accepted.
- Success URL: `/checkout/success?session_id={CHECKOUT_SESSION_ID}`
- Cancel URL: configured marketing-site origin + `/#packages`

### Smoke test (local)

1. Ensure `STRIPE_SECRET_KEY` is set in `.env.local`.
2. Start app:

```bash
npm run dev
```

3. Open a package checkout URL:

```text
http://localhost:3000/checkout/start?package_code=professional
```

4. Confirm the route redirects to Stripe Checkout.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
