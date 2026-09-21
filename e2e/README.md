# Browser tests (end to end)

Playwright scripts that drive the **running** apps in a real browser and check
what a person would see. They complement the unit tests in each repo (which cover
the business rules) and `ecommerce-admin-backend/scripts/test-cors.sh` (which
covers the API contract).

| Script | What it covers |
|---|---|
| `admin-login.js` | Admin sign-in gate: redirect to `/login`, wrong/right key, sign-out, a key rejected mid-session, product form validation and product creation with an image |
| `admin-crud.js` | Categories, products (incl. stock update), users (details, inline edit), carts and wishlists: create / edit / delete with confirmations, the "category in use" refusal, guest carts, cascade on user delete |
| `storefront.js` | Home, search, filters and pagination, product pages, cart rules (merge, stock ceiling, subtotal), wishlist, deleted/unavailable products, empty/error/not-found states, mobile overflow |

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

Not part of CI: they need the whole stack and a browser download.
