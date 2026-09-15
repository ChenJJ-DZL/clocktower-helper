/**
 * 「伪装身份」展示口径 —— 单一事实来源（SST）回归测试
 *
 * ============================================================
 * 背景（2026-09-14 用户实测，第 9 次 SST 事故）
 * ============================================================
 * 7 号是**酒鬼**，伪装设为**赏金猎人**：
 *   · 座位卡 → 「赏金猎人」✅
 *   · 身份告知牌首开 → 「罂粟种植者」❌（本是场上的真实角色）
 *   · 多次打开后 → 自愈为「赏金猎人」
 *
 * 根因：三个消费者各写各的优先级
 *   · 座位卡 `useSeatView`          → `displayRole` 优先（❌ 根因）
 *   · 告知牌 `IdentityShowcaseModal` → 只看 `charadeRole`
 *   · 控制台 `GameConsole`           → `charadeRole || role`
 *
 * ⚠️ 本测试与旧版 `charadeRole_single_source.test.ts` 的关键区别：
 *   **本文件 `import` 真实的 `charadeDisplay.ts`**，而不是在测试里
 *   重抄一遍优先级。因此：
 *     · 把 `charadeDisplay.ts` 的优先级改回 `displayRole` 优先
 *       → **本测试必然变红**（反向验证有效）
 *     · 旧版测试是"重抄一份" → 改源码也不会红（假绿，已废弃）
 */

import { describe, expect, it } from "vitest";
import {
  getCharadeDisplayRole,
  isCharadeIdentitySeat,
  isCharadeMasked,
} from "../charadeDisplay";

interface R {
  id: string;
  name: string;
  type: string;
}
interface S {
  id: number;
  role: R | null;
  charadeRole?: R | null;
  apparentDemonRole?: R | null;
  displayRole?: R | null;
}

const r = (id: string, name: string, type = "townsfolk"): R => ({ id, name, type });

const POPPY = r("poppy_grower", "罂粟种植者");
const BOUNTY = r("bounty_hunter", "赏金猎人");
const DRUNK = r("drunk", "酒鬼", "outsider");
const MARIONETTE = r("marionette", "提线木偶", "minion");
const LUNATIC = r("lunatic", "疯子", "outsider");
const IMP = r("imp", "小恶魔", "demon");
const CHEF = r("chef", "厨师");

describe("charadeDisplay —— 伪装身份唯一事实来源", () => {
  // ── ① 用户实测复现：displayRole 与 charadeRole 分叉 ──────────────
  it("① 酒鬼：displayRole 陈旧为「罂粟种植者」、charadeRole 为「赏金猎人」→ 必须取 charadeRole", () => {
    const seat: S = {
      id: 6,
      role: DRUNK,
      charadeRole: BOUNTY, // 权威
      displayRole: POPPY, // 陈旧缓存（旧实现优先读它 → 缺陷）
    };
    expect(getCharadeDisplayRole(seat)?.id).toBe("bounty_hunter");
  });

  it("② 提线木偶：同样以 charadeRole 优先于 displayRole", () => {
    const seat: S = {
      id: 2,
      role: MARIONETTE,
      charadeRole: BOUNTY,
      displayRole: POPPY,
    };
    expect(getCharadeDisplayRole(seat)?.id).toBe("bounty_hunter");
  });

  // ── ③ 缺 charadeRole 时才用 displayRole 兜底（旧存档） ──────────
  it("③ 酒鬼：charadeRole 缺省 → 回退 displayRole（兼容旧存档）", () => {
    const seat: S = { id: 0, role: DRUNK, charadeRole: null, displayRole: CHEF };
    expect(getCharadeDisplayRole(seat)?.id).toBe("chef");
  });

  it("④ 酒鬼：charadeRole 与 displayRole 都缺省 → 回退真实 role", () => {
    const seat: S = { id: 0, role: DRUNK, charadeRole: null, displayRole: null };
    expect(getCharadeDisplayRole(seat)?.id).toBe("drunk");
  });

  // ── ⑤ 疯子走 apparentDemonRole，不吃 charadeRole ────────────────
  it("⑤ 疯子：取 apparentDemonRole（而非 charadeRole）", () => {
    const seat: S = {
      id: 3,
      role: LUNATIC,
      apparentDemonRole: IMP,
      charadeRole: BOUNTY, // 不该被疯子使用
      displayRole: POPPY,
    };
    expect(getCharadeDisplayRole(seat)?.id).toBe("imp");
  });

  // ── ⑥ 普通角色：恒为真身，不受 displayRole 污染 ──────────────────
  it("⑥ 普通镇民：即使 displayRole 被写脏也取真实 role", () => {
    const seat: S = { id: 5, role: CHEF, displayRole: POPPY };
    expect(getCharadeDisplayRole(seat)?.id).toBe("chef");
  });

  // ── ⑦⑧ 边界 ─────────────────────────────────────────────────
  it("⑦ 空座位 → null", () => {
    expect(getCharadeDisplayRole(null)).toBeNull();
    expect(getCharadeDisplayRole({ id: 0, role: null })).toBeNull();
  });

  it("⑧ isCharadeIdentitySeat 只认酒鬼 / 提线木偶", () => {
    expect(isCharadeIdentitySeat({ role: DRUNK })).toBe(true);
    expect(isCharadeIdentitySeat({ role: MARIONETTE })).toBe(true);
    expect(isCharadeIdentitySeat({ role: LUNATIC })).toBe(false);
    expect(isCharadeIdentitySeat({ role: CHEF })).toBe(false);
    expect(isCharadeIdentitySeat(null)).toBe(false);
  });

  // ── ⑨ 遮罩角标判据 ────────────────────────────────────────────
  it("⑨ isCharadeMasked：真身≠展示身份 才为 true", () => {
    expect(
      isCharadeMasked({ role: DRUNK, charadeRole: BOUNTY, displayRole: POPPY })
    ).toBe(true);
    expect(isCharadeMasked({ role: CHEF })).toBe(false);
    expect(isCharadeMasked({ role: DRUNK, charadeRole: DRUNK })).toBe(false);
  });

  // ── ⑩ 三消费者口径一致性（用同一份助手 ⇒ 恒等） ─────────────────
  it("⑩ 分叉态下，三处消费者口径必须一致（同一助手保证）", () => {
    const seats: S[] = [
      { id: 0, role: DRUNK, charadeRole: BOUNTY, displayRole: POPPY },
      { id: 1, role: CHEF },
      { id: 2, role: LUNATIC, apparentDemonRole: IMP, displayRole: POPPY },
    ];
    // 座位卡 / 告知牌 / 控制台 —— 修复后三者都调用 getCharadeDisplayRole
    const seatCard = seats.map((s) => getCharadeDisplayRole(s)?.id);
    const showcase = seats.map((s) => getCharadeDisplayRole(s)?.id);
    const console_ = seats.map((s) => getCharadeDisplayRole(s)?.id);
    expect(seatCard).toEqual(showcase);
    expect(showcase).toEqual(console_);
    expect(seatCard).toEqual(["bounty_hunter", "chef", "imp"]);
  });
});
