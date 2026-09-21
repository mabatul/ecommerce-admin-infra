# DynamoDB data model

How the application's data is stored, and which questions the tables are
designed to answer. Everything here is created by
[`infrastructure/cloudformation/main.yaml`](../infrastructure/cloudformation/main.yaml)
(or, on Railway's DynamoDB Local, by
[`scripts/railway-dynamodb-init.sh`](../scripts/railway-dynamodb-init.sh) —
same keys and indexes). The code that reads and writes it lives in
`ecommerce-admin-backend/lib/repositories/`.

## Design in one paragraph

**One table per entity**, each with a simple string partition key and no sort
key, billed on demand. The application's reads are almost all "fetch this
one item" (a product, a user's cart) plus a few list/filter screens over
catalogs that are small. That's what a key-value table does best, it keeps
the CloudFormation template, the IAM policy and the Railway init script
trivial, and it means a new attribute is just a new field on an item, not a
migration. A single-table design would add real complexity (overloaded keys,
harder debugging) for no benefit at this scale, so it was deliberately not
used.

Table names are `${ProjectName}-${Environment}-<Entity>` (for example
`ecommerce-admin-local-Products`) and are never hardcoded: the backend
computes them from environment variables.

## Tables

| Table | Partition key | Index | Notes |
|---|---|---|---|
| `Users` | `userId` (S) | — | Registered people (admins and customers) |
| `Categories` | `categoryId` (S) | — | Tiny, read whole |
| `Products` | `productId` (S) | `ByCategory` (`categoryId`, projection ALL) | The catalog |
| `Carts` | `userId` (S) | — | One item per customer; lines are embedded |
| `Wishlists` | `userId` (S) | — | One item per customer; product ids embedded |

### Attributes

**Users** — `userId`, `name`, `email`, `role` (`admin` \| `customer`), `createdAt`.

**Categories** — `categoryId`, `name`, `description?`.

**Products** — `productId`, `name`, `description?`, `price` (number, 2
decimals), `categoryId`, `stock` (integer ≥ 0), `imageUrl?` (http/https),
`featured?` (boolean), `createdAt`, `updatedAt?`.
`imageUrl`, `featured` and `updatedAt` were added for the storefront; they are
optional, so older items remain valid without a migration.

**Carts** — `userId`, `items` (list of `{ productId, quantity }`, one entry
per product, at most 50, quantity 1–99), `updatedAt`, `version`.

**Wishlists** — `userId`, `productIds` (list, no duplicates, at most 200),
`updatedAt`, `version`.

`version` is a counter used for optimistic concurrency (see below). Carts
and wishlists written before it existed simply have none.

### Relationships

```
Categories 1 ──── * Products          Products.categoryId  -> Categories.categoryId
Users      1 ──── 1 Carts             Carts.userId         -> Users.userId (or a guest id)
Users      1 ──── 1 Wishlists         Wishlists.userId     -> Users.userId (or a guest id)
Carts      * ──── * Products          Carts.items[].productId, Wishlists.productIds[]
```

DynamoDB has no foreign keys, so integrity is kept by the backend's services:

- Creating or editing a product requires its category to exist; deleting a
  category that still has products is refused (`409`).
- Deleting a user also deletes their cart and wishlist.
- Deleting a **product** does not touch carts or wishlists (that would mean
  scanning them all). Instead they are resolved when read, and a line whose
  product is gone comes back flagged `unavailable` and is left out of totals.
- **Anonymous shoppers** are `guest-<uuid>` ids with no `Users` record; their
  cart and wishlist use that id as `userId`. The admin dashboard shows them as
  "Guest xxxxxx".

## Access patterns

| Who | Question | How it's answered |
|---|---|---|
| Storefront | Browse / search / filter the catalog, paged | `Scan` in key order (or `Query` on `ByCategory` when a category is chosen), filtered in the service, cursor-paginated — see below |
| Storefront | One product + related products | `GetItem`, then `Query ByCategory` with limit 5 |
| Storefront | List categories | `Scan` (tiny table) |
| Storefront | Get / change my cart or wishlist | `GetItem` by `userId`, then a conditional `PutItem` |
| Admin | List everything for a table | `Scan`, following `LastEvaluatedKey` until exhausted |
| Admin | CRUD one item | `GetItem` / `PutItem` / `DeleteItem` by key |
| Admin | How many products use a category? | `Query ByCategory` with `Select: COUNT` (blocks deleting a category in use) |
| Admin | Dashboard totals | Five table scans in one request (`GET /api/stats`) |

A plain `Scan` returns at most 1 MB per call, so the repositories always
follow `LastEvaluatedKey`. An earlier version didn't, which would have
silently truncated any list past 1 MB.

## Pagination

The catalog endpoint uses **cursor pagination**, not page numbers:

- The response is `{ items, nextCursor, hasMore }`.
- The cursor is the last `productId` returned (base64url of `{"id": "..."}`).
  The backend rebuilds DynamoDB's `ExclusiveStartKey` from it — `{productId}`
  for a scan, `{productId, categoryId}` for the category index — so the next
  request resumes right after that item.
- To know whether there's another page, the service collects `limit + 1`
  matches and only returns `limit`; the extra one proves `hasMore`.
- Cursors come from the client, so they are validated (malformed → `400`)
  and only ever used as a starting key, never as query text.
- When filters may discard most rows, each DynamoDB call reads 100 items, and
  a single request stops after 30 calls: it then returns what it found plus a
  cursor to continue, rather than scanning forever.

## Search and filtering

DynamoDB has no full-text search. The decision, and its consequences:

- **Category** filter → `Query` on the `ByCategory` index. This is the one
  filter that genuinely narrows what DynamoDB reads.
- **Text search, price range, in-stock, featured** → applied in the service
  while paging. (A DynamoDB `FilterExpression` would not read less either —
  you're billed for the items scanned, not returned — so doing it in code is
  equivalent, simpler, and makes search case-insensitive across name and
  description.)
- Results come back in **key order**, not sorted by price or date. Sorting
  would need an index with a sort key (for example a constant partition plus
  `price` or `createdAt`); it hasn't been needed yet.
- A very selective search reads more items than it returns. At a catalog of
  hundreds of products this is negligible; if it ever reached tens of
  thousands, that is the point to add an index or a search service —
  OpenSearch was deliberately not introduced for this scope.

## Concurrency and consistency

- **Carts and wishlists** are read-modify-write. Each write is a conditional
  `PutItem` that only succeeds if `version` is still what was read (or the
  item doesn't exist yet), and the service retries up to 4 times. Two tabs
  adding items at once therefore both land, instead of one overwriting the
  other. A 4-way parallel test against LocalStack confirms nothing is lost.
- **Stock** is a ceiling checked when adding to a cart, not a reservation:
  there are no orders/checkout in this project, so nothing decrements it.
  The cart re-reads the product on every view, so a line that no longer fits
  is flagged `insufficient_stock` rather than trusted.
- **Prices** are never taken from the client; the cart is priced from the
  `Products` table each time it's read.

## Limits worth knowing

- DynamoDB items are capped at 400 KB. Carts (50 lines) and wishlists (200
  ids) are bounded well below that on purpose.
- Table scans are fine for these table sizes and costly beyond them; the
  access patterns above are the list of what to index first if that changes.
- LocalStack and DynamoDB Local don't enforce the IAM policy; see
  [`LOCALSTACK.md`](LOCALSTACK.md).
