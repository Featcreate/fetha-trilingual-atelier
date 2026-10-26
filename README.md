# Fetha Trilingual Atelier

Implement Step 1 only for the FethaCreate digital products store.



1. Brand identity



- Use these exact brand colors:

  - Dark petrol blue: "#0A2533"

  - Peach/coral: "#FF7555"

  - Warm cream: "#FBF9F5"

  - Light cream: "#F4EFE6"

  - Muted gold: "#C5A869"

- Configure reusable design tokens in Tailwind/CSS.

- Use Tajawal for Arabic and a clean, readable sans-serif font for French and English.

- Keep the design professional, modern, elegant, and responsive.



2. Original logo



- Use the supplied original FethaCreate logo without redesigning, recoloring, cropping, or distorting it.

- Preserve its aspect ratio using "object-contain".

- If the logo file is not available yet, create a clearly marked asset slot and tell me where to place the original file. Do not invent a replacement logo.



3. Languages and direction



Support Arabic ("ar"), French ("fr"), and English ("en").



- French is the default language on the first visit.

- Arabic uses "dir="rtl"" and Tajawal.

- French and English use "dir="ltr"".

- Add a visible language switcher.

- Remember the selected language using localStorage, with "fr" as the initial default.

- Provide a small static UI translation dictionary for all three languages.



4. Responsive frontend



Build a simple, polished homepage shell containing:



- A responsive sticky header with the original logo, navigation links, and language switcher.

- A mobile-friendly collapsible navigation menu.

- A clean hero section introducing FethaCreate.

- A simple static placeholder showcase for future digital products.

- A minimal footer.

- Responsive layouts for mobile, tablet, and desktop.



5. Strict scope limits



This is a frontend-only first step. Do NOT implement:



- Database tables or migrations.

- Authentication or user accounts.

- Lovable Cloud or backend provisioning.

- Storage buckets or file-upload functionality.

- Backend functions or APIs.

- Admin dashboard or product-management forms.

- Payment integration, checkout, or orders.



Use static placeholder content only for this preview. Do not pretend that products or backend features are functional.



6. Implementation and verification



- Make the smallest set of changes necessary to implement this scope.

- Preserve any existing project configuration and unrelated files.

- Verify language switching, text direction, logo proportions, and responsive navigation.

- Fix any obvious issues introduced by this step.

- At the end, summarize the files changed, tests performed, and any remaining issues.

- Clearly report whether Lovable Cloud or any backend infrastructure was enabled. Do not claim zero credit consumption unless it has been verified.



Stop after completing Step 1. Do not proceed to Step 2 or add features outside this scope.

Original Images and Visual References



- Use the original FethaCreate logo and supplied product images as provided. Do not redraw, distort, crop, or alter their content.

- Use the supplied product images only as a visual preview in the static homepage showcase.

- Do not invent product details, prices, or claims.

- Preserve image aspect ratios and use "object-contain" where appropriate.

- If a reference website screenshot is supplied, use it only as visual inspiration. Keep the approved FethaCreate brand colors and identity.

- Do not implement image uploads, storage, database functionality, or product management in this step.

- Keep the implementation limited to Step 1 and stop for review afterward.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/d7b2a794-779f-4eb1-aef2-eec65598eb2c).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
