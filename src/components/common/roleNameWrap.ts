/**
 * 5 字及以上角色名的折行规则（全局统一）：
 * 第一行固定取前 3 个字，第二行取其余全部字符。
 *
 * 例：
 *   图书管理员   → ["图书管", "理员"]
 *   畸形秀演员   → ["畸形秀", "演员"]
 *   罂粟种植者   → ["罂粟种", "植者"]
 *   <= 4 字（如 共情者）→ 单行原样返回，交给容器的 whitespace-nowrap 处理。
 *
 * 注意：不要用 <wbr> —— CJK 本身允许任意位置断行，<wbr> 只是"额外的断点机会"，
 * 浏览器依然会贪心填满整行，5 字名会折成 4+1。这里用硬拆分成两个块级行。
 */
export function splitRoleNameLines(name?: string | null): string[] {
  const text = (name ?? "").trim();
  if (!text) return [""];
  if (text.length <= 4) return [text];
  return [text.slice(0, 3), text.slice(3)];
}
