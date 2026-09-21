# Browser tests (end to end)

Playwright scripts that drive the **running** apps in a real browser and check
what a person would see. They complement the unit tests in each repo (which cover
the business rules) and `ecommerce-admin-backend/scripts/test-cors.sh` (which
covers the API contract).

| Script | What it covers |
|---|---|
| `admin-login.js` | Admin sign-in gate: redirect to `/login`, wrong/right key, sign-out, a key rejected mid-session, product form validation and product creation with an image |
| `admin-crud.js` | Categories, products (incl. stock update), users (details, inline edit), carts and wishlists: create / edit / delete with confirmations, the "category in use" refusal, guest carts, cascade on user delete |
| `storefront.js` | Home, search, filters and pagination, product pages, cart rules (merge, stock ceiling, subtotal), wishlist, deleted/unavailable products, empty/error/not-found states (missing products and categories answer HTTP 404), mobile overflow |

## Running them

Start the stack (see the infra README), then, from this folder:

```bash
npm install
npx playwright install chromium   # once

export ADMIN_KEY=<the backend's ADMIN_API_KEY>
export ADMIN_URL=http://localhost:3000   # admin dashboard
export SHOP_URL=http://localhost:3001    # storefront
export API_URL=http://localhost:4000     # backend

npm run all          # or: npm run admin:login | admin:crud | storefront
```

They need the sample data (`../scripts/seed-local.sh`) and a backend that has
`ADMIN_API_KEY` set to the same value as `ADMIN_KEY` (the wrong-key checks rely
on it being enforced).

They only touch records they create (names starting with `E2E`, ids starting
with `e2e-`, throwaway `guest-…` ids) and clean up after themselves, so they can
be re-run and are safe against a shared environment — but they do write real
rows, so think twice before pointing them at anything you don't want to
touch. Exit code is non-zero when any check fails.

## In CI

`.github/workflows/e2e.yml` builds and starts the whole stack on a GitHub runner (LocalStack,
backend, dashboard, storefront) and runs `npm run all`. It isn't part of the regular push CI
because it's slow (~10 min), so it runs when these tests change and **on demand** from the
Actions tab: *Run workflow* lets you point it at a branch of each app, which is how to check a
feature branch against the rest of the system before merging it:

```bash
gh workflow run e2e.yml -R mabatul/ecommerce-admin-infra   -f backend_ref=my-branch -f admin_ref=main -f storefront_ref=main
```
