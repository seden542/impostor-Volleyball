export type Difficulty = "easy" | "normal" | "hard";
export type RecordStats = { wins: number; losses: number; draws: number };
export type Profile = {
  version: 1;
  name: string;
  color: string;
  map: string;
  mode: number;
  seconds: number;
  difficulty: Difficulty;
  mobile: boolean;
  touchSize: number;
  musicEnabled: boolean;
  volume: number;
  lang: "ko" | "en";
  keys: Record<string, string>;
  rank: RecordStats & { rating: number };
  ai: RecordStats;
};
export const defaultKeys = {
  left: "ArrowLeft",
  right: "ArrowRight",
  jump: "ArrowUp",
  hit: "Space",
};
const defaults = (): Profile => ({
  version: 1,
  name: "Player",
  color: "red",
  map: "polus",
  mode: 1,
  seconds: 180,
  difficulty: "normal",
  mobile: false,
  touchSize: 62,
  musicEnabled: true,
  volume: 0.35,
  lang: "ko",
  keys: { ...defaultKeys },
  rank: { rating: 0, wins: 0, losses: 0, draws: 0 },
  ai: { wins: 0, losses: 0, draws: 0 },
});
const count = (x: unknown) =>
  typeof x === "number" && Number.isFinite(x)
    ? Math.max(0, Math.min(100000000, Math.floor(x)))
    : 0;
export function loadProfile(storage: Pick<Storage, "getItem">): Profile {
  const p = defaults();
  let raw: any;
  try {
    raw = JSON.parse(storage.getItem("iv-profile-v1") || "null");
    if (!raw) {
      p.lang = storage.getItem("iv-lang") === "en" ? "en" : "ko";
      try {
        const keys = JSON.parse(storage.getItem("iv-keys") || "null");
        if (keys) raw = { keys };
      } catch {}
    }
  } catch {
    return p;
  }
  if (!raw || typeof raw !== "object") return p;
  if (typeof raw.name === "string")
    p.name = raw.name.trim().slice(0, 16) || "Player";
  if (["red", "green", "yellow", "white"].includes(raw.color))
    p.color = raw.color;
  if (["polus", "mira", "defeat"].includes(raw.map)) p.map = raw.map;
  if ([1, 2, 3, 4].includes(raw.mode)) p.mode = raw.mode;
  if ([0, 60, 180, 300].includes(raw.seconds)) p.seconds = raw.seconds;
  if (["easy", "normal", "hard"].includes(raw.difficulty))
    p.difficulty = raw.difficulty;
  if (typeof raw.mobile === "boolean") p.mobile = raw.mobile;
  if (typeof raw.touchSize === "number" && Number.isFinite(raw.touchSize))
    p.touchSize = Math.max(48, Math.min(96, Math.round(raw.touchSize)));
  if (typeof raw.musicEnabled === "boolean") p.musicEnabled = raw.musicEnabled;
  if (typeof raw.volume === "number" && Number.isFinite(raw.volume))
    p.volume = Math.max(0, Math.min(1, raw.volume));
  if (raw.lang === "en" || raw.lang === "ko") p.lang = raw.lang;
  for (const key of Object.keys(defaultKeys))
    if (typeof raw.keys?.[key] === "string" && raw.keys[key].length < 40)
      p.keys[key] = raw.keys[key];
  for (const kind of ["rank", "ai"] as const)
    for (const key of ["wins", "losses", "draws"] as const)
      p[kind][key] = count(raw[kind]?.[key]);
  p.rank.rating = count(raw.rank?.rating);
  return p;
}
export function saveProfile(
  storage: Pick<Storage, "setItem">,
  profile: Profile,
) {
  try {
    storage.setItem("iv-profile-v1", JSON.stringify(profile));
    return true;
  } catch {
    return false;
  }
}
export function applyResult(
  profile: Profile,
  result: "win" | "loss" | "draw",
  ranked: boolean,
) {
  const record = ranked ? profile.rank : profile.ai;
  record[result === "win" ? "wins" : result === "loss" ? "losses" : "draws"]++;
  if (ranked)
    profile.rank.rating = Math.max(
      0,
      profile.rank.rating +
        (result === "win" ? 25 : result === "loss" ? -15 : 5),
    );
}
export function rankTier(rating: number) {
  const tiers = ["BRONZE", "SILVER", "GOLD", "PLATINUM", "DIAMOND", "MASTER"];
  return tiers[Math.min(5, Math.floor(Math.max(0, rating) / 200))];
}
