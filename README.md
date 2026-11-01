# Algorea Bazaar

Algorea Bazaar is a multilingual marketplace for downloadable digital products, including ebooks, PDFs, templates, educational resources, bundles, apps, and software. It does not support physical-product shipping.

## Product principles

- French is the default language; Arabic uses RTL and Tajawal; English uses LTR.
- Seller registration, store creation, and product listings remain free. A verified email is required before opening a store; storage is limited to 1 GiB per store and 50 MiB per file.
- Platform commission starts at 5% and is configurable by an authorized administrator; every order item snapshots the rate.
- Buyer payment fees and seller payout/withdrawal fees must be disclosed separately and allocated only where provider terms and applicable law permit.
- Real payments remain disabled until provider terms, fees, sandbox behavior, and the user's explicit live-activation approval are confirmed.
- Digital product files remain private and are delivered through short-lived, authorized download links.
- Multiple files are supported per product, with a 50 MiB maximum per file and 1 GiB total per store.
- Sellers can upload public product preview images (JPG, PNG, WebP, GIF, AVIF) up to 10 MiB; digital downloads remain private.

## Marketplace interfaces

- `/catalog` — public searchable product catalogue.
- `/products/:id` — digital product detail.
- `/stores/:slug` — public seller storefront.
- `/seller` — authenticated seller area for store settings, product management, file uploads, and seller order/earnings views.
- `/admin` — admin-role-only dashboard for commission configuration (5% default), store/product moderation, and order monitoring.
- `/orders` — authenticated buyer order history and secure downloads.
- `/terms` — Arabic, French and English Terms of Use draft.

Prices currently display in TND. Konnect remains the only implemented collection provider; selection is controlled by the server-side `PAYMENT_COLLECTION_PROVIDER` setting (unset preserves Konnect, `disabled` blocks new checkout, unknown values fail closed). Checkout remains unavailable unless the existing explicit provider activation gates are satisfied. International providers, multi-currency collection, and provider-neutral payment storage are not yet implemented. The settlement account is intentionally not hard-coded; changing it later must not change marketplace ledger or commission logic.

## Technical stack

React, TypeScript, TanStack Start, Vite, Tailwind CSS, Supabase Auth/Postgres/Storage, and Drizzle SQL migrations.

## Project documentation

- `roadmap.md` — implementation milestones.
- `.lovable/plan.md` — project scope, audit findings, and implementation constraints.
- `docs/terms-of-use-ar.md` — approved concise Arabic Terms of Use draft; legal review and operator details are still required before publication.
- `docs/financial-fee-allocation-policy.md` — external payment, transfer, and withdrawal fee allocation.
- `docs/payment-and-settlement-configuration.md` — provider selection, settlement-account flexibility, and safe future expansion.
- `docs/konnect-seller-onboarding.md` — one Konnect referral route for all sellers; provider-controlled eligibility and payout safeguards.

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
