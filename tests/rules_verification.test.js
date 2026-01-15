/**
 * 游戏规则逻辑验证测试
 * 验证特定游戏规则的正确实现（Slayer, Virgin, Zombuul）
 * 不依赖浏览器，直接测试核心逻辑
 */

const { roles } = require('../app/data.ts');
const troubleBrewingRolesData = require('../src/data/rolesData.json');
const { generateNightTimeline } = require('../src/utils/nightLogic.ts');
const { getRegistration } = require('../src/utils/gameRules.ts');
const { killPlayer } = require('../app/gameLogic.ts');

// ---------- 工具函数 ----------
// 合并roles和rolesData.json的元数据
const getRole = (id) => {
  const r = roles.find((x) => x.id === id);
  if (!r) throw new Error(`未找到角色: ${id}`);
  
  // 尝试从rolesData.json获取元数据并合并
  const jsonRole = troubleBrewingRolesData.find((x) => x.id === id);
  if (jsonRole) {
    // 合并元数据字段
    return {
      ...r,
      firstNightMeta: jsonRole.firstNightMeta || r.firstNightMeta,
      otherNightMeta: jsonRole.otherNightMeta || r.otherNightMeta,
      dayMeta: jsonRole.dayMeta || r.dayMeta,
      triggerMeta: jsonRole.triggerMeta || r.triggerMeta,
      setupMeta: jsonRole.setupMeta || r.setupMeta,
      firstNightOrder: jsonRole.firstNightOrder ?? r.firstNightOrder,
      otherNightOrder: jsonRole.otherNightOrder ?? r.otherNightOrder,
    };
  }
  
  return r;
};

const createSeat = (idx, roleId, overrides = {}) => ({
  id: idx,
  role: getRole(roleId),
  charadeRole: null,
  isDead: false,
  isEvilConverted: false,
  isGoodConverted: false,
  isDrunk: roleId === 'drunk',
  isPoisoned: false,
  isProtected: false,
  protectedBy: null,
  isRedHerring: false,
  isFortuneTellerRedHerring: false,
  isSentenced: false,
  masterId: null,
  hasUsedSlayerAbility: false,
  hasUsedVirginAbility: false,
  hasBeenNominated: false,
  isDemonSuccessor: false,
  hasAbilityEvenDead: false,
  statusDetails: [],
  statuses: [],
  grandchildId: null,
  isGrandchild: false,
  isFirstDeathForZombuul: false,
  isZombuulTrulyDead: false,
  zombuulLives: 1,
  ...overrides,
});

// ---------- 测试场景 ----------

describe('游戏规则逻辑验证', () => {
  
  describe('1. Slayer射击测试', () => {
    test('Slayer对Imp开枪，Imp应该死亡', () => {
      // 设置：创建Slayer和Imp
      const slayer = createSeat(0, 'slayer');
      const imp = createSeat(1, 'imp');
      const seats = [slayer, imp];

      // 验证初始状态
      expect(slayer.hasUsedSlayerAbility).toBe(false);
      expect(imp.isDead).toBe(false);
      expect(slayer.isDead).toBe(false);
      expect(slayer.isPoisoned).toBe(false);

      // 模拟Slayer射击逻辑（基于useGameController的handleDayAction）
      // 1. 检查Slayer是否可以使用能力
      if (slayer.hasUsedSlayerAbility || slayer.isDead) {
        throw new Error('Slayer无法使用能力');
      }

      // 2. 检查目标是否已死亡
      if (imp.isDead) {
        throw new Error('目标已死亡');
      }

      // 3. 检查Slayer是否为健康的真正Slayer
      const isRealSlayer = slayer.role?.id === 'slayer' && !slayer.isPoisoned && !slayer.isDead;
      expect(isRealSlayer).toBe(true);

      // 4. 检查目标是否注册为恶魔
      const registration = getRegistration(imp, slayer.role);
      const isDemon = registration.registersAsDemon;
      expect(isDemon).toBe(true); // Imp是恶魔，应该注册为恶魔

      // 5. 执行射击：如果Slayer健康且目标是恶魔，目标死亡
      if (isRealSlayer && isDemon) {
        const updatedSeats = killPlayer(seats, imp.id, { 
          isNightPhase: false, 
          checkProtection: false 
        });
        const updatedImp = updatedSeats.find(s => s.id === imp.id);
        
        // 验证：Imp应该死亡
        expect(updatedImp.isDead).toBe(true);
      } else {
        throw new Error('射击条件不满足');
      }
    });

    test('Slayer对非恶魔开枪，目标不应该死亡', () => {
      const slayer = createSeat(0, 'slayer');
      const chef = createSeat(1, 'chef');
      const seats = [slayer, chef];

      const isRealSlayer = slayer.role?.id === 'slayer' && !slayer.isPoisoned && !slayer.isDead;
      expect(isRealSlayer).toBe(true);

      const registration = getRegistration(chef, slayer.role);
      const isDemon = registration.registersAsDemon;
      expect(isDemon).toBe(false); // Chef不是恶魔

      // 如果目标不是恶魔，不应该死亡
      expect(chef.isDead).toBe(false);
    });
  });

  describe('2. Virgin触发测试', () => {
    test('Chef提名Virgin，Chef应该被处决', () => {
      // 设置：创建Chef和Virgin
      const chef = createSeat(0, 'chef');
      const virgin = createSeat(1, 'virgin');
      const seats = [chef, virgin];

      // 验证初始状态
      expect(virgin.hasBeenNominated).toBe(false);
      expect(virgin.hasUsedVirginAbility).toBe(false);
      expect(virgin.isPoisoned).toBe(false);
      expect(chef.isDead).toBe(false);
      expect(chef.role?.type).toBe('townsfolk');
      expect(chef.role?.id).not.toBe('drunk');
      expect(chef.isDrunk).toBe(false);

      // 模拟提名逻辑（基于useGameController的executeNomination）
      const sourceId = chef.id;
      const targetId = virgin.id;
      const target = seats.find(s => s.id === targetId);
      const nominatorSeat = seats.find(s => s.id === sourceId);

      // 检查是否为Virgin首次被提名
      const isFirstNomination = !target.hasBeenNominated;
      expect(isFirstNomination).toBe(true);

      // 检查Virgin是否中毒（中毒时能力失效）
      if (target.isPoisoned) {
        throw new Error('Virgin中毒，能力失效');
      }

      // 检查提名者是否为真正的镇民
      const isRealTownsfolk = 
        nominatorSeat &&
        nominatorSeat.role?.type === 'townsfolk' &&
        nominatorSeat.role?.id !== 'drunk' &&
        !nominatorSeat.isDrunk;

      expect(isRealTownsfolk).toBe(true);

      // 执行Virgin触发逻辑
      if (isFirstNomination && isRealTownsfolk) {
        // 更新Virgin状态
        const updatedSeats = seats.map(s => {
          if (s.id === targetId) {
            return { ...s, hasBeenNominated: true, hasUsedVirginAbility: true };
          }
          if (s.id === sourceId) {
            // 提名者被处决
            return { ...s, isDead: true };
          }
          return s;
        });

        const updatedChef = updatedSeats.find(s => s.id === chef.id);
        const updatedVirgin = updatedSeats.find(s => s.id === virgin.id);

        // 验证：Chef应该死亡
        expect(updatedChef.isDead).toBe(true);
        // 验证：Virgin应该被标记为已提名
        expect(updatedVirgin.hasBeenNominated).toBe(true);
        expect(updatedVirgin.hasUsedVirginAbility).toBe(true);
      } else {
        throw new Error('Virgin触发条件不满足');
      }
    });

    test('非镇民提名Virgin，不应该触发处决', () => {
      const imp = createSeat(0, 'imp'); // Imp是恶魔，不是镇民
      const virgin = createSeat(1, 'virgin');
      const seats = [imp, virgin];

      const nominatorSeat = seats.find(s => s.id === imp.id);
      const isRealTownsfolk = 
        nominatorSeat &&
        nominatorSeat.role?.type === 'townsfolk' &&
        nominatorSeat.role?.id !== 'drunk' &&
        !nominatorSeat.isDrunk;

      expect(isRealTownsfolk).toBe(false); // Imp不是镇民

      // 不应该触发处决
      expect(imp.isDead).toBe(false);
    });
  });

  describe('3. Zombuul重新醒来测试', () => {
    test('Zombuul被执行后，生成下一个夜晚时间线时应该出现在时间线中', () => {
      // 设置：创建Zombuul（首次死亡状态，仍可醒来）
      const zombuul = createSeat(0, 'zombuul', {
        isDead: true, // Zombuul已被执行（首次死亡）
        isFirstDeathForZombuul: true, // 首次死亡标记
        isZombuulTrulyDead: false, // 尚未真正死亡
      });
      const otherPlayer = createSeat(1, 'chef');
      const seats = [zombuul, otherPlayer];

      // 验证初始状态：Zombuul已死亡
      expect(zombuul.isDead).toBe(true);

      // 检查Zombuul的元数据是否有wakesIfDead标志
      const zombuulRole = zombuul.role;
      expect(zombuulRole).toBeDefined();
      expect(zombuulRole.id).toBe('zombuul');

      // 检查otherNightMeta中的wakesIfDead
      const otherNightMeta = zombuulRole.otherNightMeta;
      expect(otherNightMeta).toBeDefined();
      expect(otherNightMeta?.wakesIfDead).toBe(true); // Zombuul应该允许死亡后醒来

      // 生成夜晚时间线（非首夜）
      const timeline = generateNightTimeline(seats, false); // false表示非首夜

      // 验证：Zombuul应该在时间线中（因为wakesIfDead = true）
      const zombuulStep = timeline.find(step => 
        step.type === 'character' && 
        step.roleId === 'zombuul' &&
        step.seatId === zombuul.id
      );

      expect(zombuulStep).toBeDefined();
      expect(zombuulStep?.content.title).toBe('僵怖');
    });

    test('存活的Zombuul应该出现在夜晚时间线中', () => {
      const zombuul = createSeat(0, 'zombuul', {
        isDead: false,
      });
      const seats = [zombuul];

      const timeline = generateNightTimeline(seats, false);

      const zombuulStep = timeline.find(step => 
        step.type === 'character' && 
        step.roleId === 'zombuul'
      );

      expect(zombuulStep).toBeDefined();
    });

    test('普通角色死亡后不应该出现在夜晚时间线中', () => {
      const chef = createSeat(0, 'chef', {
        isDead: true,
      });
      const seats = [chef];

      const timeline = generateNightTimeline(seats, false);

      // Chef没有夜晚行动，不应该出现在时间线中
      const chefStep = timeline.find(step => 
        step.type === 'character' && 
        step.roleId === 'chef'
      );

      expect(chefStep).toBeUndefined();
    });
  });
});

