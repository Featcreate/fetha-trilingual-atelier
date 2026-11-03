# Algorea Bazaar

Algorea Bazaar is a multilingual, worldwide marketplace for downloadable digital products, including ebooks, PDFs, templates, educational resources, bundles, apps, and software. It does not support physical-product shipping.

## Product and marketplace principles

- Buyers may purchase from any country, subject to the selected payment provider's supported countries, currencies, card rules, sanctions controls, and applicable law.
- Phase 1 seller onboarding is for sellers in Tunisia. Buyer reach is global; seller payout coverage is not represented as global.
- French is the default language; Arabic uses RTL and Tajawal; English uses LTR.
- Seller registration, store creation, and product listings remain free. A verified email is required before opening a store; storage is limited to 1 GiB per store and 50 MiB per file.
- Platform commission starts at 5% and is configurable by an authorized administrator; every order item snapshots the rate.
- Real payments remain disabled until provider terms, supported buyer countries/currencies, fees, sandbox behavior, and the user's explicit live-activation approval are confirmed.
- Digital product files remain private and are delivered through short-lived, authorized download links.
- Multiple files are supported per product, with a 50 MiB maximum per file and 1 GiB total per store.
- Sellers can upload public product preview images (JPG, PNG, WebP, GIF, AVIF) up to 10 MiB; digital downloads remain private.

## Central financial operating model

All buyer collections are made for the benefit of Algorea Bazaar into the platform's own merchant/settlement account. The payment provider is a collection and settlement rail only; it must not split, hold on behalf of, or distribute seller proceeds.

The platform's own financial system is the sole source of truth for:
- recording buyer charges and the provider's actual settlement;
- recording the buyer currency, settlement currency, FX rate/source/time, and immutable order snapshot where currency conversion applies;
- calculating the configurable platform commission (5% default);
- calculating and tracking each seller's payable balance;
- preparing and recording seller payouts.

During Phase 1, seller accounting and seller payouts are denominated in TND. The default payout method is a weekly manual transfer initiated by the platform operator from the platform's funds to the seller's own account. The platform records the transfer reference after it is completed. No provider API or payment intermediary initiates seller payouts.

The internal financial ledger is an accounting record of the platform's obligations and movements; it is not itself a bank account, stored-value wallet, or payment instrument. Actual funds remain in the platform's external merchant/bank settlement account until the platform transfers the seller's payable amount.

See [central financial accounting](docs/central-financial-accounting.md), [fee allocation policy](docs/financial-fee-allocation-policy.md), and [seller payout operations](docs/seller-payout-operations.md).

## Marketplace interfaces

- `/catalog` — public searchable product catalogue.
- `/products/:id` — digital product detail.
- `/stores/:slug` — public seller storefront.
- `/seller` — authenticated seller area for store settings, product management, file uploads, and seller order/earnings views.
- `/admin` — admin-role-only dashboard for commission configuration (5% default), store/product moderation, and order monitoring.
- `/orders` — authenticated buyer order history and secure downloads.
- `/terms` — Arabic, French and English Terms of Use draft.

Product accounting prices remain denominated in TND during Phase 1. Buyer-facing currency conversion/collection must use a verified, time-stamped FX snapshot and the selected provider's confirmed charge/settlement behavior; informational display rates must never be reused as a checkout or accounting rate. Checkout remains unavailable until the provider and currency flow are verified and explicitly approved.

## Technical stack

React, TypeScript, TanStack Start, Vite, Tailwind CSS, Supabase Auth/Postgres/Storage, and Drizzle SQL migrations.

## Project documentation

- `roadmap.md` — implementation milestones.
- `.lovable/plan.md` — project scope, audit findings, and implementation constraints.
- `docs/central-financial-accounting.md` — central collection, accounting, FX snapshots and platform-controlled seller payouts.
- `docs/terms-of-use-ar.md` — Arabic Terms of Use draft; legal review and operator details are still required before publication.
- `docs/financial-fee-allocation-policy.md` — external payment, transfer, and withdrawal fee allocation.
- `docs/seller-payout-operations.md` — platform-controlled weekly seller payout procedure.

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
