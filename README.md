# Algorea Bazaar

Algorea Bazaar is a multilingual marketplace for downloadable digital products, including ebooks, PDFs, templates, educational resources, apps, and software. It does not support physical-product shipping.

## Product principles

- French is the default language; Arabic uses RTL and Tajawal; English uses LTR.
- Seller registration, store creation, and product listings remain free.
- Platform commission is configurable; do not hard-code a fixed percentage.
- Buyer payment fees and seller payout/withdrawal fees must be disclosed separately and allocated only where provider terms and applicable law permit.
- Real payments remain disabled until provider terms, fees, sandbox behavior, and the user's explicit live-activation approval are confirmed.
- Digital product files remain private and are delivered through short-lived, authorized download links.

## Current application

The project uses React, TypeScript, TanStack Start, Vite, Tailwind CSS, Supabase, and Drizzle migrations. The current repository includes the multilingual homepage, authentication and account screens, marketplace data/security migrations, and payment/download server logic. Some marketplace storefront, seller, admin, and order-management screens remain on the roadmap.

## Project documentation

- `roadmap.md` — implementation milestones.
- `.lovable/plan.md` — project scope, audit findings, and implementation constraints.
- `docs/terms-of-use-ar.md` — approved concise Arabic Terms of Use draft; legal review and operator details are still required before publication.
- `docs/financial-fee-allocation-policy.md` — external payment, transfer, and withdrawal fee allocation.

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
