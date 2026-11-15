import { chromium } from "playwright";
import assert from "node:assert/strict";
const base = process.env.TEST_URL || "http://127.0.0.1:4173";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.TEST_CHANNEL ? { channel: process.env.TEST_CHANNEL } : {}),
});
const errors = [];
try {
  const context = await browser.newContext();
  context.on("page", (p) => p.on("pageerror", (e) => errors.push(e.message)));
  async function page() {
    const p = await context.newPage();
    p.setDefaultTimeout(25000);
    await p.goto(base);
    return p;
  }
  async function lobby(p) {
    await p.locator("#onlineBtn").click();
  }
  async function join(p, code, spectator = false) {
    await lobby(p);
    await p.locator("#roomCode").fill(code);
    await p.locator(spectator ? "#spectateBtn" : "#joinRoomBtn").click();
  }
  const host = await page(),
    guest = await page(),
    viewer = await page();
  await lobby(host);
  await host.locator('[data-color="red"]').click();
  await host.locator("#createRoomBtn").click();
  await host.locator(".room-code-card strong").waitFor();
  const code = await host.locator(".room-code-card strong").innerText();
  assert.match(code, /^\d{6}$/);
  await join(guest, code);
  await guest.locator("#roleBtn").waitFor();
  await guest.locator('[data-color="green"]').click();
  await join(viewer, code, true);
  await viewer.locator("#roleBtn").waitFor();
  assert(await viewer.locator('[data-color="red"]').isDisabled());
  // A full player roster never blocks spectators; spectators do not stop a match starting.
  assert(await guest.locator("#mode").isDisabled());
  assert(await viewer.locator("#startBtn").isDisabled());
  await host.locator("#startBtn").click();
  await Promise.all([
    guest.locator("#court").waitFor(),
    viewer.locator("#court").waitFor(),
  ]);
  assert.equal(await viewer.locator("#matchSettingsBtn").count(), 0);
  assert.match(await viewer.locator("#gameRoom").innerText(), /관전 중/);
  await host.locator("#matchSettingsBtn").click();
  await host.locator('[name="map"]').selectOption("defeat");
  await host.locator('[name="seconds"]').selectOption("0");
  await host.locator('[name="mode"]').selectOption("2");
  await host.locator('#matchSettingsForm button[type="submit"]').click();
  for (const p of [host, guest, viewer]) {
    await p.waitForFunction(
      () =>
        document.querySelector("#gameMap")?.textContent === "디피트" &&
        document.querySelector("#timer")?.textContent === "∞",
    );
  }
  // Late spectator receives the live court and current settings, then leaves harmlessly.
  const late = await page();
  await join(late, code, true);
  await late.locator("#court").waitFor();
  await late.waitForFunction(
    () => document.querySelector("#timer")?.textContent === "∞",
  );
  await late.locator("#exitGame").click();
  await host.waitForFunction(() =>
    document.querySelector("#gameRoom")?.textContent.endsWith("1"),
  );
  assert(await guest.locator("#court").isVisible());
  await host.locator("#matchSettingsBtn").click();
  await host.locator('[name="seconds"]').selectOption("60");
  await host.locator('#matchSettingsForm button[type="submit"]').click();
  await guest.waitForFunction(() =>
    /^0:|^1:/.test(document.querySelector("#timer")?.textContent || ""),
  );
  console.log(
    "PASS private room, pre-match/late spectators, host-only live settings, timer reset, spectator exit",
  );
  await host.locator("#exitGame").click();
  await guest.locator("#onlineStatus").waitFor();
  await viewer.locator("#onlineStatus").waitFor();
  // Lobby role changes free and consume a player slot without permitting spectator input.
  await guest.locator("#back").click();
  await viewer.locator("#back").click();
  await lobby(host);
  await host.locator("#createRoomBtn").click();
  await host.locator(".room-code-card strong").waitFor();
  const roleCode = await host.locator(".room-code-card strong").innerText();
  await join(guest, roleCode, true);
  await guest.locator("#roleBtn").waitFor();
  await guest.locator("#roleBtn").click();
  await guest.waitForFunction(
    () => !document.querySelector('[data-color="red"]').disabled,
  );
  await guest.locator("#roleBtn").click();
  await guest.waitForFunction(
    () => document.querySelector('[data-color="red"]').disabled,
  );
  await host.locator("#leaveRoomBtn").click();
  await guest.locator("#onlineStatus").waitFor();
  await guest.locator("#back").click();
  await host.locator("#back").click();
  // Two public waiters automatically pair and start, no code and no start click.
  await host.locator("#randomHomeBtn").click();
  await host.locator(".room-code-card strong").waitFor();
  const randomCode = await host.locator(".room-code-card strong").innerText();
  await guest.locator("#randomHomeBtn").click();
  await Promise.all([
    host.locator("#court").waitFor(),
    guest.locator("#court").waitFor(),
  ]);
  assert.match(
    await guest.locator("#gameRoom").innerText(),
    new RegExp(randomCode),
  );
  // A new waiter skips the active public match. Cancellation releases its slot.
  await viewer.locator("#randomHomeBtn").click();
  await viewer.locator(".room-code-card strong").waitFor();
  const nextCode = await viewer.locator(".room-code-card strong").innerText();
  assert.notEqual(nextCode, randomCode);
  await viewer.locator("#leaveRoomBtn").click();
  await viewer.locator("#back").click();
  await viewer.locator("#randomHomeBtn").click();
  await viewer.locator(".room-code-card strong").waitFor();
  assert.equal(
    await viewer.locator(".room-code-card strong").innerText(),
    nextCode,
  );
  await viewer.locator("#leaveRoomBtn").click();
  await host.locator("#exitGame").click();
  await guest.locator("#onlineStatus").waitFor();
  console.log(
    "PASS role switching, random auto-start, skip active room, cancel and reuse matchmaking slot",
  );
  assert.deepEqual(errors, []);
  console.log("PASS no browser page errors");
} finally {
  await browser.close();
}
