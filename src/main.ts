import "./style.css";
import {
  loadProfile,
  saveProfile,
  applyResult,
  rankTier,
  type Difficulty,
} from "./profile";
import { botDecision, botSpeed, type BotMemory } from "./ai";
let storage: Storage;
try {
  storage = localStorage;
} catch {
  storage = {
    getItem: () => null,
    setItem: () => {
      throw new Error("Storage unavailable");
    },
  } as unknown as Storage;
}
const profile = loadProfile(storage);
let saveAvailable = true,
  difficulty: Difficulty = profile.difficulty;
let resultRecorded = false,
  rankedGame = false,
  rankEligible = true;
const botMemories = new Map<number, BotMemory>();
const music = new Audio("./audio/bgm.mp3");
music.loop = true;
music.preload = "metadata";
music.volume = profile.volume;
let musicPlaying = false;
function savePreferences() {
  profile.lang = lang;
  profile.map = selectedMap;
  profile.mode = mode;
  profile.seconds = matchSeconds;
  profile.mobile = mobileMode;
  profile.keys = { ...keys };
  profile.difficulty = difficulty;
  saveAvailable = saveProfile(storage, profile);
}
function refreshMusicButton() {
  const b = document.querySelector("#musicBtn");
  if (b)
    b.textContent = profile.musicEnabled && musicPlaying ? "♫ ON" : "♫ OFF";
}
async function playMusic() {
  if (!profile.musicEnabled) return;
  try {
    await music.play();
    musicPlaying = true;
  } catch {
    musicPlaying = false;
  }
  refreshMusicButton();
}
function toggleMusic() {
  profile.musicEnabled = !profile.musicEnabled;
  if (profile.musicEnabled) void playMusic();
  else {
    music.pause();
    musicPlaying = false;
  }
  savePreferences();
  refreshMusicButton();
}

import { RoomNetwork, type Room, type Controls } from "./network";

type Lang = "ko" | "en";
type Color = "red" | "green" | "yellow" | "white";
type MapId = "polus" | "mira" | "defeat";
const COLORS: Color[] = ["red", "green", "yellow", "white"];
const MAPS: Record<MapId, { ko: string; en: string; file: string }> = {
  polus: { ko: "폴루스", en: "Polus", file: "polus.jpg" },
  mira: { ko: "미라", en: "Mira", file: "mira.jpg" },
  defeat: { ko: "디피트", en: "Defeat", file: "defeat.jpg" },
};
const t = (ko: string, en: string) => (lang === "ko" ? ko : en);
let lang: Lang = profile.lang;
let selectedMap: MapId = profile.map as MapId,
  mobileMode = profile.mobile,
  mode = profile.mode,
  matchSeconds = profile.seconds,
  remaining = profile.seconds;
const network = new RoomNetwork();
let roomCode = "",
  onlineStatus = "",
  currentRoom: Room | null = null,
  onlineGame = false,
  networkTick = 0;
let frameRequest = 0;
let keys: Record<string, string> = { ...profile.keys };
let gameRunning = false,
  lastFrame = 0,
  animation = 0,
  serveDelay = 0;
const app = document.querySelector<HTMLDivElement>("#root")!;
const imgCache = new Map<string, HTMLImageElement>();
function image(path: string) {
  let im = imgCache.get(path);
  if (!im) {
    im = new Image();
    im.src = path;
    imgCache.set(path, im);
  }
  return im;
}
function renderShell() {
  app.innerHTML = `<div class="app-shell"><header class="topbar"><div class="brand"><span class="brand-mark">IV</span><span>IMPOSTOR <b>VOLLEYBALL</b></span></div><div class="top-actions"><button id="langBtn" class="ghost">${lang === "ko" ? "한국어" : "English"}</button><button id="musicBtn" class="ghost" aria-label="BGM">♫ OFF</button><button id="rankBtn" class="ghost">${rankTier(profile.rank.rating)} · ${profile.rank.rating} RP</button><button id="settingsBtn" class="ghost">⚙ ${t("설정", "Settings")}</button></div></header><main id="view"></main><footer>FAN-MADE GAME PROTOTYPE · NOT AN OFFICIAL VS IMPOSTOR PRODUCT</footer></div>`;
  document.querySelector("#langBtn")!.addEventListener("click", () => {
    lang = lang === "ko" ? "en" : "ko";
    savePreferences();
    leaveOnline();
    renderHome();
  });
  document
    .querySelector("#settingsBtn")!
    .addEventListener("click", openSettings);
  document.querySelector("#musicBtn")!.addEventListener("click", toggleMusic);
  document.querySelector("#rankBtn")!.addEventListener("click", openRank);
  document.addEventListener("pointerdown", () => {
    if (profile.musicEnabled && !musicPlaying) void playMusic();
  });
  document.addEventListener("keydown", () => {
    if (profile.musicEnabled && !musicPlaying) void playMusic();
  });
  refreshMusicButton();
  renderHome();
}
function renderHome() {
  gameRunning = false;
  cancelAnimationFrame(frameRequest);
  held.clear();
  document.querySelectorAll(".modal-backdrop").forEach((el) => el.remove());
  const v = document.querySelector<HTMLDivElement>("#view")!;
  v.innerHTML = `<section class="hero"><div class="hero-copy"><div class="eyebrow">⚡ ${t("친구들과 함께하는 우주 배구", "SPACE VOLLEYBALL WITH FRIENDS")}</div><h1>IMPOSTOR<br><em>VOLLEYBALL</em></h1><p>${t("임포스터를 선택하고 코트에 입장해!", "Pick your impostor and step onto the court!")}</p><div class="hero-buttons"><button class="primary" id="playBtn">${t("AI 대전", "VS AI")}</button><button class="secondary" id="onlineBtn">${t("온라인 방", "ONLINE ROOM")}</button><button class="secondary" id="randomHomeBtn">${t("랜덤 랭크전", "RANKED MATCH")}</button></div></div><div class="hero-art"><div class="orbit orbit-a"></div><div class="orbit orbit-b"></div><img src="./assets/characters/red/idle.png" alt="Red"/><span class="hero-tag">4 COLORS · UP TO 8 PLAYERS</span></div></section><section class="feature-row"><div><b>01</b><span>${t("최대 4 vs 4", "UP TO 4 vs 4")}</span></div><div><b>02</b><span>${t("3개 맵", "3 MAPS")}</span></div><div><b>03</b><span>한국어 / English</span></div><div><b>04</b><span>${t("모바일 터치 조작", "MOBILE TOUCH")}</span></div></section>`;
  const rankBar = document.querySelector("#rankBtn");
  if (rankBar)
    rankBar.textContent = `${rankTier(profile.rank.rating)} · ${profile.rank.rating} RP`;
  v.querySelector("#playBtn")!.addEventListener("click", () =>
    renderLobby(false),
  );
  v.querySelector("#onlineBtn")!.addEventListener("click", () =>
    renderLobby(true),
  );
  v.querySelector("#randomHomeBtn")!.addEventListener(
    "click",
    startRandomMatch,
  );
}
function startRandomMatch() {
  const name = playerName();
  renderLobby(true);
  connectionBusy();
  void network.randomMatch(name);
}
function spectating() {
  return !!currentRoom?.players.find((p) => p.id === network.id)?.spectator;
}
function openRank() {
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  const r = profile.rank,
    ai = profile.ai,
    total = r.wins + r.losses + r.draws;
  modal.innerHTML = `<div class="modal"><div class="modal-head"><h2>${t("랭크 · 전적", "Rank & records")}</h2><button class="x">×</button></div><div class="rank-card"><strong>${rankTier(r.rating)}</strong><b>${r.rating} RP</b><progress max="200" value="${r.rating >= 1000 ? 200 : r.rating % 200}"></progress><p>${r.rating >= 1000 ? t("최고 티어", "Top tier") : `${200 - (r.rating % 200)} RP ${t("후 다음 티어", "to next tier")}`}</p></div><p>${t("온라인 랭크전", "Online ranked")}: ${r.wins} W · ${r.losses} L · ${r.draws} D · ${total ? Math.round((r.wins / total) * 100) : 0}%</p><p>${t("AI 대전", "AI matches")}: ${ai.wins} W · ${ai.losses} L · ${ai.draws} D</p><p class="muted">${t("승리 +25 / 패배 −15 / 무승부 +5 RP. AI 대전은 RP에 반영되지 않습니다. 랭크전에서 설정을 바꾸면 일반전으로 전환됩니다.", "Win +25 / Loss −15 / Draw +5 RP. AI matches do not affect RP. Live settings changes make ranked matches unranked.")}</p><p class="muted">${saveAvailable ? t("이 기기·브라우저에 자동 저장됩니다. 계정 연동 및 공인 순위가 아니며 저장 데이터를 삭제하면 초기화됩니다.", "Saved on this device/browser. No account sync or global leaderboard. Clearing browser data resets records.") : t("저장 공간을 사용할 수 없습니다. 브라우저 저장 설정을 확인해주세요.", "Storage unavailable. Check browser storage settings.")}</p></div>`;
  document.body.append(modal);
  modal.querySelector(".x")!.addEventListener("click", () => modal.remove());
}
function openSettings() {
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `<div class="modal"><div class="modal-head"><h2>${t("설정", "Settings")}</h2><button class="x">×</button></div><label class="toggle-line"><span><b>${t("모바일 모드", "Mobile mode")}</b><small>${t("화면에 터치 버튼 표시", "Show on-screen controls")}</small></span><input id="mobileToggle" type="checkbox" ${mobileMode ? "checked" : ""}></label><div class="music-setting"><label><input id="musicEnabled" type="checkbox" ${profile.musicEnabled ? "checked" : ""}> ${t("배경음악", "Background music")}</label><label>${t("음량", "Volume")} <input id="musicVolume" type="range" min="0" max="100" value="${Math.round(profile.volume * 100)}"></label></div><label class="difficulty-label">${t("AI 난이도 (AI 대전에서 적용)", "AI difficulty (AI matches)")}<select id="settingsDifficulty">${(["easy", "normal", "hard"] as const).map((level) => `<option value="${level}" ${level === difficulty ? "selected" : ""}>${level === "easy" ? t("쉬움", "Easy") : level === "normal" ? t("보통", "Normal") : t("어려움", "Hard")}</option>`).join("")}</select></label><div class="setting-block"><h3>${t("개인 키 설정", "Key bindings")}</h3><p>${t("키 입력칸을 클릭한 뒤 원하는 키를 눌러.", "Click a field and press a key.")}</p><div class="key-grid">${[
    ["left", t("왼쪽", "Left")],
    ["right", t("오른쪽", "Right")],
    ["jump", t("점프", "Jump")],
    ["hit", t("공 치기", "Hit")],
  ]
    .map(
      ([k, n]) =>
        `<label>${n}<input data-key="${k}" value="${keys[k]}" readonly></label>`,
    )
    .join(
      "",
    )}</div></div><div class="modal-actions"><button class="primary save">${t("저장", "Save")}</button></div></div>`;
  document.body.append(modal);
  modal.querySelector(".x")!.addEventListener("click", () => modal.remove());
  modal
    .querySelector<HTMLInputElement>("#mobileToggle")!
    .addEventListener(
      "change",
      (e) => (mobileMode = (e.target as HTMLInputElement).checked),
    );
  modal
    .querySelector<HTMLSelectElement>("#settingsDifficulty")!
    .addEventListener("change", (e) => {
      difficulty = (e.target as HTMLSelectElement).value as Difficulty;
      botMemories.clear();
      savePreferences();
    });
  modal.querySelectorAll<HTMLInputElement>("[data-key]").forEach((input) => {
    input.addEventListener("click", () => input.focus());
    input.addEventListener("keydown", (e) => {
      e.preventDefault();
      keys[input.dataset.key!] = (e as KeyboardEvent).code;
      input.value = keys[input.dataset.key!];
    });
  });
  modal
    .querySelector<HTMLInputElement>("#musicEnabled")!
    .addEventListener("change", (e) => {
      profile.musicEnabled = (e.target as HTMLInputElement).checked;
      if (profile.musicEnabled) void playMusic();
      else {
        music.pause();
        musicPlaying = false;
      }
      savePreferences();
      refreshMusicButton();
    });
  modal
    .querySelector<HTMLInputElement>("#musicVolume")!
    .addEventListener("input", (e) => {
      profile.volume = Number((e.target as HTMLInputElement).value) / 100;
      music.volume = profile.volume;
      savePreferences();
    });
  modal.querySelector(".save")!.addEventListener("click", () => {
    savePreferences();
    modal.remove();
  });
}
function renderLobby(online: boolean) {
  gameRunning = false;
  cancelAnimationFrame(frameRequest);
  held.clear();
  document.querySelectorAll(".modal-backdrop").forEach((el) => el.remove());
  const v = document.querySelector<HTMLDivElement>("#view")!;
  let chosen: Color | null = profile.color as Color;
  v.innerHTML = `<section class="panel"><div class="panel-title"><div><div class="eyebrow">${online ? t("온라인 멀티플레이", "ONLINE MULTIPLAYER") : t("로컬 게임", "LOCAL GAME")}</div><h2>${t("경기 준비", "MATCH SETUP")}</h2></div><button class="ghost" id="back">← ${t("뒤로", "BACK")}</button></div><div class="setup-grid"><div class="setup-card"><h3>01 / ${t("캐릭터 선택", "CHARACTER SELECT")}</h3><p>${t("플레이할 캐릭터를 선택해.", "Choose your player character.")}</p><div class="character-grid">${COLORS.map((c) => `<button class="character-choice" data-color="${c}"><img src="./assets/characters/${c}/idle.png"><span>${c.toUpperCase()}</span></button>`).join("")}</div>${!online ? `<label class="difficulty-label">${t("AI 난이도", "AI difficulty")}<select id="difficulty">${(["easy", "normal", "hard"] as const).map((level) => `<option value="${level}" ${level === difficulty ? "selected" : ""}>${level === "easy" ? t("쉬움", "Easy") : level === "normal" ? t("보통", "Normal") : t("어려움", "Hard")}</option>`).join("")}</select></label><p>${t("AI는 같은 팀의 빈 자리와 상대 팀을 조작합니다. 난이도에 따라 반응 속도·이동 속도·예측 정확도가 달라집니다.", "AI controls teammates and opponents. Difficulty changes reaction, speed and prediction.")}</p>` : ""}</div><div class="setup-card"><h3>02 / ${t("경기 설정", "MATCH SETTINGS")}</h3><label>${t("팀 모드", "TEAM MODE")}<select id="mode">${[1, 2, 3, 4].map((n) => `<option value="${n}" ${n === mode ? "selected" : ""}>${n} vs ${n}</option>`).join("")}</select></label><label>${t("경기 시간", "MATCH TIME")}<select id="time"><option value="60">1:00</option><option value="180">3:00</option><option value="300">5:00</option><option value="0">${t("무제한", "Unlimited")}</option></select></label><label>${t("맵", "MAP")}<select id="map">${Object.entries(
    MAPS,
  )
    .map(
      ([id, m]) =>
        `<option value="${id}" ${id === selectedMap ? "selected" : ""}>${m[lang]}</option>`,
    )
    .join(
      "",
    )}</select></label>${online ? `<div class="online-box"><h3>03 / ${t("6자리 숫자 방 코드", "6-DIGIT ROOM CODE")}</h3><label>${t("플레이어 이름", "Player name")}<input id="playerName" maxlength="16" placeholder="Player"></label><div class="room-row"><input id="roomCode" maxlength="6" inputmode="numeric" pattern="[0-9]{6}" autocomplete="off" placeholder="000000" value="${roomCode}"></div><div class="room-actions"><button class="primary" id="createRoomBtn">${t("방 만들기", "CREATE ROOM")}</button><button class="secondary" id="joinRoomBtn">${t("방 참가", "JOIN ROOM")}</button><button class="secondary" id="spectateBtn">${t("관전 참가", "SPECTATE")}</button><button class="secondary" id="randomMatchBtn">${t("랜덤 매치", "RANDOM MATCH")}</button><button class="ghost" id="leaveRoomBtn">${t("방 나가기", "LEAVE ROOM")}</button></div><div id="roomState" class="room-state"></div><small>${t("서버 주소 없이 코드로 참가 · 방장 브라우저가 경기를 진행합니다. 인터넷 연결이 필요합니다.", "Join with a code · The host browser runs the match. Internet required.")}</small><p id="onlineStatus" class="status" role="status"></p></div>` : ""}<button class="primary full" id="startBtn">${online ? t("방장: 경기 시작", "HOST: START MATCH") : t("경기 시작", "START MATCH")}</button></div></div></section>`;
  v.querySelector("#back")!.addEventListener("click", () => {
    leaveOnline();
    renderHome();
  });
  v.querySelectorAll<HTMLButtonElement>("[data-color]").forEach((b) =>
    b.addEventListener("click", () => {
      v.querySelectorAll(".character-choice").forEach((x) =>
        x.classList.remove("selected"),
      );
      b.classList.add("selected");
      chosen = b.dataset.color as Color;
      profile.color = chosen;
      savePreferences();
      if (online) selectOnlineCharacter(chosen);
    }),
  );
  v.querySelector<HTMLSelectElement>("#mode")!.addEventListener(
    "change",
    (e) => {
      mode = Number((e.target as HTMLSelectElement).value);
      syncRoomSettings();
      if (!online) savePreferences();
    },
  );
  v.querySelector<HTMLSelectElement>("#time")!.addEventListener(
    "change",
    (e) => {
      matchSeconds = Number((e.target as HTMLSelectElement).value);
      syncRoomSettings();
      if (!online) savePreferences();
    },
  );
  v.querySelector<HTMLSelectElement>("#map")!.addEventListener(
    "change",
    (e) => {
      selectedMap = (e.target as HTMLSelectElement).value as MapId;
      syncRoomSettings();
      if (!online) savePreferences();
    },
  );
  v.querySelector<HTMLSelectElement>("#difficulty")?.addEventListener(
    "change",
    (e) => {
      difficulty = (e.target as HTMLSelectElement).value as Difficulty;
      savePreferences();
    },
  );
  v.querySelector<HTMLButtonElement>(
    `[data-color="${profile.color}"]`,
  )?.classList.add("selected");
  v.querySelector<HTMLSelectElement>("#time")!.value = String(matchSeconds);
  if (online) {
    v.querySelector<HTMLInputElement>("#playerName")!.value = profile.name;
    v.querySelector<HTMLInputElement>("#playerName")!.addEventListener(
      "input",
      (e) => {
        profile.name =
          (e.target as HTMLInputElement).value.trim().slice(0, 16) || "Player";
        savePreferences();
      },
    );
    v.querySelector<HTMLButtonElement>("#startBtn")!.disabled =
      !currentRoom || !network.host;
    v.querySelector("#createRoomBtn")!.addEventListener(
      "click",
      createOnlineRoom,
    );
    v.querySelector("#joinRoomBtn")!.addEventListener("click", () =>
      joinOnlineRoom(false),
    );
    v.querySelector("#spectateBtn")!.addEventListener("click", () =>
      joinOnlineRoom(true),
    );
    v.querySelector("#randomMatchBtn")!.addEventListener(
      "click",
      startRandomMatch,
    );
    v.querySelector("#leaveRoomBtn")!.addEventListener("click", () => {
      leaveOnline();
      renderLobby(true);
    });
    v.querySelector<HTMLInputElement>("#roomCode")!.addEventListener(
      "input",
      (e) => {
        const input = e.target as HTMLInputElement;
        input.value = input.value.replace(/[^0-9]/g, "").slice(0, 6);
      },
    );
    if (currentRoom) renderRoomState(currentRoom);
    setOnlineStatus(onlineStatus);
  }
  v.querySelector("#startBtn")!.addEventListener("click", () => {
    if (online) {
      network.start();
      return;
    }
    if (!chosen) {
      alert(t("캐릭터를 선택해줘!", "Choose a character first!"));
      return;
    }
    startGame(chosen, false);
  });
}
function setOnlineStatus(message: string) {
  onlineStatus = message;
  const el = document.querySelector("#onlineStatus");
  if (el) el.textContent = message;
}
function leaveOnline() {
  network.close();
  currentRoom = null;
  roomCode = "";
  onlineGame = false;
  held.clear();
}
function renderRoomState(room: Room) {
  const box = document.querySelector<HTMLDivElement>("#roomState");
  if (!box) return;
  box.innerHTML = `<div class="room-code-card"><small>${t("친구에게 코드 공유하기", "SHARE WITH FRIENDS")}</small><strong>${room.code}</strong><button class="ghost" id="copyRoomCode">${t("코드 복사", "COPY CODE")}</button></div><div class="room-player-list">${room.players.map((p) => `<div class="room-player"><span class="player-dot ${COLORS.includes(p.color as Color) ? p.color : "none"}"></span><span>${escapeHtml(p.name)}</span><small>${p.spectator ? t("관전", "Spectator") : p.team === 0 ? "A" : "B"} · ${p.color || (p.spectator ? "—" : t("미선택", "Choose color"))}${p.id === room.hostId ? " ★" : ""}</small></div>`).join("")}</div><small>${room.players.filter((p) => !p.spectator).length}/${room.settings.mode * 2} ${t("명 참가 중 · 관전", "players · Spectators")} ${room.players.filter((p) => p.spectator).length}/16</small>`;
  box.querySelector("#copyRoomCode")?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(room.code);
      setOnlineStatus(t("코드를 복사했습니다.", "Code copied."));
    } catch {
      setOnlineStatus(
        t(
          "표시된 코드를 직접 복사해주세요.",
          "Copy the displayed code manually.",
        ),
      );
    }
  });
  const member = room.players.find((p) => p.id === network.id);
  if (!network.host && !room.matchmaking) {
    const role = document.createElement("button");
    role.id = "roleBtn";
    role.className = "ghost";
    role.textContent = member?.spectator
      ? t("선수로 전환", "Join as player")
      : t("관전으로 전환", "Switch to spectator");
    role.addEventListener("click", () => network.role(!member?.spectator));
    box.append(role);
  }
  document
    .querySelectorAll<HTMLButtonElement>("[data-color]")
    .forEach((b) => (b.disabled = !!member?.spectator));
  for (const [id, value] of Object.entries({
    mode: room.settings.mode,
    time: room.settings.seconds,
    map: room.settings.map,
  })) {
    const el = document.querySelector<HTMLSelectElement>("#" + id);
    if (el) {
      el.value = String(value);
      el.disabled = !network.host;
    }
  }
  const start = document.querySelector<HTMLButtonElement>("#startBtn");
  if (start) start.disabled = !network.host;
  const selected = room.players.find((p) => p.id === network.id)?.color;
  document
    .querySelectorAll<HTMLButtonElement>("[data-color]")
    .forEach((b) =>
      b.classList.toggle("selected", b.dataset.color === selected),
    );
  for (const id of [
    "createRoomBtn",
    "joinRoomBtn",
    "spectateBtn",
    "randomMatchBtn",
  ]) {
    const el = document.querySelector<HTMLButtonElement>("#" + id);
    if (el) el.disabled = true;
  }
}
function escapeHtml(s: string) {
  const el = document.createElement("span");
  el.textContent = s;
  return el.innerHTML;
}
function syncRoomSettings() {
  if (currentRoom) network.settings(roomSettings());
}
function roomSettings() {
  return {
    mode: Number(
      (document.querySelector("#mode") as HTMLSelectElement)?.value || mode,
    ),
    seconds: Number(
      (document.querySelector("#time") as HTMLSelectElement)?.value ??
        matchSeconds,
    ),
    map:
      (document.querySelector("#map") as HTMLSelectElement)?.value ||
      selectedMap,
  };
}
function chosenColor(): Color | null {
  return (
    (document.querySelector<HTMLButtonElement>(".character-choice.selected")
      ?.dataset.color as Color) || null
  );
}
function playerName() {
  return (
    document.querySelector<HTMLInputElement>("#playerName")?.value.trim() ||
    profile.name
  );
}
function connectionBusy() {
  for (const id of [
    "createRoomBtn",
    "joinRoomBtn",
    "spectateBtn",
    "randomMatchBtn",
  ])
    document.querySelector<HTMLButtonElement>("#" + id)!.disabled = true;
}
function createOnlineRoom() {
  connectionBusy();
  setOnlineStatus(t("방 생성 중…", "Creating room…"));
  void network.create(playerName(), roomSettings());
}
function selectOnlineCharacter(color: Color) {
  network.select(color);
}
function joinOnlineRoom(spectator = false) {
  const code = document
    .querySelector<HTMLInputElement>("#roomCode")!
    .value.trim();
  if (!/^\d{6}$/.test(code)) {
    setOnlineStatus(
      t("숫자 6자리를 입력해주세요.", "Enter exactly six digits."),
    );
    return;
  }
  connectionBusy();
  setOnlineStatus(t("방 연결 중…", "Joining room…"));
  network.join(code, playerName(), spectator);
}
network.onStatus = setOnlineStatus;
network.onRoom = (room) => {
  const first = !currentRoom;
  const color = chosenColor();
  const previous = currentRoom;
  if (
    onlineGame &&
    rankedGame &&
    previous &&
    JSON.stringify(previous.settings) !== JSON.stringify(room.settings)
  )
    rankEligible = false;
  currentRoom = structuredClone(room);
  roomCode = room.code;
  renderRoomState(room);
  if (onlineGame) {
    if (network.host) {
      if (previous?.settings.seconds !== room.settings.seconds)
        remaining = room.settings.seconds;
      if (previous?.settings.mode !== room.settings.mode)
        players = onlinePlayers(room, players);
    }
    mode = room.settings.mode;
    matchSeconds = room.settings.seconds;
    selectedMap = room.settings.map as MapId;
    const mapLabel = document.querySelector("#gameMap");
    if (mapLabel) mapLabel.textContent = MAPS[selectedMap][lang];
    const roomLabel = document.querySelector("#gameRoom");
    if (roomLabel) roomLabel.textContent = roomSummary();
    updateTimer();
  }
  if (first && color && !spectating() && !room.matchmaking)
    network.select(color);
};
network.onClose = () => {
  gameRunning = false;
  cancelAnimationFrame(frameRequest);
  held.clear();
  leaveOnline();
  renderLobby(true);
  setOnlineStatus(onlineStatus);
};
network.onStart = (room) => {
  mode = room.settings.mode;
  matchSeconds = room.settings.seconds;
  selectedMap = room.settings.map as MapId;
  startGame(
    (room.players.find((p) => p.id === network.id)?.color || "red") as Color,
    true,
  );
};
network.onFrame = (state) => {
  if (!onlineGame || network.host) return;
  players = state.players;
  ball = state.ball;
  score = state.score;
  remaining = state.remaining;
  animation = state.animation;
  updateScore();
  updateTimer();
  if (state.ended) {
    gameRunning = false;
    showResult();
    draw();
  }
};

let canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D;
type Player = {
  id: number;
  peerId?: string;
  team: 0 | 1;
  color: Color;
  x: number;
  y: number;
  vy: number;
  grounded: boolean;
  moving: boolean;
};
let players: Player[] = [],
  ball = { x: 640, y: 230, vx: 4, vy: 0, r: 17 },
  score = [0, 0],
  held = new Set<string>();
let floorY = 620,
  localColor: Color = "red";
function onlinePlayers(room: Room, previous: Player[] = []): Player[] {
  return room.players
    .filter((p) => !p.spectator)
    .map((member, i) => {
      const old = previous.find(
        (p) => p.peerId === member.id && p.team === member.team,
      );
      if (old) return { ...old, id: i };
      const position = room.players
        .filter((p) => !p.spectator && p.team === member.team)
        .findIndex((p) => p.id === member.id);
      return {
        id: i,
        peerId: member.id,
        team: member.team,
        color: member.color as Color,
        x: member.team === 0 ? 150 + position * 100 : 1130 - position * 100,
        y: floorY - 55,
        vy: 0,
        grounded: true,
        moving: false,
      };
    });
}
function roomSummary() {
  return currentRoom
    ? `${rankedGame ? (rankEligible ? t("랭크전", "RANKED") : t("일반전", "UNRANKED")) : t("방", "Room")} ${currentRoom.code} · ${spectating() ? t("관전 중", "Spectating") : t("선수", "Player")} · ${t("관전", "Viewers")} ${currentRoom.players.filter((p) => p.spectator).length}`
    : "";
}
function openMatchSettings() {
  if (!onlineGame || !network.host || !gameRunning) return;
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `<form class="modal" id="matchSettingsForm"><div class="modal-head"><h2>${t("경기 설정 변경", "Match settings")}</h2><button type="button" class="x">×</button></div><div class="live-settings"><label>${t("팀 모드", "Team mode")}<select name="mode">${[1, 2, 3, 4].map((n) => `<option value="${n}" ${n === mode ? "selected" : ""}>${n} vs ${n}</option>`).join("")}</select></label><label>${t("경기 시간", "Match time")}<select name="seconds">${[60, 180, 300, 0].map((n) => `<option value="${n}" ${n === matchSeconds ? "selected" : ""}>${n ? formatTime(n) : t("무제한", "Unlimited")}</option>`).join("")}</select></label><label>${t("맵", "Map")}<select name="map">${Object.entries(
    MAPS,
  )
    .map(
      ([id, m]) =>
        `<option value="${id}" ${id === selectedMap ? "selected" : ""}>${m[lang]}</option>`,
    )
    .join(
      "",
    )}</select></label><p>${t("맵과 팀 모드는 즉시 적용됩니다. 경기 시간을 바꾸면 남은 시간이 새 값으로 재설정됩니다. 점수는 유지됩니다.", "Changes apply immediately. Changing duration resets time remaining. Scores are kept.")}</p></div><div class="modal-actions"><button class="primary" type="submit">${t("모두에게 적용", "APPLY TO EVERYONE")}</button></div></form>`;
  document.body.append(modal);
  modal.querySelector(".x")!.addEventListener("click", () => modal.remove());
  modal.querySelector("form")!.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = new FormData(e.target as HTMLFormElement);
    const settings = {
      mode: Number(data.get("mode")),
      seconds: Number(data.get("seconds")),
      map: String(data.get("map")),
    };
    if (
      currentRoom!.players.filter((p) => !p.spectator).length >
      settings.mode * 2
    ) {
      const message = modal.querySelector("p")!;
      message.textContent = t(
        "현재 선수 인원보다 작은 팀 모드는 선택할 수 없습니다.",
        "Too many players for this team mode.",
      );
      return;
    }
    network.settings(settings);
    modal.remove();
  });
}
function startGame(color: Color, online: boolean) {
  cancelAnimationFrame(frameRequest);
  onlineGame = online;
  networkTick = 0;
  resultRecorded = false;
  rankedGame = online && !!currentRoom?.matchmaking;
  rankEligible = true;
  botMemories.clear();
  animation = 0;
  ball = { x: 640, y: 220, vx: 4, vy: -2, r: 17 };
  held.clear();
  localColor = color;
  gameRunning = true;
  remaining = matchSeconds || 0;
  score = [0, 0];
  serveDelay = 1;
  players = [];
  for (let team = 0; team < 2; team++)
    for (let i = 0; i < mode; i++)
      players.push({
        id: team * mode + i,
        team: team as 0 | 1,
        color: team === 0 ? color : COLORS[(i + 1) % COLORS.length],
        x: team === 0 ? 150 + i * 75 : 1130 - i * 75,
        y: floorY - 55,
        vy: 0,
        grounded: true,
        moving: false,
      });
  if (online && currentRoom) players = onlinePlayers(currentRoom);
  renderGame();
  lastFrame = performance.now();
  frameRequest = requestAnimationFrame(loop);
}
function renderGame() {
  const v = document.querySelector<HTMLDivElement>("#view")!;
  v.innerHTML = `<section class="game-wrap"><div class="game-hud"><div><small>${t("팀 블루", "TEAM A")}</small><b id="scoreA">0</b></div><div class="match-info"><b id="gameMap">${MAPS[selectedMap][lang]}</b><span id="timer">${matchSeconds ? formatTime(matchSeconds) : "∞"}</span></div><div><small>${t("팀 레드", "TEAM B")}</small><b id="scoreB">0</b></div>${onlineGame && network.host ? `<button id="matchSettingsBtn" class="ghost">${t("경기 설정", "MATCH SETTINGS")}</button>` : ""}<button id="exitGame" class="ghost">✕</button></div>${onlineGame ? `<div class="game-room-bar"><span id="gameRoom">${roomSummary()}</span><span>${t("코드 공유로 관전 가능", "Share code to invite spectators")}</span></div>` : ""}<div class="canvas-shell"><canvas id="court" width="1280" height="720"></canvas><div class="toast" id="toast"></div></div><div class="control-hint">${t("이동: 좌우 키 · 점프: 위쪽 키 · 공 치기: 스페이스", "Move: Left/Right · Jump: Up · Hit: Space")}</div>${mobileMode && !spectating() ? '<div class="touch-controls"><div><button data-hold="left">◀</button><button data-hold="right">▶</button></div><div><button data-hold="jump">▲</button><button data-hold="hit">●</button></div></div>' : ""}</section>`;
  document
    .querySelector("#matchSettingsBtn")
    ?.addEventListener("click", openMatchSettings);
  canvas = document.querySelector<HTMLCanvasElement>("#court")!;
  ctx = canvas.getContext("2d")!;
  document.querySelector("#exitGame")!.addEventListener("click", () => {
    if (
      gameRunning &&
      rankedGame &&
      rankEligible &&
      !spectating() &&
      !resultRecorded
    ) {
      applyResult(profile, "loss", true);
      resultRecorded = true;
      savePreferences();
    }
    gameRunning = false;
    leaveOnline();
    renderHome();
  });
  document.querySelectorAll<HTMLButtonElement>("[data-hold]").forEach((b) => {
    const k = b.dataset.hold!;
    b.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      held.add(k);
    });
    ["pointerup", "pointerleave", "pointercancel"].forEach((ev) =>
      b.addEventListener(ev, () => held.delete(k)),
    );
  });
}
function formatTime(s: number) {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}
function readControls(): Controls {
  return {
    left: held.has("left") || held.has(keys.left),
    right: held.has("right") || held.has(keys.right),
    jump: held.has("jump") || held.has(keys.jump),
    hit: held.has("hit") || held.has(keys.hit),
  };
}
function loop(now: number) {
  if (!gameRunning) return;
  const dt = Math.min((now - lastFrame) / 16.667, 2);
  lastFrame = now;
  animation += dt;
  if (onlineGame) {
    networkTick += dt;
    if (networkTick >= 3) {
      network.input(readControls());
      networkTick = 0;
    }
  }
  if (!onlineGame || network.host) {
    if (matchSeconds > 0) remaining = Math.max(0, remaining - dt / 60);
    update(dt);
    updateTimer();
    if (onlineGame && (networkTick === 0 || !gameRunning))
      network.frame({
        players,
        ball,
        score,
        remaining,
        animation,
        ended: !gameRunning,
      });
  }
  draw();
  if (gameRunning) frameRequest = requestAnimationFrame(loop);
}
function updateTimer() {
  const timer = document.querySelector("#timer");
  if (timer)
    timer.textContent = matchSeconds ? formatTime(Math.ceil(remaining)) : "∞";
  if (matchSeconds > 0 && remaining <= 0) {
    gameRunning = false;
    showResult();
  }
}
function showResult() {
  if (!resultRecorded && !spectating()) {
    resultRecorded = true;
    const team = onlineGame
      ? currentRoom?.players.find((p) => p.id === network.id)?.team
      : 0;
    if (team !== undefined && (!onlineGame || (rankedGame && rankEligible))) {
      const result =
        score[0] === score[1]
          ? "draw"
          : score[team] > score[1 - team]
            ? "win"
            : "loss";
      applyResult(profile, result, onlineGame);
      savePreferences();
      const rankBtn = document.querySelector("#rankBtn");
      if (rankBtn)
        rankBtn.textContent = `${rankTier(profile.rank.rating)} · ${profile.rank.rating} RP`;
    }
  }
  const toast = document.querySelector("#toast");
  if (toast)
    toast.textContent =
      score[0] === score[1]
        ? t("무승부!", "DRAW!")
        : score[0] > score[1]
          ? t("팀 블루 승리!", "TEAM A WINS!")
          : t("팀 레드 승리!", "TEAM B WINS!");
}
function aiControls(p: Player) {
  let memory = botMemories.get(p.id);
  if (!memory) {
    memory = { next: 0, target: p.x, decision: 0 };
    botMemories.set(p.id, memory);
  }
  return botDecision(difficulty, animation, p, ball, memory);
}
function update(dt: number) {
  players.forEach((p, i) => {
    const control = onlineGame
      ? network.controls(p.peerId!)
      : i === 0
        ? readControls()
        : aiControls(p);
    p.moving = control.left || control.right;
    const speed = !onlineGame && i !== 0 ? botSpeed(difficulty) : 5;
    if (control.left) p.x -= speed * dt;
    if (control.right) p.x += speed * dt;
    p.x = Math.max(
      p.team === 0 ? 40 : 680,
      Math.min(p.team === 0 ? 600 : 1240, p.x),
    );
    if (control.jump && p.grounded) {
      p.vy = -13;
      p.grounded = false;
    }
    if (
      control.hit &&
      Math.abs(ball.x - p.x) < 105 &&
      Math.abs(ball.y - p.y) < 125
    ) {
      ball.vx = p.team === 0 ? 7 : -7;
      ball.vy = -9;
    }
    if (!p.grounded) {
      p.y += p.vy * dt;
      p.vy += 0.65 * dt;
      if (p.y >= floorY - 55) {
        p.y = floorY - 55;
        p.vy = 0;
        p.grounded = true;
      }
    }
  });
  if (serveDelay > 0) {
    serveDelay -= dt / 60;
    return;
  }
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  ball.vy += 0.24 * dt;
  if (ball.x < ball.r || ball.x > 1280 - ball.r) {
    ball.vx *= -0.85;
    ball.x = Math.max(ball.r, Math.min(1280 - ball.r, ball.x));
  }
  if (ball.y < ball.r) {
    ball.y = ball.r;
    ball.vy = Math.abs(ball.vy) * 0.8;
  }
  if (ball.y + ball.r >= floorY) {
    const team = ball.x < 640 ? 1 : 0;
    score[team]++;
    updateScore();
    serveDelay = 1.1;
    ball = { x: 640, y: 220, vx: team === 0 ? -4 : 4, vy: -2, r: 17 };
  }
  if (ball.x > 620 && ball.x < 660 && ball.y > floorY - 260)
    ball.vx = ball.x < 640 ? -Math.abs(ball.vx) : Math.abs(ball.vx);
  players.forEach((pl) => {
    const dx = ball.x - pl.x,
      dy = ball.y - (pl.y - 25);
    if (Math.abs(dx) < 42 && Math.abs(dy) < 48) {
      ball.vy = -8;
      ball.vx = dx < 0 ? -4 : 4;
    }
  });
}

function updateScore() {
  const a = document.querySelector("#scoreA"),
    b = document.querySelector("#scoreB");
  if (a) a.textContent = String(score[0]);
  if (b) b.textContent = String(score[1]);
}
function draw() {
  ctx.clearRect(0, 0, 1280, 720);
  const bg = image(`./assets/maps/${MAPS[selectedMap].file}`);
  if (bg.complete && bg.naturalWidth) ctx.drawImage(bg, 0, 0, 1280, floorY);
  else {
    ctx.fillStyle = "#222";
    ctx.fillRect(0, 0, 1280, floorY);
  }
  ctx.fillStyle = "rgba(12,14,25,.23)";
  ctx.fillRect(0, 0, 1280, floorY);
  ctx.fillStyle = "#4b4450";
  ctx.fillRect(0, floorY, 1280, 100);
  ctx.fillStyle = "#dedee5";
  ctx.fillRect(635, floorY - 205, 10, 205);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, floorY - 4, 1280, 4);
  players.forEach((p) => {
    const state = !p.grounded
      ? "jump"
      : p.moving
        ? Math.floor(animation / 8) % 2
          ? "walk1"
          : "walk2"
        : "idle";
    const im = image(`./assets/characters/${p.color}/${state}.png`);
    if (im.complete && im.naturalWidth) {
      const height = 105,
        width = (height * im.naturalWidth) / im.naturalHeight;
      ctx.save();
      if (p.team === 1) {
        ctx.translate(p.x, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(im, -width / 2, p.y - height / 2, width, height);
      } else
        ctx.drawImage(im, p.x - width / 2, p.y - height / 2, width, height);
      ctx.restore();
    }
  });
  ctx.save();
  ctx.shadowColor = "#fff";
  ctx.shadowBlur = 12;
  ctx.fillStyle = "#f3eee0";
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#37343b";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
}
window.addEventListener("keydown", (e) => {
  if ((e.target as HTMLElement)?.matches("input,select,textarea")) return;
  if (
    gameRunning &&
    ["ArrowLeft", "ArrowRight", "ArrowUp", "Space"].includes(e.code)
  )
    e.preventDefault();
  held.add(e.code);
});
window.addEventListener("keyup", (e) => held.delete(e.code));
window.addEventListener("blur", () => {
  held.clear();
  if (onlineGame) network.input(readControls());
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    held.clear();
    if (onlineGame) network.input(readControls());
  }
});
renderShell();
