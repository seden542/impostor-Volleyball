import type { Difficulty } from "./profile";
import type { Controls } from "./network";
const levels = {
  easy: { speed: 2.5, reaction: 28, error: 80, reach: 65, prediction: 0 },
  normal: { speed: 3.8, reaction: 15, error: 30, reach: 90, prediction: 9 },
  hard: { speed: 4.8, reaction: 6, error: 10, reach: 105, prediction: 18 },
};
export type BotMemory = { next: number; target: number; decision: number };
export function botDecision(
  level: Difficulty,
  clock: number,
  p: { x: number; y: number; team: 0 | 1 },
  ball: { x: number; y: number; vx: number; vy: number },
  memory: BotMemory,
): Controls {
  const settings = levels[level];
  if (clock >= memory.next) {
    memory.next = clock + settings.reaction;
    memory.decision++;
    // Deterministic error changes at each decision; reacts more slowly on easy.
    const error =
      Math.sin(memory.decision * 2.399 + p.team * 1.7) * settings.error;
    memory.target = Math.max(
      p.team === 0 ? 45 : 685,
      Math.min(
        p.team === 0 ? 595 : 1235,
        ball.x + ball.vx * settings.prediction + error,
      ),
    );
  }
  const distance = Math.abs(ball.x - p.x);
  return {
    left: p.x > memory.target + 12,
    right: p.x < memory.target - 12,
    jump: ball.y < p.y - 65 && ball.y > p.y - 210 && distance < settings.reach,
    hit: distance < settings.reach && Math.abs(ball.y - p.y) < 115,
  };
}
export function botSpeed(level: Difficulty) {
  return levels[level].speed;
}
