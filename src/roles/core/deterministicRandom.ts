/**
 * 夜间信息生成用的「确定性随机数」。
 *
 * ## 为什么需要它
 * 同一夜间行动在本项目里会被计算两次：
 *   1. 预演：生成「当前的行动」提示文本（说书人照着念）；
 *   2. 执行：真正跑完整管道，生成结果弹窗与魔典标记。
 * 若两处都直接调用 `Math.random()`，凡是「随机挑人 / 随机挑角色」的能力
 * 就会算出两份互不相同的信息。
 *
 * 实测复现（7 人局·暗流涌动，4号酒鬼伪装图书管理员）：
 *   提示：「6号和1号其中一位是【圣徒】」
 *   结果：「7号和2号之中有一名是【陌客】」
 * 说书人照提示念、魔典却按结果标记，两边对不上，会直接导致开局错误。
 *
 * ## 做法
 * 以 `(能力ID, 行动者座位, 夜次)` 作为种子，使同一夜、同一角色的重复计算
 * 得到**完全相同**的随机序列；跨夜、跨角色仍然各不相同。
 */

/** 生成随机数函数：(0, 1) 均匀分布，语义与 `Math.random()` 一致 */
export type DeterministicRandom = () => number;

/** FNV-1a 字符串哈希：把种子串折叠成 32 位整数 */
function hashSeed(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/**
 * 由字符串种子构造确定性随机序列（mulberry32）。
 * 同一种子必定产生同一序列，可直接替代 `Math.random` 使用。
 */
export function createDeterministicRandom(seed: string): DeterministicRandom {
  let state = hashSeed(seed);
  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 构造夜间信息种子的统一格式。
 * 同一夜内同角色恒定，跨夜自动变化。
 */
export function nightInfoSeed(
  abilityId: string,
  actorId: number,
  nightCount: number
): string {
  return `nightinfo|${abilityId}|${actorId}|${nightCount}`;
}
