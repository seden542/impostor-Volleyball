import { chromium } from "playwright";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  ...(process.env.TEST_CHANNEL ? { channel: process.env.TEST_CHANNEL } : {}),
  headless: true,
});
const base = process.env.TEST_URL || "http://127.0.0.1:4173";
try {
  async function gamePage(seconds = 180) {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(45000);
    await page.addInitScript(
      ({ seconds }) => {
        localStorage.setItem(
          "iv-profile-v1",
          JSON.stringify({ seconds, musicEnabled: false }),
        );
        let now = performance.now();
        window.requestAnimationFrame = (callback) =>
          setTimeout(() => callback((now += 33.334)), 0);
        window.cancelAnimationFrame = clearTimeout;
      },
      { seconds },
    );
    await page.goto(base);
    return page;
  }
  const ai = await gamePage(60);
  await ai.locator("#playBtn").click();
  await ai.locator("#startBtn").click();
  await ai.waitForFunction(
    () => !!document.querySelector("#toast")?.textContent,
    null,
    { timeout: 45000 },
  );
  const before = await ai.evaluate(() =>
    JSON.parse(localStorage.getItem("iv-profile-v1")),
  );
  assert.equal(before.ai.wins + before.ai.losses + before.ai.draws, 1);
  assert.equal(before.rank.rating, 0);
  await ai.waitForTimeout(500);
  assert.deepEqual(
    await ai.evaluate(
      () => JSON.parse(localStorage.getItem("iv-profile-v1")).ai,
    ),
    before.ai,
  );
  console.log("PASS AI completed match records exactly once, no ranked points");
  const a = await gamePage(),
    b = await gamePage();
  await a.locator("#randomHomeBtn").click();
  await a.locator(".room-code-card").waitFor();
  await b.locator("#randomHomeBtn").click();
  await a.locator("#court").waitFor();
  await b.locator("#court").waitFor();
  await a.waitForFunction(
    () => !!document.querySelector("#toast")?.textContent,
    null,
    { timeout: 45000 },
  );
  await b.waitForFunction(
    () => !!document.querySelector("#toast")?.textContent,
    null,
    { timeout: 45000 },
  );
  const pa = await a.evaluate(() =>
      JSON.parse(localStorage.getItem("iv-profile-v1")),
    ),
    pb = await b.evaluate(() =>
      JSON.parse(localStorage.getItem("iv-profile-v1")),
    );
  for (const p of [pa, pb])
    assert.equal(p.rank.wins + p.rank.losses + p.rank.draws, 1);
  assert.equal(pa.rank.wins, pb.rank.losses);
  assert.equal(pa.rank.losses, pb.rank.wins);
  assert.equal(pa.rank.draws, pb.rank.draws);
  assert.equal(pa.rank.rating, pa.rank.wins * 25 + pa.rank.draws * 5);
  assert.equal(pb.rank.rating, pb.rank.wins * 25 + pb.rank.draws * 5);
  await a.waitForTimeout(500);
  assert.deepEqual(
    await a.evaluate(
      () => JSON.parse(localStorage.getItem("iv-profile-v1")).rank,
    ),
    pa.rank,
  );
  console.log(
    "PASS completed online ranked match awards both devices correct result and points exactly once",
  );
} finally {
  await browser.close();
}
