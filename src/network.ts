import Peer, { type DataConnection } from "peerjs";
export type Settings = { mode: number; seconds: number; map: string };
export type Member = {
  id: string;
  name: string;
  color: string | null;
  team: 0 | 1;
};
export type Room = {
  code: string;
  hostId: string;
  settings: Settings;
  players: Member[];
};
export type Controls = {
  left: boolean;
  right: boolean;
  jump: boolean;
  hit: boolean;
};
const prefix = "impostor-volleyball-v3-";
const colors = ["red", "green", "yellow", "white"];
export class RoomNetwork {
  peer: Peer | null = null;
  connection: DataConnection | null = null;
  links = new Map<string, DataConnection>();
  room: Room | null = null;
  id = "";
  host = false;
  playing = false;
  inputs = new Map<string, Controls>();
  onRoom = (room: Room) => {};
  onStatus = (message: string) => {};
  onStart = (room: Room) => {};
  onFrame = (state: any) => {};
  onClose = () => {};
  private timer: ReturnType<typeof setTimeout> | undefined;
  private generation = 0;
  close() {
    this.generation++;
    clearTimeout(this.timer);
    this.peer?.destroy();
    this.peer = null;
    this.connection = null;
    this.links.clear();
    this.inputs.clear();
    this.room = null;
    this.host = false;
    this.playing = false;
  }
  private fail(message: string) {
    this.onStatus(message);
    this.close();
    this.onClose();
  }
  async create(name: string, settings: Settings) {
    this.close();
    this.host = true;
    const generation = this.generation;
    for (let attempt = 0; attempt < 8; attempt++) {
      if (generation !== this.generation) return;
      const number = new Uint32Array(1);
      crypto.getRandomValues(number);
      const code = String(number[0] % 1000000).padStart(6, "0");
      const peer = new Peer(prefix + code);
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
        });
      } catch (e: any) {
        peer.destroy();
        if (e.type === "unavailable-id") continue;
        if (generation === this.generation)
          this.fail("방 생성 실패 / Create failed: " + e.message);
        return;
      }
      if (generation !== this.generation) {
        peer.destroy();
        return;
      }
      this.id = peer.id;
      this.room = {
        code,
        hostId: this.id,
        settings,
        players: [
          { id: this.id, name: name.slice(0, 16), color: null, team: 0 },
        ],
      };
      peer.on("connection", (c) => this.accept(c));
      peer.on("error", (e) => this.onStatus(e.message));
      peer.on("disconnected", () =>
        this.fail(
          "연결 중개 서비스가 끊겼습니다. 방을 다시 만들어 주세요. / Signaling disconnected.",
        ),
      );
      this.publish();
      this.onStatus("방 생성 완료 / Room created");
      return;
    }
    this.fail("사용 가능한 코드 생성 실패. 다시 시도하세요. / Try again.");
  }
  join(code: string, name: string) {
    this.close();
    const generation = this.generation;
    const peer = new Peer();
    this.peer = peer;
    this.timer = setTimeout(() => {
      if (generation === this.generation)
        this.fail(
          "방을 찾을 수 없거나 연결이 차단되었습니다. / Room not found or connection blocked.",
        );
    }, 15000);
    peer.on("open", (id) => {
      if (generation !== this.generation) return;
      this.id = id;
      const c = peer.connect(prefix + code, {
        reliable: true,
        serialization: "json",
      });
      this.connection = c;
      c.on("open", () => c.send({ type: "join", name: name.slice(0, 16) }));
      c.on("data", (raw: any) => {
        if (generation !== this.generation) return;
        const m = raw;
        if (!m || typeof m !== "object") return;
        if (m.type === "room") {
          clearTimeout(this.timer);
          this.room = m.room;
          this.onRoom(m.room);
          this.onStatus("방 참가 완료 / Joined room");
        }
        if (m.type === "error") {
          this.fail(String(m.message));
          return;
        }
        if (m.type === "start") {
          this.playing = true;
          this.room = m.room;
          this.onStart(m.room);
        }
        if (m.type === "frame" && this.playing) this.onFrame(m.state);
      });
      c.on("close", () => {
        if (generation === this.generation)
          this.fail("방장이 방을 닫았습니다. / Host left the room.");
      });
      c.on("error", (e) => {
        if (generation === this.generation) this.fail(e.message);
      });
    });
    peer.on("error", (e) => {
      if (generation === this.generation)
        this.fail("참가 실패 / Join failed: " + e.message);
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
        !m ||
        typeof m !== "object" ||
        !this.room
      )
        return;
      if (m.type === "join" && !joined) {
        if (
          this.playing ||
          this.room.players.length >= this.room.settings.mode * 2
        ) {
          c.send({
            type: "error",
            message:
              "경기 중이거나 방이 가득 찼습니다. / Match started or room full.",
          });
          setTimeout(() => c.close(), 200);
          return;
        }
        if (this.links.has(c.peer)) {
          c.close();
          return;
        }
        joined = true;
        clearTimeout(timeout);
        this.links.set(c.peer, c);
        const a = this.room.players.filter((p) => p.team === 0).length,
          b = this.room.players.filter((p) => p.team === 1).length;
        this.room.players.push({
          id: c.peer,
          name: String(m.name || "Player").slice(0, 16),
          color: null,
          team: a <= b ? 0 : 1,
        });
        this.publish();
      } else if (joined && m.type === "select") this.selectFor(c.peer, m.color);
      else if (
        joined &&
        m.type === "input" &&
        m.controls &&
        typeof m.controls === "object"
      )
        this.inputs.set(c.peer, {
          left: !!m.controls.left,
          right: !!m.controls.right,
          jump: !!m.controls.jump,
          hit: !!m.controls.hit,
        });
    });
    c.on("close", () => {
      clearTimeout(timeout);
      if (generation !== this.generation || !joined || !this.room) return;
      this.links.delete(c.peer);
      this.inputs.delete(c.peer);
      this.room.players = this.room.players.filter((p) => p.id !== c.peer);
      this.publish();
      if (this.playing) {
        this.playing = false;
        this.broadcast({
          type: "error",
          message:
            "참가자가 나가 경기가 종료되었습니다. / Player left; match ended.",
        });
        this.onStatus(
          "참가자가 나가 경기가 종료되었습니다. / Player left; match ended.",
        );
        this.onClose();
      }
    });
    c.on("error", () => c.close());
  }
  private broadcast(message: any) {
    for (const c of this.links.values()) if (c.open) c.send(message);
  }
  private publish() {
    if (this.room) {
      this.broadcast({ type: "room", room: this.room });
      this.onRoom(this.room);
    }
  }
  select(color: string) {
    if (this.host) this.selectFor(this.id, color);
    else this.connection?.send({ type: "select", color });
  }
  private selectFor(id: string, color: string) {
    if (!this.room || this.playing || !colors.includes(color)) return;
    const member = this.room.players.find((p) => p.id === id);
    if (member) {
      member.color = color;
      this.publish();
    }
  }
  settings(settings: Settings) {
    if (!this.host || !this.room || this.playing) return;
    if (
      ![1, 2, 3, 4].includes(settings.mode) ||
      ![0, 60, 180, 300].includes(settings.seconds) ||
      !["polus", "mira", "defeat"].includes(settings.map)
    )
      return;
    if (this.room.players.length > settings.mode * 2) {
      this.onStatus(
        "참가 인원보다 작은 모드는 선택할 수 없습니다. / Too many players for this mode.",
      );
      this.publish();
      return;
    }
    this.room.settings = settings;
    this.room.players.forEach((p, i) => (p.team = (i % 2) as 0 | 1));
    this.publish();
  }
  start() {
    if (!this.host || !this.room) return;
    const r = this.room;
    if (r.players.length < 2 || r.players.some((p) => !p.color)) {
      this.onStatus(
        "최소 2명이 참가하고 모두 캐릭터를 선택해야 합니다. / At least two players must select characters.",
      );
      return;
    }
    this.playing = true;
    this.broadcast({ type: "start", room: r });
    this.onStart(r);
  }
  input(controls: Controls) {
    if (this.host) this.inputs.set(this.id, controls);
    else if (this.connection?.open)
      this.connection.send({ type: "input", controls });
  }
  frame(state: any) {
    if (this.host) this.broadcast({ type: "frame", state });
  }
}
