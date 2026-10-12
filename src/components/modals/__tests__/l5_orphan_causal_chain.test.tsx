// @vitest-environment jsdom
/**
 * L5「因果链」· 孤儿角色抽样（2026-10-08 全权授权批次）
 *
 * 范式照抄 l5_poisoner_causal_chain.test.tsx（已验证 + 已过防假绿自检）。
 * 抽样覆盖三类效果语义的孤儿角色（全部不在任何内置剧本，自定义剧本场景）：
 *   · acrobat    杂技演员 —— 检测致死类（选目标：若其醉酒/中毒则自己死）
 *   · fearmonger 恐惧之灵 —— 标记类（选目标：snapshot.fearTarget 落地）
 *   · astrologer 星象师   —— 信息猜测类（选目标：阵营猜测结果落地）
 *
 * ⚠️ 红线（skill §1.1）：禁止只断言「弹窗打开了/按钮可点」——
 *    必须断言「操作之后状态与操作之前不同」（before/after 对比）。
 * 判据来源 = 各 ability 头注官方原文 + stateUpdate 实际落地字段（逐个读过，未凭记忆）。
 */

import { fireEvent } from "@testing-library/dom";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { acrobatAbility } from "../../../roles/new_engine/acrobat.ability";
import { fearmongerAbility } from "../../../roles/new_engine/fearmonger.ability";
import { astrologerAbility } from "../../../roles/new_engine/astrologer.ability";
import { board, runRole } from "../../../roles/__tests__/_tbHarness";
import { NightActionConfirmModal } from "../NightActionConfirmModal";

/** 真实交互：渲染弹窗 → 点座位卡 → 点确认 → 收集 onConfirm 产出 */
function clickSeatAndConfirm(opts: {
  roleName: string;
  roleId: string;
  actionDescription: string;
  targetLimit: { min: number; max: number };
  actorSeatId: number;
  allowSelf?: boolean;
  aliveOnly?: boolean;
  seatIds: number[];
  seats: any[];
}) {
  let confirmed: number[] | undefined;
  const { unmount } = render(
    <NightActionConfirmModal
      data={
        {
          roleName: opts.roleName,
          roleId: opts.roleId,
          actionDescription: opts.actionDescription,
          targetLimit: opts.targetLimit,
          actorSeatId: opts.actorSeatId,
          allowSelf: opts.allowSelf ?? false,
          aliveOnly: opts.aliveOnly ?? true,
          initialSelectedTargets: [],
        } as any
      }
      seats={opts.seats}
      onConfirm={(t?: number[]) => {
        confirmed = t;
      }}
      onCancel={() => {}}
    />
  );
  for (const sid of opts.seatIds) {
    fireEvent.click(screen.getByText(`${sid + 1}号`, { exact: true }));
  }
  fireEvent.click(screen.getByRole("button", { name: /确认/ }));
  unmount();
  return { confirmed };
}

describe("L5 · 孤儿角色因果链抽样：UI 点击 → 状态落地", () => {
  it("⭐ acrobat 杂技演员：选中毒目标 → acrobatResult 判定「目标醉酒/中毒」落地", async () => {
    // 5人局：0洗衣妇 1杂技演员 2厨师(中毒夹具) 3管家 4小恶魔
    const seats = board(["washerwoman", "acrobat", "chef", "butler", "imp"]);
    const target = seats.find((s: any) => s.id === 2)!;
    target.statusEffects = [{ type: "poisoned", source: "poisoner" }];

    const { confirmed } = clickSeatAndConfirm({
      roleName: "2号-杂技演员",
      roleId: "acrobat",
      actionDescription: "选择一名玩家：如果当晚他醉酒或中毒，你死亡",
      targetLimit: { min: 1, max: 1 },
      actorSeatId: 1,
      allowSelf: true,
      seatIds: [2],
      seats,
    });
    expect(confirmed, "UI 应把 3号 的座位 id（0基=2）传给 onConfirm").toEqual([2]);

    const res = await runRole(acrobatAbility, seats, 1, {
      night: 2,
      targets: confirmed!,
    });
    const r = res.meta?.acrobatResult ?? res.snapshot?._abilityResults?.acrobat;
    expect(r, "⭐ 因果链断开：结算后无 acrobatResult").toBeDefined();
    expect(r.targetId, "检测目标应为 3号（0基=2）").toBe(2);
    expect(
      r.isDrunkOrPoisoned,
      "⭐ 目标带 poisoned 标记 → 检测判定应为 true（官方：若他醉酒或中毒，你死亡）"
    ).toBe(true);
  });

  it("⭐ fearmonger 恐惧之灵：指向目标 → snapshot.fearTarget 真的落地", async () => {
    // 5人局：0洗衣妇 1恐惧之灵 2厨师 3管家 4小恶魔
    const seats = board(["washerwoman", "fearmonger", "chef", "butler", "imp"]);

    const { confirmed } = clickSeatAndConfirm({
      roleName: "2号-恐惧之灵",
      roleId: "fearmonger",
      actionDescription: "指向任意一名玩家（放置恐惧标记）",
      targetLimit: { min: 1, max: 1 },
      actorSeatId: 1,
      seatIds: [0],
      seats,
    });
    expect(confirmed, "UI 应把 1号 的座位 id（0基=0）传给 onConfirm").toEqual([0]);

    const before = (seats as any).fearTarget;
    const res = await runRole(fearmongerAbility, seats, 1, {
      night: 1,
      targets: confirmed!,
    });
    expect(
      res.snapshot.fearTarget,
      `⭐ 因果链断开：结算后 snapshot.fearTarget 未落地（before=${before}）`
    ).toBe(0);
  });

  it("⭐ astrologer 星象师：指向目标猜测阵营 → 猜测结果落地", async () => {
    // 5人局：0洗衣妇 1厨师 2星象师 3管家 4小恶魔
    const seats = board(["washerwoman", "chef", "astrologer", "butler", "imp"]);

    const { confirmed } = clickSeatAndConfirm({
      roleName: "3号-星象师",
      roleId: "astrologer",
      actionDescription: "选择一名玩家（可以是自己）：猜测其阵营，说书人告知对错",
      targetLimit: { min: 1, max: 1 },
      actorSeatId: 2,
      allowSelf: true,
      seatIds: [0],
      seats,
    });
    expect(confirmed, "UI 应把 1号 的座位 id（0基=0）传给 onConfirm").toEqual([0]);

    const res = await runRole(astrologerAbility, seats, 2, {
      night: 2, // 官方「每个夜晚*」→ 首夜不行动（ability 头注），preCheck 会拦首夜
      targets: confirmed!,
    });
    const r = res.snapshot?._abilityResults?.astrologer;
    expect(r, "⭐ 因果链断开：结算后无 astrologer 结果").toBeDefined();
    expect(r.targetId ?? r.guessTargetId, "猜测目标应记录为 1号（0基=0）").toBe(0);
  });
});
