import { describe, expect, it } from "vitest";
import type { Seat } from "../../../app/data";
import {
  PLAYER_VIEW_FORBIDDEN_TERMS,
  findPlayerViewLeaks,
  getLunaticNightHint,
  getPlayerFacingRole,
  getPlayerFacingRoleName,
  getPlayerFacingRoleType,
  getPlayerFacingSeatLabel,
  sanitizePlayerFacingText,
} from "../playerView";

/**
 * B 组（全局玩家视角脱敏）工具层的具体断言。
 * 机制说明见 src/utils/playerView.ts 顶部注释。
 */

const lunaticSeat = {
  id: 2,
  role: { id: "lunatic", name: "疯子", type: "outsider" },
  apparentDemonRole: { id: "vortox", name: "涡流", type: "demon" },
} as unknown as Seat;

const drunkSeat = {
  id: 3,
  role: { id: "drunk", name: "酒鬼", type: "outsider" },
  charadeRole: { id: "empath", name: "共情者", type: "townsfolk" },
} as unknown as Seat;

const normalSeat = {
  id: 4,
  role: { id: "chef", name: "厨师", type: "townsfolk" },
} as unknown as Seat;

describe("playerView · 玩家可见身份解析", () => {
  it("疯子 → apparentDemonRole（涡流），绝不返回 lunatic", () => {
    expect(getPlayerFacingRoleName(lunaticSeat)).toBe("涡流");
    expect(getPlayerFacingRoleType(lunaticSeat)).toBe("demon");
    expect(getPlayerFacingRole(lunaticSeat)?.id).toBe("vortox");
    expect(getPlayerFacingRoleName(lunaticSeat)).not.toContain("疯子");
  });

  it("酒鬼 → charadeRole（共情者）", () => {
    expect(getPlayerFacingRoleName(drunkSeat)).toBe("共情者");
    expect(getPlayerFacingRoleType(drunkSeat)).toBe("townsfolk");
  });

  it("普通角色 → 自己", () => {
    expect(getPlayerFacingRoleName(normalSeat)).toBe("厨师");
  });
});

describe("playerView · 座位标签（目标网格脱敏）", () => {
  it("只给座位号 + 玩家名，绝不带角色名", () => {
    expect(getPlayerFacingSeatLabel({ id: 0, playerName: "玩家1" })).toBe("1号");
    expect(getPlayerFacingSeatLabel({ id: 1, playerName: "张三" })).toBe(
      "2号 张三"
    );
    const anySeat = { id: 5, playerName: "李四" } as any;
    expect(getPlayerFacingSeatLabel(anySeat)).not.toContain("厨师");
  });
});

describe("playerView · 文案脱敏与泄漏词表", () => {
  it("剥掉【受干扰】/（虚假信息）等说书人标记", () => {
    expect(
      sanitizePlayerFacingText("占卜师【受干扰】探查【3号和5号】：没有恶魔")
    ).toBe("占卜师探查【3号和5号】：没有恶魔");
    expect(sanitizePlayerFacingText("得知：场上有2对邪恶玩家邻座。（虚假信息）")).toBe(
      "得知：场上有2对邪恶玩家邻座。"
    );
    expect(
      sanitizePlayerFacingText(
        "3号玩家的真实身份：男爵 (中毒/醉酒状态，此为假信息)"
      )
    ).toBe("男爵");
  });

  it("不会误伤能力本身的合法表述（投毒者的「使X号中毒」）", () => {
    const src = "3号玩家 中毒（持续至次日黄昏）";
    expect(sanitizePlayerFacingText(src)).toBe(src);
  });

  it("词表能抓出真实泄漏", () => {
    expect(findPlayerViewLeaks("唤醒3号【疯子】，选择击杀目标")).toContain("疯子");
    expect(findPlayerViewLeaks("该角色处于醉酒/中毒状态，能力可能不生效")).toContain(
      "能力可能不生效"
    );
    expect(findPlayerViewLeaks("涡流世界 · 镇民信息将反相")).toContain("涡流世界");
    expect(findPlayerViewLeaks("3号玩家的真实身份：男爵")).toContain("真实身份");
    expect(findPlayerViewLeaks("爪牙是: 2号")).toEqual([]);
  });

  it("词表本身自检：不得出现空串或重复项", () => {
    expect(PLAYER_VIEW_FORBIDDEN_TERMS.every((t) => t.length > 0)).toBe(true);
    expect(new Set(PLAYER_VIEW_FORBIDDEN_TERMS).size).toBe(
      PLAYER_VIEW_FORBIDDEN_TERMS.length
    );
  });
});

describe("playerView · A4 真恶魔提示（每夜、多目标、0 目标也有文案）", () => {
  const mk = (id: number, targetIds?: number[], target?: number) =>
    ({
      id,
      role: { id: "lunatic", name: "疯子", type: "outsider" },
      lunaticTargetIds: targetIds,
      lunaticTarget: target,
      isDead: false,
    }) as unknown as Seat;

  it("多目标全部列出", () => {
    expect(getLunaticNightHint([mk(1, [2, 4])])).toBe(
      "🌀 疯子本夜选择了 3号玩家、5号玩家"
    );
  });

  it("兼容单目标历史字段 lunaticTarget", () => {
    expect(getLunaticNightHint([mk(1, undefined, 0)])).toBe(
      "🌀 疯子本夜选择了 1号玩家"
    );
  });

  it("未选择目标时给出明确文案（不能静默）", () => {
    expect(getLunaticNightHint([mk(1, [])])).toBe("🌀 疯子本夜未选择任何玩家");
  });

  it("场上没有疯子 → null（不产生误导提示）", () => {
    expect(
      getLunaticNightHint([
        { id: 0, role: { id: "chef", name: "厨师", type: "townsfolk" } } as any,
      ])
    ).toBeNull();
  });
});
