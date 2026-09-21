// Drives the admin dashboard in a real browser: sign-in gate, wrong/right key, CRUD with the new fields.
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

// Remove products this test creates, so it can be re-run and leaves the data as it found it.
async function cleanup() {
  const headers = { Authorization: `Bearer ${KEY}` };
  const products = await (await fetch(`${API}/api/products`, { headers })).json();
  for (const p of products.filter((p) => p.name === "E2E Test Lamp")) {
    await fetch(`${API}/api/products/${p.productId}`, { method: "DELETE", headers });
  }
}

(async () => {
  await cleanup();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  // 1. unauthenticated visit is sent to /login and no sidebar shows
  await page.goto(BASE + "/products");
  await page.waitForURL("**/login");
  check("unauthenticated /products redirects to /login", true);
  check("login page has no sidebar", (await page.locator("nav").count()) === 0);

  // 2. wrong key is rejected with a message
  await page.fill('input[type="password"]', "wrong-key");
  await page.click('button:has-text("Sign in")');
  await page.waitForSelector("text=Invalid or missing admin key");
  check("wrong key shows the API's error", true);
  check("wrong key is not kept", (await page.evaluate(() => sessionStorage.getItem("ecommerce-admin-key"))) === null);
  check("still on /login", page.url().endsWith("/login"));

  // 3. right key gets in
  await page.fill('input[type="password"]', KEY);
  await page.click('button:has-text("Sign in")');
  await page.waitForURL(BASE + "/");
  await page.waitForSelector("text=Total Products");
  check("right key lands on the dashboard", true);
  const cards = await page.locator("section").first().innerText();
  console.log("      dashboard stats:", cards.replace(/\n+/g, " | "));

  // 4. product list shows thumbnails + featured badges from the new seed
  await page.click('a:has-text("Products")');
  await page.waitForSelector("table tbody tr");
  await page.fill('input[type="search"]', "Wireless Headphones");
  await page.waitForSelector("tr:has-text('Wireless Headphones') img");
  check("product list renders thumbnails", true);
  check("seeded featured product shows the badge", (await page.locator("tr:has-text('Wireless Headphones') >> text=Featured").count()) === 1);

  // 5. create a product with image + featured through the form
  await page.click('a:has-text("Add Product")');
  await page.waitForSelector("form");
  await page.fill("input >> nth=0", "E2E Test Lamp");
  await page.fill('input[type="number"] >> nth=0', "-5");
  const nativeBlocks = await page.evaluate(() => !document.querySelector('form input[type="number"]').checkValidity());
  check("browser blocks a negative price natively", nativeBlocks);
  await page.fill('input[type="number"] >> nth=0', "19.99");
  await page.fill('input[type="url"]', "ftp://example.com/lamp.png");
  await page.click('button[type="submit"]');
  await page.waitForSelector("text=Enter a full http(s) URL");
  check("form's own validation rejects a non-http image URL", true);
  await page.fill('input[type="url"]', "https://picsum.photos/seed/e2e/300/300");
  await page.check('input[type="checkbox"]');
  await page.click('button[type="submit"]');
  await page.waitForURL("**/products");
  await page.fill('input[type="search"]', "E2E Test Lamp");
  await page.waitForSelector("tr:has-text('E2E Test Lamp')");
  check("created product appears in the list", true);
  const row = page.locator("tr", { hasText: "E2E Test Lamp" });
  check("new product is featured + has a thumbnail", (await row.locator("text=Featured").count()) === 1 && (await row.locator("img").count()) === 1);

  // 6. category delete is refused by the API while it has products, and the message reaches the user
  await page.click('a:has-text("Categories")');
  await page.waitForSelector("table tbody tr");
  await page.locator("tr", { has: page.locator('td:text-is("Electronics")') }).locator('button:has-text("Delete")').click();
  await page.locator('[role="dialog"] button:has-text("Delete"), dialog button:has-text("Delete")').last().click();
  await page.waitForSelector("text=still has");
  check("deleting a category in use shows the API's 409 message", true);
  await page.locator('button:has-text("Cancel")').last().click();

  // 7. sign out clears the key and gates again
  await page.click('button:has-text("Sign out")');
  await page.waitForURL("**/login");
  check("sign out returns to /login", true);
  await page.goto(BASE + "/carts");
  await page.waitForURL("**/login");
  check("after sign out, protected pages redirect again", true);

  // 8. a key that stops working mid-session sends the user back to /login
  await page.fill('input[type="password"]', KEY);
  await page.click('button:has-text("Sign in")');
  await page.waitForURL(BASE + "/");
  await page.evaluate(() => sessionStorage.setItem("ecommerce-admin-key", "revoked"));
  await page.goto(BASE + "/users");
  await page.waitForURL("**/login");
  check("a rejected key mid-session redirects to /login", true);

  check("no uncaught page errors", errors.length === 0, errors.join(" | "));
  await browser.close();
  await cleanup();

  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error("SCRIPT ERROR:", e.message.split("\n").slice(0, 4).join("\n"));
  process.exit(2);
});
