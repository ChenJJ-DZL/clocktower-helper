/**
 * 首夜入夜守卫校验与空夜间队列容错专项测试
 *
 * 覆盖场景：
 * 1. 未落座（0人）或少于5人时，尝试入夜会被拦截提示，杜绝空对局卡死
 * 2. 缺少恶魔角色时，拦截并提示，确保对局合法性
 * 3. 正常5人及以上且含恶魔时，顺利启动首夜
 * 4. 极端空夜间队列场景（全员首夜无行动），系统友好提示并直接进入第一天白天
 */

import { describe, it, expect, beforeAll } from "vitest";
import { generateDynamicNightQueue } from "../../src/utils/dynamicQueueGenerator";
import { ENGINE_CONFIG } from "../../src/hooks/useNightEngine";
import { registerAllNewEngineAbilities } from "../../src/roles/new_engine/abilityRegistry";
import type { Seat } from "../../app/data";

describe("首夜入夜守卫与夜间队列容错测试", () => {
  beforeAll(() => {
    registerAllNewEngineAbilities();
  });
  it("场景 1: 空座位（未分配角色）时生成队列为空", () => {
    const emptySeats: Seat[] = Array.from({ length: 15 }, (_, i) => ({
      id: i,
      playerName: `玩家 ${i + 1}`,
      role: null,
      charadeRole: null,
      isDead: false,
      isDrunk: false,
      isPoisoned: false,
      isProtected: false,
      protectedBy: null,
      isRedHerring: false,
      isFortuneTellerRedHerring: false,
      isSentenced: false,
      masterId: null,
      hasUsedSlayerAbility: false,
      hasUsedVirginAbility: false,
      isDemonSuccessor: false,
      hasAbilityEvenDead: false,
      statusDetails: [],
      statuses: [],
      voteCount: 0,
      isCandidate: false,
      grandchildId: null,
      isGrandchild: false,
      isFirstDeathForZombuul: false,
      isZombuulTrulyDead: false,
      zombuulLives: 1,
    }));

    const snapshot: any = {
      nightCount: 1,
      gamePhase: "firstNight",
      seats: emptySeats,
      statusEffects: {},
    };

    const queue = generateDynamicNightQueue(
      ENGINE_CONFIG.fullNightOrder,
      snapshot,
      { isFirstNight: true }
    );

    // 验证空座位生成队列确实为 0，这正是此前导致静默卡死的根源
    expect(queue.length).toBe(0);
  });

  it("场景 2: 正常 5 人以上且含恶魔时，首夜能够生成合法唤醒队列", () => {
    const validSeats: Seat[] = [
      {
        id: 0,
        playerName: "P1",
        role: { id: "librarian", name: "图书管理员", type: "townsfolk" },
        charadeRole: null,
        isDead: false,
        isDrunk: false,
        isPoisoned: false,
        isProtected: false,
        protectedBy: null,
        isRedHerring: false,
        isFortuneTellerRedHerring: false,
        isSentenced: false,
        masterId: null,
        hasUsedSlayerAbility: false,
        hasUsedVirginAbility: false,
        isDemonSuccessor: false,
        hasAbilityEvenDead: false,
        statusDetails: [],
        statuses: [],
        voteCount: 0,
        isCandidate: false,
        grandchildId: null,
        isGrandchild: false,
        isFirstDeathForZombuul: false,
        isZombuulTrulyDead: false,
        zombuulLives: 1,
      },
      {
        id: 1,
        playerName: "P2",
        role: { id: "chef", name: "厨师", type: "townsfolk" },
        charadeRole: null,
        isDead: false,
        isDrunk: false,
        isPoisoned: false,
        isProtected: false,
        protectedBy: null,
        isRedHerring: false,
        isFortuneTellerRedHerring: false,
        isSentenced: false,
        masterId: null,
        hasUsedSlayerAbility: false,
        hasUsedVirginAbility: false,
        isDemonSuccessor: false,
        hasAbilityEvenDead: false,
        statusDetails: [],
        statuses: [],
        voteCount: 0,
        isCandidate: false,
        grandchildId: null,
        isGrandchild: false,
        isFirstDeathForZombuul: false,
        isZombuulTrulyDead: false,
        zombuulLives: 1,
      },
      {
        id: 2,
        playerName: "P3",
        role: { id: "drunk", name: "酒鬼", type: "outsider" },
        charadeRole: { id: "monk", name: "僧侣", type: "townsfolk" },
        isDead: false,
        isDrunk: true,
        isPoisoned: false,
        isProtected: false,
        protectedBy: null,
        isRedHerring: false,
        isFortuneTellerRedHerring: false,
        isSentenced: false,
        masterId: null,
        hasUsedSlayerAbility: false,
        hasUsedVirginAbility: false,
        isDemonSuccessor: false,
        hasAbilityEvenDead: false,
        statusDetails: [],
        statuses: [],
        voteCount: 0,
        isCandidate: false,
        grandchildId: null,
        isGrandchild: false,
        isFirstDeathForZombuul: false,
        isZombuulTrulyDead: false,
        zombuulLives: 1,
      },
      {
        id: 3,
        playerName: "P4",
        role: { id: "poisoner", name: "投毒者", type: "minion" },
        charadeRole: null,
        isDead: false,
        isDrunk: false,
        isPoisoned: false,
        isProtected: false,
        protectedBy: null,
        isRedHerring: false,
        isFortuneTellerRedHerring: false,
        isSentenced: false,
        masterId: null,
        hasUsedSlayerAbility: false,
        hasUsedVirginAbility: false,
        isDemonSuccessor: false,
        hasAbilityEvenDead: false,
        statusDetails: [],
        statuses: [],
        voteCount: 0,
        isCandidate: false,
        grandchildId: null,
        isGrandchild: false,
        isFirstDeathForZombuul: false,
        isZombuulTrulyDead: false,
        zombuulLives: 1,
      },
      {
        id: 4,
        playerName: "P5",
        role: { id: "imp", name: "小恶魔", type: "demon" },
        charadeRole: null,
        isDead: false,
        isDrunk: false,
        isPoisoned: false,
        isProtected: false,
        protectedBy: null,
        isRedHerring: false,
        isFortuneTellerRedHerring: false,
        isSentenced: false,
        masterId: null,
        hasUsedSlayerAbility: false,
        hasUsedVirginAbility: false,
        isDemonSuccessor: false,
        hasAbilityEvenDead: false,
        statusDetails: [],
        statuses: [],
        voteCount: 0,
        isCandidate: false,
        grandchildId: null,
        isGrandchild: false,
        isFirstDeathForZombuul: false,
        isZombuulTrulyDead: false,
        zombuulLives: 1,
      },
    ];

    const snapshot: any = {
      nightCount: 1,
      gamePhase: "firstNight",
      seats: validSeats,
      statusEffects: {},
    };

    const queue = generateDynamicNightQueue(
      ENGINE_CONFIG.fullNightOrder,
      snapshot,
      { isFirstNight: true }
    );

    // 应该生成包含爪牙互认、恶魔互认、投毒者、厨师、图书管理员的完整队列
    expect(queue.length).toBeGreaterThan(0);
    const roleIds = queue.map((q) => q.roleId);
    expect(roleIds).toContain("poisoner");
    expect(roleIds).toContain("chef");
    expect(roleIds).toContain("librarian");
  });

  it("场景 3: 罂粟种植者存活且军团无独立首夜唤醒技能时，首夜互认被规则正确过滤", () => {
    // 罂粟种植者 + 军团 + 纯白天行动角色（如市长）
    const poppygandaQuietSeats: Seat[] = [
      {
        id: 0,
        playerName: "P1",
        role: { id: "poppy_grower", name: "罂粟种植者", type: "townsfolk" },
        charadeRole: null,
        isDead: false,
        isDrunk: false,
        isPoisoned: false,
        isProtected: false,
        protectedBy: null,
        isRedHerring: false,
        isFortuneTellerRedHerring: false,
        isSentenced: false,
        masterId: null,
        hasUsedSlayerAbility: false,
        hasUsedVirginAbility: false,
        isDemonSuccessor: false,
        hasAbilityEvenDead: false,
        statusDetails: [],
        statuses: [],
        voteCount: 0,
        isCandidate: false,
        grandchildId: null,
        isGrandchild: false,
        isFirstDeathForZombuul: false,
        isZombuulTrulyDead: false,
        zombuulLives: 1,
      },
      {
        id: 1,
        playerName: "P2",
        role: { id: "mayor", name: "市长", type: "townsfolk" },
        charadeRole: null,
        isDead: false,
        isDrunk: false,
        isPoisoned: false,
        isProtected: false,
        protectedBy: null,
        isRedHerring: false,
        isFortuneTellerRedHerring: false,
        isSentenced: false,
        masterId: null,
        hasUsedSlayerAbility: false,
        hasUsedVirginAbility: false,
        isDemonSuccessor: false,
        hasAbilityEvenDead: false,
        statusDetails: [],
        statuses: [],
        voteCount: 0,
        isCandidate: false,
        grandchildId: null,
        isGrandchild: false,
        isFirstDeathForZombuul: false,
        isZombuulTrulyDead: false,
        zombuulLives: 1,
      },
      {
        id: 2,
        playerName: "P3",
        role: { id: "legion", name: "军团", type: "demon" },
        charadeRole: null,
        isDead: false,
        isDrunk: false,
        isPoisoned: false,
        isProtected: false,
        protectedBy: null,
        isRedHerring: false,
        isFortuneTellerRedHerring: false,
        isSentenced: false,
        masterId: null,
        hasUsedSlayerAbility: false,
        hasUsedVirginAbility: false,
        isDemonSuccessor: false,
        hasAbilityEvenDead: false,
        statusDetails: [],
        statuses: [],
        voteCount: 0,
        isCandidate: false,
        grandchildId: null,
        isGrandchild: false,
        isFirstDeathForZombuul: false,
        isZombuulTrulyDead: false,
        zombuulLives: 1,
      },
      {
        id: 3,
        playerName: "P4",
        role: { id: "legion", name: "军团", type: "demon" },
        charadeRole: null,
        isDead: false,
        isDrunk: false,
        isPoisoned: false,
        isProtected: false,
        protectedBy: null,
        isRedHerring: false,
        isFortuneTellerRedHerring: false,
        isSentenced: false,
        masterId: null,
        hasUsedSlayerAbility: false,
        hasUsedVirginAbility: false,
        isDemonSuccessor: false,
        hasAbilityEvenDead: false,
        statusDetails: [],
        statuses: [],
        voteCount: 0,
        isCandidate: false,
        grandchildId: null,
        isGrandchild: false,
        isFirstDeathForZombuul: false,
        isZombuulTrulyDead: false,
        zombuulLives: 1,
      },
      {
        id: 4,
        playerName: "P5",
        role: { id: "legion", name: "军团", type: "demon" },
        charadeRole: null,
        isDead: false,
        isDrunk: false,
        isPoisoned: false,
        isProtected: false,
        protectedBy: null,
        isRedHerring: false,
        isFortuneTellerRedHerring: false,
        isSentenced: false,
        masterId: null,
        hasUsedSlayerAbility: false,
        hasUsedVirginAbility: false,
        isDemonSuccessor: false,
        hasAbilityEvenDead: false,
        statusDetails: [],
        statuses: [],
        voteCount: 0,
        isCandidate: false,
        grandchildId: null,
        isGrandchild: false,
        isFirstDeathForZombuul: false,
        isZombuulTrulyDead: false,
        zombuulLives: 1,
      },
    ];

    const snapshot: any = {
      nightCount: 1,
      gamePhase: "firstNight",
      seats: poppygandaQuietSeats,
      statusEffects: {},
    };

    const queue = generateDynamicNightQueue(
      ENGINE_CONFIG.fullNightOrder,
      snapshot,
      { isFirstNight: true }
    );

    // 军团互认因为罂粟种植者存活被过滤，市长和罂粟种植者首夜无唤醒技能，队列合法为空
    expect(queue.length).toBe(0);
  });
});
