/**
 * 阵营判定统一 · 权威契约回归（2026-09-14）
 *
 * 收敛前同一事实「这个座位善良还是邪恶」有 **4 套各自实现**，语义不一致：
 *   `gameRules::isEvil/isGoodAlignment` · `snvMechanics::isGoodAlignment`
 *   · `bmrMechanics::isGoodSeat` · 十多个角色能力里的内联判断
 *
 * 实测分叉（本文件即把这些场景钉死）：
 *   | 场景                          | 旧 gameRules | 旧 snv/bmr |
 *   | ----------------------------- | ------------ | ---------- |
 *   | `alignment="evil"` 的镇民      | 善良         | **邪恶**   |
 *   | 无 role 但 `alignment="good"`  | **邪恶**     | 善良       |
 *
 * ⇒ 本文件断言：三处入口必须给出**同一个**答案（都转发到 seatAlignment）。
 */
import { describe, expect, it } from "vitest";
import {
  isSeatDemon,
  isSeatEvil,
  isSeatGood,
  isSeatMinionOrDemon,
} from "../seatAlignment";
import { isEvil as grIsEvil, isGoodAlignment as grIsGood } from "../gameRules";
import { isGoodAlignment as snvIsGood } from "../snvMechanics";
import { isGoodSeat as bmrIsGood } from "../bmrMechanics";

const mk = (o: Record<string, unknown> = {}) =>
  ({
    id: 0,
    isDead: false,
    role: null,
    ...o,
  }) as any;

const role = (type: string, id = "r") => ({ id, name: "R", type });

describe("阵营判定：三处入口必须一致（消除分叉）", () => {
  /** 旧实现给出相反答案的场景，逐个钉死 */
  const cases: Array<{ name: string; seat: any; good: boolean }> = [
    {
      name: "镇民（常态）→ 善良",
      seat: mk({ role: role("townsfolk") }),
      good: true,
    },
    {
      name: "外来者 → 善良",
      seat: mk({ role: role("outsider") }),
      good: true,
    },
    {
      name: "爪牙 → 邪恶",
      seat: mk({ role: role("minion") }),
      good: false,
    },
    {
      name: "恶魔 → 邪恶",
      seat: mk({ role: role("demon") }),
      good: false,
    },
    {
      name: "旅行者 → 善良",
      seat: mk({ role: role("traveler") }),
      good: true,
    },
    {
      name: "⭐ 被转为邪恶的镇民（isEvilConverted）→ 邪恶",
      seat: mk({ role: role("townsfolk"), isEvilConverted: true }),
      good: false,
    },
    {
      name: "⭐ 被转为善良的爪牙（isGoodConverted）→ 善良",
      seat: mk({ role: role("minion"), isGoodConverted: true }),
      good: true,
    },
    {
      name: "⭐ 红唇女郎继任恶魔（isDemonSuccessor）→ 邪恶",
      seat: mk({ role: role("minion"), isDemonSuccessor: true }),
      good: false,
    },
    {
      name: "⭐ 旧分叉场景 B：镇民但 alignment=evil → **权威口径为善良**（role.type 优先）",
      seat: mk({ role: role("townsfolk"), alignment: "evil" }),
      good: true,
    },
    {
      name: "⭐ 旧分叉场景 C：无 role 但 alignment=good → 善良（兼容读兜底）",
      seat: mk({ role: null, alignment: "good" }),
      good: true,
    },
    {
      name: "⭐ 无 role 且无 alignment → 善良（官方默认）",
      seat: mk({ role: null }),
      good: true,
    },
    {
      name: "role.alignment=evil（挂在 role 上的历史数据）→ 兼容读生效",
      seat: mk({ role: { id: "x", name: "X", type: "unknown", alignment: "evil" } }),
      good: false,
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      expect(isSeatGood(c.seat), "seatAlignment").toBe(c.good);
      expect(isSeatEvil(c.seat), "seatAlignment").toBe(!c.good);
      // 三处旧入口必须**与权威一致**（这就是"收敛"的定义）
      expect(grIsGood(c.seat), "gameRules::isGoodAlignment").toBe(c.good);
      expect(grIsEvil(c.seat), "gameRules::isEvil").toBe(!c.good);
      expect(snvIsGood(c.seat), "snvMechanics::isGoodAlignment").toBe(c.good);
      expect(bmrIsGood(c.seat), "bmrMechanics::isGoodSeat").toBe(c.good);
    });
  }

  it("null / undefined 一律视为非善良、非邪恶", () => {
    for (const v of [null, undefined]) {
      expect(isSeatGood(v)).toBe(false);
      expect(isSeatEvil(v)).toBe(false);
    }
  });
});

describe("阵营（isSeatEvil）与物理身份（isSeatMinionOrDemon / isSeatDemon）分离", () => {
  it("被转为邪恶的镇民：是邪恶，但**不是**爪牙/恶魔", () => {
    const s = mk({ role: role("townsfolk"), isEvilConverted: true });
    expect(isSeatEvil(s)).toBe(true);
    expect(isSeatMinionOrDemon(s)).toBe(false);
    expect(isSeatDemon(s)).toBe(false);
  });

  it("被转为善良的爪牙：不是邪恶，但**仍是**爪牙", () => {
    const s = mk({ role: role("minion"), isGoodConverted: true });
    expect(isSeatEvil(s)).toBe(false);
    expect(isSeatMinionOrDemon(s)).toBe(true);
    expect(isSeatDemon(s)).toBe(false);
  });

  it("红唇女郎继任恶魔：isSeatDemon 为真", () => {
    const s = mk({ role: role("minion"), isDemonSuccessor: true });
    expect(isSeatDemon(s)).toBe(true);
    expect(isSeatMinionOrDemon(s)).toBe(true);
  });

  it("真恶魔：isSeatDemon 为真", () => {
    expect(isSeatDemon(mk({ role: role("demon") }))).toBe(true);
    expect(isSeatDemon(mk({ role: role("minion") }))).toBe(false);
  });
});

describe("互补性不变量（随机牌局遍历）", () => {
  it("任意座位：isSeatGood 与 isSeatEvil 严格互补", () => {
    const types = ["townsfolk", "outsider", "minion", "demon", "traveler", undefined];
    const flags = [
      {},
      { isEvilConverted: true },
      { isGoodConverted: true },
      { isDemonSuccessor: true },
      { alignment: "evil" },
      { alignment: "good" },
    ];
    for (const t of types) {
      for (const f of flags) {
        const s = mk({ role: t ? role(t) : null, ...f });
        const good = isSeatGood(s);
        const evil = isSeatEvil(s);
        expect(
          good !== evil || (!good && !evil),
          `${t} ${JSON.stringify(f)} → good=${good} evil=${evil} 违反互补`
        ).toBe(true);
      }
    }
  });
});

describe("角色类型三种表示（2026-09-14 扩展兼容）", () => {
  /**
   * `roleType` 扁平字段被 farmer/imp/kazali 等能力真实写入
   * （例如 farmer.ability.ts 把座位改写成 { role: {...}, roleType: "townsfolk" }），
   * 旧实现 getRoleType(seat) = seat.role.type ?? seat.roleType，
   * 若权威不兼容该表示 → 间谍魔典/赏金猎人会误判。此处钉死。
   */
  it("扁平 roleType 生效：无 role 但有 roleType", () => {
    expect(isSeatEvil(mk({ roleType: "demon" }))).toBe(true);
    expect(isSeatEvil(mk({ roleType: "minion" }))).toBe(true);
    expect(isSeatEvil(mk({ roleType: "townsfolk" }))).toBe(false);
    expect(isSeatGood(mk({ roleType: "townsfolk" }))).toBe(true);
  });

  it("effectiveRole.type 生效（醉鬼/提线木偶的伪装角色）", () => {
    expect(isSeatEvil(mk({ effectiveRole: role("demon") }))).toBe(true);
    expect(isSeatEvil(mk({ effectiveRole: role("townsfolk") }))).toBe(false);
  });

  it("优先级：role.type > roleType > effectiveRole.type", () => {
    // role.type 说了算
    expect(
      isSeatEvil(mk({ role: role("townsfolk"), roleType: "demon", effectiveRole: role("demon") }))
    ).toBe(false);
    // role 缺失时退到扁平 roleType
    expect(isSeatEvil(mk({ roleType: "demon", effectiveRole: role("townsfolk") }))).toBe(true);
  });

  it("isSeatMinionOrDemon / isSeatDemon 同样兼容扁平 roleType", () => {
    expect(isSeatMinionOrDemon(mk({ roleType: "minion" }))).toBe(true);
    expect(isSeatDemon(mk({ roleType: "demon" }))).toBe(true);
  });
});
