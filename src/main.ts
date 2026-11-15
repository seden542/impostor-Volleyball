import "./style.css";
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
let lang: Lang = (localStorage.getItem("iv-lang") as Lang) || "ko";
let selectedMap: MapId = "polus",
  mobileMode = false,
  mode = 1,
  matchSeconds = 180,
  remaining = 180;
const network = new RoomNetwork();
let roomCode = "",
  onlineStatus = "",
  currentRoom: Room | null = null,
  onlineGame = false,
  networkTick = 0;
let frameRequest = 0;
let keys: Record<string, string> = JSON.parse(
  localStorage.getItem("iv-keys") ||
    '{"left":"ArrowLeft","right":"ArrowRight","jump":"ArrowUp","hit":"Space"}',
);
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
  app.innerHTML = `<div class="app-shell"><header class="topbar"><div class="brand"><span class="brand-mark">IV</span><span>IMPOSTOR <b>VOLLEYBALL</b></span></div><div class="top-actions"><button id="langBtn" class="ghost">${lang === "ko" ? "한국어" : "English"}</button><button id="settingsBtn" class="ghost">⚙ ${t("설정", "Settings")}</button></div></header><main id="view"></main><footer>FAN-MADE GAME PROTOTYPE · NOT AN OFFICIAL VS IMPOSTOR PRODUCT</footer></div>`;
  document.querySelector("#langBtn")!.addEventListener("click", () => {
    lang = lang === "ko" ? "en" : "ko";
    localStorage.setItem("iv-lang", lang);
    leaveOnline();
    renderHome();
  });
  document
    .querySelector("#settingsBtn")!
    .addEventListener("click", openSettings);
  renderHome();
}
function renderHome() {
  gameRunning = false;
  cancelAnimationFrame(frameRequest);
  held.clear();
  const v = document.querySelector<HTMLDivElement>("#view")!;
  v.innerHTML = `<section class="hero"><div class="hero-copy"><div class="eyebrow">⚡ ${t("친구들과 함께하는 우주 배구", "SPACE VOLLEYBALL WITH FRIENDS")}</div><h1>IMPOSTOR<br><em>VOLLEYBALL</em></h1><p>${t("임포스터를 선택하고 코트에 입장해!", "Pick your impostor and step onto the court!")}</p><div class="hero-buttons"><button class="primary" id="playBtn">${t("게임 시작", "PLAY")}</button><button class="secondary" id="onlineBtn">${t("온라인 방", "ONLINE ROOM")}</button></div></div><div class="hero-art"><div class="orbit orbit-a"></div><div class="orbit orbit-b"></div><img src="./assets/characters/red/idle.png" alt="Red"/><span class="hero-tag">4 COLORS · UP TO 8 PLAYERS</span></div></section><section class="feature-row"><div><b>01</b><span>${t("최대 4 vs 4", "UP TO 4 vs 4")}</span></div><div><b>02</b><span>${t("3개 맵", "3 MAPS")}</span></div><div><b>03</b><span>한국어 / English</span></div><div><b>04</b><span>${t("모바일 터치 조작", "MOBILE TOUCH")}</span></div></section>`;
  v.querySelector("#playBtn")!.addEventListener("click", () =>
    renderLobby(false),
  );
  v.querySelector("#onlineBtn")!.addEventListener("click", () =>
    renderLobby(true),
  );
}
function openSettings() {
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `<div class="modal"><div class="modal-head"><h2>${t("설정", "Settings")}</h2><button class="x">×</button></div><label class="toggle-line"><span><b>${t("모바일 모드", "Mobile mode")}</b><small>${t("화면에 터치 버튼 표시", "Show on-screen controls")}</small></span><input id="mobileToggle" type="checkbox" ${mobileMode ? "checked" : ""}></label><div class="setting-block"><h3>${t("개인 키 설정", "Key bindings")}</h3><p>${t("키 입력칸을 클릭한 뒤 원하는 키를 눌러.", "Click a field and press a key.")}</p><div class="key-grid">${[
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
  modal.querySelectorAll<HTMLInputElement>("[data-key]").forEach((input) => {
    input.addEventListener("click", () => input.focus());
    input.addEventListener("keydown", (e) => {
      e.preventDefault();
      keys[input.dataset.key!] = (e as KeyboardEvent).code;
      input.value = keys[input.dataset.key!];
    });
  });
  modal.querySelector(".save")!.addEventListener("click", () => {
    localStorage.setItem("iv-keys", JSON.stringify(keys));
    modal.remove();
  });
}
function renderLobby(online: boolean) {
  gameRunning = false;
  cancelAnimationFrame(frameRequest);
  held.clear();
  const v = document.querySelector<HTMLDivElement>("#view")!;
  let chosen: Color | null = null;
  v.innerHTML = `<section class="panel"><div class="panel-title"><div><div class="eyebrow">${online ? t("온라인 멀티플레이", "ONLINE MULTIPLAYER") : t("로컬 게임", "LOCAL GAME")}</div><h2>${t("경기 준비", "MATCH SETUP")}</h2></div><button class="ghost" id="back">← ${t("뒤로", "BACK")}</button></div><div class="setup-grid"><div class="setup-card"><h3>01 / ${t("캐릭터 선택", "CHARACTER SELECT")}</h3><p>${t("플레이할 캐릭터를 선택해.", "Choose your player character.")}</p><div class="character-grid">${COLORS.map((c) => `<button class="character-choice" data-color="${c}"><img src="./assets/characters/${c}/idle.png"><span>${c.toUpperCase()}</span></button>`).join("")}</div></div><div class="setup-card"><h3>02 / ${t("경기 설정", "MATCH SETTINGS")}</h3><label>${t("팀 모드", "TEAM MODE")}<select id="mode">${[1, 2, 3, 4].map((n) => `<option value="${n}" ${n === mode ? "selected" : ""}>${n} vs ${n}</option>`).join("")}</select></label><label>${t("경기 시간", "MATCH TIME")}<select id="time"><option value="60">1:00</option><option value="180">3:00</option><option value="300">5:00</option><option value="0">${t("무제한", "Unlimited")}</option></select></label><label>${t("맵", "MAP")}<select id="map">${Object.entries(
    MAPS,
  )
    .map(
      ([id, m]) =>
        `<option value="${id}" ${id === selectedMap ? "selected" : ""}>${m[lang]}</option>`,
    )
    .join(
      "",
    )}</select></label>${online ? `<div class="online-box"><h3>03 / ${t("6자리 숫자 방 코드", "6-DIGIT ROOM CODE")}</h3><label>${t("플레이어 이름", "Player name")}<input id="playerName" maxlength="16" placeholder="Player"></label><div class="room-row"><input id="roomCode" maxlength="6" inputmode="numeric" pattern="[0-9]{6}" autocomplete="off" placeholder="000000" value="${roomCode}"></div><div class="room-actions"><button class="primary" id="createRoomBtn">${t("방 만들기", "CREATE ROOM")}</button><button class="secondary" id="joinRoomBtn">${t("방 참가", "JOIN ROOM")}</button><button class="ghost" id="leaveRoomBtn">${t("방 나가기", "LEAVE ROOM")}</button></div><div id="roomState" class="room-state"></div><small>${t("서버 주소 없이 코드로 참가 · 방장 브라우저가 경기를 진행합니다. 인터넷 연결이 필요합니다.", "Join with a code · The host browser runs the match. Internet required.")}</small><p id="onlineStatus" class="status" role="status"></p></div>` : ""}<button class="primary full" id="startBtn">${online ? t("방장: 경기 시작", "HOST: START MATCH") : t("경기 시작", "START MATCH")}</button></div></div></section>`;
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
      if (online) selectOnlineCharacter(chosen);
    }),
  );
  v.querySelector<HTMLSelectElement>("#mode")!.addEventListener(
    "change",
    (e) => {
      mode = Number((e.target as HTMLSelectElement).value);
      syncRoomSettings();
    },
  );
  v.querySelector<HTMLSelectElement>("#time")!.addEventListener(
    "change",
    (e) => {
      matchSeconds = Number((e.target as HTMLSelectElement).value);
      syncRoomSettings();
    },
  );
  v.querySelector<HTMLSelectElement>("#map")!.addEventListener(
    "change",
    (e) => {
      selectedMap = (e.target as HTMLSelectElement).value as MapId;
      syncRoomSettings();
    },
  );
  v.querySelector<HTMLSelectElement>("#time")!.value = String(matchSeconds);
  if (online) {
    v.querySelector<HTMLButtonElement>("#startBtn")!.disabled =
      !currentRoom || !network.host;
    v.querySelector("#createRoomBtn")!.addEventListener(
      "click",
      createOnlineRoom,
    );
    v.querySelector("#joinRoomBtn")!.addEventListener("click", joinOnlineRoom);
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
  box.innerHTML = `<div class="room-code-card"><small>${t("친구에게 코드 공유하기", "SHARE WITH FRIENDS")}</small><strong>${room.code}</strong><button class="ghost" id="copyRoomCode">${t("코드 복사", "COPY CODE")}</button></div><div class="room-player-list">${room.players.map((p) => `<div class="room-player"><span class="player-dot ${COLORS.includes(p.color as Color) ? p.color : "none"}"></span><span>${escapeHtml(p.name)}</span><small>${p.team === 0 ? "A" : "B"} · ${p.color || t("미선택", "Choose color")}${p.id === room.hostId ? " ★" : ""}</small></div>`).join("")}</div><small>${room.players.length}/${room.settings.mode * 2} ${t("명 참가 중 · 같은 색도 선택 가능", "players · Colors can be reused")}</small>`;
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
  for (const id of ["createRoomBtn", "joinRoomBtn"]) {
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
    "Player"
  );
}
function connectionBusy() {
  for (const id of ["createRoomBtn", "joinRoomBtn"])
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
function joinOnlineRoom() {
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
  network.join(code, playerName());
}
network.onStatus = setOnlineStatus;
network.onRoom = (room) => {
  const first = !currentRoom;
  const color = chosenColor();
  currentRoom = room;
  roomCode = room.code;
  renderRoomState(room);
  if (first && color) network.select(color);
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
function startGame(color: Color, online: boolean) {
  cancelAnimationFrame(frameRequest);
  onlineGame = online;
  networkTick = 0;
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
  if (online && currentRoom) {
    players = currentRoom.players.map((member, i) => {
      const team = member.team;
      const position = currentRoom!.players
        .filter((p) => p.team === team)
        .findIndex((p) => p.id === member.id);
      return {
        id: i,
        peerId: member.id,
        team,
        color: member.color as Color,
        x: team === 0 ? 150 + position * 100 : 1130 - position * 100,
        y: floorY - 55,
        vy: 0,
        grounded: true,
        moving: false,
      };
    });
  }
  renderGame();
  lastFrame = performance.now();
  frameRequest = requestAnimationFrame(loop);
}
function renderGame() {
  const v = document.querySelector<HTMLDivElement>("#view")!;
  v.innerHTML = `<section class="game-wrap"><div class="game-hud"><div><small>${t("팀 블루", "TEAM A")}</small><b id="scoreA">0</b></div><div class="match-info"><b>${MAPS[selectedMap][lang]}</b><span id="timer">${matchSeconds ? formatTime(matchSeconds) : "∞"}</span></div><div><small>${t("팀 레드", "TEAM B")}</small><b id="scoreB">0</b></div><button id="exitGame" class="ghost">✕</button></div><div class="canvas-shell"><canvas id="court" width="1280" height="720"></canvas><div class="toast" id="toast"></div></div><div class="control-hint">${t("이동: 좌우 키 · 점프: 위쪽 키 · 공 치기: 스페이스", "Move: Left/Right · Jump: Up · Hit: Space")}</div>${mobileMode ? '<div class="touch-controls"><div><button data-hold="left">◀</button><button data-hold="right">▶</button></div><div><button data-hold="jump">▲</button><button data-hold="hit">●</button></div></div>' : ""}</section>`;
  canvas = document.querySelector<HTMLCanvasElement>("#court")!;
  ctx = canvas.getContext("2d")!;
  document.querySelector("#exitGame")!.addEventListener("click", () => {
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
  const toast = document.querySelector("#toast");
  if (toast)
    toast.textContent =
      score[0] === score[1]
        ? t("무승부!", "DRAW!")
        : score[0] > score[1]
          ? t("팀 블루 승리!", "TEAM A WINS!")
          : t("팀 레드 승리!", "TEAM B WINS!");
}
function update(dt: number) {
  players.forEach((p, i) => {
    const control = onlineGame
      ? network.inputs.get(p.peerId!) || {
          left: false,
          right: false,
          jump: false,
          hit: false,
        }
      : i === 0
        ? readControls()
        : {
            left: ball.x < p.x - 15,
            right: ball.x > p.x + 15,
            jump: ball.y < p.y - 90 && Math.abs(ball.x - p.x) < 90,
            hit: Math.abs(ball.x - p.x) < 100,
          };
    p.moving = control.left || control.right;
    if (control.left) p.x -= 5 * dt;
    if (control.right) p.x += 5 * dt;
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
