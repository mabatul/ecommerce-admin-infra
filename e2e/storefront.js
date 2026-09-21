// Drives the customer storefront in a real browser against the local backend + LocalStack.
const { chromium } = require("playwright");

const SHOP = process.env.SHOP_URL || "http://localhost:3001";
const API = process.env.API_URL || "http://localhost:4000";
const KEY = process.env.ADMIN_KEY || "";
if (!KEY) {
  console.error("Set ADMIN_KEY to the backend's ADMIN_API_KEY.");
  process.exit(2);
}
const results = [];
const check = (name, ok, extra = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};
const admin = (path, init = {}) =>
  fetch(API + path, { ...init, headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", ...(init.headers || {}) } });

// Wait out Next's streaming swap (hidden template copies of the content) before querying the DOM.
async function go(p, url) {
  await p.goto(url);
  await p.waitForFunction(() => !document.querySelector('div[hidden][id^="S:"]'), null, { timeout: 10000 }).catch(() => {});
}

const cartBadge = (page) => page.locator('a[aria-label^="Cart,"]').getAttribute("aria-label");
const wishBadge = (page) => page.locator('a[aria-label^="Wishlist,"]').getAttribute("aria-label");
const card = (page, name) => page.locator("article", { has: page.locator(`a:text-is("${name}")`) });

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));

  // ---------- home ----------
  await go(page, SHOP + "/");
  await page.waitForSelector("text=Featured products");
  check("home shows branding and hero", (await page.locator("h1").innerText()).includes("Everything you need"));
  check("home lists featured products", (await page.locator("section:has(h2:text('Featured products')) article").count()) >= 4);
  check("home lists categories", (await page.locator("section:has(h2:text('Shop by category')) li").count()) >= 5);
  check("category nav in the header", (await page.locator('nav[aria-label="Categories"] a').count()) >= 6);

  // ---------- search + filters ----------
  await page.fill('header input[type="search"]', "clean");
  await page.press('header input[type="search"]', "Enter");
  await page.waitForURL("**/products?q=clean");
  await page.waitForSelector("article");
  check("header search finds the matching product only", (await page.locator("article").count()) === 1 && (await page.locator("article").innerText()).includes("Clean Code"));

  await go(page, SHOP + "/products?q=zzzzzz");
  await page.waitForSelector("text=No products found");
  check("no results shows an empty state with a way out", (await page.locator("text=Clear filters").count()) === 1);
  await page.click("text=Clear filters");
  await page.waitForURL(SHOP + "/products");
  await page.waitForSelector("article");
  check("clearing filters restores the catalog", (await page.locator("article").count()) === 12);

  await page.selectOption('select', "cat-books");
  await page.waitForURL("**category=cat-books");
  await page.waitForFunction(() => document.querySelectorAll("article").length === 3);
  check("category filter narrows to that category", true);

  await go(page, SHOP + "/products");
  await page.check('input[type="checkbox"]');
  await page.waitForURL("**inStock=1");
  await page.waitForSelector("article");
  check("in-stock filter hides out-of-stock products", (await page.locator("article:has-text('Out of stock')").count()) === 0);

  await go(page, SHOP + "/products");
  await page.fill('input[placeholder="0"]', "20");
  await page.fill('input[placeholder="Any"]', "30");
  await page.click('button:has-text("Apply")');
  await page.waitForURL("**min=20&max=30");
  await page.waitForSelector("article");
  const prices = await page.locator("article span.text-base").allInnerTexts();
  check("price range keeps only products in range", prices.length > 0 && prices.every((p) => { const v = Number(p.replace("$", "")); return v >= 20 && v <= 30; }), prices.join(", "));

  await page.fill('input[placeholder="0"]', "50");
  await page.fill('input[placeholder="Any"]', "10");
  await page.click('button:has-text("Apply")');
  await page.waitForSelector("text=minimum price can't be above");
  check("inverted price range is rejected inline", true);

  // ---------- pagination ----------
  await go(page, SHOP + "/products");
  await page.waitForSelector("article");
  check("first page has 12 products", (await page.locator("article").count()) === 12);
  check("every card shows its category and a short description", (await page.locator("article span.uppercase").count()) === 12 && (await page.locator("article p.line-clamp-2").count()) === 12);
  await page.click('button:has-text("Load more")');
  await page.waitForFunction(() => document.querySelectorAll("article").length > 12);
  const total = await page.locator("article").count();
  const names = await page.locator("article a.line-clamp-2").allInnerTexts();
  check("'Load more' appends the rest without duplicates", total === 15 && new Set(names).size === 15, `${total} products`);
  check("load more disappears at the end", (await page.locator('button:has-text("Load more")').count()) === 0);

  // ---------- product detail ----------
  await go(page, SHOP + "/products");
  await page.click('a:text-is("Wireless Headphones")');
  await page.waitForURL("**/products/prod-001");
  await page.waitForSelector("h1:text('Wireless Headphones')");
  check("detail shows price and stock", (await page.locator("main").innerText()).includes("$59.99") && (await page.locator("main").innerText()).includes("In stock"));
  check("detail shows related products", (await page.locator("section:has(h2:text('Related products')) article").count()) >= 1);
  check("detail shows a breadcrumb to the category", (await page.locator('nav[aria-label="Breadcrumb"] a:text("Electronics")').count()) === 1);

  // ---------- cart: add / merge / stock ceiling ----------
  check("cart starts empty", (await cartBadge(page)) === "Cart, 0 items");
  await page.click('button:has-text("Add to cart")');
  await page.waitForFunction(() => document.querySelector('a[aria-label^="Cart,"]')?.getAttribute("aria-label") === "Cart, 1 items");
  check("adding updates the header count", true);
  check("detail notes what is already in the cart", (await page.locator("text=1 in your cart").count()) === 1);
  await page.click('button[aria-label="Increase quantity"]');
  await page.click('button:has-text("Add to cart")');
  await page.waitForFunction(() => document.querySelector('a[aria-label^="Cart,"]')?.getAttribute("aria-label") === "Cart, 3 items");
  check("adding the same product again merges the quantity", true);

  await go(page, SHOP + "/products/prod-010"); // stock 3
  await page.waitForSelector("h1");
  check("low stock is called out", (await page.locator("main").innerText()).includes("Only 3 left"));
  for (let i = 0; i < 5; i++) await page.click('button[aria-label="Increase quantity"]', { force: true }).catch(() => {});
  check("quantity picker stops at the stock limit", (await page.locator('[role="group"] span').innerText()) === "3");
  await page.click('button:has-text("Add to cart")');
  await page.waitForFunction(() => document.querySelector('a[aria-label^="Cart,"]')?.getAttribute("aria-label") === "Cart, 6 items");
  await page.waitForSelector("button:has-text('All available in cart')");
  check("once all stock is in the cart, adding is disabled", await page.locator("button:has-text('All available in cart')").isDisabled());

  await go(page, SHOP + "/products/prod-007"); // stock 0
  await page.waitForSelector("h1");
  check("out-of-stock product cannot be added", await page.locator("button:text-is('Out of stock')").isDisabled());

  // card add merges too
  await go(page, SHOP + "/products?q=french");
  await page.waitForSelector("article");
  await card(page, "French Press").locator("button:has-text('Add to cart')").click();
  await page.waitForFunction(() => document.querySelector('a[aria-label^="Cart,"]')?.getAttribute("aria-label") === "Cart, 7 items");
  await card(page, "French Press").locator("button:has-text('Add to cart')").click();
  await page.waitForFunction(() => document.querySelector('a[aria-label^="Cart,"]')?.getAttribute("aria-label") === "Cart, 8 items");
  check("adding from a product card works and merges", true);

  // ---------- cart page ----------
  await page.click('a[aria-label^="Cart,"]');
  await page.waitForURL("**/cart");
  await page.waitForSelector("text=Subtotal");
  check("cart has one line per product (no duplicates)", (await page.locator("main ul > li").count()) === 3);
  const subtotal = await page.locator("dd:right-of(dt:text-is('Subtotal'))").first().innerText();
  // 3 x 59.99 + 3 x 54.00 + 2 x 24.50
  check("subtotal is computed from server prices", subtotal === "$390.97", subtotal);
  check("item count matches", (await page.locator("aside dl > div:has(dt:text-is('Items')) dd").innerText()) === "8");

  await page.locator("li", { hasText: "Designing Data-Intensive" }).locator('button[aria-label^="Increase"]').waitFor();
  check("stock-limited line cannot go above stock", await page.locator("li", { hasText: "Designing Data-Intensive" }).locator('button[aria-label^="Increase"]').isDisabled());
  await page.locator("li", { hasText: "French Press" }).locator('button[aria-label^="Decrease"]').click();
  await page.waitForFunction(() => document.body.innerText.includes("$366.47"));
  check("changing a quantity updates the subtotal", true);

  await page.locator("li", { hasText: "French Press" }).locator('button:has-text("Remove")').click();
  await page.waitForSelector('[role="dialog"]');
  await page.click('[role="dialog"] button:has-text("Cancel")');
  check("removing asks for confirmation; cancel keeps the item", (await page.locator("li", { hasText: "French Press" }).count()) === 1);
  await page.locator("li", { hasText: "French Press" }).locator('button:has-text("Remove")').click();
  await page.click('[role="dialog"] button:has-text("Remove")');
  await page.waitForFunction(() => !document.body.innerText.includes("French Press"));
  check("confirming removes the line", (await page.locator("main ul > li").count()) === 2);

  await page.reload();
  await page.waitForSelector("text=Subtotal");
  check("the cart survives a reload (same anonymous customer)", (await page.locator("main ul > li").count()) === 2);

  // ---------- wishlist ----------
  await go(page, SHOP + "/products?q=yoga");
  await page.waitForSelector("article");
  const heart = card(page, "Yoga Mat").locator('button[aria-pressed]');
  check("heart starts unpressed", (await heart.getAttribute("aria-pressed")) === "false");
  await heart.click();
  await page.waitForFunction(() => document.querySelector('a[aria-label^="Wishlist,"]')?.getAttribute("aria-label") === "Wishlist, 1 items");
  check("saving updates the header and presses the heart", (await heart.getAttribute("aria-pressed")) === "true");
  await heart.click();
  await page.waitForFunction(() => document.querySelector('a[aria-label^="Wishlist,"]')?.getAttribute("aria-label") === "Wishlist, 0 items");
  await heart.click();
  await page.waitForFunction(() => document.querySelector('a[aria-label^="Wishlist,"]')?.getAttribute("aria-label") === "Wishlist, 1 items");
  check("toggling never duplicates a wishlist item", (await wishBadge(page)) === "Wishlist, 1 items");

  await go(page, SHOP + "/products/prod-007");
  await page.click('button:has-text("Save to wishlist")');
  await page.waitForFunction(() => document.querySelector('a[aria-label^="Wishlist,"]')?.getAttribute("aria-label") === "Wishlist, 2 items");
  await page.click('a[aria-label^="Wishlist,"]');
  await page.waitForURL("**/wishlist");
  await page.waitForSelector("text=Yoga Mat");
  check("wishlist lists what was saved", (await page.locator("main ul > li").count()) === 2);
  check("out-of-stock wishlist item can't be added to the cart", await page.locator("li", { hasText: "USB-C Hub" }).locator("button:text-is('Out of stock')").isDisabled());
  await page.locator("li", { hasText: "Yoga Mat" }).locator("button:has-text('Add to cart')").click();
  await page.waitForFunction(() => document.querySelector('a[aria-label^="Cart,"]')?.getAttribute("aria-label") === "Cart, 7 items");
  check("wishlist item can be added to the cart", true);
  await page.locator("li", { hasText: "USB-C Hub" }).locator('button:has-text("Remove")').click();
  await page.click('[role="dialog"] button:has-text("Remove")');
  await page.waitForFunction(() => !document.body.innerText.includes("USB-C Hub"));
  check("wishlist removal is confirmed and works", (await page.locator("main ul > li").count()) === 1);

  // ---------- deleted / unavailable product ----------
  await admin("/api/products", { method: "POST", body: JSON.stringify({ productId: "e2e-temp", name: "E2E Temporary Item", price: 5, categoryId: "cat-books", stock: 4 }) });
  await go(page, SHOP + "/products/e2e-temp");
  await page.waitForSelector("h1:text('E2E Temporary Item')");
  await page.click('button:has-text("Add to cart")');
  await page.waitForFunction(() => document.querySelector('a[aria-label^="Cart,"]')?.getAttribute("aria-label") === "Cart, 8 items");
  await page.click('button:has-text("Save to wishlist")');
  await page.waitForFunction(() => document.querySelector('a[aria-label^="Wishlist,"]')?.getAttribute("aria-label") === "Wishlist, 2 items");
  await admin("/api/products/e2e-temp", { method: "DELETE" });
  await go(page, SHOP + "/cart");
  await page.waitForSelector("text=no longer available");
  check("a deleted product shows as unavailable in the cart", true);
  const sub2 = await page.locator("dd:right-of(dt:text-is('Subtotal'))").first().innerText();
  check("…and is left out of the subtotal", sub2 === "$368.97", sub2);
  check("…with a warning under the summary", (await page.locator("text=need attention").count()) === 1);
  await page.locator("li", { hasText: "Unavailable product" }).locator('button:has-text("Remove")').click();
  await page.click('[role="dialog"] button:has-text("Remove")');
  await page.waitForFunction(() => !document.body.innerText.includes("Unavailable product"));
  check("the unavailable line can be removed", true);
  await go(page, SHOP + "/wishlist");
  await page.waitForSelector("text=no longer available");
  check("a deleted product shows as unavailable in the wishlist", true);
  await page.click('button:has-text("Remove from wishlist")');
  await page.click('[role="dialog"] button:has-text("Remove")');
  await page.waitForFunction(() => !document.body.innerText.includes("no longer available"));

  // ---------- empty states ----------
  await go(page, SHOP + "/cart");
  await page.waitForSelector("text=Subtotal");
  await page.click('button:has-text("Empty cart")');
  await page.click('[role="dialog"] button:has-text("Empty cart")');
  await page.waitForSelector("text=Your cart is empty");
  check("emptying the cart asks first, then shows the empty state", true);
  await go(page, SHOP + "/wishlist");
  await page.locator("li button:has-text('Remove')").first().click();
  await page.click('[role="dialog"] button:has-text("Remove")');
  await page.waitForSelector("text=Your wishlist is empty");
  check("empty wishlist state", true);

  // ---------- error state + recovery ----------
  await page.route("**/api/store/cart", (route) => route.abort());
  await page.route("**/api/store/wishlist", (route) => route.abort());
  await go(page, SHOP + "/cart");
  await page.waitForSelector('[role="alert"]');
  check("cart shows an error state when the API is unreachable", (await page.locator("button:text-is('Try again')").count()) === 1);
  await page.unroute("**/api/store/cart");
  await page.unroute("**/api/store/wishlist");
  await page.click('button:has-text("Try again")');
  await page.waitForSelector("text=Your cart is empty");
  check("…and recovers on retry", true);

  // ---------- not found + category page ----------
  await go(page, SHOP + "/products/does-not-exist");
  await page.waitForSelector("text=We couldn't find that");
  check("unknown product shows a not-found page", true);
  await go(page, SHOP + "/categories/does-not-exist");
  await page.waitForSelector("text=We couldn't find that");
  check("unknown category shows a not-found page", true);
  await go(page, SHOP + "/categories/cat-books");
  await page.waitForSelector("h1:text('Books')");
  await page.waitForSelector("article");
  check("category page lists only that category", (await page.locator("article").count()) === 3);
  check("category page has no category selector", (await page.locator("select").count()) === 0);
  await go(page, SHOP + "/categories");
  await page.waitForSelector("text=Shop now");
  check("categories index lists every category", (await page.locator("main ul li").count()) >= 5);

  // ---------- new visitor = new empty cart ----------
  const ctx2 = await browser.newContext();
  const page2 = await ctx2.newPage();
  await go(page2, SHOP + "/cart");
  await page2.waitForSelector("text=Your cart is empty");
  check("a different browser starts with its own empty cart", true);
  await ctx2.close();

  // ---------- mobile ----------
  const mobile = await browser.newContext({ viewport: { width: 390, height: 800 }, isMobile: true });
  const m = await mobile.newPage();
  for (const path of ["/", "/products", "/products/prod-001", "/cart", "/wishlist", "/categories"]) {
    await go(m, SHOP + path);
    await m.waitForLoadState("networkidle");
    const overflow = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(`mobile ${path}: no horizontal overflow`, overflow <= 0, overflow > 0 ? `${overflow}px too wide` : "");
  }
  await mobile.close();

  check("no uncaught page errors", pageErrors.length === 0, pageErrors.join(" | "));
  await browser.close();

  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error("SCRIPT ERROR:", e.message.split("\n").slice(0, 5).join("\n"));
  process.exit(2);
});
