import assert from "node:assert/strict";
import {
  loadProfile,
  saveProfile,
  applyResult,
  rankTier,
} from "../src/profile.ts";
import { botDecision, botSpeed } from "../src/ai.ts";
const data = new Map();
const storage = {
  getItem: (k) => data.get(k) || null,
  setItem: (k, v) => data.set(k, v),
};
const p = loadProfile(storage);
assert.equal(p.rank.rating, 0);
applyResult(p, "win", true);
applyResult(p, "draw", true);
applyResult(p, "loss", true);
assert.deepEqual(p.rank, { rating: 15, wins: 1, losses: 1, draws: 1 });
applyResult(p, "win", false);
assert.equal(p.rank.rating, 15);
assert.equal(p.ai.wins, 1);
p.name = "Saved";
p.difficulty = "hard";
p.musicEnabled = false;
p.volume = 0.2;
p.keys.jump = "KeyW";
assert(saveProfile(storage, p));
assert.deepEqual(loadProfile(storage), p);
assert.equal(rankTier(199), "BRONZE");
assert.equal(rankTier(200), "SILVER");
assert.equal(rankTier(1000), "MASTER");
assert.equal(
  saveProfile(
    {
      setItem: () => {
        throw Error("Blocked");
      },
    },
    p,
  ),
  false,
);
data.set("iv-profile-v1", "{broken");
assert.equal(loadProfile(storage).name, "Player");
data.set(
  "iv-profile-v1",
  JSON.stringify({
    rank: { rating: -100, wins: Infinity },
    volume: 40,
    color: "injected",
    difficulty: "x",
  }),
);
const safe = loadProfile(storage);
assert.equal(safe.rank.rating, 0);
assert.equal(safe.rank.wins, 0);
assert.equal(safe.volume, 1);
assert.equal(safe.color, "red");
assert.equal(safe.difficulty, "normal");
assert(
  botSpeed("easy") < botSpeed("normal") &&
    botSpeed("normal") < botSpeed("hard"),
);
const player = { x: 1000, y: 565, team: 1 },
  ball = { x: 900, y: 400, vx: -4, vy: 1 };
const slow = { next: 0, target: 0, decision: 0 },
  fast = { next: 0, target: 0, decision: 0 };
botDecision("easy", 0, player, ball, slow);
botDecision("hard", 0, player, ball, fast);
assert(slow.next > fast.next);
assert.notEqual(slow.target, fast.target);
console.log(
  "PASS rating, tiers, separate AI records, save/reload, malformed storage recovery, storage denied, difficulty behavior",
);
