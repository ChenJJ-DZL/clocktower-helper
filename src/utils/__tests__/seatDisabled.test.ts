/**
 * 失能状态（中毒 / 醉酒）统一 · 权威契约回归（2026-09-14）
 *
 * 收敛前「这个座位是否被中毒/醉酒压制」有两套**检测口径不一致**的实现：
 *   · `gameRules::computeIsPoisoned`    —— 认 8 种表示（中文 statusDetails 正则、
 *     `statuses[] effect=Poison`、`statusEffects[]`、布尔位、诺-达动态中毒…）
 *   · `bmrMechanics::isDrunkOrPoisoned` —— 只认 `statusEffects[]` 与布尔位
 *
 * 实测分叉（双向，A/B 为真缺陷）：
 *   | 场景                            | computeIsPoisoned | 旧 isDrunkOrPoisoned |
 *   | ------------------------------- | ----------------- | -------------------- |
 *   | 仅 `statusDetails` 中文标记      | 中毒              | **判为清醒** ⛔       |
 *   | 仅 `statuses[] effect="Poison"` | 中毒              | **判为清醒** ⛔       |
 *
 * 生产 `gameRules::addPoisonMark` 写的正是中文 `statusDetails`
 * ⇒ 被投毒者会被 BMR 系列角色（茶艺师/莽夫/月之子）当作清醒。
 *
 * 本文件把"所有表示都必须被识别"钉死，防止再次分叉。
 */
import { describe, expect, it } from "vitest";
import {
  isSeatDisabled,
  isSeatDrunk,
  isSeatPoisoned,
} from "../seatDisabled";
import { isDrunkOrPoisoned } from "../bmrMechanics";
import { computeIsPoisoned } from "../gameRules";

const mk = (o: Record<string, unknown> = {}) =>
  ({
    id: 0,
    isDead: false,
    role: { id: "chef", name: "厨师", type: "townsfolk" },
    ...o,
  }) as any;

/** 生产会写出的各种「中毒」表示 —— 每一种都必须被判定为中毒 */
const POISON_REPRESENTATIONS: Array<{ name: string; seat: any }> = [
  {
    name: "① statusDetails 中文标记「投毒（第N夜清除）」（addPoisonMark 产物）",
    seat: mk({ statusDetails: ["投毒（第2夜清除）"] }),
  },
  {
    name: "② statusDetails「永久中毒」",
    seat: mk({ statusDetails: ["永久中毒"] }),
  },
  {
    name: "③ statusDetails「亡骨魔中毒（…清除）」",
    seat: mk({ statusDetails: ["亡骨魔中毒（第3夜清除）"] }),
  },
  {
    name: "④ statusDetails「普卡中毒（…清除）」",
    seat: mk({ statusDetails: ["普卡中毒（第3夜清除）"] }),
  },
  {
    name: "⑤ statusDetails「诺-达中毒（…清除）」",
    seat: mk({ statusDetails: ["诺-达中毒（第3夜清除）"] }),
  },
  {
    name: "⑥ statusDetails「食人族中毒」",
    seat: mk({ statusDetails: ["食人族中毒（第3夜清除）"] }),
  },
  {
    name: "⑦ statusDetails「舞蛇人中毒」",
    seat: mk({ statusDetails: ["舞蛇人中毒（永久）"] }),
  },
  {
    name: "⑧ statuses[] effect=Poison（未过期）",
    seat: mk({
      statuses: [{ effect: "Poison", duration: "night", startNight: 1 }],
    }),
  },
  {
    name: "⑨ statusEffects[] type=poisoned（引擎直接结算）",
    seat: mk({ statusEffects: [{ type: "poisoned", source: "poisoner" }] }),
  },
  {
    name: "⑩ statusEffects[] type=poison",
    seat: mk({ statusEffects: [{ type: "poison", source: "x" }] }),
  },
  {
    name: "⑪ 布尔位 isPoisoned=true",
    seat: mk({ isPoisoned: true }),
  },
];

describe("中毒：所有生产表示都必须被识别（消除 A/B 分叉）", () => {
  for (const r of POISON_REPRESENTATIONS) {
    it(r.name, () => {
      // 引擎权威
      expect(computeIsPoisoned(r.seat), "computeIsPoisoned").toBe(true);
      // ⭐ 统一入口
      expect(isSeatPoisoned(r.seat), "isSeatPoisoned").toBe(true);
      expect(isSeatDisabled(r.seat), "isSeatDisabled").toBe(true);
      // ⭐ 旧 BMR 入口必须与权威一致（这就是"收敛"的定义）
      expect(isDrunkOrPoisoned(r.seat), "bmrMechanics::isDrunkOrPoisoned").toBe(
        true
      );
    });
  }
});

describe("醉酒：所有表示都必须被识别", () => {
  const cases: Array<{ name: string; seat: any }> = [
    { name: "statusEffects[] type=drunk（如朝臣/水手）", seat: mk({ statusEffects: [{ type: "drunk", source: "courtier" }] }) },
    { name: "布尔位 isDrunk=true", seat: mk({ isDrunk: true }) },
    { name: "本质角色 drunk（酒鬼）", seat: mk({ role: { id: "drunk", name: "酒鬼", type: "outsider" } }) },
    { name: "本质角色 marionette（提线木偶）", seat: mk({ role: { id: "marionette", name: "提线木偶", type: "minion" } }) },
  ];
  for (const c of cases) {
    it(c.name, () => {
      expect(isSeatDrunk(c.seat), "isSeatDrunk").toBe(true);
      expect(isSeatDisabled(c.seat), "isSeatDisabled").toBe(true);
      expect(isDrunkOrPoisoned(c.seat), "isDrunkOrPoisoned").toBe(true);
    });
  }
});

describe("清醒座位不得被误判", () => {
  const clean: Array<{ name: string; seat: any }> = [
    { name: "普通镇民（无任何状态）", seat: mk() },
    { name: "已过期的 statuses Poison（duration=expired）", seat: mk({ statuses: [{ effect: "Poison", duration: "expired" }] }) },
    { name: "无关的 statusEffects（受保护）", seat: mk({ statusEffects: [{ type: "protected", source: "monk" }] }) },
    { name: "无关的 statusDetails（被僧侣保护）", seat: mk({ statusDetails: ["被僧侣保护（第2夜清除）"] }) },
  ];
  for (const c of clean) {
    it(c.name, () => {
      expect(isSeatPoisoned(c.seat), "isSeatPoisoned").toBe(false);
      expect(isSeatDrunk(c.seat), "isSeatDrunk").toBe(false);
      expect(isSeatDisabled(c.seat), "isSeatDisabled").toBe(false);
      expect(isDrunkOrPoisoned(c.seat), "isDrunkOrPoisoned").toBe(false);
    });
  }
});

describe("诺-达（No-Dashii）动态中毒必须被统一识别", () => {
  it("镇民坐在活着的诺-达顺时针最近处 → computeIsPoisoned 与 isSeatDisabled 都成立", () => {
    const seats = [
      mk({ id: 0, role: { id: "no_dashii", name: "诺-达", type: "demon" } }),
      mk({ id: 1 }),
      mk({ id: 2 }),
    ];
    // 位 0 是诺-达本人，顺时针第一个镇民是位 1
    expect(computeIsPoisoned(seats[1], seats)).toBe(true);
    expect(isSeatPoisoned(seats[1], seats)).toBe(true);
    expect(isSeatDisabled(seats[1], seats)).toBe(true);
  });
});

describe("null / undefined 安全", () => {
  it("空值一律 false", () => {
    for (const v of [null, undefined]) {
      expect(isSeatPoisoned(v)).toBe(false);
      expect(isSeatDrunk(v)).toBe(false);
      expect(isSeatDisabled(v)).toBe(false);
      expect(isDrunkOrPoisoned(v)).toBe(false);
    }
  });
});
