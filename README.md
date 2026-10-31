# Algorea Bazaar

Algorea Bazaar is a multilingual marketplace for downloadable digital products, including ebooks, PDFs, templates, educational resources, bundles, apps, and software. It does not support physical-product shipping.

## Product principles

- French is the default language; Arabic uses RTL and Tajawal; English uses LTR.
- Seller registration, store creation, and product listings remain free. A verified email is required before opening a store; storage is limited to 1 GiB per store and 50 MiB per file.
- Platform commission starts at 5% and is configurable by an authorized administrator; every order item snapshots the rate.
- Buyer payment fees and seller payout/withdrawal fees must be disclosed separately and allocated only where provider terms and applicable law permit.
- Real payments remain disabled until provider terms, fees, sandbox behavior, and the user's explicit live-activation approval are confirmed.
- Digital product files remain private and are delivered through short-lived, authorized download links.
- Multiple files are supported per product, with a 50 MB maximum per file.

## Marketplace interfaces

- `/catalog` — public searchable product catalogue.
- `/products/:id` — digital product detail.
- `/stores/:slug` — public seller storefront.
- `/seller` — authenticated seller area for store settings, product management, file uploads, and seller order/earnings views.
- `/admin` — admin-role-only dashboard for commission configuration (5% default), store/product moderation, and order monitoring.
- `/orders` — authenticated buyer order history and secure downloads.
- `/terms` — Arabic Terms of Use draft.

Prices currently display in TND. Checkout is intentionally unavailable until the payment provider has been verified and explicitly approved. International currency and payout coverage are not yet implemented.

## Technical stack

React, TypeScript, TanStack Start, Vite, Tailwind CSS, Supabase Auth/Postgres/Storage, and Drizzle SQL migrations.

## Project documentation

- `roadmap.md` — implementation milestones.
- `.lovable/plan.md` — project scope, audit findings, and implementation constraints.
- `docs/terms-of-use-ar.md` — approved concise Arabic Terms of Use draft; legal review and operator details are still required before publication.
- `docs/financial-fee-allocation-policy.md` — external payment, transfer, and withdrawal fee allocation.
- `docs/ipay-tunisian-seller-onboarding.md` — required referral route and iPay seller payout prerequisites.

## Development

Requirements: Node.js and Bun (or a compatible package manager).

```sh
bun install
bun run dev
bun run test
bun run lint
bun run build
```

Do not enable live payments, publish the application, apply database migrations, or use paid services without explicit approval.


## Seller payouts

The supported seller payout route is weekly manual transfer. Administrators can prepare idempotent payout batches from verified sales and record a completed transfer using its external reference. The dashboard does not initiate transfers. See [seller payout operations](docs/seller-payout-operations.md) for the operating procedure and rollout safeguards.
