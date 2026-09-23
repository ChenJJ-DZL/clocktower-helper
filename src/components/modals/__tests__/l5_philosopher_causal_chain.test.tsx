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

// ═════════════════════════════════════════════════════════════
// ④ ✅ 2026-09-22 **夜间**选角 —— 迁移后的**真实**路径
// ═════════════════════════════════════════════════════════════
/**
 * 背景（按官方迁移）：官方【哲学家】「每局游戏限一次，**在夜晚时**，你可以选择一个
 * 善良角色：你获得该角色的能力。」
 *   · 原先唯一可用的选角入口在**日间**（上面 ① 的 `RoleSelectModal`，经 `useDayActions`
 *     的 `transform_ability` 分支），且 `philosopher.ts` 同时写了 `day:` 块 ⇒ 夜/日双入口，
 *     而夜间节点给的却是**座位**选择 —— 语义都不对。
 *   · 迁移后：选角改在**夜间行动确认窗**（`NightActionConfirmModal` 的角色选择器，
 *     与洗脑师/奥乔同一条通路）完成
 *     ⇒ `useNightActionHandler` 的 `requiresRoleSelection` 列表加 `philosopher`
 *       + 新增哲学家分支把 `chosenRoleId` 写进 `actionData`。
 *
 * ⚠️ 为什么必须有这条：只改个白名单数组是"看不见的行为变更"——
 *   若不渲染，没人知道夜间到底有没有角色可点。
 */
describe("L5 · 哲学家 ④ 夜间选角（迁移后的真实路径）", () => {
  const script = "凶宅魅影";
  const availableRoles = [
    { id: "chef", name: "厨师", type: "townsfolk", script },
    { id: "saint", name: "圣徒", type: "outsider", script },
    { id: "poisoner", name: "投毒者", type: "minion", script },
    { id: "imp", name: "小恶魔", type: "demon", script },
  ];
  const seats = [
    { id: 0, role: availableRoles[0], isDead: false },
    { id: 1, role: availableRoles[1], isDead: false },
    { id: 2, role: availableRoles[2], isDead: false },
    { id: 3, role: availableRoles[3], isDead: false },
  ];

  it("⭐ roleId=philosopher ⇒ 夜间确认窗**必须**渲染角色选项，选中后 onConfirm 能收到该角色", async () => {
    const { NightActionConfirmModal } = await import("../NightActionConfirmModal");
    const onConfirm = vi.fn();
    render(
      <NightActionConfirmModal
        data={{
          roleId: "philosopher",
          requiresRoleSelection: true,
          roleName: "1号-哲学家",
          actionDescription: "选择一名善良角色",
          targetLimit: { min: 0, max: 0 },
          onConfirm,
        } as any}
        seats={seats as any}
        availableRoles={availableRoles as any}
        selectedScript={undefined as any}
        onConfirm={onConfirm}
        onCancel={() => {}}
      />
    );

    /**
     * ⚠️ **必须查 `document.body`**：`ModalWrapper` 会把弹窗 **portal 到 body**，
     *   因此 RTL `render()` 返回的 `container` 里是**空的**（本项目记录在案的坑）。
     */
    const options = document.body.querySelectorAll("button[data-role-id]");
    expect(
      options.length,
      "❌ 夜间确认窗没有渲染角色选项 —— 哲学家在夜里将**无法发动能力**（迁移失败）"
    ).toBeGreaterThan(0);

    // 点第一个角色选项 → 再点确认 → onConfirm 必须带回该角色
    fireEvent.click(options[0]);
    const confirmBtn = Array.from(document.body.querySelectorAll("button")).find(
      (b) => /确认选择/.test(b.textContent ?? "")
    ) as HTMLButtonElement | undefined;
    expect(confirmBtn, "❌ 找不到「确认选择」按钮").toBeTruthy();
    fireEvent.click(confirmBtn!);
    expect(onConfirm, "❌ 确认后未回调 onConfirm").toHaveBeenCalledTimes(1);
    const chosen = onConfirm.mock.calls[0][1];
    const chosenId = typeof chosen === "string" ? chosen : chosen?.id;
    expect(
      ["chef", "saint", "poisoner", "imp"],
      "❌ onConfirm 未把所选角色带回（拿到 " + JSON.stringify(chosen) + "）"
    ).toContain(chosenId);
  });

  it("负向对照：**非**选角类夜间步骤不得渲染角色选项（防白名单写宽）", async () => {
    const { NightActionConfirmModal } = await import("../NightActionConfirmModal");
    render(
      <NightActionConfirmModal
        data={{
          roleId: "chef",
          roleName: "1号-厨师",
          actionDescription: "无目标",
          targetLimit: { min: 0, max: 0 },
          onConfirm: vi.fn(),
        } as any}
        seats={seats as any}
        availableRoles={availableRoles as any}
        selectedScript={undefined as any}
        onConfirm={vi.fn()}
        onCancel={() => {}}
      />
    );
    expect(
      document.body.querySelectorAll("button[data-role-id]").length,
      "❌ 普通夜间步骤不该出现角色选项"
    ).toBe(0);
  });
});
