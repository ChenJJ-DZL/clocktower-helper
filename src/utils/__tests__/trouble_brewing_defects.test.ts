/**
 * 暗流涌动 · 缺陷回归（2026-09-13 全量测试发现）
 *
 * 本轮发现并修复 2 处缺陷：
 *
 *  P1-1 厨师：受干扰（醉酒/中毒）时的假「相邻邪恶对数」上界是**与棋盘无关的常量**
 *       （`CHEF_FAKE_MAX = 5`）→ 7~8 人局（邪恶 2 人 → 相邻对最多 1 对）会报出
 *       「5 对」这种**物理不可能**的值。说书人真的照念/比 5 根手指 →
 *       玩家一眼看出数字不可能 → **直接暴露厨师被醉酒/中毒**，
 *       而醉酒/中毒的全部意义就是"玩家不该知道"→ 信息泄漏级缺陷。
 *       修法：上界 = 本局棋盘「注册为邪恶的人数 - 1」，三处（引擎/提示预演/
 *       玩家结果页）共用同一上界 → 保持既有的「三处一致」不变量。
 *
 *  P2-1 管家：`wake` 只有「唤醒N号玩家（管家）。」—— 缺行动说明，
 *       且格式与同类夜间选目标角色（僧侣/投毒者/间谍）不一致。
 *       官方：「每个夜晚，你要选择除你以外的一名玩家：明天白天，只有他投票时
 *       你才能投票。」→ 说书人看到的引导必须包含"选主人"这件事。
 */
import { describe, expect, it } from "vitest";
import { roles, scripts } from "../../../app/data";
import { ENGINE_CONFIG } from "../../hooks/useNightEngine";
import { initializeAbilityRegistry } from "../../roles/new_engine/abilityRegistry";
import {
  chefMaxPlausiblePairs,
  countChefEvilPairsForUi,
  pickChefFakePairCount,
} from "../../roles/new_engine/chef.ability";
import { butler } from "../../roles/outsider/butler";
import { chef } from "../../roles/townsfolk/chef";
import { buildCorruptedInfoMask, pickFakeNumber } from "../corruptedInfo";
import { calculateNightInfoViaNewEngine } from "../nightInfoAdapter";

const r = (id: string) => roles.find((x) => x.id === id)!;
const TB = scripts.find((s) => s.id === "trouble_brewing")!;

/**
 * 8 席棋盘：邪恶 = 4号投毒者 + 5号小恶魔（相邻 2 人）
 * → 相邻邪恶对真值 = 1；邪恶人数 = 2 → 物理上界 = 1
 */
function makeBoard(): any[] {
  const layout = [
    [0, "chef"],
    [1, "washerwoman"],
    [2, "butler"],
    [3, "soldier"],
    [4, "poisoner"],
    [5, "imp"],
    [6, "mayor"],
    [7, "empath"],
  ] as const;
  return layout.map(([id, rid]) => ({
    id,
    playerName: `P${id + 1}`,
    role: r(rid),
    isDead: false,
    isDrunk: false,
    isPoisoned: false,
    statusEffects: [],
  }));
}

describe("暗流涌动 · 缺陷回归", () => {
  initializeAbilityRegistry();
  const seats = makeBoard();

  describe("P1-1 厨师假对数上界必须来自本局棋盘", () => {
    it("物理上界 = 注册为邪恶的人数 - 1（本局 8 席 / 2 邪恶 → 1）", () => {
      expect(countChefEvilPairsForUi(seats), "真值应为 1 对").toBe(1);
      expect(
        chefMaxPlausiblePairs(seats),
        "上界应为 邪恶人数(2) - 1 = 1；旧实现是常量 5"
      ).toBe(1);
    });

    it("⭐ 任一夜 / 任一行动者，假对数都不超过棋盘上界（旧实现会给出 5）", () => {
      const cap = chefMaxPlausiblePairs(seats);
      const real = countChefEvilPairsForUi(seats);
      for (let night = 1; night <= 3; night++) {
        for (let seatId = 0; seatId < seats.length; seatId++) {
          const fake = pickChefFakePairCount(real, seatId, night, cap);
          expect(
            fake,
            `第${night}夜 座位${seatId}：假对数 ${fake} 超过棋盘上界 ${cap}`
          ).toBeLessThanOrEqual(cap);
          expect(
            fake,
            `第${night}夜 座位${seatId}：假对数不得等于真值`
          ).not.toBe(real);
        }
      }
    });

    it("⭐ 三处一致：引擎结算文本 / 提示预演 / 玩家结果页脱敏值完全相同", () => {
      // ⚠️ 厨师官方是「在你的**首个夜晚**」→ 只在首夜产出；
      //    用第 2 夜调 adapter 会拿到空结果（会误判成"引擎没产出数字"）。
      const nightCount = 1;
      const seatId = 0;
      const cap = chefMaxPlausiblePairs(seats);
      const real = countChefEvilPairsForUi(seats);

      // ② 提示预演（dialog 走的就是 pickChefFakePairCount + chefMaxPlausiblePairs）
      const dialogResult = chef.firstNight!.dialog!(
        seatId,
        false,
        {
          seats,
          nightCount,
          isActorDisabledByPoisonOrDrunk: () => true,
        } as any
      ) as any;
      const dialogPairs = Number(
        String(dialogResult.wake).match(/有\s*(\d+)\s*对/)?.[1]
      );
      expect(dialogPairs, "提示预演未取到数字").not.toBeNaN();

      // ① 引擎结算（座位中毒 → 走假值分支）
      const corrupted = seats.map((s) =>
        s.id === seatId ? { ...s, statusEffects: [{ type: "poisoned" }] } : s
      );
      const info: any = calculateNightInfoViaNewEngine(
        TB as any,
        corrupted as any,
        0,
        "firstNight" as any,
        null,
        nightCount,
        undefined,
        undefined,
        undefined,
        undefined,
        false,
        undefined,
        undefined,
        undefined,
        [],
        undefined,
        undefined,
        undefined,
        false,
        false,
        false,
        null,
        undefined,
        undefined,
        undefined
      );
      const enginePairs = Number(String(info?.guide ?? "").match(/有\s*(\d+)\s*对/)?.[1]);
      expect(enginePairs, "引擎结算未取到数字").not.toBeNaN();

      // ③ 玩家结果页脱敏
      const masked = buildCorruptedInfoMask({
        roleId: "chef",
        roleName: "厨师",
        truthText: `相邻邪恶玩家有 ${real} 对`,
        trueValue: real,
        actorSeatId: seatId,
        nightCount,
        maxValue: cap,
      });

      expect(dialogPairs, "提示预演与引擎结算不一致").toBe(enginePairs);
      expect(
        masked.fakeValue,
        "玩家结果页脱敏值与引擎结算不一致"
      ).toBe(enginePairs);
      expect(enginePairs).toBeLessThanOrEqual(cap);
    });

    it("退化局面：pickFakeNumber 上界为 0 时不得返回越界值（旧实现会返回 1）", () => {
      // 旧实现 pool 为空时 `return trueValue === 0 ? 1 : 0` → 1 > max(0)
      expect(pickFakeNumber(0, 0, () => 0.5)).toBe(0);
      expect(pickFakeNumber(null, 0, () => 0.5)).toBe(0);
      // 常规局面仍必须排除真值
      expect(pickFakeNumber(1, 2, () => 0)).not.toBe(1);
    });

    it("大棋盘（邪恶多）仍以 CHEF_FAKE_MAX=5 为绝对上限，不回退", () => {
      const big: any[] = Array.from({ length: 15 }, (_, i) => ({
        id: i,
        playerName: `P${i + 1}`,
        role: r(i < 4 ? "imp" : "soldier"),
        isDead: false,
        statusEffects: [],
      }));
      // 15 席、4 邪恶 → 上界 3（且不超过 5）
      expect(chefMaxPlausiblePairs(big)).toBe(3);
    });
  });

  describe("P2-1 管家 wake 必须自带行动说明", () => {
    it("⭐ 首夜与常规夜期的引导都点明「选择主人」与投票限制", () => {
      // ⚠️ 官方：「每个夜晚，你要选择除你以外的一名玩家：明天白天，
      //    只有他投票时你才能投票。」
      for (const phase of ["firstNight", "night"] as const) {
        const d = butler[phase]!.dialog!(0, false, {} as any) as any;
        expect(d.wake, `${phase} wake 为空`).toBeTruthy();
        expect(
          d.wake,
          `${phase} wake 未点明要选主人：${d.wake}`
        ).toMatch(/主人/);
        expect(
          d.wake,
          `${phase} wake 未点明投票跟随限制：${d.wake}`
        ).toMatch(/投票/);
        // 旧文案是光秃秃的「唤醒N号玩家（管家）。」→ 不得再出现
        expect(
          d.wake,
          `${phase} wake 仍是占位式无说明文案`
        ).not.toMatch(/^唤醒\d+号玩家（管家）。?$/);
      }
    });
  });
});
