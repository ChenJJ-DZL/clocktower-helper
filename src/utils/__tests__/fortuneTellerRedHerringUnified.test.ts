/**
 * 占卜师「天敌红罗刹」单一来源护栏（2026-09-14）
 *
 * 背景（用户实测缺陷）：
 *  项目曾同时存在**两套彼此独立**的红罗刹机制 ——
 *   ① 座位标记 `isRedHerring` / `isFortuneTellerRedHerring`
 *      （`useGameFlow` 开局写入、说书人可见、随快照存档）
 *   ② 内存 Map `fortuneTellerBoonManager`（占卜师能力内部 `initializeBoon`
 *      又自己随机挑一次、说书人不可见、不存档）
 *
 *  官方规则只允许**恰好 1 名**天敌红罗刹 → 两套各自随机必然打架：
 *  说书人标记 3 号、能力随机到 2 号，于是「占卜两名善良玩家报『有』」
 *  这种**凭空捏造恶魔**的结果；无标记局同样会随机造出假恶魔。
 *
 *  现已收敛：**座位标记是唯一权威来源**，内存 Boon 只是它的缓存视图；
 *  两者都缺位时**不启用干扰项**（绝不随机发明红罗刹）。
 *
 * 本文件是**护栏**：静态扫描占卜师能力文件，禁止再引入"能力内部自选干扰项"。
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ABILITY_FILE = "src/roles/new_engine/fortune_teller.ability.ts";

function readCodeLines(file: string): string[] {
  const root = process.cwd();
  const full = path.join(root, file);
  if (!fs.existsSync(full)) return [];
  return fs
    .readFileSync(full, "utf8")
    .split(/\r?\n/)
    .filter((l) => {
      const t = l.trim();
      return !(t.startsWith("*") || t.startsWith("//") || t.startsWith("/*"));
    });
}

describe("占卜师天敌红罗刹单一来源护栏", () => {
  it("⭐⭐ initializeBoon 内不得再调用 pickBoonSeatId（禁止能力内部自选干扰项）", () => {
    const lines = readCodeLines(ABILITY_FILE);
    const start = lines.findIndex((l) => l.includes("function initializeBoon("));
    expect(start, "未找到 initializeBoon 函数").toBeGreaterThan(-1);

    // 从函数头扫到下一个顶层函数注释/声明为止
    const body: string[] = [];
    for (let i = start + 1; i < lines.length; i++) {
      const l = lines[i];
      if (/^(function|export function|const \w+ = async)/.test(l)) break;
      body.push(l);
    }

    const offenders = body
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => /pickBoonSeatId\s*\(/.test(l))
      .map(({ l, i }) => `+${i + 1}: ${l.trim()}`);

    expect(
      offenders,
      `initializeBoon 不得自行随机挑干扰项（红罗刹只能由说书人开局放置）：\n${offenders.join("\n")}`
    ).toEqual([]);
  });

  it("⭐ initializeBoon 必须优先读取座位标记（findSeatFlaggedRedHerring）", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), ABILITY_FILE),
      "utf8"
    );
    expect(src).toContain("findSeatFlaggedRedHerring");
  });

  it("⭐ 不得再出现「兜底随机 raven 红罗刹」式提示", () => {
    const lines = readCodeLines(ABILITY_FILE);
    const offenders = lines
      .filter(
        (l) =>
          /兜底随机/.test(l) ||
          /Boon initialized: FT=/.test(l) // 旧的随机初始化日志
      )
      .map((l) => l.trim());
    expect(offenders).toEqual([]);
  });
});
