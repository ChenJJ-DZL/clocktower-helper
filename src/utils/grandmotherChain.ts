/**
 * 👵 祖母（Grandmother）连带死亡 —— 官方规则唯一实现
 * ============================================================================
 * 官方【角色能力】：「在你的首个夜晚，你会得知一名善良玩家是**你的孙子**。
 *   如果**恶魔杀死了他**，**你也会死**。」
 *
 * ─── 为什么单独抽一个文件 ──────────────────────────────────────────────────
 * 祖母**不是被唤醒的角色**，而是「别人死了我也死」——
 *   ⇒ 判据不能写在 `grandmother.ability.ts`（那是「首夜得知孙子」，只有 FIRST_NIGHT 段），
 *   ⇒ 也不能靠死亡触发唤醒队列（她不需要被唤醒，她要直接死）。
 * 唯一正确的接入点是**击杀咽喉** `useGameController::killPlayer`（夜杀/处决/能力击杀都过它）。
 *
 * 抽成纯函数的原因：`killPlayer` 住在 hook 里无法单测；
 * 判据抽出来后「哪些角色算恶魔杀」「谁会连带死」都能直接断言。
 *
 * ⚠️ 死因必须真的是**恶魔**（官方原文限定）：
 *   · 刺客（assassin）刺杀不算 ⇒ 不触发
 *   · 处决不算 ⇒ 不触发
 *   · 毒杀/诅咒等「非恶魔直接击杀」不算 ⇒ 不触发
 *   （说书人若想判定为恶魔杀，走 `deathSource` 的显式值即可）
 */

import type { Role, Seat } from "../../app/data";

/** 明确的「恶魔击杀」死因字面量（引擎里实际出现的几种写法） */
const DEMON_KILL_SOURCES = new Set([
  "demon",
  "demon_kill",
  "imp",
  "imp_kill",
  "kill_by_demon",
]);

/**
 * 该死因是否算「被恶魔杀死」。
 *
 * @param source 座位上的 `deathSource`（或调用 `killPlayer` 时传的 `source`）
 * @param roles  本局可用角色表（用于把 `pukka` / `shabaloth` 这类**角色 id 当死因**的情况认出来）
 */
export function isDemonKillSource(
  source: string | null | undefined,
  roles?: ReadonlyArray<Pick<Role, "id" | "type">> | null
): boolean {
  if (!source) return false;
  // 处决永远不算（哪怕被执行者是恶魔杀的假象）
  if (source === "execution") return false;
  if (DEMON_KILL_SOURCES.has(source)) return true;
  // 角色 id 当死因：只有 type === "demon" 才算
  if (Array.isArray(roles)) {
    const r = roles.find((x) => x.id === source);
    if (r?.type === "demon") return true;
  }
  return false;
}

/**
 * 找出「因孙子被恶魔杀死而必须同死」的祖母座位。
 *
 * @param seats      死亡落库**之后**的座位表（死者 `isDead === true`）
 * @param deadSeatId 刚死亡的座位
 * @param byDemon    该死亡是否算「被恶魔杀死」
 * @returns 需要连带死亡的祖母座位 id（可为空）
 */
export function resolveGrandmotherChainDeaths(
  seats: ReadonlyArray<Seat & { grandchildId?: number | null }>,
  deadSeatId: number,
  byDemon: boolean
): number[] {
  if (!byDemon) return [];
  const out: number[] = [];
  for (const s of seats) {
    if (s.isDead) continue;
    if (s.role?.id !== "grandmother") continue;
    const gid = (s as { grandchildId?: number | null }).grandchildId;
    if (gid === deadSeatId) out.push(s.id);
  }
  return out;
}
