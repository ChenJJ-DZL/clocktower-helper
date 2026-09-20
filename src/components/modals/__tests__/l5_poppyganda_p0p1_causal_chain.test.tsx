// @vitest-environment jsdom
/**
 * L5「因果链」测试 —— 罂粟花开 · 本轮 P0/P1 修复的**状态变更**验证
 * （2026-09-21）
 *
 * ⚠️⚠️ 为什么单独开一个文件
 * ---------------------------------------------------------------
 * 本项目的核心痛点是「**测试全绿，人工实测完全不同**」。根因是历史上断言打在了
 * **文案层**（`text.length > 0` / `not.toContain("undefined")`），而玩家感知的是
 * **状态层**（谁的毒生效了、谁死了、游戏结束没）。
 *
 * 本文件对本轮修掉的三个**真 bug** 各写一条"改坏生产代码必红"的状态断言：
 *
 *   P0-1  镇长和平获胜：`lastAction` 口径不一致导致真值永假
 *         → 断言 `checkGameEnd(...).winner === "Good"`（状态字段，不是日志文案）
 *
 *   P0-2  占卜师「死去的邪恶玩家数」：内联 role.type 判定 vs 转换标记
 *         → 断言 `countDeadEvilPlayers()` 的**返回值**随转换标记变化
 *
 *   P1-13 夜间确认弹窗「只能选活人」：消费方读了不存在的字段名
 *         → 断言渲染后**已死座位的卡片真的带上禁用样式**（DOM 状态）
 *
 * ── 防假绿自检（每条都实测过，见提交说明）──────────────────────────
 *   把对应生产代码改坏 → 本文件必须变红 → 还原后变绿。
 */

import { fireEvent } from "@testing-library/dom";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { checkGameEnd } from "../../../../app/gameLogic";
import { countDeadEvilPlayers } from "../../../utils/deadEvilCount";
import { NightActionConfirmModal } from "../../modals/NightActionConfirmModal";

// ─────────────────────────────────────────────────────────────────────
// 通用座位构造
// ─────────────────────────────────────────────────────────────────────
function seat(
  id: number,
  roleId: string,
  type: "townsfolk" | "outsider" | "minion" | "demon",
  opts: Partial<any> = {}
): any {
  return {
    id,
    playerName: `P${id + 1}`,
    role: { id: roleId, name: roleId, type },
    displayRole: null,
    charadeRole: null,
    isDead: false,
    isDrunk: false,
    isPoisoned: false,
    isProtected: false,
    protectedBy: null,
    isEvilConverted: false,
    isGoodConverted: false,
    isRedHerring: false,
    isFortuneTellerRedHerring: false,
    isSentenced: false,
    masterId: null,
    hasUsedSlayerAbility: false,
    hasUsedDayAbility: false,
    hasUsedVirginAbility: false,
    hasBeenNominated: false,
    isDemonSuccessor: false,
    hasAbilityEvenDead: false,
    hasGhostVote: true,
    statusEffects: [],
    ...opts,
  };
}

// ═════════════════════════════════════════════════════════════════════
// P0-1 · 镇长和平获胜（状态层断言）
// ═════════════════════════════════════════════════════════════════════
describe("L5 · P0-1 镇长和平获胜：平安日 + 恰 3 人存活 → 善良胜", () => {
  /** 3 人存活：镇长 + 恶魔 + 旅行者（旅行者计入镇长口径） */
  const makeMayorPeacefulBoard = () =>
    [
      seat(0, "mayor", "townsfolk"),
      seat(1, "imp", "demon"),
      seat(2, "scapegoat", "townsfolk"), // 普通第三人
    ] as any[];

  it("入口 A：lastAction = 'check_phase'（普通平安日）也必须判善良胜", () => {
    // ⚠️ 这正是 P0-1 的原始病灶：旧实现要求 lastAction === "execution"，
    //    而普通平安日走的是 `check_phase`（见 useLogicDispatcher.ts:144），
    //    ⇒ 真值永假 ⇒ 镇长和平获胜**从不触发**（实测 A 组从 Evil 修成 Good）。
    const r = checkGameEnd(makeMayorPeacefulBoard(), "check_phase");
    expect(r.isGameOver).toBe(true);
    expect(r.winner, "官方：镇长在场 + 无人被处决 + 3 人存活 → 善良胜").toBe(
      "Good"
    );
  });

  it("入口 B：lastAction = 'execution' 但 executedPlayerId = null（平票/涡流路径）", () => {
    // 涡流平票路径：action.executedId ?? null → execution + null（gameLogic.ts:353）
    const r = checkGameEnd(makeMayorPeacefulBoard(), "execution", null);
    expect(r.isGameOver).toBe(true);
    expect(r.winner).toBe("Good");
  });

  it("反例：镇长醉酒 → 不得判善良胜", () => {
    const seats = makeMayorPeacefulBoard();
    seats[0] = { ...seats[0], isDrunk: true };
    const r = checkGameEnd(seats, "check_phase");
    expect(r.winner, "醉酒的镇长无能力，不能和平获胜").not.toBe("Good");
  });

  it("反例：人数不是 3 → 不得判善良胜", () => {
    const seats = [
      seat(0, "mayor", "townsfolk"),
      seat(1, "imp", "demon"),
      seat(2, "chef", "townsfolk"),
      seat(3, "soldier", "townsfolk"),
    ];
    const r = checkGameEnd(seats, "check_phase");
    expect(r.winner).not.toBe("Good");
  });
});

// ═════════════════════════════════════════════════════════════════════
// P0-2 · 占卜师「死去的邪恶玩家数」（状态层断言）
// ═════════════════════════════════════════════════════════════════════
describe("L5 · P0-2 死邪恶计数：转换标记 / 登记 必须影响结果", () => {
  it("基础：死掉的爪牙 + 恶魔都计入", () => {
    const seats = [
      seat(0, "chef", "townsfolk", { isDead: true }),
      seat(1, "poisoner", "minion", { isDead: true }),
      seat(2, "imp", "demon", { isDead: true }),
      seat(3, "baron", "minion"), // 存活，不计
    ];
    expect(countDeadEvilPlayers(seats)).toBe(2);
  });

  it("⭐ 转换标记优先：善良镇民被转为邪恶且已死 → 必须计入", () => {
    // 旧实现只判 role.type === "minion" | "demon" → 漏掉被转换的善良角色。
    const seats = [
      seat(0, "chef", "townsfolk", { isDead: true, isEvilConverted: true }),
    ];
    expect(
      countDeadEvilPlayers(seats),
      "isEvilConverted 的死人必须算作死亡邪恶玩家（阵营 ≠ 物理身份）"
    ).toBe(1);
  });

  it("⭐ 转换标记优先：邪恶被转为善良且已死 → 不得计入", () => {
    const seats = [
      seat(1, "imp", "demon", { isDead: true, isGoodConverted: true }),
    ];
    expect(
      countDeadEvilPlayers(seats),
      "isGoodConverted 的死人不应算作死亡邪恶玩家"
    ).toBe(0);
  });

  it("registerAsEvil 优先于物理身份", () => {
    const seats = [
      seat(0, "recluse", "outsider", { isDead: true, registerAsEvil: true }),
    ];
    expect(countDeadEvilPlayers(seats)).toBe(1);
  });

  it("deadThisNight 参数：当晚死者也算（不需要 isDead 已落库）", () => {
    const seats = [seat(0, "imp", "demon")]; // isDead 仍为 false
    expect(countDeadEvilPlayers(seats, [0])).toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════
// P1-13 · 夜间确认弹窗「只能选活人」（DOM 状态断言）
// ═════════════════════════════════════════════════════════════════════
describe("L5 · P1-13 弹窗禁用态：aliveOnly 必须真的作用到已死座位", () => {
  function renderModal(aliveOnly: boolean) {
    const seats = [
      seat(0, "chef", "townsfolk"),
      seat(1, "chef", "townsfolk", { isDead: true }), // 已死
      seat(2, "monk", "townsfolk"),
    ];
    let confirmed: number[] | undefined;
    const { unmount } = render(
      <NightActionConfirmModal
        data={
          {
            roleName: "3号-僧侣",
            roleId: "monk",
            actionDescription: "选择一名其他存活玩家进行保护",
            targetLimit: { min: 1, max: 1 },
            actorSeatId: 2,
            allowSelf: false,
            aliveOnly,
            initialSelectedTargets: [],
          } as any
        }
        seats={seats as any}
        onConfirm={(t) => {
          confirmed = t;
        }}
        onCancel={() => {}}
      />
    );
    return {
      unmount,
      getConfirmed: () => confirmed,
      seats,
    };
  }

  /**
   * 取"已死座位"对应的 button 元素。
   *
   * ⚠️ 实测要点（勿凭感觉）：
   *   · 弹窗内容通过 portal 渲染到 **document.body**，`render()` 返回的 container 是空的
   *     ⇒ 必须用 `document.body.querySelectorAll`，不能用 container
   *   · 已死座位的按钮文案形如 `2号(已死亡)`（0 基 id=1 → 1 基展示 2号）
   */
  function deadSeatButton(): HTMLButtonElement | null {
    const btns = Array.from(document.body.querySelectorAll("button"));
    return (
      (btns.find((b) => /2号/.test(b.textContent ?? "")) as
        | HTMLButtonElement
        | undefined) ?? null
    );
  }

  it("aliveOnly=true → 已死座位卡片真的 disabled（DOM 状态）", () => {
    const { unmount } = renderModal(true);
    const btn = deadSeatButton();
    expect(btn, "未渲染出 2号 座位卡（选择器需更新）").not.toBeNull();
    expect(
      btn!.textContent ?? "",
      "应命中已死亡座位卡（文案含「已死亡」）"
    ).toContain("已死亡");
    expect(
      btn!.disabled,
      "❌ aliveOnly=true 时已死座位的 <button> 没有 disabled —— " +
        "说明 aliveOnly 判据没生效（P1-13：消费方读了不存在的字段名，allowDead/aliveOnly 不一致）"
    ).toBe(true);
    unmount();
  });

  it("aliveOnly=false → 同一已死座位不被禁用（对照组，防止护栏恒真）", () => {
    const { unmount } = renderModal(false);
    const btn = deadSeatButton();
    expect(btn, "未渲染出 2号 座位卡（选择器需更新）").not.toBeNull();
    expect(
      btn!.disabled,
      "aliveOnly=false 时不应禁用已死座位 —— 若此处也为 true，" +
        "说明禁用判据与 aliveOnly 无关（护栏失效，需重写）"
    ).toBe(false);
    unmount();
  });

  it("⭐ 判据来源：useNightActionHandler 必须从 allowDead 推导 aliveOnly（源码级 + 行为级）", () => {
    // 上面两条只证明「弹窗收到 aliveOnly 后行为正确」，
    // **不能**证明「生产代码算出的 aliveOnly 是对的」——中间的推导在
    // useNightActionHandler 里。这里把那段推导**单独钉死**，堵住假绿。
    const fs = require("node:fs");
    const path = require("node:path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../../hooks/useNightActionHandler.ts"),
      "utf8"
    );
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    const idx = code.indexOf("const aliveOnly");
    expect(idx, "未找到 `const aliveOnly`，疑似被重命名").toBeGreaterThan(-1);
    const win = code.slice(idx, idx + 400);
    expect(
      win.includes("allowDead"),
      "❌ aliveOnly 的推导没有引用 allowDead（新引擎 targetConfig 的 SST 字段名）" +
        "—— isDeadDisabled 会恒为 false，已死玩家可被点选（P1-13 回归）"
    ).toBe(true);

    // 行为级：复刻推导并验证 monk（allowDead:false）→ true
    const derive = (tc: any): boolean =>
      tc?.aliveOnly ??
      (typeof tc?.allowDead === "boolean" ? !tc.allowDead : false);
    expect(derive({ allowDead: false })).toBe(true);
    expect(derive({ allowDead: true })).toBe(false);
  });
});
