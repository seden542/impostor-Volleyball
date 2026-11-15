import Peer, { type DataConnection } from "peerjs";
export type Settings = { mode: number; seconds: number; map: string };
export type Member = {
  id: string;
  name: string;
  color: string | null;
  team: 0 | 1;
  spectator: boolean;
};
export type Room = {
  code: string;
  hostId: string;
  settings: Settings;
  players: Member[];
  matchmaking: boolean;
  playing: boolean;
};
export type Controls = {
  left: boolean;
  right: boolean;
  jump: boolean;
  hit: boolean;
};
const prefix = "impostor-volleyball-v4-";
const colors = ["red", "green", "yellow", "white"];
const validSettings = (s: Settings) =>
  s &&
  [1, 2, 3, 4].includes(s.mode) &&
  [0, 60, 180, 300].includes(s.seconds) &&
  ["polus", "mira", "defeat"].includes(s.map);
export class RoomNetwork {
  peer: Peer | null = null;
  connection: DataConnection | null = null;
  links = new Map<string, DataConnection>();
  room: Room | null = null;
  id = "";
  host = false;
  playing = false;
  searching = false;
  inputs = new Map<string, Controls>();
  lastFrame: any = null;
  onRoom = (room: Room) => {};
  onStatus = (message: string) => {};
  onStart = (room: Room) => {};
  onFrame = (state: any) => {};
  onClose = () => {};
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private inputTimes = new Map<string, number>();
  private release() {
    this.generation++;
    clearTimeout(this.timer);
    const peer = this.peer;
    this.peer = null;
    this.connection = null;
    this.links.clear();
    this.inputs.clear();
    this.inputTimes.clear();
    this.room = null;
    this.host = false;
    this.playing = false;
    this.lastFrame = null;
    peer?.destroy();
  }
  close() {
    this.searching = false;
    this.release();
  }
  private fail(message: string) {
    this.onStatus(message);
    this.close();
    this.onClose();
  }
  private async openPeer(id?: string) {
    const generation = this.generation;
    const peer = id ? new Peer(id) : new Peer();
    this.peer = peer;
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () =>
            reject(
              new Error("연결 중개 서비스 응답 없음 / Signaling timed out"),
            ),
          12000,
        );
        peer.once("open", () => {
          clearTimeout(timer);
          resolve();
        });
        peer.once("error", (e) => {
          clearTimeout(timer);
          reject(e);
        });
        peer.once("close", () => {
          clearTimeout(timer);
          reject(new Error("Cancelled"));
        });
      });
    } catch (e) {
      peer.destroy();
      throw e;
    }
    if (generation !== this.generation) {
      peer.destroy();
      throw new Error("Cancelled");
    }
    this.id = peer.id;
    peer.on("error", (e) => {
      if (generation === this.generation) this.onStatus(e.message);
    });
    peer.on("disconnected", () => {
      if (generation === this.generation)
        this.fail(
          "연결이 끊겼습니다. 다시 참가해주세요. / Signaling disconnected.",
        );
    });
    return peer;
  }
  async create(name: string, settings: Settings) {
    this.close();
    if (!validSettings(settings)) return;
    const generation = this.generation;
    for (let attempt = 0; attempt < 8; attempt++) {
      const n = new Uint32Array(1);
      crypto.getRandomValues(n);
      const code = String(n[0] % 990000).padStart(6, "0");
      try {
        await this.hostRoom(code, name, settings, false);
        return;
      } catch (e: any) {
        if (generation !== this.generation) return;
        if (e.type === "unavailable-id") continue;
        this.fail("방 생성 실패 / Create failed: " + e.message);
        return;
      }
    }
    this.fail("방 코드 생성 실패. 다시 시도해주세요. / Try again.");
  }
  private async hostRoom(
    code: string,
    name: string,
    settings: Settings,
    matchmaking: boolean,
  ) {
    const peer = await this.openPeer(prefix + code);
    this.host = true;
    this.room = {
      code,
      hostId: this.id,
      settings: { ...settings },
      matchmaking,
      playing: false,
      players: [
        {
          id: this.id,
          name: name.slice(0, 16),
          color: matchmaking ? "red" : null,
          team: 0,
          spectator: false,
        },
      ],
    };
    peer.on("connection", (c) => this.accept(c));
    this.publish();
    this.onStatus(
      matchmaking
        ? "상대를 기다리는 중… 취소하려면 방 나가기 / Waiting for an opponent…"
        : "방 생성 완료 / Room created",
    );
  }
  async join(code: string, name: string, spectator = false) {
    this.close();
    const generation = this.generation;
    try {
      await this.connectRoom(code, name, spectator, false);
    } catch (e: any) {
      if (generation === this.generation)
        this.fail("참가 실패 / Join failed: " + e.message);
    }
  }
  // The first free public slot becomes a waiting host. An occupied slot is joined;
  // full/started rooms are skipped. No peer directory or dedicated matchmaking server.
  async randomMatch(name: string) {
    this.close();
    this.searching = true;
    for (let slot = 0; slot < 32 && this.searching; slot++) {
      const generation = this.generation;
      const code = String(990000 + slot);
      this.onStatus(`랜덤 매치 검색 중… ${slot + 1}/32 / Finding an opponent…`);
      try {
        await this.hostRoom(
          code,
          name,
          { mode: 1, seconds: 180, map: "polus" },
          true,
        );
        return;
      } catch (e: any) {
        if (generation !== this.generation || !this.searching) return;
        if (e.type !== "unavailable-id") {
          this.fail("매칭 연결 실패 / Matchmaking failed: " + e.message);
          return;
        }
      }
      this.release();
      const joinGeneration = this.generation;
      try {
        await this.connectRoom(code, name, false, true);
        return;
      } catch {
        if (joinGeneration !== this.generation || !this.searching) return;
        this.release();
      }
    }
    if (this.searching)
      this.fail(
        "대기 공간이 가득 찼습니다. 잠시 후 다시 시도해주세요. / Matchmaking busy. Try again.",
      );
  }
  private async connectRoom(
    code: string,
    name: string,
    spectator: boolean,
    matchmaking: boolean,
  ) {
    const peer = await this.openPeer();
    const generation = this.generation;
    return new Promise<void>((resolve, reject) => {
      let admitted = false;
      const c = peer.connect(prefix + code, {
        reliable: true,
        serialization: "json",
      });
      this.connection = c;
      const rejectPending = (e: Error) => {
        clearTimeout(this.timer);
        reject(e);
      };
      this.timer = setTimeout(
        () =>
          rejectPending(
            new Error(
              "방을 찾을 수 없거나 연결이 차단되었습니다. / Room not found or connection blocked.",
            ),
          ),
        12000,
      );
      c.on("open", () =>
        c.send({
          type: "join",
          name: name.slice(0, 16),
          spectator,
          matchmaking,
        }),
      );
      c.on("data", (m: any) => {
        if (generation !== this.generation || !m || typeof m !== "object")
          return;
        if (m.type === "reject") {
          rejectPending(new Error(String(m.message)));
          return;
        }
        if (m.type === "error") {
          this.fail(String(m.message));
          return;
        }
        if (m.type === "room") {
          clearTimeout(this.timer);
          admitted = true;
          this.room = m.room;
          this.onRoom(m.room);
          this.onStatus(
            spectator ? "관전 중 / Spectating" : "방 참가 완료 / Joined room",
          );
          resolve();
        }
        if (m.type === "start") {
          this.playing = true;
          this.searching = false;
          this.room = m.room;
          this.onStart(m.room);
        }
        if (m.type === "frame" && this.playing) this.onFrame(m.state);
      });
      c.on("close", () => {
        if (generation !== this.generation) return;
        if (!admitted)
          rejectPending(
            new Error("방에 참가할 수 없습니다. / Room unavailable."),
          );
        else this.fail("방장이 방을 닫았습니다. / Host left the room.");
      });
      c.on("error", (e) => {
        if (generation !== this.generation) return;
        if (!admitted) rejectPending(e);
        else this.fail(e.message);
      });
      peer.on("error", (e) => {
        if (generation === this.generation && !admitted) rejectPending(e);
      });
    });
  }
  private accept(c: DataConnection) {
    const generation = this.generation;
    let joined = false;
    const timeout = setTimeout(() => {
      if (!joined) c.close();
    }, 10000);
    c.on("data", (m: any) => {
      if (
        generation !== this.generation ||
        !this.host ||
        !this.room ||
        !m ||
        typeof m !== "object"
      )
        return;
      if (m.type === "join" && !joined) {
        const spectator = m.spectator === true;
        const active = this.room.players.filter((p) => !p.spectator);
        const reject = (message: string) => {
          c.send({ type: "reject", message });
          setTimeout(() => c.close(), 200);
        };
        if (m.matchmaking === true && (!this.room.matchmaking || this.playing))
          return reject("현재 매칭 불가 / Match unavailable");
        if (
          spectator
            ? this.room.players.filter((p) => p.spectator).length >= 16
            : this.playing || active.length >= this.room.settings.mode * 2
        )
          return reject(
            "경기 중이거나 방이 가득 찼습니다. 관전으로 참가할 수 있습니다. / Match started or room full; try spectating.",
          );
        if (this.links.has(c.peer)) {
          c.close();
          return;
        }
        joined = true;
        clearTimeout(timeout);
        this.links.set(c.peer, c);
        this.room.players.push({
          id: c.peer,
          name: String(m.name || "Player").slice(0, 16),
          color: this.room.matchmaking && !spectator ? "green" : null,
          team:
            active.filter((p) => p.team === 0).length <=
            active.filter((p) => p.team === 1).length
              ? 0
              : 1,
          spectator,
        });
        this.publish();
        if (this.playing) {
          c.send({ type: "start", room: this.room });
          if (this.lastFrame) c.send({ type: "frame", state: this.lastFrame });
        } else if (
          this.room.matchmaking &&
          this.room.players.filter((p) => !p.spectator).length === 2
        )
          this.start();
      } else if (joined && m.type === "select") this.selectFor(c.peer, m.color);
      else if (joined && m.type === "role")
        this.roleFor(c.peer, m.spectator === true);
      else if (
        joined &&
        m.type === "input" &&
        m.controls &&
        this.room.players.some((p) => p.id === c.peer && !p.spectator)
      ) {
        this.inputs.set(c.peer, {
          left: !!m.controls.left,
          right: !!m.controls.right,
          jump: !!m.controls.jump,
          hit: !!m.controls.hit,
        });
        this.inputTimes.set(c.peer, performance.now());
      }
    });
    c.on("close", () => {
      clearTimeout(timeout);
      if (generation !== this.generation || !joined || !this.room) return;
      const departed = this.room.players.find((p) => p.id === c.peer);
      this.links.delete(c.peer);
      this.inputs.delete(c.peer);
      this.inputTimes.delete(c.peer);
      this.room.players = this.room.players.filter((p) => p.id !== c.peer);
      this.publish();
      if (this.playing && !departed?.spectator) {
        this.broadcast({
          type: "error",
          message:
            "참가자가 나가 경기가 종료되었습니다. / Player left; match ended.",
        });
        this.fail(
          "참가자가 나가 경기가 종료되었습니다. / Player left; match ended.",
        );
      }
    });
    c.on("error", () => c.close());
  }
  private broadcast(message: any) {
    for (const c of this.links.values()) if (c.open) c.send(message);
  }
  private publish() {
    if (this.room) {
      this.room.playing = this.playing;
      this.broadcast({ type: "room", room: this.room });
      this.onRoom(this.room);
    }
  }
  select(color: string) {
    if (this.host) this.selectFor(this.id, color);
    else if (this.connection?.open)
      this.connection.send({ type: "select", color });
  }
  private selectFor(id: string, color: string) {
    if (!this.room || this.playing || !colors.includes(color)) return;
    const member = this.room.players.find((p) => p.id === id && !p.spectator);
    if (member) {
      member.color = color;
      this.publish();
    }
  }
  role(spectator: boolean) {
    if (this.host) this.roleFor(this.id, spectator);
    else if (this.connection?.open)
      this.connection.send({ type: "role", spectator });
  }
  private roleFor(id: string, spectator: boolean) {
    if (!this.room || this.playing || this.room.matchmaking) return;
    const member = this.room.players.find((p) => p.id === id);
    if (!member || member.id === this.room.hostId) return;
    if (spectator && this.room.players.filter((p) => p.spectator).length >= 16)
      return;
    const active = this.room.players.filter((p) => !p.spectator && p.id !== id);
    if (!spectator && active.length >= this.room.settings.mode * 2) {
      this.onStatus("선수 자리가 없습니다. / No player slot available.");
      return;
    }
    member.spectator = spectator;
    member.color = null;
    member.team =
      active.filter((p) => p.team === 0).length <=
      active.filter((p) => p.team === 1).length
        ? 0
        : 1;
    this.publish();
  }
  settings(settings: Settings) {
    if (!this.host || !this.room || !validSettings(settings)) return;
    const active = this.room.players.filter((p) => !p.spectator);
    if (active.length > settings.mode * 2) {
      this.onStatus(
        "참가 인원보다 작은 모드는 선택할 수 없습니다. / Too many players for this mode.",
      );
      this.publish();
      return;
    }
    if (this.room.matchmaking && !this.playing) {
      this.onStatus(
        "랜덤 매치는 1대1로 시작합니다. / Random matches start as 1v1.",
      );
      return;
    }
    if (this.room.settings.mode !== settings.mode)
      active.forEach((p, i) => (p.team = (i % 2) as 0 | 1));
    this.room.settings = { ...settings };
    this.publish();
  }
  start() {
    if (!this.host || !this.room || this.playing) return;
    const active = this.room.players.filter((p) => !p.spectator);
    if (active.length < 2 || active.some((p) => !p.color)) {
      this.onStatus(
        "최소 2명의 선수가 캐릭터를 선택해야 합니다. / At least two players must select characters.",
      );
      return;
    }
    this.playing = true;
    this.searching = false;
    this.inputs.clear();
    this.lastFrame = null;
    this.publish();
    this.broadcast({ type: "start", room: this.room });
    this.onStart(this.room);
  }
  input(controls: Controls) {
    if (this.room?.players.find((p) => p.id === this.id)?.spectator) return;
    if (this.host) {
      this.inputs.set(this.id, controls);
      this.inputTimes.set(this.id, performance.now());
    } else if (this.connection?.open)
      this.connection.send({ type: "input", controls });
  }
  controls(id: string): Controls {
    if (performance.now() - (this.inputTimes.get(id) || 0) > 1000)
      return { left: false, right: false, jump: false, hit: false };
    return (
      this.inputs.get(id) || {
        left: false,
        right: false,
        jump: false,
        hit: false,
      }
    );
  }
  frame(state: any) {
    if (this.host) {
      this.lastFrame = state;
      this.broadcast({ type: "frame", state });
    }
  }
}
