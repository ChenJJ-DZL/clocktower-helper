import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { enterFirstNight, waitForSnapshot } from "../helpers/scriptFlow";

/**
 * 🧱 强制阵容地基验证
 * ------------------------------------------------------------------
 * 这是「27 场逐角色用例」能不能落地的前提：如果发牌器不认
 * `window.__CT_FORCE_LINEUP__`，后面所有场次都只能靠随机碰角色。
 *
 * 断言的是**发出来的牌 === 注入的牌**（多重集合相等；座位由「随机落座」决定，
 * 所以不比座位号，只比角色集合）。
 *
 * 只跑 1 场（S01，暗流涌动 15 人），作为地基 smoke；
 * 27 场全量由 `scenes.spec.ts` 承担（按 scenes.json 逐场执行）。
 */
type Seat = { id: string; name: string; type: string };
type Game = {
  id: string;
  seed: number;
  players: number;
  counts: Record<string, number>;
  seats: Seat[];
};

const scenesPath = path.resolve(__dirname, "../../outputs/scenes.json");

function loadScene(id: string): { script: string; game: Game } {
  const raw = JSON.parse(fs.readFileSync(scenesPath, "utf-8"));
  for (const s of raw.scripts as any[]) {
    for (const g of s.games as Game[]) {
      if (g.id === id) return { script: s.script, game: g };
    }
  }
  throw new Error(`scenes.json 里找不到场次 ${id}`);
}

test.describe("强制阵容地基", () => {
  test.setTimeout(4 * 60 * 1000);

  test("S01 · 注入的 15 个角色就是发出的 15 个角色", async ({ page }) => {
    const { script, game } = loadScene("S01");
    const lineup = game.seats.map((s) => s.id);

    await enterFirstNight(page, game.players, script, game.seed, lineup);

    const snap = await waitForSnapshot(
      page,
      (s) => Array.isArray(s?.seats) && s.seats.filter((x: any) => x.role).length === game.players,
      20_000
    );
    expect(snap?.seats, "进入首夜后应有快照").toBeTruthy();

    const dealt = (snap.seats as any[])
      .filter((s) => s.role)
      .map((s) => String(s.role.id))
      .sort();
    expect(dealt).toEqual([...lineup].sort());

    // 配比也要对：恶魔 1、爪牙 3（S01 = 15 人 9/2/3/1）
    const byType = (t: string) => snap.seats.filter((s: any) => s.role?.type === t).length;
    expect(byType("demon")).toBe(game.counts.demon);
    expect(byType("minion")).toBe(game.counts.minion);
    expect(byType("outsider")).toBe(game.counts.outsider);
    expect(byType("townsfolk")).toBe(game.counts.townsfolk);
  });
});
