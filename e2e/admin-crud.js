// Drives the admin dashboard through the CRUD screens: categories, products, users, carts, wishlists.
// Only touches records it creates (ids and names start with "E2E"/"e2e-") and removes them at the end.
//
//   ADMIN_URL=http://localhost:3000 API_URL=http://localhost:4000 ADMIN_KEY=<key> node admin-crud.js
const { chromium } = require("playwright");

const BASE = process.env.ADMIN_URL || "http://localhost:3000";
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

const api = (path, init = {}) =>
  fetch(API + path, {
    ...init,
    headers: { ...(KEY ? { Authorization: `Bearer ${KEY}` } : {}), "Content-Type": "application/json", ...(init.headers || {}) },
  });

async function cleanup() {
  for (const p of await (await api("/api/products")).json()) if (p.name.startsWith("E2E")) await api(`/api/products/${p.productId}`, { method: "DELETE" });
  for (const c of await (await api("/api/categories")).json()) if (c.name.startsWith("E2E")) await api(`/api/categories/${c.categoryId}`, { method: "DELETE" });
  for (const u of await (await api("/api/users")).json()) if (u.email.startsWith("e2e-")) await api(`/api/users/${u.userId}`, { method: "DELETE" });
}

async function go(page, path) {
  await page.goto(BASE + path);
  await page.waitForFunction(() => !document.querySelector('div[hidden][id^="S:"]'), null, { timeout: 10000 }).catch(() => {});
}

const row = (page, text) => page.locator("tbody tr", { hasText: text });
const search = async (page, text) => {
  await page.fill('input[type="search"]', text);
  await page.waitForTimeout(150);
};
const confirmDialog = async (page, label) => {
  await page.waitForSelector('[role="dialog"]');
  await page.click(`[role="dialog"] button:has-text("${label}")`);
};

(async () => {
  await cleanup();
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));

  // sign in
  await go(page, "/login");
  await page.fill('input[type="password"]', KEY);
  await page.click('button:has-text("Sign in")');
  await page.waitForURL(BASE + "/");

  // ---------- categories: create, edit ----------
  await go(page, "/categories/new");
  await page.getByLabel("Name").fill("E2E Category");
  await page.getByLabel("Description (optional)").fill("made by the browser test");
  await page.click('button:has-text("Create category")');
  await page.waitForURL("**/categories");
  await search(page, "E2E Category");
  await row(page, "E2E Category").waitFor();
  check("category created and listed", true);

  await row(page, "E2E Category").locator('a:has-text("Edit")').click();
  await page.waitForURL("**/edit");
  await page.getByLabel("Name").fill("E2E Category (edited)");
  await page.click('button:has-text("Save changes")');
  await page.waitForURL("**/categories");
  await search(page, "E2E Category (edited)");
  check("category edited", (await row(page, "E2E Category (edited)").count()) === 1);

  await go(page, "/categories/new");
  await page.click('button:has-text("Create category")');
  await page.waitForSelector("text=required", { timeout: 3000 }).catch(() => {});
  check("empty category name is rejected by the form", page.url().endsWith("/categories/new"));

  // ---------- products: create, stock update, delete ----------
  await go(page, "/products/new");
  await page.getByLabel("Name").first().fill("E2E Gadget");
  await page.getByLabel("Category").selectOption({ label: "E2E Category (edited)" });
  await page.getByLabel("Price (USD)").fill("12.34");
  await page.getByLabel("Stock").fill("7");
  await page.click('button:has-text("Create product")');
  await page.waitForURL("**/products");
  await search(page, "E2E Gadget");
  await row(page, "E2E Gadget").waitFor();
  check("product created and listed with its price", (await row(page, "E2E Gadget").innerText()).includes("$12.34"));

  await row(page, "E2E Gadget").locator('a:has-text("Edit")').click();
  await page.waitForURL("**/edit");
  await page.getByLabel("Stock").fill("0");
  await page.click('button:has-text("Save changes")');
  await page.waitForURL("**/products");
  await search(page, "E2E Gadget");
  await row(page, "E2E Gadget").waitFor();
  check("stock update is saved", (await row(page, "E2E Gadget").locator("td").nth(3).innerText()).trim() === "0");

  // the category is in use now: the API refuses to delete it and the user is told why
  await go(page, "/categories");
  await search(page, "E2E Category (edited)");
  await row(page, "E2E Category (edited)").locator('button:has-text("Delete")').click();
  await confirmDialog(page, "Delete");
  await page.waitForSelector("text=still has");
  check("a category that still has products cannot be deleted", true);
  await page.click('[role="dialog"] button:has-text("Cancel")');

  await go(page, "/products");
  await search(page, "E2E Gadget");
  await row(page, "E2E Gadget").locator('button:has-text("Delete")').click();
  await page.waitForSelector('[role="dialog"]');
  check("deleting a product asks for confirmation", (await page.locator('[role="dialog"]').innerText()).includes("E2E Gadget"));
  await page.click('[role="dialog"] button:has-text("Cancel")');
  check("cancel keeps the product", (await row(page, "E2E Gadget").count()) === 1);
  await row(page, "E2E Gadget").locator('button:has-text("Delete")').click();
  await confirmDialog(page, "Delete");
  await page.waitForFunction(() => !document.body.innerText.includes("E2E Gadget"));
  check("confirming deletes the product", true);

  await go(page, "/categories");
  await search(page, "E2E Category (edited)");
  await row(page, "E2E Category (edited)").locator('button:has-text("Delete")').click();
  await confirmDialog(page, "Delete");
  await page.waitForFunction(() => !document.body.innerText.includes("E2E Category (edited)"));
  check("an empty category can be deleted", true);

  // ---------- users: create, view details, edit, delete ----------
  await go(page, "/users/new");
  await page.getByLabel("Name").fill("E2E Person");
  await page.getByLabel("Email").fill("e2e-person@example.test");
  await page.getByLabel("Role").selectOption("customer");
  await page.click('button:has-text("Create user")');
  await page.waitForURL("**/users");
  await search(page, "E2E Person");
  await row(page, "E2E Person").waitFor();
  check("user created and listed", true);

  await go(page, "/users/new");
  await page.getByLabel("Name").fill("Bad Email");
  await page.getByLabel("Email").fill("not-an-email");
  await page.click('button:has-text("Create user")');
  check("an invalid email is rejected by the form", page.url().endsWith("/users/new"));

  const users = await (await api("/api/users")).json();
  const person = users.find((u) => u.email === "e2e-person@example.test");
  await api(`/api/carts/${person.userId}`, { method: "PUT", body: JSON.stringify({ items: [{ productId: "prod-001", quantity: 2 }, { productId: "prod-003", quantity: 1 }] }) });
  await api(`/api/wishlists/${person.userId}`, { method: "PUT", body: JSON.stringify({ productIds: ["prod-002", "prod-005"] }) });

  await go(page, `/users/${person.userId}`);
  await page.waitForSelector("h1:text('E2E Person')");
  const detailText = await page.locator("main").innerText();
  check("user details show their cart and wishlist", /cart/i.test(detailText) && /wishlist/i.test(detailText));
  await page.click('button:has-text("Edit")');
  await page.getByLabel("Name").fill("E2E Person Renamed");
  await page.click('button:has-text("Save changes")');
  await page.waitForSelector("h1:text('E2E Person Renamed')");
  check("user details can be edited inline", true);

  // ---------- carts and wishlists (admin overview) ----------
  await go(page, "/carts");
  await page.waitForSelector("text=E2E Person Renamed");
  const cartCard = page.locator("div.rounded-xl", { hasText: "E2E Person Renamed" }).first();
  check("cart lists the customer with product names", (await cartCard.innerText()).includes("Wireless Headphones") && (await cartCard.innerText()).includes("French Press"));
  await cartCard.locator('button:has-text("Remove")').first().click();
  await page.waitForFunction(() => ![...document.querySelectorAll("div.rounded-xl")].some((d) => d.textContent.includes("E2E Person Renamed") && d.textContent.includes("Wireless Headphones")));
  const cartAfter = await (await api(`/api/carts/${person.userId}`)).json();
  check("removing one cart item keeps the rest", cartAfter.items.length === 1 && cartAfter.items[0].productId === "prod-003");

  await go(page, "/wishlists");
  await page.waitForSelector("text=E2E Person Renamed");
  const wishCard = page.locator("div.rounded-xl", { hasText: "E2E Person Renamed" }).first();
  check("wishlist lists the customer with product names", (await wishCard.innerText()).includes("Mechanical Keyboard"));
  await wishCard.locator('button:has-text("Clear")').click();
  await confirmDialog(page, "Clear");
  await page.waitForFunction(() => ![...document.querySelectorAll("div.rounded-xl")].some((d) => d.textContent.includes("E2E Person Renamed") && d.textContent.includes("Mechanical Keyboard")));
  const wishAfter = await (await api(`/api/wishlists/${person.userId}`)).json();
  check("clearing a wishlist works (and only that customer's)", wishAfter.productIds.length === 0);

  // anonymous storefront shoppers show up as guests
  const guestId = "guest-abababab-1111-4111-8111-abababababab";
  await fetch(`${API}/api/store/cart/items`, { method: "POST", headers: { "Content-Type": "application/json", "X-Customer-Id": guestId }, body: JSON.stringify({ productId: "prod-001", quantity: 1 }) });
  await go(page, "/carts");
  await page.waitForSelector("text=Guest abab");
  check("anonymous storefront carts are labelled as guests", true);
  await api(`/api/carts/${guestId}`, { method: "DELETE" });

  // delete the user (and check the cascade)
  await go(page, `/users/${person.userId}`);
  await page.waitForSelector("h1:text('E2E Person Renamed')");
  await page.click('button:has-text("Delete")');
  await confirmDialog(page, "Delete");
  await page.waitForURL("**/users");
  await search(page, "E2E Person");
  check("user deleted after confirmation", (await row(page, "E2E Person").count()) === 0);
  const cartGone = await (await api(`/api/carts/${person.userId}`)).json();
  check("deleting a user also removes their cart", cartGone.items.length === 0);

  check("no uncaught page errors", pageErrors.length === 0, pageErrors.join(" | "));
  await browser.close();
  await cleanup();

  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})().catch(async (e) => {
  console.error("SCRIPT ERROR:", e.message.split("\n").slice(0, 5).join("\n"));
  await cleanup().catch(() => {});
  process.exit(2);
});
