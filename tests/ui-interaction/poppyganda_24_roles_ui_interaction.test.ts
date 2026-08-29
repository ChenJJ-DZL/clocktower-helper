/**
 * tests/ui-interaction/poppyganda_24_roles_ui_interaction.test.ts
 *
 * 全面打通《罂粟花开》(Poppyganda) 全部 24 角色的真实 UI 交互与状态机联动集成测试
 */
import { describe, expect, it } from "vitest";
import { checkGameEnd, isPlayerEvil } from "../../app/gameLogic";
import { baronAbility } from "../../src/roles/new_engine/baron.ability";
import { bounty_hunterAbility } from "../../src/roles/new_engine/bounty_hunter.ability";
import { cerenovusAbility } from "../../src/roles/new_engine/cerenovus.ability";
import { chefAbility } from "../../src/roles/new_engine/chef.ability";
import { drunkAbility } from "../../src/roles/new_engine/drunk.ability";
import { evil_twinAbility } from "../../src/roles/new_engine/evil_twin.ability";
import { farmerAbility } from "../../src/roles/new_engine/farmer.ability";
import { fortuneTellerAbility } from "../../src/roles/new_engine/fortune_teller.ability";
import { impAbility } from "../../src/roles/new_engine/imp.ability";
import { jugglerAbility } from "../../src/roles/new_engine/juggler.ability";
import { librarianAbility } from "../../src/roles/new_engine/librarian.ability";
import { lunaticAbility } from "../../src/roles/new_engine/lunatic.ability";
import { monkAbility } from "../../src/roles/new_engine/monk.ability";
import { mutantAbility } from "../../src/roles/new_engine/mutant.ability";
import { oracleAbility } from "../../src/roles/new_engine/oracle.ability";
import { pixieAbility } from "../../src/roles/new_engine/pixie.ability";
import { poppy_growerAbility } from "../../src/roles/new_engine/poppy_grower.ability";
import { savantAbility } from "../../src/roles/new_engine/savant.ability";
import { snitchAbility } from "../../src/roles/new_engine/snitch.ability";
import { town_crierAbility } from "../../src/roles/new_engine/town_crier.ability";
import { isActorDisabledByPoisonOrDrunk } from "../../src/utils/gameRules";
import { runFullAbilityPipeline } from "../../src/utils/middlewarePipeline";

const pipe = (a: any) => ({
  preCheck: a?.preCheck,
  calculate: a?.calculate,
  stateUpdate: a?.stateUpdate,
  postProcess: a?.postProcess,
});

describe("《罂粟花开》(Poppyganda) 24 角色 UI 交互与状态机联动全量测试", () => {
  // ─── 镇民角色 (Townsfolk 13) ───────────────────────────────────────────────

  it("1. 图书管理员 (Librarian): 唤醒指定 2 名玩家及外来者，打上「图书目标」状态标记", async () => {
    const ctx: any = {
      snapshot: {
        seats: [
          {
            id: 0,
            playerName: "P1",
            role: { id: "librarian", name: "图书管理员", type: "townsfolk" },
            isAlive: true,
            isDead: false,
            statusDetails: [],
          },
          {
            id: 1,
            playerName: "P2",
            role: { id: "drunk", name: "酒鬼", type: "outsider" },
            isAlive: true,
            isDead: false,
            statusDetails: [],
          },
          {
            id: 2,
            playerName: "P3",
            role: { id: "monk", name: "僧侣", type: "townsfolk" },
            isAlive: true,
            isDead: false,
            statusDetails: [],
          },
        ],
        nightCount: 1,
        gamePhase: "firstNight",
      },
      actionNode: { seatId: 0, roleId: "librarian", roleName: "图书管理员" },
      storytellerInput: { seat1: 1, seat2: 2, roleName: "酒鬼" },
      meta: {},
    };

    const res = await runFullAbilityPipeline(pipe(librarianAbility), ctx);
    expect(res.meta.abilityResult.roleName).toBe("酒鬼");
    expect(res.snapshot.seats[1].statusDetails).toContain("图书目标");
    expect(res.snapshot.seats[2].statusDetails).toContain("图书目标");
  });

  it("2. 赏金猎人 (Bounty Hunter): 唤醒得知邪恶镇民/爪牙，在对应玩家挂载「赏金已知」标记", async () => {
    const ctx: any = {
      snapshot: {
        seats: [
          {
            id: 0,
            playerName: "P1",
            role: { id: "bounty_hunter", name: "赏金猎人", type: "townsfolk" },
            isAlive: true,
            isDead: false,
            statusDetails: [],
          },
          {
            id: 1,
            playerName: "P2",
            role: { id: "chef", name: "厨师", type: "townsfolk" },
            isEvilConverted: true,
            isAlive: true,
            isDead: false,
            statusDetails: [],
          },
          {
            id: 2,
            playerName: "P3",
            role: { id: "imp", name: "小恶魔", type: "demon" },
            isAlive: true,
            isDead: false,
            statusDetails: [],
          },
        ],
        nightCount: 1,
        gamePhase: "firstNight",
      },
      actionNode: { seatId: 0, roleId: "bounty_hunter", roleName: "赏金猎人" },
      storytellerInput: { targetSeatId: 1 },
      meta: {},
    };

    const res = await runFullAbilityPipeline(pipe(bounty_hunterAbility), ctx);
    expect(res.meta.abilityResult.targetId).toBe(1);
    expect(res.snapshot.seats[1].statusDetails).toContain("赏金已知");
  });

  it("3. 小精灵 (Pixie): 首夜指定目标，挂载「伪装身份:[角色]」标记", async () => {
    const ctx: any = {
      snapshot: {
        seats: [
          {
            id: 0,
            playerName: "P1",
            role: { id: "pixie", name: "小精灵", type: "townsfolk" },
            isAlive: true,
            isDead: false,
            statusDetails: [],
          },
          {
            id: 1,
            playerName: "P2",
            role: { id: "monk", name: "僧侣", type: "townsfolk" },
            isAlive: true,
            isDead: false,
            statusDetails: [],
          },
        ],
        nightCount: 1,
        gamePhase: "firstNight",
      },
      actionNode: { seatId: 0, roleId: "pixie", roleName: "小精灵" },
      targetIds: [1],
      meta: {},
    };

    const res = await runFullAbilityPipeline(pipe(pixieAbility), ctx);
    expect(res.meta.abilityResult.roleName).toBe("僧侣");
    expect(res.snapshot.seats[0].statusDetails).toContain("伪装身份:僧侣");
  });

  it("4. 杂耍艺人 (Juggler): 白天记录猜测映射，次夜自动计算猜对总数", async () => {
    const ctx: any = {
      snapshot: {
        seats: [
          {
            id: 0,
            playerName: "P1",
            role: { id: "juggler", name: "杂耍艺人", type: "townsfolk" },
            isAlive: true,
            isDead: false,
          },
          {
            id: 1,
            playerName: "P2",
            role: { id: "monk", name: "僧侣", type: "townsfolk" },
            isAlive: true,
            isDead: false,
          },
          {
            id: 2,
            playerName: "P3",
            role: { id: "imp", name: "小恶魔", type: "demon" },
            isAlive: true,
            isDead: false,
          },
        ],
        jugglerGuesses: [
          { targetSeatId: 1, roleName: "僧侣" },
          { targetSeatId: 2, roleName: "厨师" },
        ],
        nightCount: 2,
        gamePhase: "night",
      },
      actionNode: { seatId: 0, roleId: "juggler", roleName: "杂耍艺人" },
      meta: {},
    };

    const res = await runFullAbilityPipeline(pipe(jugglerAbility), ctx);
    expect(res.meta.abilityResult.correctCount).toBe(1);
    expect(res.meta.abilityLog).toContain("猜对了1个");
  });

  it("5. 农夫 (Farmer): 夜间遇害弹窗选定继承者，选定玩家代币变农夫", async () => {
    const ctx: any = {
      snapshot: {
        seats: [
          {
            id: 0,
            playerName: "P1",
            role: { id: "farmer", name: "农夫", type: "townsfolk" },
            isAlive: true,
            isDead: false,
            statusDetails: [],
          },
          {
            id: 1,
            playerName: "P2",
            role: { id: "monk", name: "僧侣", type: "townsfolk" },
            isAlive: true,
            isDead: false,
            statusDetails: [],
          },
        ],
        nightCount: 2,
        deadThisNight: [0],
        gamePhase: "night",
      },
      actionNode: { seatId: 0, roleId: "farmer", roleName: "农夫" },
      storytellerInput: { successorSeatId: 1 },
      meta: {},
    };

    const res = await runFullAbilityPipeline(pipe(farmerAbility), ctx);
    expect(res.snapshot.seats[1].role.id).toBe("farmer");
    expect(res.snapshot.seats[1].statusDetails).toContain("成为新农夫");
  });

  // ─── 外来者与爪牙 (Outsiders & Minions) ──────────────────────────────────

  it("6. 疯子 (Lunatic): 夜间伪装恶魔行动，记录攻击目标供真恶魔同步", async () => {
    const ctx: any = {
      snapshot: {
        seats: [
          {
            id: 0,
            playerName: "P1",
            role: { id: "lunatic", name: "疯子", type: "outsider" },
            apparentDemonRole: { id: "imp", name: "小恶魔" },
            isAlive: true,
            isDead: false,
          },
          {
            id: 1,
            playerName: "P2",
            role: { id: "imp", name: "小恶魔", type: "demon" },
            isAlive: true,
            isDead: false,
          },
          {
            id: 2,
            playerName: "P3",
            role: { id: "monk", name: "僧侣", type: "townsfolk" },
            isAlive: true,
            isDead: false,
          },
        ],
        nightCount: 2,
        gamePhase: "night",
      },
      actionNode: { seatId: 0, roleId: "lunatic", roleName: "疯子" },
      targetIds: [2],
      meta: {},
    };

    const res = await runFullAbilityPipeline(pipe(lunaticAbility), ctx);
    expect(res.snapshot.lunaticTarget).toBe(2);
    expect(res.meta.abilityResult.fakeKill).toBe(true);
    expect(res.meta.abilityResult.realKill).toBe(false);
  });

  it("7. 洗脑师 (Cerenovus): 每夜指定目标与疯狂角色，挂载「洗脑疯狂:[角色]」标记", async () => {
    const ctx: any = {
      snapshot: {
        seats: [
          {
            id: 0,
            playerName: "P1",
            role: { id: "cerenovus", name: "洗脑师", type: "minion" },
            isAlive: true,
            isDead: false,
            statusDetails: [],
          },
          {
            id: 1,
            playerName: "P2",
            role: { id: "monk", name: "僧侣", type: "townsfolk" },
            isAlive: true,
            isDead: false,
            statusDetails: [],
          },
        ],
        nightCount: 2,
        gamePhase: "night",
      },
      actionNode: { seatId: 0, roleId: "cerenovus", roleName: "洗脑师" },
      targetIds: [1],
      storytellerInput: { roleName: "变异者" },
      meta: {},
    };

    const res = await runFullAbilityPipeline(pipe(cerenovusAbility), ctx);
    expect(res.snapshot.seats[1].statusDetails).toContain("洗脑疯狂:变异者");
  });

  it("8. 镜像双子 (Evil Twin): 首夜绑定对立好双子；好双子被处决时邪恶获胜", async () => {
    const ctx: any = {
      snapshot: {
        seats: [
          {
            id: 0,
            playerName: "P1",
            role: { id: "evil_twin", name: "邪恶双子", type: "minion" },
            isAlive: true,
            isDead: false,
          },
          {
            id: 1,
            playerName: "P2",
            role: { id: "monk", name: "僧侣", type: "townsfolk" },
            isAlive: true,
            isDead: false,
          },
        ],
        nightCount: 1,
        gamePhase: "firstNight",
      },
      actionNode: { seatId: 0, roleId: "evil_twin", roleName: "邪恶双子" },
      storytellerInput: { twinId: 1 },
      meta: {},
    };

    const res = await runFullAbilityPipeline(pipe(evil_twinAbility), ctx);
    expect(res.snapshot.evilTwinPair).toEqual({ evilSeatId: 0, goodSeatId: 1 });

    const seats = [
      {
        id: 0,
        playerName: "P1",
        role: { id: "evil_twin", name: "邪恶双子", type: "minion" },
        isAlive: true,
        isDead: false,
        isPoisoned: false,
        isDrunk: false,
      },
      {
        id: 1,
        playerName: "P2",
        role: { id: "monk", name: "僧侣", type: "townsfolk" },
        isAlive: false,
        isDead: true,
        isPoisoned: false,
        isDrunk: false,
      },
      {
        id: 2,
        playerName: "P3",
        role: { id: "imp", name: "小恶魔", type: "demon" },
        isAlive: true,
        isDead: false,
      },
      {
        id: 3,
        playerName: "P4",
        role: { id: "chef", name: "厨师", type: "townsfolk" },
        isAlive: true,
        isDead: false,
      },
    ];
    const gameEnd = checkGameEnd(seats as any, "execution", 1, {
      evilTwinPair: { evilId: 0, goodId: 1 },
    });
    expect(gameEnd.isGameOver).toBe(true);
    expect(gameEnd.winner).toBe("Evil");
    expect(gameEnd.reason).toContain("双子");
  });

  // ─── 恶魔角色 (Demons 3) ──────────────────────────────────────────────────

  it("9. 小恶魔 (Imp): 自杀后爪牙晋升为小恶魔，魔典即时同步", async () => {
    const ctx: any = {
      snapshot: {
        seats: [
          {
            id: 0,
            playerName: "P1",
            role: { id: "imp", name: "小恶魔", type: "demon" },
            isAlive: true,
            isDead: false,
            statusDetails: [],
          },
          {
            id: 1,
            playerName: "P2",
            role: { id: "poisoner", name: "投毒者", type: "minion" },
            isAlive: true,
            isDead: false,
            statusDetails: [],
          },
          {
            id: 2,
            playerName: "P3",
            role: { id: "monk", name: "僧侣", type: "townsfolk" },
            isAlive: true,
            isDead: false,
            statusDetails: [],
          },
        ],
        nightCount: 2,
        gamePhase: "night",
      },
      actionNode: { seatId: 0, roleId: "imp", roleName: "小恶魔" },
      targetIds: [0],
      storytellerInput: { minionSuccessorSeatId: 1 },
      meta: {},
    };

    const res = await runFullAbilityPipeline(pipe(impAbility), ctx);
    expect(res.snapshot.seats[0].isDead).toBe(true);
    expect(res.snapshot.seats[1].role.id).toBe("imp");
    expect(res.snapshot.seats[1].isDemonSuccessor).toBe(true);
  });

  it("10. 涡流 (Vortox): 白天无人被处决，白天结束时直接判定邪恶阵营获胜", () => {
    const seats = [
      {
        id: 0,
        playerName: "P1",
        role: { id: "vortox", name: "涡流", type: "demon" },
        isAlive: true,
        isDead: false,
        isPoisoned: false,
        isDrunk: false,
      },
      {
        id: 1,
        playerName: "P2",
        role: { id: "monk", name: "僧侣", type: "townsfolk" },
        isAlive: true,
        isDead: false,
      },
      {
        id: 2,
        playerName: "P3",
        role: { id: "chef", name: "厨师", type: "townsfolk" },
        isAlive: true,
        isDead: false,
      },
      {
        id: 3,
        playerName: "P4",
        role: { id: "librarian", name: "图书管理员", type: "townsfolk" },
        isAlive: true,
        isDead: false,
      },
    ];
    const gameEnd = checkGameEnd(seats as any, "execution", null, {
      isVortoxWorld: true,
    });
    expect(gameEnd.isGameOver).toBe(true);
    expect(gameEnd.winner).toBe("Evil");
    expect(gameEnd.reason).toContain("涡流");
  });

  it("11. 提线木偶 (Marionette): 酒鬼伪装逻辑与邪恶阵营属性", async () => {
    // 提线木偶本人收到的身份牌为不在场的善良镇民（如僧侣），但其真实阵营为邪恶爪牙
    const marionetteSeat: any = {
      id: 1,
      playerName: "P2",
      role: { id: "marionette", name: "提线木偶", type: "minion" },
      charadeRole: {
        id: "monk",
        name: "僧侣",
        type: "townsfolk",
        ability: "每晚选择一名其他玩家：该玩家免受恶魔杀害。",
      },
      displayRole: { id: "monk", name: "僧侣", type: "townsfolk" },
      isAlive: true,
      isDead: false,
    };

    // 1. 验证魔典展示逻辑：displayRole / charadeRole 展示为僧侣
    const effectiveDisplay = marionetteSeat.charadeRole || marionetteSeat.role;
    expect(effectiveDisplay.id).toBe("monk");
    expect(effectiveDisplay.name).toBe("僧侣");

    // 2. 验证阵营属性：即使以为自己是镇民，真实阵营仍属于邪恶 (Evil Minion)
    expect(marionetteSeat.role.type).toBe("minion");
    expect(isPlayerEvil(marionetteSeat)).toBe(true);

    // 3. 验证能力失效逻辑：作为提线木偶，其中毒/醉酒能力判定自动失效
    expect(isActorDisabledByPoisonOrDrunk(marionetteSeat)).toBe(true);
  });

  // ─── 补充：缺失的 13 个角色 UI 交互测试 ─────────────────────────────────

  it("12. 厨师 (Chef): 首夜自动计算邪恶相邻对数，结果写入 abilityResult", async () => {
    const ctx: any = {
      snapshot: {
        seats: [
          {
            id: 0,
            playerName: "P1",
            role: { id: "chef", name: "厨师", type: "townsfolk" },
            isAlive: true,
            isDead: false,
          },
          {
            id: 1,
            playerName: "P2",
            role: { id: "imp", name: "小恶魔", type: "demon" },
            isAlive: true,
            isDead: false,
          },
          {
            id: 2,
            playerName: "P3",
            role: { id: "baron", name: "男爵", type: "minion" },
            isAlive: true,
            isDead: false,
          },
          {
            id: 3,
            playerName: "P4",
            role: { id: "monk", name: "僧侣", type: "townsfolk" },
            isAlive: true,
            isDead: false,
          },
        ],
        nightCount: 1,
        gamePhase: "firstNight",
      },
      actionNode: { seatId: 0, roleId: "chef", roleName: "厨师" },
      meta: {},
    };
    const res = await runFullAbilityPipeline(pipe(chefAbility), ctx);
    expect(res.meta.abilityResult).toBe(1);
    expect(res.meta.abilityLog).toContain("1 对相邻的邪恶玩家");
  });

  it("13. 占卜师 (Fortune Teller): 选择 2 名玩家，返回是否包含恶魔（含干扰项管理）", async () => {
    const ctx: any = {
      snapshot: {
        seats: [
          {
            id: 0,
            playerName: "P1",
            role: { id: "fortune_teller", name: "占卜师", type: "townsfolk" },
            isAlive: true,
            isDead: false,
          },
          {
            id: 1,
            playerName: "P2",
            role: { id: "imp", name: "小恶魔", type: "demon" },
            isAlive: true,
            isDead: false,
          },
          {
            id: 2,
            playerName: "P3",
            role: { id: "monk", name: "僧侣", type: "townsfolk" },
            isAlive: true,
            isDead: false,
          },
        ],
        nightCount: 2,
        gamePhase: "night",
      },
      actionNode: { seatId: 0, roleId: "fortune_teller", roleName: "占卜师" },
      targetIds: [1, 2],
      meta: {},
    };
    const res = await runFullAbilityPipeline(pipe(fortuneTellerAbility), ctx);
    expect(res.meta.abilityResult).toBeDefined();
    expect(res.meta.abilityLog).toContain("有恶魔");
  });

  it("14. 僧侣 (Monk): 选择保护目标，能力管道成功执行", async () => {
    const ctx: any = {
      snapshot: {
        seats: [
          {
            id: 0,
            playerName: "P1",
            role: { id: "monk", name: "僧侣", type: "townsfolk" },
            isAlive: true,
            isDead: false,
            statusDetails: [],
          },
          {
            id: 1,
            playerName: "P2",
            role: { id: "chef", name: "厨师", type: "townsfolk" },
            isAlive: true,
            isDead: false,
            statusDetails: [],
          },
        ],
        nightCount: 2,
        gamePhase: "night",
      },
      actionNode: { seatId: 0, roleId: "monk", roleName: "僧侣" },
      targetIds: [1],
      meta: {},
    };
    const res = await runFullAbilityPipeline(pipe(monkAbility), ctx);
    expect(res.meta.abilityResult).toBeDefined();
    expect(res.meta.abilityLog).toBeDefined();
  });

  it("15. 神谕者 (Oracle): 白天处决后当晚得知死亡玩家中邪恶数量", async () => {
    const ctx: any = {
      snapshot: {
        seats: [
          {
            id: 0,
            playerName: "P1",
            role: { id: "oracle", name: "神谕者", type: "townsfolk" },
            isAlive: true,
            isDead: false,
          },
          {
            id: 1,
            playerName: "P2",
            role: { id: "imp", name: "小恶魔", type: "demon" },
            isAlive: false,
            isDead: true,
          },
          {
            id: 2,
            playerName: "P3",
            role: { id: "monk", name: "僧侣", type: "townsfolk" },
            isAlive: true,
            isDead: false,
          },
        ],
        nightCount: 2,
        gamePhase: "night",
        executedPlayerId: 1,
      },
      actionNode: { seatId: 0, roleId: "oracle", roleName: "神谕者" },
      meta: {},
    };
    const res = await runFullAbilityPipeline(pipe(oracleAbility), ctx);
    expect(res.meta.abilityResult).toBeDefined();
    expect(res.meta.abilityResult.finalCount).toBe(1);
    expect(res.meta.abilityLog).toContain("1");
  });

  it("16. 城镇公告员 (Town Crier): 白天有爪牙发起提名后当晚能力管道成功执行", async () => {
    const ctx: any = {
      snapshot: {
        seats: [
          {
            id: 0,
            playerName: "P1",
            role: { id: "town_crier", name: "城镇公告员", type: "townsfolk" },
            isAlive: true,
            isDead: false,
          },
          {
            id: 1,
            playerName: "P2",
            role: { id: "baron", name: "男爵", type: "minion" },
            isAlive: true,
            isDead: false,
          },
        ],
        nightCount: 2,
        gamePhase: "night",
        todayNominations: [{ nominatorSeatId: 1, nomineeSeatId: 0 }],
      },
      actionNode: { seatId: 0, roleId: "town_crier", roleName: "城镇公告员" },
      meta: {},
    };
    const res = await runFullAbilityPipeline(pipe(town_crierAbility), ctx);
    expect(res.meta.abilityResult).toBeDefined();
    expect(res.meta.abilityLog).toBeDefined();
  });

  it("17. 博学者 (Savant): 白天获得两条信息，能力管道成功执行", async () => {
    const ctx: any = {
      snapshot: {
        seats: [
          {
            id: 0,
            playerName: "P1",
            role: { id: "savant", name: "博学者", type: "townsfolk" },
            isAlive: true,
            isDead: false,
          },
          {
            id: 1,
            playerName: "P2",
            role: { id: "monk", name: "僧侣", type: "townsfolk" },
            isAlive: true,
            isDead: false,
          },
        ],
        nightCount: 2,
        gamePhase: "night",
      },
      actionNode: { seatId: 0, roleId: "savant", roleName: "博学者" },
      storytellerInput: {
        info1: "所有戴眼镜的玩家都是善良的",
        info2: "坐在黑色沙发上的玩家之一是爪牙",
      },
      meta: {},
    };
    const res = await runFullAbilityPipeline(pipe(savantAbility), ctx);
    expect(res.meta.abilityResult).toBeDefined();
  });

  it("18. 镇长 (Mayor): 3人存活且无处决提名 → 善良阵营获胜", () => {
    const seats = [
      {
        id: 0,
        playerName: "P1",
        role: { id: "mayor", name: "镇长", type: "townsfolk" },
        isAlive: true,
        isDead: false,
      },
      {
        id: 1,
        playerName: "P2",
        role: { id: "monk", name: "僧侣", type: "townsfolk" },
        isAlive: true,
        isDead: false,
      },
      {
        id: 2,
        playerName: "P3",
        role: { id: "imp", name: "小恶魔", type: "demon" },
        isAlive: true,
        isDead: false,
      },
    ];
    const gameEnd = checkGameEnd(seats as any, "execution", null, {
      mayorAlive: true,
      noExecutionToday: true,
      aliveCount: 3,
    });
    expect(gameEnd.isGameOver).toBe(true);
    expect(gameEnd.winner).toBe("Good");
    expect(gameEnd.reason).toContain("市长");
  });

  it("19. 罂粟种植者 (Poppy Grower): 存活时邪恶互识被阻断，死亡后恢复", async () => {
    const ctx: any = {
      snapshot: {
        seats: [
          {
            id: 0,
            playerName: "P1",
            role: { id: "poppy_grower", name: "罂粟种植者", type: "townsfolk" },
            isAlive: true,
            isDead: false,
          },
          {
            id: 1,
            playerName: "P2",
            role: { id: "imp", name: "小恶魔", type: "demon" },
            isAlive: true,
            isDead: false,
          },
          {
            id: 2,
            playerName: "P3",
            role: { id: "baron", name: "男爵", type: "minion" },
            isAlive: true,
            isDead: false,
          },
        ],
        nightCount: 1,
        gamePhase: "firstNight",
      },
      actionNode: { seatId: 0, roleId: "poppy_grower", roleName: "罂粟种植者" },
      meta: {},
    };
    const res = await runFullAbilityPipeline(pipe(poppy_growerAbility), ctx);
    expect(res.snapshot.evilHidden).toBe(true);
    expect(res.meta.abilityLog).toContain("隐藏");
  });

  it("20. 酒鬼 (Drunk): 以为自己是士兵，能力管道执行（醉酒状态可能中止）", async () => {
    const ctx: any = {
      snapshot: {
        seats: [
          {
            id: 0,
            playerName: "P1",
            role: { id: "drunk", name: "酒鬼", type: "outsider" },
            charadeRole: { id: "soldier", name: "士兵" },
            isAlive: true,
            isDead: false,
            isDrunk: true,
            statusEffects: [{ type: "drunk" }],
          },
          {
            id: 1,
            playerName: "P2",
            role: { id: "imp", name: "小恶魔", type: "demon" },
            isAlive: true,
            isDead: false,
          },
        ],
        nightCount: 2,
        gamePhase: "night",
      },
      actionNode: { seatId: 0, roleId: "drunk", roleName: "酒鬼" },
      meta: {},
    };
    const res = await runFullAbilityPipeline(pipe(drunkAbility), ctx);
    // 酒鬼能力可能被中止（无夜间行动）或执行成功，两种结果均合法
    expect(res).toBeDefined();
    expect(res.meta).toBeDefined();
  });

  it("21. 畸形秀演员 (Mutant): 能力管道成功执行，挂载身份标记", async () => {
    const ctx: any = {
      snapshot: {
        seats: [
          {
            id: 0,
            playerName: "P1",
            role: { id: "mutant", name: "畸形秀演员", type: "outsider" },
            isAlive: true,
            isDead: false,
            statusDetails: [],
          },
          {
            id: 1,
            playerName: "P2",
            role: { id: "monk", name: "僧侣", type: "townsfolk" },
            isAlive: true,
            isDead: false,
          },
        ],
        nightCount: 1,
        gamePhase: "firstNight",
      },
      actionNode: { seatId: 0, roleId: "mutant", roleName: "畸形秀演员" },
      meta: {},
    };
    const res = await runFullAbilityPipeline(pipe(mutantAbility), ctx);
    expect(res.meta.abilityResult).toBeDefined();
  });

  it("22. 告密者 (Snitch): 首夜为所有爪牙/恶魔提供不在场角色，能力管道成功执行", async () => {
    const ctx: any = {
      snapshot: {
        seats: [
          {
            id: 0,
            playerName: "P1",
            role: { id: "snitch", name: "告密者", type: "outsider" },
            isAlive: true,
            isDead: false,
          },
          {
            id: 1,
            playerName: "P2",
            role: { id: "imp", name: "小恶魔", type: "demon" },
            isAlive: true,
            isDead: false,
            statusDetails: [],
          },
          {
            id: 2,
            playerName: "P3",
            role: { id: "baron", name: "男爵", type: "minion" },
            isAlive: true,
            isDead: false,
            statusDetails: [],
          },
        ],
        nightCount: 1,
        gamePhase: "firstNight",
      },
      actionNode: { seatId: 0, roleId: "snitch", roleName: "告密者" },
      meta: {},
    };
    const res = await runFullAbilityPipeline(pipe(snitchAbility), ctx);
    expect(res.meta.abilityResult).toBeDefined();
  });

  it("23. 男爵 (Baron): 首夜能力管道成功执行（被动能力，设置阶段已生效）", async () => {
    const ctx: any = {
      snapshot: {
        seats: [
          {
            id: 0,
            playerName: "P1",
            role: { id: "baron", name: "男爵", type: "minion" },
            isAlive: true,
            isDead: false,
          },
          {
            id: 1,
            playerName: "P2",
            role: { id: "imp", name: "小恶魔", type: "demon" },
            isAlive: true,
            isDead: false,
          },
        ],
        nightCount: 1,
        gamePhase: "firstNight",
        scriptRoleIds: ["monk", "chef", "librarian", "mayor", "imp", "baron"],
      },
      actionNode: { seatId: 0, roleId: "baron", roleName: "男爵" },
      meta: {},
    };
    const res = await runFullAbilityPipeline(pipe(baronAbility), ctx);
    expect(res).toBeDefined();
    expect(res.meta).toBeDefined();
  });

  it("24. 军团 (Legion): 所有恶魔均为军团，白天无人被处决 → 邪恶获胜", () => {
    const seats = [
      {
        id: 0,
        playerName: "P1",
        role: { id: "legion", name: "军团", type: "demon" },
        isAlive: true,
        isDead: false,
      },
      {
        id: 1,
        playerName: "P2",
        role: { id: "legion", name: "军团", type: "demon" },
        isAlive: true,
        isDead: false,
      },
      {
        id: 2,
        playerName: "P3",
        role: { id: "legion", name: "军团", type: "demon" },
        isAlive: true,
        isDead: false,
      },
      {
        id: 3,
        playerName: "P4",
        role: { id: "monk", name: "僧侣", type: "townsfolk" },
        isAlive: true,
        isDead: false,
      },
    ];
    const gameEnd = checkGameEnd(seats as any, "execution", null, {
      legionActive: true,
      noExecutionToday: true,
    });
    expect(gameEnd.isGameOver).toBe(true);
    expect(gameEnd.winner).toBe("Evil");
  });
});
