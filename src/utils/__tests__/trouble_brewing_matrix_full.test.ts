/**
 * 暗流涌动（Trouble Brewing）· 全角色 × 状态 批量矩阵测试
 *
 * 剧本：trouble_brewing（官方基础剧本，22 角色 = 镇民 13 / 外来者 4 / 爪牙 4 / 恶魔 1）
 * 维度：3 夜（首夜/第2夜/第3夜）× 7 状态 = **462 单元格**
 *
 * 状态维度**按本剧本实际机制选取**（不照抄罂粟花开的涡流/罂粟种植者 —— TB 没有这两个）：
 *   常态 / 中毒 / 酒鬼伪装 / 陌客在座 / 间谍在座 / 昨夜处决
 *   · 陌客在座：官方「你可能会被当作邪恶阵营、爪牙角色或恶魔角色」→ TB 最大信息污染源
 *   · 间谍在座：官方「你可能会被当作善良阵营、镇民角色或外来者角色」→ 反向污染
 *   · 昨夜处决：注入 lastDuskExecution → 送葬者的信息源（其余角色应不受影响）
 *
 * 判据一律取 `src/data/officialRoleDocs.json` 官方原文。
 * 采集脚手架为通用件：`./harness/scriptMatrix`（换剧本只改本文件的 CONFIG）。
 */
import { describe, expect, it } from "vitest";
import { ENGINE_CONFIG } from "../../hooks/useNightEngine";
import { initializeAbilityRegistry } from "../../roles/new_engine/abilityRegistry";
import {
  collectScriptMatrix,
  findCell,
  printMatrixSummary,
  writeMatrixReport,
  type AdapterFlags,
  type MutateCtx,
  type ScriptMatrixConfig,
} from "./harness/scriptMatrix";

/** 暗流涌动官方花名册（来源 app/data.ts scripts[trouble_brewing].roleIds） */
const ROSTER = {
  townsfolk: [
    "washerwoman",
    "librarian",
    "investigator",
    "chef",
    "empath",
    "fortune_teller",
    "undertaker",
    "monk",
    "ravenkeeper",
    "virgin",
    "slayer",
    "soldier",
    "mayor",
  ],
  outsider: ["butler", "drunk", "recluse", "saint"],
  minion: ["poisoner", "spy", "scarlet_woman", "baron"],
  demon: ["imp"],
} as const;

const CONFIG: ScriptMatrixConfig = {
  scriptId: "trouble_brewing",
  scriptName: "暗流涌动",
  roster: ROSTER,
  nights: [1, 2, 3],
  companions: {
    townsfolkPool: ["washerwoman", "chef", "empath", "soldier", "mayor"],
    outsider: "butler",
    minion: "poisoner",
    demon: "imp",
  },
  // 酒鬼以为自己是镇民 → 必须带 charadeRole，否则会被当成本角色（假缺陷）
  coveredDisguise: { roleIds: ["drunk"], as: "soldier" },
  states: [
    // ① 常态
    { name: "常态" },

    // ② 中毒：官方投毒者「他在当晚和明天白天中毒」→ 能力失效
    {
      name: "中毒",
      mutateSeats: ({ seats }: MutateCtx) => {
        seats[0].statusEffects = [{ type: "poisoned" }];
      },
    },

    // ③ 酒鬼伪装：官方「你以为你是一个镇民角色，但其实你不是」→ 得假信息
    {
      name: "酒鬼伪装",
      applicableTo: (t) => t === "townsfolk",
      mutateSeats: ({ seats, roleId, r }: MutateCtx) => {
        seats[0].role = r("drunk");
        seats[0].charadeRole = r(roleId);
        // 保真：生产在设置阶段由 drunk.ability.ts 写入 permanent drunk 状态效果
        seats[0].statusEffects = [{ type: "drunk", permanent: true }];
      },
    },

    // ④ 陌客在座：官方「你可能会被当作邪恶阵营、爪牙角色或恶魔角色，即使你已死亡」
    {
      name: "陌客在座",
      extraSeat: () => "recluse",
    },

    // ⑤ 间谍在座：官方「你可能会被当作善良阵营、镇民角色或外来者角色」
    {
      name: "间谍在座",
      extraSeat: () => "spy",
    },

    // ⑥ 昨夜有人被处决：送葬者的信息源（官方「每个夜晚*，你会得知今天白天死于处决的玩家的角色」）
    //    ⚠️ 双注入：`snapshot` 喂队列（排程门控 requiresExecutedToday），
    //    `flags` 喂 adapter（信息内容）。只注入 adapter = 队列仍不唤醒 → 误判缺陷。
    {
      name: "昨夜处决",
      mutateSeats: ({ seats }: MutateCtx) => {
        seats[1].isDead = true;
        seats[1].isDead = true;
        (seats[1] as any).executedToday = true;
      },
      snapshot: () => ({ todayExecutedId: 1 }),
      flags: (): AdapterFlags => ({ lastDuskExecution: 1 }),
    },

    // ⑦ 本角色今夜死亡：守鸦人的触发条件（官方「如果你在夜晚死亡，你会被唤醒」），
    //    同时作为**负向不变量** —— 其余角色今晚死了也不该被唤醒。
    {
      name: "本角色今夜死亡",
      mutateSeats: ({ seats }: MutateCtx) => {
        seats[0].isDead = true;
        seats[0].isDead = true;
      },
      snapshot: () => ({ deadThisNight: [0] }),
    },
  ],
};

let RES: ReturnType<typeof collectScriptMatrix>;

describe("暗流涌动 · 全角色 × 状态 批量矩阵", () => {
  // ⚠️ 保真前置：必须先注册能力，否则 ENGINE_CONFIG.fullNightOrder 会退化（假绿）
  initializeAbilityRegistry();

  it("前置自检：能力注册表已装载，夜序表足量", () => {
    expect(
      ENGINE_CONFIG.fullNightOrder.length,
      "夜序表条目过少 → 极可能漏了 initializeAbilityRegistry()"
    ).toBeGreaterThan(50);
  });

  it("采集全部角色 × 3 夜 × 7 状态（队列判定为准），并写入报告 JSON", () => {
    RES = collectScriptMatrix(CONFIG);
    const file = writeMatrixReport(CONFIG, RES);
    printMatrixSummary(RES);

    expect(RES.cells.length).toBe(22 * 3 * 7);
    console.log(`\n报告已写入：${file}`);

    const withAnomaly = RES.cells.filter((c) => c.anomalies.length > 0);
    expect(
      withAnomaly.length,
      `存在硬错误：${withAnomaly
        .slice(0, 10)
        .map((c) => `${c.roleName}/${c.night}夜/${c.state}: ${c.anomalies.join(",")}`)
        .join(" | ")}`
    ).toBe(0);
  });

  // ─────────── 队列排程不变量（判据：officialRoleDocs.json 官方原文）───────────

  it("白天/被动型角色：三个夜晚均无**自身能力**节点", () => {
    // 官方依据：
    //   贞洁者「在你的首个白天…」/ 猎手「每个白天」/ 士兵 被动「恶魔的负面能力对你无效」
    //   镇长 被动 / 酒鬼「你不知道你是酒鬼」无自身行动 / 陌客 被动 / 圣徒 被动
    //   男爵 初始设置型「+2 外来者」（不产生夜晚行动）
    // ⚠️ 用 `baselineAbilityWake` 而非 `baselineWake`：后者含首夜的
    //    minion_info（爪牙互认）系统步骤，会把男爵误判成"被唤醒"。
    for (const id of [
      "virgin",
      "slayer",
      "soldier",
      "mayor",
      "drunk",
      "recluse",
      "saint",
      "baron",
      "scarlet_woman",
    ]) {
      const b = RES.baselineAbilityWake[id];
      expect(b, `${id} 未采集到基线`).toBeDefined();
      expect(b.n1, `${id} 首夜不应有自身能力节点`).toBe(false);
      expect(b.n2, `${id} 第2夜不应有自身能力节点`).toBe(false);
      expect(b.n3, `${id} 第3夜不应有自身能力节点`).toBe(false);
    }
  });

  it("男爵/红唇女郎：首夜被唤醒仅因 minion_info（爪牙互认），第2/3夜不唤醒", () => {
    for (const id of ["baron", "scarlet_woman"]) {
      const b = RES.baselineWake[id];
      expect(b.n1, `${id} 首夜应被唤醒（minion_info 爪牙互认）`).toBe(true);
      expect(b.n2, `${id} 第2夜不应唤醒`).toBe(false);
      expect(b.n3, `${id} 第3夜不应唤醒`).toBe(false);
      expect(
        findCell(RES, id, 1, "常态")?.queueRoleIds,
        `${id} 首夜节点应只有 minion_info`
      ).toEqual(["minion_info"]);
    }
  });

  it("首夜-only 角色：首夜唤醒、第2/3夜不唤醒", () => {
    // 官方：洗衣妇/图书管理员/调查员/厨师 均为「在你的首个夜晚」
    for (const id of ["washerwoman", "librarian", "investigator", "chef"]) {
      const b = RES.baselineWake[id];
      expect(b.n1, `${id} 首夜应唤醒`).toBe(true);
      expect(b.n2, `${id} 第2夜不应唤醒`).toBe(false);
      expect(b.n3, `${id} 第3夜不应唤醒`).toBe(false);
    }
  });

  it("除首夜外每晚唤醒的角色：首夜无**自身能力**节点、第2夜有", () => {
    // 官方：僧侣「每个夜晚*，你要选择除你以外的一名玩家」→ 带 «*» 记号 = 除首夜外
    const b = RES.baselineAbilityWake.monk;
    expect(b?.n1, "僧侣首夜不应有自身能力节点").toBe(false);
    expect(b?.n2, "僧侣第2夜应有自身能力节点").toBe(true);
  });

  it("⭐ 送葬者：常态（当天无人被处决）不唤醒，昨夜有人被处决则第2/3夜唤醒", () => {
    // 官方：「每个夜晚*，你会得知今天白天死于处决的玩家的角色。」
    //       且「送葬者会在除首个夜晚以外的每晚醒来」。
    // 排程门控 = `requiresExecutedToday`（dynamicQueueGenerator.ts:327）：
    //   无死亡处决 → 不唤醒（正确，避免说书人白跑一趟）；
    //   有死亡处决 → 第2/3夜必须唤醒。
    for (const night of [2, 3]) {
      const idle = findCell(RES, "undertaker", night, "常态");
      const exec = findCell(RES, "undertaker", night, "昨夜处决");
      expect(idle?.abilityWoken, `送葬者 第${night}夜/常态（无处决）不应唤醒`).toBe(
        false
      );
      expect(
        exec?.abilityWoken,
        `送葬者 第${night}夜/昨夜处决 应被唤醒`
      ).toBe(true);
    }
    // 首夜无论如何都不唤醒（官方：首个夜晚之前不会有任何处决发生）
    for (const st of ["常态", "昨夜处决"]) {
      expect(
        findCell(RES, "undertaker", 1, st)?.abilityWoken,
        `送葬者 首夜/${st} 不应唤醒`
      ).toBe(false);
    }
  });

  it("⭐ 守鸦人：存活时不入队；死亡触发已武装（入队由击杀后专用路径注入，非队列生成器）", () => {
    // 官方：「如果你在夜晚死亡，你会被唤醒，然后你要选择一名玩家：你会得知他的角色。」
    //
    // ⚠️ 判定层次（踩坑记录）：**队列生成器不是守鸦人的入队机制**。
    //    · 队列生成器侧：守鸦人座位已死而 `deadActorWakes` 仅间谍为真
    //      （useNightEngine.ts:190）→ directSeat 查不到 → 不入队。**这是设计如此**。
    //    · 生产真正的入队：恶魔击杀后由 `enqueueRavenkeeperIfNeeded`
    //      （useGameController.ts:779）把座位**插到当前行动节点之后**，
    //      并置 `hasAbilityEvenDead=true`（否则被 preProcessAbility 的已死亡校验拦掉）。
    //    ⇒ 若在此断言"队列应唤醒守鸦人"，就是**断言错了层**（假缺陷）。

    // ① 死亡触发的"武装"必须在位：夜序条目带 deathTriggered（来自能力的 ON_DEATH 声明）
    const rk = (ENGINE_CONFIG.fullNightOrder as any[]).find(
      (e) => e.roleId === "ravenkeeper"
    );
    expect(rk, "夜序表缺少守鸦人条目").toBeDefined();
    expect(
      rk.deathTriggered,
      "守鸦人未武装 deathTriggered → 击杀后专用路径的前提失效"
    ).toBe(true);

    // ② 存活时三个夜晚都不入队
    for (const night of [1, 2, 3]) {
      expect(
        findCell(RES, "ravenkeeper", night, "常态")?.woken,
        `守鸦人 第${night}夜/常态（未死）不应被唤醒`
      ).toBe(false);
    }

    // ③ 座位已死时队列仍不生成该节点（设计如此，入队由专用路径负责）
    for (const night of [1, 2, 3]) {
      const c = findCell(RES, "ravenkeeper", night, "本角色今夜死亡");
      expect(c?.queueRoleIds, `守鸦人 第${night}夜 队列不应含自身节点`).not.toContain(
        "ravenkeeper"
      );
    }
  });

  it("负向不变量：本角色今夜死亡 ≠ 该唤醒 —— 其余角色仍按各自条件排程", () => {
    // 「本角色今夜死亡」这一维只对守鸦人这类 deathTriggered 角色有触发意义；
    // 白天/被动型角色即便今晚死了也不得因此被唤醒。
    for (const id of ["virgin", "slayer", "soldier", "mayor", "saint", "baron"]) {
      for (const night of [1, 2, 3]) {
        expect(
          findCell(RES, id, night, "本角色今夜死亡")?.abilityWoken,
          `${id} 第${night}夜/本角色今夜死亡 不应被唤醒`
        ).toBe(false);
      }
    }
  });

  it("每个夜晚都唤醒的角色：首夜与第2夜均有自身能力节点", () => {
    // 官方：投毒者/共情者/占卜师/管家/间谍
    //   共情者「每个夜晚，你会得知…」/ 占卜师「每个夜晚，你要选择两名玩家」
    //   管家「每个夜晚，你要选择除你以外的一名玩家」
    //   间谍「每个夜晚，你能查看魔典」/ 投毒者「每个夜晚，你要选择一名玩家」
    for (const id of [
      "poisoner",
      "empath",
      "fortune_teller",
      "butler",
      "spy",
    ]) {
      const b = RES.baselineAbilityWake[id];
      expect(b?.n1, `${id} 首夜应有自身能力节点`).toBe(true);
      expect(b?.n2, `${id} 第2夜应有自身能力节点`).toBe(true);
    }
  });

  it("小恶魔：首夜是被 demon_info 系统步骤唤醒，自身能力节点从第2夜起", () => {
    const b = RES.baselineWake.imp;
    expect(b?.n1, "小恶魔首夜应被唤醒（demon_info）").toBe(true);
    expect(
      RES.baselineAbilityWake.imp?.n1,
      "小恶魔首夜不应有自身能力节点"
    ).toBe(false);
    expect(RES.baselineAbilityWake.imp?.n2, "小恶魔第2夜应有自身能力节点").toBe(
      true
    );
  });
});
