import { chromium } from "playwright";
import assert from "node:assert/strict";
const b = await chromium.launch({
  ...(process.env.TEST_CHANNEL ? { channel: process.env.TEST_CHANNEL } : {}),
  headless: true,
});
try {
  const context = await b.newContext();
  const p = await context.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(process.env.TEST_URL || "http://127.0.0.1:4173");
  await p.locator("#playBtn").click();
  await p.locator("#difficulty").selectOption("hard");
  await p.locator('[data-color="yellow"]').click();
  await p.locator("#map").selectOption("mira");
  await p.locator("#mode").selectOption("2");
  await p.locator("#time").selectOption("60");
  await p.locator("#settingsBtn").click();
  await p.locator("#musicEnabled").uncheck();
  await p.locator("#musicVolume").fill("20");
  await p.locator("#mobileToggle").check();
  await p.locator(".save").click();
  await p.reload();
  await p.locator("#playBtn").click();
  assert.equal(await p.locator("#difficulty").inputValue(), "hard");
  assert.equal(await p.locator("#map").inputValue(), "mira");
  assert.equal(await p.locator("#mode").inputValue(), "2");
  assert.equal(await p.locator("#time").inputValue(), "60");
  assert.equal(
    await p.locator(".character-choice.selected").getAttribute("data-color"),
    "yellow",
  );
  await p.locator("#settingsBtn").click();
  assert(!(await p.locator("#musicEnabled").isChecked()));
  assert(await p.locator("#mobileToggle").isChecked());
  assert.equal(await p.locator("#musicVolume").inputValue(), "20");
  await p.locator(".save").click();
  await p.locator("#startBtn").click();
  await p.locator("#court").waitFor();
  assert.equal(await p.locator("[data-hold]").count(), 4);
  await p.locator("#exitGame").click();
  await p.locator("#musicBtn").click();
  await p.waitForFunction(
    () => document.querySelector("#musicBtn")?.textContent === "♫ ON",
  );
  const audioStatus = await p.evaluate(async () => {
    const response = await fetch("./audio/bgm.mp3");
    return {
      status: response.status,
      size: (await response.arrayBuffer()).byteLength,
    };
  });
  assert.equal(audioStatus.status, 200);
  assert(audioStatus.size > 1000000);
  await p.locator("#rankBtn").click();
  assert.match(await p.locator(".rank-card").innerText(), /BRONZE/);
  await p.locator(".x").click();
  await p.evaluate(() => localStorage.setItem("iv-profile-v1", "{corrupt"));
  await p.reload();
  assert(await p.locator("#playBtn").isVisible());
  assert.deepEqual(errors, []);
  await p.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
  );
  console.log(
    "PASS browser reload persistence, AI setup, mobile controls, MP3 playback and asset, rank panel, malformed save recovery, mobile width",
  );
} finally {
  await b.close();
}
