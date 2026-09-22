import { describe, expect, it } from "vitest";
import { board, r, runRole, seat } from "../_tbHarness";

import { corruptGrimoireData } from "../../new_engine/spy.ability";
import { drunkAbility } from "../../new_engine/drunk.ability";
import { generateFakeRoleName as rkFakeRoleName } from "../../new_engine/ravenkeeper.ability";
import { impAbility } from "../../new_engine/imp.ability";
import { investigatorAbility } from "../../new_engine/investigator.ability";
import { librarianAbility } from "../../new_engine/librarian.ability";
import { monkAbility } from "../../new_engine/monk.ability";
import { slayerAbility } from "../../new_engine/slayer.ability";
import { undertakerAbility } from "../../new_engine/undertaker.ability";
import { virginAbility } from "../../new_engine/virgin.ability";
import { washerwomanAbility } from "../../new_engine/washerwoman.ability";

import { createDeterministicRandom } from "../../core/deterministicRandom";

/**
 * L5 补强 · 暗流涌动 · **由细粒度变异检验反推出来的盲点用例**
 * ==================================================================
 * 来源：2026-09-21 对 22 个角色各做 1 个**细粒度语义变异**（改具体条件 /
 *   阈值 / 过滤项，绝不「清空整个 calculate/stateUpdate」），跑 tb_l5_causal +
 *   tb_l1_l2，看测试是否变红。变红 = 测试有效；**没变红 = 测试有盲点**。
 *
 * 本文件只收录**当时没变红**的那些变异体所指向的行为 —— 每条都写明：
 *   · 变异点（`文件:行号` + 改前/改后）
 *   · 官方/实现依据
 *   · 为什么原有用例抓不住（大多是「测试棋局恰好绕过了该分支」）
 *
 * ⚠️ 只加测试不改生产。
 */

const seatAfter = (res: any, id: number): any =>
  (res?.snapshot?.seats ?? []).find((s: any) => s.id === id);
const effectsOf = (res: any, id: number): any[] =>
  (seatAfter(res, id)?.statusEffects ?? []) as any[];

describe("L5 补强 · 变异检验反推的盲点（12 条）", () => {
  // ────────────────────────────────────────────────────────────────────
  it("G1 洗衣妇：场上只有间谍能充当镇民时，必须以「僧侣」示人", async () => {
    /**
     * 变异点：`washerwoman.ability.ts:167`
     *   `registerAsGood !== false`  →  `registerAsGood === false`
     * 该行是 `isSpyAsTownsfolk` 的一部分（间谍默认注册为镇民，造成干扰）。
     *
     * 原用例抓不住的原因：L5 ① 的三副棋局（chef/empath/chambermaid…）
     *   都**有真正的镇民在场**，间谍只是多出来的候选，断言「告知的角色名
     *   由两候选之一持有」照样成立 → 变异体溜过。
     * ⇒ 新棋局把「唯一镇民候选」让给间谍，结果就与开关一一对应。
     */
    const seats = board(["washerwoman", "spy", "imp", "baron", "poisoner"]);
    const res = await runRole(washerwomanAbility, seats, 0, {
      night: 1,
      phase: "firstNight",
      snapshot: { nightCount: 1 },
    });
    const info = res.meta.abilityResult;
    expect(info, "❌ 洗衣妇未产出信息").toBeTruthy();
    expect(
      info.roleName,
      "❌ 间谍默认注册为镇民时，洗衣妇必须以「僧侣」示人（washerwoman.ability.ts:172）"
    ).toBe("僧侣");
    expect(
      [info.seat1, info.seat2],
      "❌ 两候选里必须包含间谍所在的 2号座位"
    ).toContain(1);
    expect(res.meta.isCorrupted, "（前置）首夜清醒不得受干扰").toBe(false);
  });

  // ────────────────────────────────────────────────────────────────────
  it("G2 图书管理员：间谍是场上唯一「外来者候选」时，必须给出外来者信息", async () => {
    /**
     * 变异点：`librarian.ability.ts:174`
     *   `realRole.id === "spy" || realRole.id === "recluse";`  →  `realRole.id === "recluse";`
     *
     * 官方：间谍「可能被当作外来者」（图书管理员能把它当外来者告知）。
     * 实现里 `canRegisterAsOutsider` 的 **spy 那一半**才是有效逻辑。
     *
     * ⚠️ 勘误（原用例的变异点选错了）：曾经把该行末尾的 `|| realRole.id === "recluse"`
     *   当成变异点，但 `recluse.type === "outsider"`，同一 `if` 的
     *   `realRole.type === "outsider"` 已经命中它 ⇒ 删掉那一半是**语义等价变异**，
     *   任何测试都杀不死。真正可区分的是 **spy** 那一半（spy.type === "minion"，
     *   只能靠 `canRegisterAsOutsider` 进入候选池）。
     *
     * 原用例抓不住的原因：L5 ② 的棋局 `["librarian","butler",...]` 里有真外来者
     *   （管家），且不带间谍 → `canRegisterAsOutsider` 分文未动。
     */
    const seats = board(["librarian", "spy", "imp", "baron", "chef"]);
    // 前置：全场没有任何 `type === "outsider"` 的座位，唯一候选只能来自间谍注册
    expect(
      seats.filter((s: any) => s.role?.type === "outsider").length,
      "（前置）棋局里不得有真外来者，否则测不到 spy 注册分支"
    ).toBe(0);

    const res = await runRole(librarianAbility, seats, 0, {
      night: 1,
      phase: "firstNight",
      snapshot: { nightCount: 1 },
    });
    const info = res.meta.abilityResult;
    expect(
      info?.roleName,
      "❌ 间谍默认可注册为外来者（librarian.ability.ts:174），必须被当作外来者告知"
    ).toBe(r("spy").name);
    expect([info?.seat1, info?.seat2], "❌ 两候选里必须包含间谍所在的 2号座位").toContain(1);
    expect(
      res.meta.librarianResult?.hasOutsider,
      "❌ 场上确有（注册为）外来者 → hasOutsider 必须为 true（librarian.ability.ts:425）"
    ).toBe(true);
  });

  // ────────────────────────────────────────────────────────────────────
  it("G2b 图书管理员：陌客（本身就是外来者）在场时，同样给出外来者信息", async () => {
    /**
     * 续 G2：陌客走的是 `realRole.type === "outsider"` 这一半，与其「可被当作外来者」
     * 的注册能力**互相冗余**。本用例把「陌客必须被当作外来者告知」这一**行为**钉死，
     * 避免将来有人把 `type === "outsider"` 改窄（例如改成白名单）而无人发现。
     */
    const seats = board(["librarian", "recluse", "imp", "baron", "chef"]);
    const res = await runRole(librarianAbility, seats, 0, {
      night: 1,
      phase: "firstNight",
      snapshot: { nightCount: 1 },
    });
    const info = res.meta.abilityResult;
    expect(
      info?.roleName,
      "❌ 陌客是可注册为外来者的外来者，图书管理员必须把它当作外来者告知"
    ).toBe(r("recluse").name);
    expect([info?.seat1, info?.seat2], "❌ 两候选里必须包含陌客所在的 2号座位").toContain(1);
    expect(res.meta.librarianResult?.hasOutsider).toBe(true);
  });

  // ────────────────────────────────────────────────────────────────────
  it("G3 调查员：间谍默认注册为善良 → 有真爪牙在场时永不点名间谍", async () => {
    /**
     * 变异点：`investigator.ability.ts:177`
     *   `(realRole.type === "minion" && !isSpyAsGood)`  →  `(false)`
     * 官方：间谍「可能被当作善良」；实现里默认不把间谍当爪牙交给调查员。
     *
     * 原用例抓不住的原因：L5 ③ 的棋局里间谍不在场。
     * ⚠️ 第一次补强仍抓不住的真因（本轮定位）：**随机源是确定性的**。
     *   `investigator.ability.ts:426` 用
     *   `createDeterministicRandom(nightInfoSeed("investigator", 自身座位, nightCount))`
     *   ⇒ 同一 (座位, 夜次) 的 rng 序列**恒定**，原用例「循环 20 次」根本抽不出第二个样本。
     *   变异后候选池变成兜底分支 `[间谍, 男爵]`，而该种子下
     *   `floor(rng()*2)` 恰好 = 1 → 永远取到「男爵」→ 断言假绿。
     *
     * ⇒ 正确做法：**扫描不同夜次**（种子随 nightCount 变）来覆盖 rng 的多个分支。
     *   `gamePhase: "firstNight"` 常驻 → `nightCount !== 1` 也不会被首夜门控拦下
     *   （investigator.ability.ts:126 是 `&&`），于是可以安全地在 night=1..12 上取到 12 组不同随机。
     *   实测（mulberry32 复算）`floor(rng()*2)` 在 1..12 上取到过 0 和 1 两种值；
     *   正确实现下候选池恒为 `[男爵]`（长度 1），无论 rng 怎样都只能点名男爵。
     */
    const seen = new Set<string>();
    for (let night = 1; night <= 12; night++) {
      const seats = board(["investigator", "spy", "baron", "imp", "chef"]);
      const res = await runRole(investigatorAbility, seats, 0, {
        night,
        phase: "firstNight",
        snapshot: { nightCount: night },
      });
      const info = res.meta.abilityResult;
      seen.add(String(info?.roleName ?? ""));
      expect(
        info?.roleName,
        `❌ night=${night}：场上有真爪牙（男爵）时，调查员只可能点名男爵；点到间谍说明间谍的默认注册（善良）失效`
      ).toBe(r("baron").name);
      expect(
        [info?.seat1, info?.seat2],
        `❌ night=${night}：被点名的两候选里必须包含男爵所在的 3号座位`
      ).toContain(2);
    }
    expect(
      seen.size,
      `❌ 12 个夜次抽到了多个不同答案：${[...seen].join("/")}`
    ).toBe(1);
  });

  // ────────────────────────────────────────────────────────────────────
  it("G4 送葬者：nightCount=1 的首夜必须中止（phase 仍是 night 时也一样）", async () => {
    /**
     * 变异点：`undertaker.ability.ts:126`
     *   `nightCount === 1`  →  `nightCount === 0`
     *
     * 原用例抓不住的原因：L5 ⑦ 全部跑在 `nightCount=2`，从来没有在
     *   `nightCount=1` 上验过「首夜不唤醒」这一半条件（`gamePhase` 那一半
     *   由 L2c 夜序用例覆盖，但管道层没有）。
     */
    const seats = board(["undertaker", "chef", "baron", "imp", "gossip"]);
    seats[1].executedToday = true;
    const res = await runRole(undertakerAbility, seats, 0, {
      night: 1,
      phase: "night",
      snapshot: { nightCount: 1, todayExecutedId: 1 },
    });
    expect(res.aborted, "❌ 首夜送葬者必须中止（undertaker.ability.ts:126）").toBe(true);
    expect(res.meta.abilityResult, "❌ 首夜不得产出被处决者角色").toBeUndefined();
    expect((res.snapshot as any)._abilityResults?.undertaker).toBeUndefined();
  });

  // ────────────────────────────────────────────────────────────────────
  it("G5 僧侣：nightCount=1 的首夜不得放置保护标记", async () => {
    /** 变异点：`monk.ability.ts:127` `nightCount === 1` → `nightCount === 0`
     *  原用例抓不住的原因同 G4（L5 ⑧ 全跑在第 2 夜）。 */
    const seats = board(["monk", "chambermaid", "gossip", "imp", "tinker"]);
    const res = await runRole(monkAbility, seats, 0, {
      night: 1,
      phase: "night",
      snapshot: { nightCount: 1 },
      targets: [1],
    });
    expect(res.aborted, "❌ 首夜僧侣必须中止（monk.ability.ts:127）").toBe(true);
    expect(
      effectsOf(res, 1).some((e) => e.type === "protected"),
      "❌ 首夜僧侣不得放置保护标记"
    ).toBe(false);
    expect(res.meta.monkResult?.isProtected ?? false).toBe(false);
  });

  // ────────────────────────────────────────────────────────────────────
  it("G6 守鸦人：受干扰时生成的假角色名不得等于真实角色名", () => {
    /**
     * 变异点：`ravenkeeper.ability.ts:199`
     *   `Boolean(name && name !== realRoleName)`  →  `Boolean(name)`
     * 官方：守鸦人醉酒/中毒时「可能得知错误信息」，但**不得把真身当假信息**
     *   （等于没骗，玩家的推理会被反向污染）。
     *
     * 原用例抓不住的原因：原用例的候选池里有很多别的角色名，
     *   随机抽中「恰好等于真身」的概率极低 → 变异体几乎总是产出合法值。
     * ⇒ 把候选池收成「只剩真身自己」，开关就与结果一一对应。
     */
    const only = [seat(0, "chef")];
    const fake = rkFakeRoleName(only as any, r("chef").name, createDeterministicRandom("rk-gap"));
    expect(
      fake,
      "❌ 候选池只剩真身时，假角色名仍等于真身（ravenkeeper.ability.ts:199 的排除条件失效）"
    ).not.toBe(r("chef").name);
    expect(fake.length).toBeGreaterThan(0);

    const many = board(["chef", "empath", "monk", "butler", "imp"]);
    const fake2 = rkFakeRoleName(
      many as any,
      r("chef").name,
      createDeterministicRandom("rk-gap-2")
    );
    expect(fake2, "❌ 多候选时假角色名也不得等于真身").not.toBe(r("chef").name);
  });

  // ────────────────────────────────────────────────────────────────────
  it("G7 贞洁者：间谍提名（默认注册为镇民）必须触发处决", async () => {
    /**
     * 变异点：`virgin.ability.ts:146` `if (roleId === "spy") return true;`
     *   → `return false;`
     * 官方：贞洁者只在**镇民**提名时处决；间谍「可能被当作镇民」，
     *   实现里默认按镇民处理（与 L5 ⑩ 的 recluse「默认不算镇民」互为对照）。
     *
     * 原用例抓不住的原因：L5 ⑩ 的负向对照名单是
     *   `["baron","imp","saint","recluse"]` —— **没有 spy**。
     */
    const seats = board(["virgin", "spy", "chef", "monk", "imp"]);
    const res = await runRole(virginAbility, seats, 0, {
      phase: "day",
      meta: { nominatorId: 1 },
    });
    expect(
      res.meta.abilityResult?.shouldExecute,
      "❌ 间谍提名默认按镇民处理，贞洁者应触发处决（virgin.ability.ts:146）"
    ).toBe(true);
    expect(seatAfter(res, 1)?.isDead, "❌ 提名者（间谍）必须被处决").toBe(true);
    expect(seatAfter(res, 1)?.executedToday).toBe(true);
    expect(seatAfter(res, 0)?.abilityUsed, "❌ 贞洁者能力必须被消耗").toBe(true);
  });

  // ────────────────────────────────────────────────────────────────────
  it("G8 猎手：陌客默认注册为恶魔 → 射击陌客必须致死并结束游戏", async () => {
    /**
     * 变异点：`slayer.ability.ts:81` `target.role.id === "recluse"` → `"soldier"`
     * 官方：陌客「可能被当作恶魔」；实现里默认按恶魔处理（可被猎手射杀）。
     *
     * 原用例抓不住的原因：L5 ⑪ 的三个用例全部射向 `chambermaid`（好人）
     *   或 `imp`（真恶魔），陌客从没被射击过。
     */
    const seats = board(["slayer", "recluse", "gossip", "chef", "tinker"]);
    const res = await runRole(slayerAbility, seats, 0, {
      phase: "day",
      targets: [1],
    });
    expect(
      seatAfter(res, 1)?.isDead,
      "❌ 陌客默认注册为恶魔，必须被猎手射杀（slayer.ability.ts:81）"
    ).toBe(true);
    expect(seatAfter(res, 1)?.deathReason).toBe("被猎手杀死");
    expect(res.snapshot.gamePhase, "❌ 射杀恶魔后必须结束游戏").toBe("gameOver");
    expect(res.snapshot.gameResult?.winner).toBe("good");
  });

  // ────────────────────────────────────────────────────────────────────
  it("G9 酒鬼：场上有外来者时，伪装角色仍必须取自**在场镇民**", async () => {
    /**
     * 变异点：`drunk.ability.ts:214`
     *   `s.role?.type === "townsfolk"`  →  `s.role?.type === "outsider"`
     * 官方：酒鬼以为自己是一个**镇民**（官方明文：酒鬼是外来者，但以为自己是镇民）。
     *
     * 原用例抓不住的原因：L5 ⑰ 的棋局是
     *   `["drunk","chambermaid","gossip","imp","tinker"]` —— 场上**一个外来者都没有**，
     *   所以变异后候选池为空，走了「兜底：无镇民在场 → 洗衣妇」分支，
     *   `fakeRole.type` 依然是 `townsfolk` → 断言照样通过（假绿）。
     * ⚠️ 补测棋局必须**同时**有外来者和镇民，才能把两条分支区分开。
     *   注意 `tinker(修补匠)` 在本项目数据里是 **outsider**（与官方一致），
     *   不能拿它当镇民用 —— 这里用 `chambermaid(侍女)`。
     */
    const seats = board(["drunk", "butler", "recluse", "imp", "chambermaid"]);
    const res = await runRole(drunkAbility, seats, 0, {
      night: 1,
      phase: "firstNight",
      snapshot: { nightCount: 1 },
    });
    const fake = seatAfter(res, 0)?.fakeRole;
    expect(
      fake?.type,
      `❌ 酒鬼的伪装角色取到了外来者（drunk.ability.ts:214）。实际取到「${fake?.name}」`
    ).toBe("townsfolk");
    expect(
      fake?.id,
      "❌ 本局唯一的在场镇民是侍女，酒鬼只能伪装成它"
    ).toBe("chambermaid");
    expect(["butler", "recluse"]).not.toContain(String(fake?.id));
  });

  // ────────────────────────────────────────────────────────────────────
  it("G10 小恶魔：nightCount=1 的首夜不得杀人", async () => {
    /** 变异点：`imp.ability.ts:152` 整个门控 → `if (false)`（= 首夜也开杀）
     *  原用例抓不住的原因：L5 ㉔ 全跑在 `nightCount>=2`；L2c 只验了「不排队」，
     *  没验「即使被驱动也不得杀人」。 */
    const seats = board(["imp", "chambermaid", "gossip", "chef", "tinker"]);
    const res = await runRole(impAbility, seats, 0, {
      night: 1,
      phase: "night",
      snapshot: { nightCount: 1 },
      targets: [1],
    });
    expect(res.aborted, "❌ 首夜小恶魔必须中止（imp.ability.ts:152）").toBe(true);
    expect(
      (res.snapshot.seats as any[]).filter((s) => s.isDead === true).length,
      "❌ 首夜不得有人死亡"
    ).toBe(0);
    expect(
      (res.snapshot.seats as any[]).filter((s) => s.markedForDeath === true).length,
      "❌ 首夜不得产生「待死亡」标记"
    ).toBe(0);
    expect(res.meta.impResult?.killed ?? false, "❌ 首夜不得登记击杀").toBe(false);
  });

  // ────────────────────────────────────────────────────────────────────
  it("G11 间谍：受干扰时魔典打乱的对数 = floor(人数/2)（8 人 → 8 席全换）", () => {
    /**
     * 变异点：`spy.ability.ts:321`
     *   `const pairCount = Math.floor(count / 2);`  →  `Math.floor(count / 3);`
     * 官方：间谍醉酒/中毒时「可能得知错误信息」；实现的干扰力度是
     *   **每两人一组对调**，即 `floor(N/2)` 组 —— 8 人局应把 8 席全部换掉。
     *
     * 原用例抓不住的原因：L5 ㉑ 只断言「逐条列出真实角色与阵营」「邪恶计数」，
     *   这三条在**不打乱**的情况下同样成立 → 对数多少都测不出来。
     * ⇒ 用「角色集合不变 + 换位席数」来锁定打乱力度。
     */
    const mk = (n: number) => ({
      nightCount: 2,
      players: Array.from({ length: n }, (_, i) => ({
        seatId: i,
        playerName: `P${i + 1}`,
        roleId: `role_${i}`,
        roleName: `角色${i}`,
        roleType: "townsfolk",
        alignment: (i < 2 ? "evil" : "good") as "evil" | "good",
        alignmentFlipped: false,
        isDead: false,
        statusEffects: [],
        reminderTokens: [],
      })),
      globalEffects: [],
      recentActions: [],
      isCorrupted: true,
    });
    const src = mk(8);
    const out = corruptGrimoireData(src as any, createDeterministicRandom("spy-gap"));
    const changed = out.players.filter(
      (p: any, i: number) => p.roleId !== src.players[i].roleId
    ).length;
    expect(
      changed,
      `❌ 8 人魔典应打乱 floor(8/2)=4 对（8 席全部换位），实际只换了 ${changed} 席` +
        ` —— 对数算错（spy.ability.ts:321）`
    ).toBe(8);
    expect(out.players.length, "❌ 打乱不得增删玩家").toBe(src.players.length);
    expect(
      new Set(out.players.map((p: any) => p.roleId)).size,
      "❌ 打乱后角色集合必须保持不变（只换位不增删）"
    ).toBe(8);
  });
});
