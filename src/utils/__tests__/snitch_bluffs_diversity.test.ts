import { describe, expect, it } from "vitest";
import { roles } from "../../../app/data";
import {
  computeAllMinionSnitchBluffs,
  getSnitchBluffsForMinion,
  getSnitchCandidateGoodRoles,
  getSnitchExtraBluffsForDemon,
} from "../snitchBluffs";

describe("告密者（Snitch）爪牙伪装生成与差异性", () => {
  const SCRIPT_ROLE_IDS = [
    // 镇民
    "washerwoman", "librarian", "investigator", "chef", "empath",
    "fortune_teller", "undertaker", "monk", "ravenkeeper", "virgin",
    "slayer", "soldier", "mayor",
    // 外来者
    "butler", "drunk", "recluse", "saint", "snitch",
    // 爪牙
    "poisoner", "spy", "scarlet_woman", "baron",
    // 恶魔
    "imp",
  ];

  it("① 候选池正确排除在场角色与醉酒", () => {
    const seats = [
      { id: 0, role: { id: "snitch", name: "告密者", type: "outsider" } },
      { id: 1, role: { id: "washerwoman", name: "洗衣妇", type: "townsfolk" } },
      { id: 2, role: { id: "poisoner", name: "投毒者", type: "minion" } },
      { id: 3, role: { id: "baron", name: "男爵", type: "minion" } },
      { id: 4, role: { id: "imp", name: "小恶魔", type: "demon" } },
    ];

    const pool = getSnitchCandidateGoodRoles(seats as any, roles, SCRIPT_ROLE_IDS);
    const poolIds = pool.map((r) => r.id);

    // 在场的洗衣妇与告密者不应出现在候选池
    expect(poolIds).not.toContain("washerwoman");
    expect(poolIds).not.toContain("snitch");
    // 酒鬼不应作为伪装
    expect(poolIds).not.toContain("drunk");
    // 不在场的镇民和外来者应该在候选池
    expect(poolIds).toContain("monk");
    expect(poolIds).toContain("saint");
  });

  it("② 每个爪牙玩家从候选池中随机生成 3 个，且不同爪牙得知的身份不完全相同", () => {
    const seats = [
      { id: 0, role: { id: "snitch", name: "告密者", type: "outsider" } },
      { id: 1, role: { id: "poisoner", name: "投毒者", type: "minion" } }, // 爪牙 1
      { id: 2, role: { id: "baron", name: "男爵", type: "minion" } },       // 爪牙 2
      { id: 3, role: { id: "spy", name: "间谍", type: "minion" } },         // 爪牙 3
      { id: 4, role: { id: "imp", name: "小恶魔", type: "demon" } },
    ];

    const bluffs1 = getSnitchBluffsForMinion(seats as any, roles, SCRIPT_ROLE_IDS, 1);
    const bluffs2 = getSnitchBluffsForMinion(seats as any, roles, SCRIPT_ROLE_IDS, 2);
    const bluffs3 = getSnitchBluffsForMinion(seats as any, roles, SCRIPT_ROLE_IDS, 3);

    // 每个爪牙均得知 3 个伪装
    expect(bluffs1).toHaveLength(3);
    expect(bluffs2).toHaveLength(3);
    expect(bluffs3).toHaveLength(3);

    // 每个爪牙内部 3 个角色互不重复
    expect(new Set(bluffs1).size).toBe(3);
    expect(new Set(bluffs2).size).toBe(3);
    expect(new Set(bluffs3).size).toBe(3);

    // 关键断言：不同爪牙得知的 3 个身份组合不完全相同（不相等）
    const sig1 = [...bluffs1].sort().join("|");
    const sig2 = [...bluffs2].sort().join("|");
    const sig3 = [...bluffs3].sort().join("|");

    expect(sig1).not.toBe(sig2);
    expect(sig1).not.toBe(sig3);
    expect(sig2).not.toBe(sig3);
  });

  it("③ 同一爪牙多次生成具有确定性（不发生前后晃动/不一致）", () => {
    const seats = [
      { id: 0, role: { id: "snitch", name: "告密者", type: "outsider" } },
      { id: 1, role: { id: "poisoner", name: "投毒者", type: "minion" } },
      { id: 2, role: { id: "imp", name: "小恶魔", type: "demon" } },
    ];

    const run1 = getSnitchBluffsForMinion(seats as any, roles, SCRIPT_ROLE_IDS, 1);
    const run2 = getSnitchBluffsForMinion(seats as any, roles, SCRIPT_ROLE_IDS, 1);

    expect(run1).toEqual(run2);
  });

  it("④ 提线木偶×告密者相克：恶魔额外得知 3 个伪装角色", () => {
    const seats = [
      { id: 0, role: { id: "snitch", name: "告密者", type: "outsider" } },
      { id: 1, role: { id: "marionette", name: "提线木偶", type: "minion" } },
      { id: 2, role: { id: "imp", name: "小恶魔", type: "demon" } },
    ];

    const extra = getSnitchExtraBluffsForDemon(seats as any, roles, SCRIPT_ROLE_IDS, ["僧侣", "猎手", "洗衣妇"]);
    expect(extra).toHaveLength(3);
    expect(new Set(extra).size).toBe(3);
  });
});
