import { describe, expect, it } from "vitest";
import { createSnapshot, restoreSnapshot } from "../../utils/undoSnapshot";

describe("单步操作级 Undo / Redo 精准撤销与重做测试", () => {
  it("夜间单个角色行动推进时，撤销应当回退到上一个角色的行动步骤，而不是跳回上一阶段", () => {
    // 模拟对局状态序列
    // 状态 0: 准备阶段
    const state0 = {
      gamePhase: "setup",
      nightCount: 1,
      currentWakeIndex: 0,
      wakeQueueIds: [0, 1, 2],
      seats: [
        { id: 0, role: { id: "washerwoman", name: "洗衣妇" }, isDead: false },
        { id: 1, role: { id: "librarian", name: "图书管理员" }, isDead: false },
        { id: 2, role: { id: "investigator", name: "调查员" }, isDead: false },
      ],
      history: [],
      historyIndex: -1,
    };

    const history: any[] = [];

    // 1. 进入首夜（保存第0步快照：洗衣妇行动）
    const state1 = {
      ...state0,
      gamePhase: "firstNight",
      currentWakeIndex: 0,
    };
    history.push(createSnapshot(state1));

    // 2. 洗衣妇确认完成，推进到第1步（图书管理员行动）
    const state2 = {
      ...state1,
      currentWakeIndex: 1,
    };
    history.push(createSnapshot(state2));

    // 3. 图书管理员确认完成，推进到第2步（调查员行动）
    const state3 = {
      ...state2,
      currentWakeIndex: 2,
    };
    history.push(createSnapshot(state3));

    expect(history.length).toBe(3);

    // 当前在调查员（index = 2）
    let currentIndex = 2;

    // 用户点击「撤销」：应当回退到图书管理员（index = 1），且 gamePhase 仍为首夜
    currentIndex -= 1;
    const undoneToStep1 = restoreSnapshot(history[currentIndex]);
    expect(undoneToStep1.gamePhase).toBe("firstNight");
    expect(undoneToStep1.currentWakeIndex).toBe(1);

    // 再次点击「撤销」：应当回退到洗衣妇（index = 0），且 gamePhase 仍为首夜
    currentIndex -= 1;
    const undoneToStep0 = restoreSnapshot(history[currentIndex]);
    expect(undoneToStep0.gamePhase).toBe("firstNight");
    expect(undoneToStep0.currentWakeIndex).toBe(0);

    // 用户点击「重做」：应当恢复到图书管理员（index = 1）
    currentIndex += 1;
    const redoneToStep1 = restoreSnapshot(history[currentIndex]);
    expect(redoneToStep1.gamePhase).toBe("firstNight");
    expect(redoneToStep1.currentWakeIndex).toBe(1);

    // 再次点击「重做」：应当恢复到调查员（index = 2）
    currentIndex += 1;
    const redoneToStep2 = restoreSnapshot(history[currentIndex]);
    expect(redoneToStep2.gamePhase).toBe("firstNight");
    expect(redoneToStep2.currentWakeIndex).toBe(2);
  });
});
