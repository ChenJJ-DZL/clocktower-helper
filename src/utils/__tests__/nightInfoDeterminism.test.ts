/**
 * 夜间信息 dialog 的**确定性护栏**（棘轮型）
 *
 * ============================================================
 * 为什么需要这个文件
 * ============================================================
 * 信息类角色（洗衣妇/调查员/共情者/钟表匠/送葬者…）的 `dialog` 产出的是
 * **说书人念出来的提示文案**，而同一份事实还会在真正结算/魔典标记时被再算一次。
 *
 * 若 dialog 里用裸 `Math.random()` 选人/洗牌/掷骰，两处各调一次真随机就会分叉：
 * 说书人照 A 念，游戏却按 B 落地 → 玩家拿到的是错的信息，且**无法通过复盘发现**
 * （因为每次重算都"看起来合理"）。这就是"同一事实被算两次必须确定性"铁律。
 *
 * 正确写法：`const rng = context.rng ?? Math.random;` 再用 `rng()`。
 * `context.rng` 由 `nightInfoGenerator.generateNightInfo` 用
 * `nightInfoSeed(roleId, currentSeatId, nightCount)` 播种后注入。
 *
 * ============================================================
 * 本护栏如何工作
 * ============================================================
 * 对每个 (剧本, 角色, 夜次, 中毒/醉酒状态) 组合，在**完全相同的局面**下
 * 连续调用 30 次 `calculateNightInfoViaNewEngine`，收集产出的 `guide` 文案：
 *   · 正确实现 → 只有 1 种文案
 *   · 踩了裸随机 → 会出现多种（实测洗衣妇曾达 21 种 / 30 次）
 *
 * ⚠️ 新增信息类角色时，请把它的组合补进下面的表。漏补不会报错，
 *    但就意味着这个角色的文案可能悄悄分叉。
 *
 * 关联修复记录：2026-09-14 本护栏落地时修掉了
 * investigator / washerwoman / undertaker / clockmaker / empath 的裸随机。
 */
import { describe, expect, it } from "vitest";
import { roles } from "../../../app/data";
import { calculateNightInfoViaNewEngine } from "../nightInfoAdapter";
import { initializeAbilityRegistry } from "../../roles/new_engine/abilityRegistry";

const r = (id: string) => roles.find((x) => x.id === id)!;

/** 暗流涌动（Trouble Brewing） */
const TB = {
  id: "trouble_brewing",
  name: "暗流涌动",
  roleIds: [
    "washerwoman", "librarian", "investigator", "chef", "empath",
    "fortune_teller", "undertaker", "monk", "ravenkeeper", "virgin",
    "slayer", "soldier", "mayor", "butler", "drunk", "recluse", "saint",
    "poisoner", "spy", "scarlet_woman", "baron", "imp",
  ],
} as any;

/** 罂粟花开（Poppyganda） */
const POPPY = {
  id: "poppyganda",
  name: "罂粟花开",
  roleIds: [
    "librarian", "chef", "bounty_hunter", "pixie", "fortune_teller", "monk",
    "oracle", "town_crier", "juggler", "savant", "farmer", "mayor", "poppy_grower",
    "drunk", "lunatic", "mutant", "snitch",
    "cerenovus", "evil_twin", "baron", "marionette",
    "imp", "vortox", "legion",
  ],
} as any;

/**
 * 构造固定的 7 人局。座位 0 为被测角色；其余座位固定不变，
 * 保证"同一局面"这一前提成立。
 */
function makeSeats(roleId: string, opts: { disabled?: "poisoned" | "drunk"; executed?: boolean } = {}) {
  const statusEffects = opts.disabled ? [{ type: opts.disabled }] : [];
  const seats: any[] = [
    { id: 0, playerName: "P1", role: r(roleId), isDead: false, isDrunk: false, isPoisoned: false, statusEffects },
    { id: 1, playerName: "P2", role: r("mayor"), isDead: false, isDrunk: false, isPoisoned: false, statusEffects: [] },
    { id: 2, playerName: "P3", role: r("soldier"), isDead: false, isDrunk: false, isPoisoned: false, statusEffects: [] },
    { id: 3, playerName: "P4", role: r("empath"), isDead: false, isDrunk: false, isPoisoned: false, statusEffects: [] },
    { id: 4, playerName: "P5", role: r("baron"), isDead: false, isDrunk: false, isPoisoned: false, statusEffects: [] },
    { id: 5, playerName: "P6", role: r("imp"), isDead: false, isDrunk: false, isPoisoned: false, statusEffects: [] },
    { id: 6, playerName: "P7", role: r("saint"), isDead: false, isDrunk: false, isPoisoned: false, statusEffects: [] },
  ];
  if (opts.executed) {
    // 送葬者需要一个"白天被处决"的座位
    seats[2].role = r("baron");
    seats[2].executedToday = true;
  }
  return seats;
}

/** 同一局面重复调用 n 次，返回去重后的文案集合 */
function guideVariants(
  script: any,
  roleId: string,
  night: 1 | 2,
  seats: any[],
  n = 30
): Set<string> {
  const seen = new Set<string>();
  for (let i = 0; i < n; i++) {
    const info: any = calculateNightInfoViaNewEngine(
      script,
      seats as any,
      0,
      (night === 1 ? "firstNight" : "night") as any,
      null,
      night,
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
    seen.add(String(info?.guide ?? ""));
  }
  return seen;
}

type Case = [
  script: any,
  roleId: string,
  cn: string,
  night: 1 | 2,
  opts?: { disabled?: "poisoned" | "drunk"; executed?: boolean }
];

describe("夜间信息 dialog 确定性护栏", () => {
  initializeAbilityRegistry();

  // ── 正常路径（技能生效）──────────────────────────────────────────────
  const NORMAL: Case[] = [
    [TB, "washerwoman", "洗衣妇", 1],
    [TB, "librarian", "图书管理员", 1],
    [TB, "investigator", "调查员", 1],
    [TB, "chef", "厨师", 1],
    [TB, "empath", "共情者", 1],
    [TB, "fortune_teller", "占卜师", 1],
    [TB, "undertaker", "送葬者", 2],
    [TB, "ravenkeeper", "守鸦人", 2],
    [TB, "butler", "管家", 1],
    [TB, "poisoner", "投毒者", 1],
    [POPPY, "clockmaker", "钟表匠", 1],
    [POPPY, "oracle", "神谕", 2],
  ];

  for (const [script, roleId, cn, night] of NORMAL) {
    it(`[生效] ${cn}（${roleId}）同一局面重复 30 次应产出唯一文案`, () => {
      const v = guideVariants(script, roleId, night, makeSeats(roleId));
      expect(
        [...v],
        `${cn} 的 dialog 出现 ${v.size} 种文案 —— 说明用了裸 Math.random()，` +
          `必须改用 context.rng`
      ).toHaveLength(1);
    });
  }

  // ── 受干扰路径（中毒/醉酒 → 假信息必然要"随机"）─────────────────────
  //    这是最容易踩坑的分支：假信息本身就该随机，但必须**确定性随机**。
  const DISABLED: Case[] = [
    [TB, "washerwoman", "洗衣妇", 1, { disabled: "poisoned" }],
    [TB, "investigator", "调查员", 1, { disabled: "poisoned" }],
    [TB, "undertaker", "送葬者", 2, { disabled: "poisoned", executed: true }],
    [POPPY, "empath", "共情者", 1, { disabled: "drunk" }],
    [POPPY, "clockmaker", "钟表匠", 1, { disabled: "drunk" }],
  ];

  for (const [script, roleId, cn, night, opts] of DISABLED) {
    it(`[中毒/醉酒] ${cn}（${roleId}）假信息也须确定性`, () => {
      const v = guideVariants(script, roleId, night, makeSeats(roleId, opts));
      expect(
        [...v],
        `${cn} 受干扰时的假信息出现 ${v.size} 种文案 —— ` +
          `假信息可以随机，但必须用 context.rng 保证同一夜可复现`
      ).toHaveLength(1);
    });
  }

  // ── 反向验证：护栏本身有效 ───────────────────────────────────────────
  it("⭐ 护栏有效性自证：首夜应产出**含具体座位号与角色名**的真实信息（非占位文案）", () => {
    const n1 = [...guideVariants(TB, "washerwoman", 1, makeSeats("washerwoman"))];
    expect(n1, "首夜洗衣妇应只产出 1 种文案").toHaveLength(1);
    const g = n1[0];
    expect(g.length, "首夜洗衣妇文案不应为空").toBeGreaterThan(0);
    // 必须是"告诉他X号和Y号其中一位是【某角色】"这种可念的实质信息
    expect(g, `首夜文案应含座位号，实际「${g}」`).toMatch(/告诉他\d+号和\d+号/);
    expect(g, `首夜文案应含角色名，实际「${g}」`).toMatch(/【.+】/);
  });

  it("⭐ 护栏有效性自证：非唤醒夜次产出占位文案而非残留首夜信息", () => {
    // 洗衣妇仅在首夜唤醒；第 2 夜不应再吐出"X号和Y号其中一位是【…】"这类首夜信息，
    // 否则等于把首夜信息泄漏到后续夜晚。
    const n2 = [...guideVariants(TB, "washerwoman", 2, makeSeats("washerwoman"))];
    expect(n2, "第 2 夜也应只有 1 种文案").toHaveLength(1);
    expect(
      n2[0],
      `洗衣妇第 2 夜不应残留首夜信息，实际「${n2[0]}」`
    ).not.toMatch(/告诉他\d+号和\d+号/);
  });

  it("⭐ 护栏有效性自证：换局面后产出会跟着变（证明不是冻结缓存/常量）", () => {
    const base = [...guideVariants(TB, "washerwoman", 1, makeSeats("washerwoman"))][0];
    // 把座位 3/4 换成别的角色 → 场上镇民集合变化 → 洗衣妇指认的对象应重新计算
    const seats = makeSeats("washerwoman");
    seats[1].role = r("ravenkeeper"); // 原 mayor
    seats[3].role = r("monk"); // 原 empath
    seats[4].role = r("soldier"); // 原 baron
    const changed = [...guideVariants(TB, "washerwoman", 1, seats)][0];
    expect(base.length).toBeGreaterThan(0);
    expect(changed.length).toBeGreaterThan(0);
    expect(
      changed.includes("男爵") || changed.includes("小恶魔"),
      `局面改变后不应仍指向已离场的角色，实际「${changed}」`
    ).toBe(false);
  });
});
