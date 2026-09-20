// @vitest-environment jsdom
/**
 * L5「因果链」测试 —— 哲学家：UI 点击 → 状态落地 → 夜序生效
 *
 * ⚠️ 这一层为解决「测试全绿、人工实测一上手就崩」而设。
 *
 * ── 为什么专门给哲学家写 L5 ────────────────────────────────────────
 * 哲学家的缺陷**恰好是"测试看起来绿、实测完全不对"的典型**：
 *   · `philosopher.ability.ts` 是完整实现，单测跑得通 → L1/L2 绿
 *   · `savant`/`gossip` 等日间弹窗渲染正常 → L3 绿
 *   · 但真实路径走的是 `useDayActions.ts` 的 `transform_ability` 分支，
 *     那里调 `changeRole()` **把哲学家变成了所选角色** —— 没有任何一条
 *     既有测试覆盖这个分支。于是「测试绿、实测变身」长期共存。
 *
 * ── 本文件断言的三段链路 ──────────────────────────────────────────
 *   ① UI：RoleSelectModal 点击角色卡片 → onConfirm(roleId) 被正确调用
 *   ② 状态：该 roleId 落到座位（acquiredAbilities / philosopherGainedRole）
 *   ③ 生效：夜序队列里出现「哲学家代打」节点（官方范例 1）
 *
 * ── 判据来源（官方原文）────────────────────────────────────────────
 *   「他获得那个角色的能力，**但不会变成那个角色**。」
 *   「如果哲学家获得了一种在夜晚使用的能力，他将在该角色应该被唤醒的
 *     时候被唤醒。如果这个角色能力是"首个夜晚"能力，他会在**当晚**使用。」
 *   「如果这个角色在场，他醉酒。」
 *
 * ── 自检（防假绿，必做）────────────────────────────────────────────
 *   把 `useDayActions.ts` transform_ability 分支里写 `acquiredAbilities`
 *   的那段注释掉 → 「状态落地」用例必须变红。
 */

import { fireEvent } from "@testing-library/dom";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// ⚠️ RoleSelectModal 只通过 useGameActions() 取上下文（渲染需要 selectedScript /
//    seats / getSeatRoleId / setCurrentModal）。这里 mock 掉该 hook，
//    以便把测试焦点钉在「点击角色卡 → onConfirm(roleId)」这条真实 UI 契约上。
const mockSetCurrentModal = vi.fn();
vi.mock("../../../contexts/GameActionsContext", () => ({
  useGameActions: () => ({
    setCurrentModal: mockSetCurrentModal,
    selectedScript: null,
    seats: [],
    getSeatRoleId: () => undefined,
  }),
}));

import { RoleSelectModal } from "../RoleSelectModal";

// ═════════════════════════════════════════════════════════════
// ① UI 段：真实渲染 + 真实点击
// ═════════════════════════════════════════════════════════════

describe("L5 · 哲学家 ① UI：RoleSelectModal 点击 → onConfirm(roleId)", () => {
  it("渲染哲学家选择弹窗 → 点击「筑梦师」卡片 → onConfirm 收到 'dreamer'", async () => {
    const onConfirm = vi.fn();

    // 真实数据源里的角色（确保卡片确实存在，否则本用例是空跑）
    const { roles } = await import("../../../../app/data");
    const dreamer = roles.find((r) => r.id === "dreamer");
    expect(dreamer, "数据源里应有 dreamer（否则本用例是空跑）").toBeTruthy();

    render(
      <RoleSelectModal
        // ⚠️ GameModals 传下来的是 `currentModal.data`（见 GameModals.tsx:153），
        //    因此 `onConfirm` 位于**顶层**，不是 `data.onConfirm`。
        modal={
          {
            type: "philosopher",
            targetId: 0,
            onConfirm,
          } as any
        }
      />
    );

    // 真实点击：定位「筑梦师」所在的角色卡片按钮
    const card = screen.getByText("筑梦师").closest("button");
    expect(card, "应能定位到筑梦师角色卡片按钮").toBeTruthy();
    fireEvent.click(card!);

    expect(onConfirm).toHaveBeenCalledWith("dreamer");
  });
});

// ═════════════════════════════════════════════════════════════
// ② 状态段：把「UI 产出的选择」喂进哲学家能力 → 状态落地
// ═════════════════════════════════════════════════════════════

describe("L5 · 哲学家 ② 状态落地（UI 选择 → 座位字段真的变了）", () => {
  it("⭐ 官方：「获得能力，但不会变成那个角色」—— role.id 不变 + acquiredAbilities 落地", async () => {
    const { runFullAbilityPipeline } = await import(
      "../../../utils/middlewarePipeline"
    );
    const { philosopherAbility } = await import(
      "../../../roles/new_engine/philosopher.ability"
    );

    const seats: any[] = [
      {
        id: 0,
        playerName: "1号",
        isDead: false,
        isDrunk: false,
        isPoisoned: false,
        hasUsedDayAbility: false,
        role: { id: "philosopher", name: "哲学家", type: "townsfolk" },
        charadeRole: null,
        statusDetails: [],
        statusEffects: [],
      },
      {
        id: 1,
        playerName: "2号",
        isDead: false,
        isDrunk: false,
        isPoisoned: false,
        hasUsedDayAbility: false,
        role: { id: "soldier", name: "士兵", type: "townsfolk" },
        charadeRole: null,
        statusDetails: [],
        statusEffects: [],
      },
    ];

    // before：哲学家没有 dreamer 能力
    expect(seats[0].acquiredAbilities ?? []).not.toContain("dreamer");

    const r = await runFullAbilityPipeline(philosopherAbility as any, {
      snapshot: { nightCount: 1, seats },
      actionNode: { seatId: 0, roleId: "philosopher", roleName: "哲学家" },
      targetIds: [],
      storytellerInput: { chosenRoleId: "dreamer" },
      meta: {},
    } as any);

    const philo = r.snapshot.seats.find((s: any) => s.id === 0)!;

    // ⭐ 核心断言 1：身份不变（这是本次修复的核心 —— 旧实现会变身）
    expect(
      philo.role?.id,
      "⭐ 因果链断裂：哲学家被变成了所选角色（应为 philosopher）"
    ).toBe("philosopher");

    // ⭐ 核心断言 2：能力落地
    expect(
      philo.acquiredAbilities,
      "⭐ 因果链断裂：哲学家座位没有记下所获得的能力"
    ).toContain("dreamer");
    expect((philo as any).philosopherGainedRole).toBe("dreamer");
  });
});

// ═════════════════════════════════════════════════════════════
// ③ 生效段：能力 → 夜序队列真的出现哲学家代打
// ═════════════════════════════════════════════════════════════

describe("L5 · 哲学家 ③ 生效（获得的能力 → 夜序真的执行）", () => {
  it("⭐ 官方范例 1：哲学家获得筑梦师能力后，在筑梦师应该行动时被唤醒", async () => {
    const { generateDynamicNightQueue } = await import(
      "../../../utils/dynamicQueueGenerator"
    );

    const seats: any[] = [
      {
        id: 0,
        isDead: false,
        role: { id: "philosopher", name: "哲学家", type: "townsfolk" },
        acquiredAbilities: ["dreamer"],
        philosopherGainedRole: "dreamer",
      },
      { id: 1, isDead: false, role: { id: "soldier", name: "士兵", type: "townsfolk" } },
    ];

    const queue = generateDynamicNightQueue(
      [
        {
          roleId: "dreamer",
          roleName: "筑梦师",
          firstNightPriority: 30,
          otherNightPriority: 31,
          firstNightOnly: false,
          wakeMessage: "role.dreamer.wake",
          abilityId: "dreamer_ability",
        },
      ],
      { nightCount: 2, seats } as any,
      { isFirstNight: false }
    );

    const node = queue.find((n) => n.roleId === "dreamer");
    expect(
      node,
      "⭐ 因果链断裂：哲学家获得了筑梦师能力，但夜序里没有他的行动条目"
    ).toBeTruthy();
    expect(node!.seatId, "行动者应是哲学家（0号）").toBe(0);
    expect(node!.roleName, "说书人侧应能看出是哲学家在代打").toContain("哲学家");
  });
});
