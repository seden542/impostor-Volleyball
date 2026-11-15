import { chromium } from "playwright";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  ...(process.env.TEST_CHANNEL ? { channel: process.env.TEST_CHANNEL } : {}),
  headless: true,
});
try {
  const context = await browser.newContext({
    viewport: { width: 900, height: 1100 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const draw = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (...args) {
      if (args[0]?.src?.includes("/characters/red/"))
        window.redPosition = {
          x: args[1] + args[3] / 2,
          y: args[2] + args[4] / 2,
        };
      return draw.apply(this, args);
    };
  });
  await page.goto(process.env.TEST_URL || "http://127.0.0.1:4173");
  await page.locator("#settingsBtn").click();
  await page.locator("#mobileToggle").check();
  await page.locator("#touchSize").fill("96");
  assert.equal(await page.locator("#touchSizeValue").innerText(), "96px");
  await page.locator(".save").click();
  await page.reload();
  await page.locator("#settingsBtn").click();
  assert.equal(await page.locator("#touchSize").inputValue(), "96");
  await page.locator(".save").click();
  await page.locator("#playBtn").click();
  await page.locator("#startBtn").click();
  const button = page.locator('[data-hold="right"]');
  assert.equal(Math.round((await button.boundingBox()).width), 96);
  await page.locator("#settingsBtn").click();
  await page.locator("#touchSize").fill("48");
  assert.equal(Math.round((await button.boundingBox()).width), 48);
  await page.locator("#mobileToggle").uncheck();
  assert.equal(await page.locator("[data-hold]").count(), 0);
  await page.locator("#mobileToggle").check();
  assert.equal(await page.locator("[data-hold]").count(), 4);
  await page.locator("#touchSize").fill("96");
  await page.locator(".save").click();
  await page.waitForTimeout(200);
  const before = await page.evaluate(() => window.redPosition);
  const right = await button.boundingBox(),
    jump = await page.locator('[data-hold="jump"]').boundingBox();
  const session = await context.newCDPSession(page);
  const points = [
    { x: right.x + right.width / 2, y: right.y + right.height / 2, id: 1 },
    { x: jump.x + jump.width / 2, y: jump.y + jump.height / 2, id: 2 },
  ];
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: points,
  });
  await page.waitForTimeout(350);
  const during = await page.evaluate(() => window.redPosition);
  assert(during.x > before.x + 20, "Held direction must move while jumping");
  assert(during.y < before.y - 20, "Second finger must jump");
  await session.send("Input.dispatchTouchEvent", {
    type: "touchCancel",
    touchPoints: [],
  });
  await page.waitForTimeout(100);
  const stopped = await page.evaluate(() => window.redPosition.x);
  await page.waitForTimeout(250);
  assert(
    Math.abs((await page.evaluate(() => window.redPosition.x)) - stopped) < 2,
    "Cancelled touches must not stick",
  );
  const blocked = await page.evaluate(
    () =>
      !document
        .querySelector("[data-hold]")
        .dispatchEvent(
          new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
        ),
  );
  assert(blocked);
  assert.equal(
    await button.evaluate((el) => getComputedStyle(el).userSelect),
    "none",
  );
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [points[0]],
  });
  await page.waitForTimeout(800);
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  assert.equal(await page.evaluate(() => getSelection().toString()), "");
  await page.setViewportSize({ width: 320, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  assert((await button.boundingBox()).width <= 61.1);
  await page.locator("#exitGame").click();
  await page.locator("#onlineBtn").click();
  const editable = await page
    .locator("#roomCode")
    .evaluate((el) => ({
      selection: getComputedStyle(el).userSelect,
      menu: el.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
      ),
    }));
  assert.equal(editable.selection, "text");
  assert(editable.menu, "Input paste menu must remain available");
  assert.deepEqual(errors, []);
  console.log(
    "PASS saved size, live resize/toggle, two-finger move+jump, cancellation release, long press suppression, narrow-screen fit, editable input menus",
  );
} finally {
  await browser.close();
}
