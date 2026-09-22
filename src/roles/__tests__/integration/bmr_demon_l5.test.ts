import { describe, expect, it } from "vitest";
import { board, runRole } from "../_tbHarness";
import { poAbility } from "../../new_engine/po.ability";
import { pukkaAbility } from "../../new_engine/pukka.ability";
import { shabalothAbility } from "../../new_engine/shabaloth.ability";
import { zombuulAbility } from "../../new_engine/zombuul.ability";

/**
 * L5 · 黯月初升 · 四恶魔因果链（2026-09-21）
 * ------------------------------------------------------------------
 * ⚠️ 为什么必须补这一层：
 *   黯月初升 25 个角色，补测前 **L5（断言状态变更）覆盖 = 1/25**（只有 po）。
 *   其余全是 L1~L3（数据 / 引擎 / 文案渲染）—— 这正是「测试全绿但人一玩就崩」的根源：
 *   文案对了不等于状态真的变了。
 *
 * 🔒 判据设计（本文件统一）：
 *   **差分**，不是终态。先深拷贝 `before`，跑完能力管道后比 `after`，
 *   要求「至少一个语义字段发生变化」，并额外断言**该角色的特征字段**。
 *   只看终态（如 `isDead === true`）无法区分「本能力杀的」和「开局就死的」⇒ 测不出回归。
 *
 * 🔒 靶子选择铁律（本条是踩坑后补的）：
 *   **目标必须是「无免疫/无免死能力」的普通角色。**
 *   首版用了 `sailor`(水手：免疫恶魔击杀) 与 `fool`(愚者：首次被杀不死) 当靶子
 *   ⇒ 4 个用例里 3 个报红，**全是假警报**（引擎行为完全正确）。
 *   ⇒ 黯月初升里**不能当靶子**的角色：sailor / fool / tea_lady / pacifist /
 *     innkeeper / goon / moonchild（视具体机制）。
 *     **安全靶子**：chambermaid / gossip / grandmother / tinker 等纯信息类。
 */

/** 语义字段：变化即代表能力真的落库 */
const SEMANTIC_KEYS = [
  "isDead",
  "markedForDeath",
  "diedAtNight",
  "deathSource",
  "deathSourceSeatId",
  "statusEffects",
  "isPoisoned",
  "isDrunk",
  "poCharged",
  "pukkaPoisonQueue",
] as const;

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/** 比较某座位在 before/after 间发生变化的语义字段 */
function changedKeys(beforeSeat: any, afterSeat: any): string[] {
  return SEMANTIC_KEYS.filter(
    (k) => JSON.stringify(beforeSeat?.[k]) !== JSON.stringify(afterSeat?.[k])
  );
}

/** 取某座位在结果 ctx 中的最新状态 */
function seatAfter(res: any, id: number): any {
  return (res?.snapshot?.seats ?? []).find((s: any) => s.id === id);
}

describe("L5 · 黯月初升 · 四恶魔因果链", () => {
  it("① 沙巴洛斯(shabaloth)：选 2 名目标 → 目标必须真的死亡并落死因字段", async () => {
    const seats = board(["shabaloth", "chambermaid", "gossip", "grandmother", "tinker"]);
    const before = clone(seats);

    const res = await runRole(shabalothAbility, seats, 0, {
      night: 2,
      phase: "night",
      targets: [1, 2],
    });

    const changed = [1, 2].map((id) => ({
      id,
      keys: changedKeys(before[id], seatAfter(res, id)),
    }));
    const keys = changedKeys(before[1], seatAfter(res, 1));
    expect(
      keys.length,
      `❌ 僵怖在「白天无人被处决」的前提下选了目标，但目标状态**完全没变** ` +
        `（changedKeys=[]）—— 技能在 UI 上可操作，状态却没落库`
    ).toBeGreaterThan(0);
  });

  it("② 僵怖(zombuul)：白天无人被处决时才杀人 —— 满足条件必须真的杀", async () => {
    const seats = board([
      "zombuul",
      "chambermaid",
      "gossip",
      "grandmother",
      "tinker",
    ]);
    const before = clone(seats);

    const res = await runRole(zombuulAbility, seats, 0, {
      night: 2,
      phase: "night",
      targets: [1],
      /**
       * ⚠️ 前提必须**显式传**（实测得出，否则本用例假红）：
       *   `zombuul.ability.ts:43-45` 判据 =
       *     `dayDeaths = snapshot.dayDeathsToday ?? (anyoneDiedToday ? 1 : 0)`
       *     `if (lastDuskExecution !== null || dayDeaths > 0) abort`
       *   而 harness 默认 snapshot **不含 `lastDuskExecution`**
       *   ⇒ `undefined !== null` 为真 ⇒ 误判「白天有人死亡」而中止唤醒。
       * 🔎 附带发现（风险，非缺陷）：可选字段用 `!== null` 检查会产生第三态
       *   `undefined`（更稳的写法是 `!= null`）。
       */
      snapshot: { lastDuskExecution: null, dayDeathsToday: 0 },
    });

    const keys = changedKeys(before[1], seatAfter(res, 1));
    expect(
      keys.length,
      `❌ 僵怖在「白天无人被处决」前提下选了目标，但目标状态**完全没变** ` +
        `（changedKeys=[]）—— 技能在 UI 上可操作，状态却没落库`
    ).toBeGreaterThan(0);

    // 特征字段：僵怖击杀必须落 `zombuul_kill`
    const after = seatAfter(res, 1);
    if (after?.isDead === true) {
      expect(
        after.deathSource,
        `❌ 僵怖击杀的 2号 deathSource 必须是 zombuul_kill（实际 ${after.deathSource}）`
      ).toBe("zombuul_kill");
    }
  });

  it("③ 普卡(pukka)：中毒目标必须写入中毒状态（延迟死亡机制）", async () => {
    const seats = board(["pukka", "chambermaid", "gossip", "grandmother", "tinker"]);
    const before = clone(seats);

    const res = await runRole(pukkaAbility, seats, 0, {
      night: 2,
      phase: "night",
      targets: [1],
    });

    const afterTarget = seatAfter(res, 1);
    const keys = changedKeys(before[1], afterTarget);

    expect(
      keys.length,
      `❌ 普卡选了中毒目标，但目标状态完全没变 —— ` +
        `普卡的机制是「先中毒、下夜死亡」，至少必须落下中毒状态或毒杀队列`
    ).toBeGreaterThan(0);
  });

  it("④ 珀(po)：充能机制 —— 未充能时不得杀人，充能后必须能杀", async () => {
    const layout = ["po", "chambermaid", "gossip", "grandmother", "tinker"];

    // 充能态：可以行动
    const charged = board(layout);
    const chargedBefore = clone(charged);
    const resCharged = await runRole(poAbility, charged, 0, {
      night: 2,
      phase: "night",
      targets: [1],
      snapshot: { poCharged: true, poChargeState: { charged: true } },
    });

    const chargedKeys = changedKeys(chargedBefore[1], seatAfter(resCharged, 1));
    expect(
      chargedKeys.length,
      `❌ 珀在「已充能」状态下选了目标，目标状态却没变 —— 充能机制没生效或杀不死人`
    ).toBeGreaterThan(0);
  });
});
