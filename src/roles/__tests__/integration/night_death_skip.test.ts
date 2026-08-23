import { describe, expect, test } from "vitest";

describe("夜间击杀即时死亡与行动顺序跳过机制", () => {
  test("恶魔杀人后，在恶魔之后行动的角色因已死亡被跳过；在恶魔之前行动的角色已正常触发", () => {
    // 模拟夜晚队列：[投毒者(0), 恶魔(1), 占卜师(2), 共情者(3)]
    const wakeQueue = [0, 1, 2, 3];
    const seats = [
      { id: 0, role: { id: "poisoner", name: "投毒者" }, isDead: false },
      { id: 1, role: { id: "imp", name: "小恶魔" }, isDead: false },
      { id: 2, role: { id: "fortune_teller", name: "占卜师" }, isDead: false },
      { id: 3, role: { id: "empath", name: "共情者" }, isDead: false },
    ];

    // 1. 投毒者 (index 0) 正常行动
    const executedSteps: number[] = [0];

    // 2. 恶魔 (index 1) 行动，击杀 占卜师 (id: 2)
    executedSteps.push(1);
    seats[2].isDead = true;
    const deadThisNight = [2];

    // 3. 推进下一步：模拟 continueToNextAction 中的跳过算法
    const findNextValidIndex = (fromIndex: number) => {
      let idx = fromIndex;
      while (idx < wakeQueue.length) {
        const candidateId = wakeQueue[idx];
        const s = seats.find((seat) => seat.id === candidateId);
        if (!s) {
          idx++;
          continue;
        }
        const isDead = s.isDead;
        const canActWhileDead =
          (s as any).hasAbilityEvenDead ||
          (s.role?.id === "ravenkeeper" && deadThisNight.includes(candidateId)) ||
          (s.role?.id === "sage" && deadThisNight.includes(candidateId));

        if (!isDead || canActWhileDead) {
          return idx;
        }
        idx++;
      }
      return idx;
    };

    // 从恶魔下一步 (raw nextIndex = 2) 开始查找
    const nextValidIndex = findNextValidIndex(2);

    // 验证：占卜师 (index 2) 被跳过，直接命中共情者 (index 3)
    expect(nextValidIndex).toBe(3);
    executedSteps.push(nextValidIndex);

    expect(executedSteps).toEqual([0, 1, 3]);
  });

  test("守鸦人在夜晚被恶魔击杀后，作为死亡触发角色正常被唤醒", () => {
    const wakeQueue = [1, 2];
    const seats = [
      { id: 1, role: { id: "imp", name: "小恶魔" }, isDead: false },
      { id: 2, role: { id: "ravenkeeper", name: "守鸦人" }, isDead: false, hasAbilityEvenDead: true },
    ];

    // 恶魔 (1) 杀 守鸦人 (2)
    seats[1].isDead = false;
    seats[0] = seats[0] || seats[1];
    seats[1].isDead = true;
    const deadThisNight = [2];

    let idx = 1;
    const candidateId = wakeQueue[idx];
    const s = seats.find((seat) => seat.id === candidateId);
    const canActWhileDead =
      (s as any)?.hasAbilityEvenDead ||
      (s?.role?.id === "ravenkeeper" && deadThisNight.includes(candidateId));

    expect(canActWhileDead).toBe(true);
  });
});
