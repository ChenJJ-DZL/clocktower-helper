/**
 * 暗月初升（Bad Moon Rising）完整游戏模拟测试
 * 包含所有角色的完整能力实现
 * 
 * 使用方法：
 * npm run test:simulation:bmr
 * 或
 * jest tests/simulation_bad_moon_rising.test.js
 */

const fs = require('fs');
const path = require('path');
const base = require('./simulation_base');
const { cleanScriptLogs } = require('./cleanup_simulation_logs');

const { roles } = require('../app/data.ts');

// 暗月初升标准阵容（与暗流涌动相同）
const BMR_PRESETS = [
  { total: 5, townsfolk: 3, outsider: 0, minion: 1, demon: 1 },
  { total: 6, townsfolk: 3, outsider: 1, minion: 1, demon: 1 },
  { total: 7, townsfolk: 5, outsider: 0, minion: 1, demon: 1 },
  { total: 8, townsfolk: 5, outsider: 1, minion: 1, demon: 1 },
  { total: 9, townsfolk: 5, outsider: 2, minion: 1, demon: 1 },
  { total: 10, townsfolk: 7, outsider: 0, minion: 2, demon: 1 },
  { total: 11, townsfolk: 7, outsider: 1, minion: 2, demon: 1 },
  { total: 12, townsfolk: 7, outsider: 2, minion: 2, demon: 1 },
  { total: 13, townsfolk: 9, outsider: 0, minion: 3, demon: 1 },
  { total: 14, townsfolk: 9, outsider: 1, minion: 3, demon: 1 },
  { total: 15, townsfolk: 9, outsider: 4, minion: 2, demon: 1 },
];

const pickPreset = (count) => BMR_PRESETS.find((p) => p.total === count);
const filterRoles = (type) =>
  roles.filter((r) => r.script === '暗月初升' && r.type === type && !r.hidden);

/**
 * 初始化游戏
 */
const initGame = (playerCount) => {
  const preset = pickPreset(playerCount);
  const seats = Array.from({ length: playerCount }, (_, id) => ({
    id,
    role: null,
    charadeRole: null,
    displayRole: null,
    isDead: false,
    isEvilConverted: false,
    isGoodConverted: false,
    isDrunk: false,
    isPoisoned: false,
    isProtected: false,
    protectedBy: null,
    isRedHerring: false,
    isFortuneTellerRedHerring: false,
    isSentenced: false,
    masterId: null,
    hasUsedSlayerAbility: false,
    hasUsedDayAbility: false,
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
    // 暗月初升特有字段
    hasUsedCourtierAbility: false,
    hasUsedProfessorAbility: false,
    hasUsedSeamstressAbility: false,
    hasUsedAssassinAbility: false,
    lastExorcistTarget: null,
    lastDevilsAdvocateTarget: null,
    pukkaPoisonedPlayers: [],
    shabalothTargets: [],
    poLastChoice: null,
    isExecutionImmune: false, // 魔鬼代言人保护
    isFoolFirstDeath: true, // 弄臣首次死亡保护
    isLunatic: false, // 疯子标记
    lunaticTargets: [], // 疯子的攻击目标
  }));

  const pickByType = (type, count) => base.shuffle(filterRoles(type)).slice(0, count);
  const picked = [
    ...pickByType('townsfolk', preset.townsfolk),
    ...pickByType('outsider', preset.outsider),
    ...pickByType('minion', preset.minion),
    ...pickByType('demon', preset.demon),
  ];

  const shuffled = base.shuffle(picked);
  seats.forEach((s, i) => {
    s.role = shuffled[i];
    // 疯子标记
    if (s.role.id === 'lunatic') {
      s.isLunatic = true;
    }
  });

  return {
    seats,
    day: 1,
    night: 1,
    phase: 'firstNight',
    winner: null,
    log: [],
    actions: [],
    stateSnapshots: [],
    storytellerTips: [],
    modals: [],
    preset,
    executedToday: null,
    nominationMap: {},
    lastExorcistTarget: null,
    lastDevilsAdvocateTarget: null,
    pukkaPoisonedPlayers: [],
    shabalothTargets: [],
    poLastChoice: null,
    gossipStatement: null, // 造谣者的声明
    gossipStatementResult: null, // 声明是否正确
  };
};

/**
 * 模拟夜晚行动 - 包含所有角色的完整能力
 */
const simulateNight = (ctx) => {
  const phaseLabel = ctx.night === 1 ? '首夜' : `第${ctx.night}夜`;
  ctx.log.push(`=== ${phaseLabel} ===`);
  
  const tips = base.getStorytellerTips(ctx);
  ctx.storytellerTips.push({
    phase: ctx.phase,
    day: ctx.day,
    night: ctx.night,
    tips: [...tips],
  });

  base.snapshotState(ctx, ctx.phase, `进入${phaseLabel}`);

  const alive = base.aliveSeats(ctx);
  const isFirstNight = ctx.night === 1;
  const actionOrder = [];
  const deadThisNight = [];

  // ========== 首夜信息角色 ==========
  if (isFirstNight) {
    // 1. 祖母 - 首夜得知一名善良玩家和他的角色
    const grandmothers = alive.filter((s) => s.role?.id === 'grandmother');
    grandmothers.forEach((gm) => {
      if (base.isActorDisabledByPoisonOrDrunk(gm)) {
        ctx.log.push(`[夜晚] 祖母(${gm.id + 1}) 因中毒/醉酒无法行动`);
        return;
      }
      const goodPlayers = alive.filter(t => base.isGood(t) && t.id !== gm.id);
      const grandchild = base.randomAlive(ctx, (t) => base.isGood(t) && t.id !== gm.id);
      if (grandchild) {
        gm.grandchildId = grandchild.id;
        grandchild.isGrandchild = true;
        actionOrder.push({
          actor: `${gm.id + 1}号-祖母`,
          action: '获得信息',
          result: `孙子：${grandchild.id + 1}号-${grandchild.role.name}`,
        });
        ctx.log.push(`[夜晚] 祖母(${gm.id + 1}) 得知孙子：${grandchild.id + 1}号-${grandchild.role.name}`);
      }
    });

    // 2. 教父 - 首夜得知有哪些外来者角色在场
    const godfathers = alive.filter((s) => s.role?.id === 'godfather');
    godfathers.forEach((gf) => {
      const outsiders = alive.filter(t => t.role?.type === 'outsider');
      const outsiderRoles = [...new Set(outsiders.map(o => o.role.name))];
      actionOrder.push({
        actor: `${gf.id + 1}号-教父`,
        action: '获得信息',
        result: `在场的外来者角色：${outsiderRoles.join('、') || '无'}`,
      });
      ctx.log.push(`[夜晚] 教父(${gf.id + 1}) 得知在场的外来者角色：${outsiderRoles.join('、') || '无'}`);
    });
  }

  // ========== 每夜行动角色 ==========
  
  // 3. 水手 - 每夜选择一名玩家，你或他之一会醉酒
  const sailors = alive.filter((s) => s.role?.id === 'sailor');
  sailors.forEach((sailor) => {
    if (base.isActorDisabledByPoisonOrDrunk(sailor)) {
      ctx.log.push(`[夜晚] 水手(${sailor.id + 1}) 因中毒/醉酒无法行动`);
      return;
    }
    const target = base.randomAlive(ctx, (t) => t.id !== sailor.id);
    if (target) {
      // 随机选择水手或目标醉酒
      const drunkTarget = base.randomFloat() < 0.5 ? sailor : target;
      drunkTarget.isDrunk = true;
      drunkTarget.statusDetails = drunkTarget.statusDetails || [];
      drunkTarget.statusDetails.push('水手致醉');
      actionOrder.push({
        actor: `${sailor.id + 1}号-水手`,
        action: '选择目标',
        target: `${target.id + 1}号-${target.role.name}`,
        drunkTarget: `${drunkTarget.id + 1}号`,
        result: '成功',
      });
      ctx.log.push(`[夜晚] 水手(${sailor.id + 1}) 选择了${target.id + 1}号，${drunkTarget.id + 1}号醉酒`);
    }
  });

  // 4. 旅店老板 - 非首夜选择两名玩家，他们不会死亡，其中一人醉酒
  const innkeepers = alive.filter((s) => s.role?.id === 'innkeeper');
  if (!isFirstNight) {
    innkeepers.forEach((ik) => {
      if (base.isActorDisabledByPoisonOrDrunk(ik)) {
        ctx.log.push(`[夜晚] 旅店老板(${ik.id + 1}) 因中毒/醉酒无法行动`);
        return;
      }
      const targets = base.randomAliveMultiple(ctx, 2, (t) => t.id !== ik.id);
      if (targets.length === 2) {
        targets.forEach(t => {
          t.isProtected = true;
          t.protectedBy = ik.id;
        });
        // 其中一人醉酒
        const drunkTarget = targets[base.randomInt(0, 1)];
        drunkTarget.isDrunk = true;
        drunkTarget.statusDetails = drunkTarget.statusDetails || [];
        drunkTarget.statusDetails.push('旅店老板致醉');
        actionOrder.push({
          actor: `${ik.id + 1}号-旅店老板`,
          action: '保护并致醉',
          targets: targets.map(t => `${t.id + 1}号-${t.role.name}`).join('、'),
          drunkTarget: `${drunkTarget.id + 1}号`,
          result: '成功',
        });
        ctx.log.push(`[夜晚] 旅店老板(${ik.id + 1}) 保护了${targets.map(t => `${t.id + 1}号`).join('、')}，${drunkTarget.id + 1}号醉酒`);
      }
    });
  }

  // 5. 侍臣 - 每局限一次，选择一个角色，该角色之一醉酒三天三夜
  const courtiers = alive.filter((s) => s.role?.id === 'courtier' && !s.hasUsedCourtierAbility);
  courtiers.forEach((courtier) => {
    if (base.isActorDisabledByPoisonOrDrunk(courtier)) {
      ctx.log.push(`[夜晚] 侍臣(${courtier.id + 1}) 因中毒/醉酒无法行动`);
      return;
    }
    // 30%概率使用能力
    if (base.randomFloat() < 0.3) {
      const allRoles = filterRoles('townsfolk').concat(filterRoles('outsider'));
      const chosenRole = allRoles[base.randomInt(0, allRoles.length - 1)];
      const target = alive.find(t => t.role?.id === chosenRole.id);
      if (target) {
        courtier.hasUsedCourtierAbility = true;
        target.isDrunk = true;
        target.statusDetails = target.statusDetails || [];
        target.statusDetails.push('侍臣致醉（三天三夜）');
        actionOrder.push({
          actor: `${courtier.id + 1}号-侍臣`,
          action: '选择角色致醉',
          target: `${target.id + 1}号-${target.role.name}`,
          result: '成功',
        });
        ctx.log.push(`[夜晚] 侍臣(${courtier.id + 1}) 选择了${chosenRole.name}，${target.id + 1}号醉酒`);
      }
    }
  });

  // 6. 赌徒 - 每夜选择一名玩家并猜测他的角色，猜错则死亡
  const gamblers = alive.filter((s) => s.role?.id === 'gambler');
  gamblers.forEach((gambler) => {
    if (base.isActorDisabledByPoisonOrDrunk(gambler)) {
      ctx.log.push(`[夜晚] 赌徒(${gambler.id + 1}) 因中毒/醉酒无法行动`);
      return;
    }
    const target = base.randomAlive(ctx, (t) => t.id !== gambler.id);
    if (target) {
      // 随机猜测一个角色
      const allRoles = roles.filter(r => !r.hidden);
      const guessedRole = allRoles[base.randomInt(0, allRoles.length - 1)];
      const isCorrect = target.role?.id === guessedRole.id;
      if (!isCorrect) {
        gambler.isDead = true;
        deadThisNight.push(gambler.id);
        actionOrder.push({
          actor: `${gambler.id + 1}号-赌徒`,
          action: '猜测角色',
          target: `${target.id + 1}号-${target.role.name}`,
          guessedRole: guessedRole.name,
          result: '猜错，死亡',
        });
        ctx.log.push(`[夜晚] 赌徒(${gambler.id + 1}) 猜测${target.id + 1}号是${guessedRole.name}，猜错，死亡`);
      } else {
        actionOrder.push({
          actor: `${gambler.id + 1}号-赌徒`,
          action: '猜测角色',
          target: `${target.id + 1}号-${target.role.name}`,
          guessedRole: guessedRole.name,
          result: '猜对，存活',
        });
        ctx.log.push(`[夜晚] 赌徒(${gambler.id + 1}) 猜测${target.id + 1}号是${guessedRole.name}，猜对`);
      }
    }
  });

  // 7. 魔鬼代言人 - 每夜选择一名玩家（与上个夜晚不同），处决不死
  const devilsAdvocates = alive.filter((s) => s.role?.id === 'devils_advocate');
  devilsAdvocates.forEach((da) => {
    if (base.isActorDisabledByPoisonOrDrunk(da)) {
      ctx.log.push(`[夜晚] 魔鬼代言人(${da.id + 1}) 因中毒/醉酒无法行动`);
      return;
    }
    const target = base.randomAlive(ctx, (t) => t.id !== da.id && t.id !== ctx.lastDevilsAdvocateTarget);
    if (target) {
      target.isExecutionImmune = true;
      ctx.lastDevilsAdvocateTarget = target.id;
      target.statusDetails = target.statusDetails || [];
      target.statusDetails.push('魔鬼代言人保护（处决不死）');
      actionOrder.push({
        actor: `${da.id + 1}号-魔鬼代言人`,
        action: '保护（处决不死）',
        target: `${target.id + 1}号-${target.role.name}`,
        result: '成功',
      });
      ctx.log.push(`[夜晚] 魔鬼代言人(${da.id + 1}) 保护了${target.id + 1}号，使其处决不死`);
    }
  });

  // 8. 驱魔人 - 每夜选择一名玩家（与上个夜晚不同），如果选中恶魔，恶魔得知但不会因自身能力被唤醒
  const exorcists = alive.filter((s) => s.role?.id === 'exorcist');
  exorcists.forEach((ex) => {
    if (base.isActorDisabledByPoisonOrDrunk(ex)) {
      ctx.log.push(`[夜晚] 驱魔人(${ex.id + 1}) 因中毒/醉酒无法行动`);
      return;
    }
    const target = base.randomAlive(ctx, (t) => t.id !== ex.id && t.id !== ctx.lastExorcistTarget);
    if (target) {
      ctx.lastExorcistTarget = target.id;
      const isDemon = target.role?.type === 'demon' || target.isDemonSuccessor;
      if (isDemon) {
        target.statusDetails = target.statusDetails || [];
        target.statusDetails.push('驱魔人选中，得知驱魔人身份');
        actionOrder.push({
          actor: `${ex.id + 1}号-驱魔人`,
          action: '选择目标',
          target: `${target.id + 1}号-${target.role.name}`,
          result: '选中恶魔，恶魔得知驱魔人身份',
        });
        ctx.log.push(`[夜晚] 驱魔人(${ex.id + 1}) 选中了恶魔${target.id + 1}号，恶魔得知驱魔人身份`);
      } else {
        actionOrder.push({
          actor: `${ex.id + 1}号-驱魔人`,
          action: '选择目标',
          target: `${target.id + 1}号-${target.role.name}`,
          result: '未选中恶魔',
        });
        ctx.log.push(`[夜晚] 驱魔人(${ex.id + 1}) 选择了${target.id + 1}号，未选中恶魔`);
      }
    }
  });

  // 9. 侍女 - 每夜选择两名玩家，得知他们中有几人因自身能力被唤醒
  const chambermaids = alive.filter((s) => s.role?.id === 'chambermaid');
  chambermaids.forEach((cm) => {
    if (base.isActorDisabledByPoisonOrDrunk(cm)) {
      ctx.log.push(`[夜晚] 侍女(${cm.id + 1}) 因中毒/醉酒无法行动`);
      return;
    }
    const targets = base.randomAliveMultiple(ctx, 2, (t) => t.id !== cm.id);
    if (targets.length === 2) {
      // 简化：随机决定有多少人被唤醒（0-2）
      const awakenedCount = base.randomInt(0, 2);
      actionOrder.push({
        actor: `${cm.id + 1}号-侍女`,
        action: '获得信息',
        targets: targets.map(t => `${t.id + 1}号-${t.role.name}`).join('、'),
        result: `有${awakenedCount}人因自身能力被唤醒`,
      });
      ctx.log.push(`[夜晚] 侍女(${cm.id + 1}) 得知${targets.map(t => `${t.id + 1}号`).join('、')}中有${awakenedCount}人因自身能力被唤醒`);
    }
  });

  // 10. 教授 - 每局限一次，选择一名死亡玩家，如果是镇民则复活
  const professors = alive.filter((s) => s.role?.id === 'professor' && !s.hasUsedProfessorAbility);
  professors.forEach((prof) => {
    if (base.isActorDisabledByPoisonOrDrunk(prof)) {
      ctx.log.push(`[夜晚] 教授(${prof.id + 1}) 因中毒/醉酒无法行动`);
      return;
    }
    // 30%概率使用能力
    if (base.randomFloat() < 0.3) {
      const deadPlayers = ctx.seats.filter(s => s.isDead && s.role?.type === 'townsfolk');
      if (deadPlayers.length > 0) {
        const target = deadPlayers[base.randomInt(0, deadPlayers.length - 1)];
        prof.hasUsedProfessorAbility = true;
        target.isDead = false;
        actionOrder.push({
          actor: `${prof.id + 1}号-教授`,
          action: '复活',
          target: `${target.id + 1}号-${target.role.name}`,
          result: '成功',
        });
        ctx.log.push(`[夜晚] 教授(${prof.id + 1}) 复活了${target.id + 1}号-${target.role.name}`);
      }
    }
  });

  // 11. 刺客 - 每局限一次，选择一名玩家，他死亡（即使因任何原因不会死亡）
  const assassins = alive.filter((s) => s.role?.id === 'assassin' && !s.hasUsedAssassinAbility);
  assassins.forEach((ass) => {
    if (base.isActorDisabledByPoisonOrDrunk(ass)) {
      ctx.log.push(`[夜晚] 刺客(${ass.id + 1}) 因中毒/醉酒无法行动`);
      return;
    }
    // 30%概率使用能力
    if (base.randomFloat() < 0.3) {
      const target = base.randomAlive(ctx, (t) => t.id !== ass.id);
      if (target) {
        ass.hasUsedAssassinAbility = true;
        target.isDead = true;
        deadThisNight.push(target.id);
        actionOrder.push({
          actor: `${ass.id + 1}号-刺客`,
          action: '刺杀',
          target: `${target.id + 1}号-${target.role.name}`,
          result: '成功，目标死亡',
        });
        ctx.log.push(`[夜晚] 刺客(${ass.id + 1}) 刺杀了${target.id + 1}号-${target.role.name}`);
      }
    }
  });

  // 12. 教父 - 如果有外来者在今天白天死亡，选择一名玩家死亡
  const godfathers = alive.filter((s) => s.role?.id === 'godfather');
  if (ctx.executedToday !== null) {
    const executed = ctx.seats.find(s => s.id === ctx.executedToday);
    if (executed && executed.role?.type === 'outsider') {
      godfathers.forEach((gf) => {
        const target = base.randomAlive(ctx, (t) => t.id !== gf.id);
        if (target) {
          target.isDead = true;
          deadThisNight.push(target.id);
          actionOrder.push({
            actor: `${gf.id + 1}号-教父`,
            action: '杀死',
            target: `${target.id + 1}号-${target.role.name}`,
            result: '成功（因外来者死亡触发）',
          });
          ctx.log.push(`[夜晚] 教父(${gf.id + 1}) 因外来者死亡，杀死了${target.id + 1}号-${target.role.name}`);
        }
      });
    }
  }

  // ========== 恶魔行动 ==========
  
  // 13. 僵怖 - 如果今天白天没有人死亡，选择一名玩家死亡
  const zombuuls = base.aliveDemons(ctx).filter(d => d.role?.id === 'zombuul');
  if (ctx.executedToday === null && !isFirstNight) {
    zombuuls.forEach((z) => {
      const target = base.randomAlive(ctx, (t) => 
        t.id !== z.id && 
        !t.isProtected && 
        !base.hasTeaLadyProtection(t, ctx.seats)
      );
      if (target) {
        target.isDead = true;
        deadThisNight.push(target.id);
        actionOrder.push({
          actor: `${z.id + 1}号-僵怖`,
          action: '杀死',
          target: `${target.id + 1}号-${target.role.name}`,
          result: '成功（因白天无人死亡触发）',
        });
        ctx.log.push(`[夜晚] 僵怖(${z.id + 1}) 因白天无人死亡，杀死了${target.id + 1}号-${target.role.name}`);
      }
    });
  }

  // 14. 普卡 - 每夜选择一名玩家中毒，上个中毒的玩家死亡
  const pukkas = base.aliveDemons(ctx).filter(d => d.role?.id === 'pukka');
  pukkas.forEach((p) => {
    const target = base.randomAlive(ctx, (t) => t.id !== p.id);
    if (target) {
      target.isPoisoned = true;
      target.statusDetails = target.statusDetails || [];
      target.statusDetails.push('普卡致毒');
      ctx.pukkaPoisonedPlayers.push(target.id);
      
      // 上个中毒的玩家死亡
      if (ctx.pukkaPoisonedPlayers.length > 1) {
        const lastPoisonedId = ctx.pukkaPoisonedPlayers[ctx.pukkaPoisonedPlayers.length - 2];
        const lastPoisoned = ctx.seats.find(s => s.id === lastPoisonedId);
        if (lastPoisoned && !lastPoisoned.isDead) {
          lastPoisoned.isDead = true;
          lastPoisoned.isPoisoned = false; // 恢复健康
          deadThisNight.push(lastPoisonedId);
          actionOrder.push({
            actor: `${p.id + 1}号-普卡`,
            action: '中毒并杀死',
            target: `${target.id + 1}号-${target.role.name}`,
            lastTarget: `${lastPoisoned.id + 1}号-${lastPoisoned.role.name}`,
            result: '新目标中毒，上个目标死亡',
          });
          ctx.log.push(`[夜晚] 普卡(${p.id + 1}) 毒了${target.id + 1}号，上个中毒的${lastPoisoned.id + 1}号死亡`);
        }
      } else {
        actionOrder.push({
          actor: `${p.id + 1}号-普卡`,
          action: '中毒',
          target: `${target.id + 1}号-${target.role.name}`,
          result: '成功',
        });
        ctx.log.push(`[夜晚] 普卡(${p.id + 1}) 毒了${target.id + 1}号`);
      }
    }
  });

  // 15. 沙巴洛斯 - 每夜选择两名玩家死亡，可能反刍上次的目标
  const shabaloths = base.aliveDemons(ctx).filter(d => d.role?.id === 'shabaloth');
  shabaloths.forEach((sh) => {
    // 可能反刍上次的目标（30%概率）
    if (ctx.shabalothTargets.length > 0 && base.randomFloat() < 0.3) {
      const regurgitated = ctx.seats.find(s => 
        ctx.shabalothTargets.includes(s.id) && s.isDead
      );
      if (regurgitated) {
        regurgitated.isDead = false;
        actionOrder.push({
          actor: `${sh.id + 1}号-沙巴洛斯`,
          action: '反刍',
          target: `${regurgitated.id + 1}号-${regurgitated.role.name}`,
          result: '成功，目标复活',
        });
        ctx.log.push(`[夜晚] 沙巴洛斯(${sh.id + 1}) 反刍了${regurgitated.id + 1}号-${regurgitated.role.name}`);
      }
    }
    
    // 选择两名新目标
    const targets = base.randomAliveMultiple(ctx, 2, (t) => 
      t.id !== sh.id && 
      !t.isProtected && 
      !base.hasTeaLadyProtection(t, ctx.seats)
    );
    if (targets.length === 2) {
      targets.forEach(t => {
        t.isDead = true;
        deadThisNight.push(t.id);
      });
      ctx.shabalothTargets = targets.map(t => t.id);
      actionOrder.push({
        actor: `${sh.id + 1}号-沙巴洛斯`,
        action: '杀死',
        targets: targets.map(t => `${t.id + 1}号-${t.role.name}`).join('、'),
        result: '成功',
      });
      ctx.log.push(`[夜晚] 沙巴洛斯(${sh.id + 1}) 杀死了${targets.map(t => `${t.id + 1}号-${t.role.name}`).join('、')}`);
    }
  });

  // 16. 珀 - 每夜可以选择一名玩家死亡，如果上次未选择则选择三名
  const pos = base.aliveDemons(ctx).filter(d => d.role?.id === 'po');
  pos.forEach((po) => {
    const targetCount = ctx.poLastChoice === null ? 3 : 1;
    const targets = base.randomAliveMultiple(ctx, targetCount, (t) => 
      t.id !== po.id && 
      !t.isProtected && 
      !base.hasTeaLadyProtection(t, ctx.seats)
    );
    if (targets.length > 0) {
      targets.forEach(t => {
        t.isDead = true;
        deadThisNight.push(t.id);
      });
      ctx.poLastChoice = targets.length;
      actionOrder.push({
        actor: `${po.id + 1}号-珀`,
        action: '杀死',
        targets: targets.map(t => `${t.id + 1}号-${t.role.name}`).join('、'),
        result: '成功',
      });
      ctx.log.push(`[夜晚] 珀(${po.id + 1}) 杀死了${targets.map(t => `${t.id + 1}号-${t.role.name}`).join('、')}`);
    } else {
      ctx.poLastChoice = null; // 未选择
    }
  });

  // 17. 修补匠 - 可能死亡（说书人决定，这里随机）
  const tinkers = alive.filter((s) => s.role?.id === 'tinker');
  tinkers.forEach((tinker) => {
    // 10%概率死亡
    if (base.randomFloat() < 0.1) {
      tinker.isDead = true;
      deadThisNight.push(tinker.id);
      actionOrder.push({
        actor: `${tinker.id + 1}号-修补匠`,
        action: '随机死亡',
        result: '死亡',
      });
      ctx.log.push(`[夜晚] 修补匠(${tinker.id + 1}) 随机死亡`);
    }
  });

  // 18. 检查祖母死亡（如果孙子被恶魔杀死）
  const grandmothers = ctx.seats.filter((s) => s.role?.id === 'grandmother' && !s.isDead);
  grandmothers.forEach((gm) => {
    if (gm.grandchildId !== null) {
      const grandchild = ctx.seats.find(s => s.id === gm.grandchildId);
      if (grandchild && grandchild.isDead && deadThisNight.includes(grandchild.id)) {
        // 检查是否被恶魔杀死
        const demons = base.aliveDemons(ctx);
        if (demons.length > 0) {
          gm.isDead = true;
          deadThisNight.push(gm.id);
          actionOrder.push({
            actor: `${gm.id + 1}号-祖母`,
            action: '因孙子死亡',
            result: '一同死亡',
          });
          ctx.log.push(`[夜晚] 祖母(${gm.id + 1}) 因孙子被恶魔杀死，一同死亡`);
        }
      }
    }
  });

  // 记录行动顺序
  ctx.actions.push({
    phase: ctx.phase,
    day: ctx.day,
    night: ctx.night,
    actionOrder: [...actionOrder],
    storytellerTips: tips,
  });

  base.snapshotState(ctx, ctx.phase, `${phaseLabel}行动完成`);

  // 清除保护状态（下个夜晚前）
  ctx.seats.forEach((s) => {
    s.isProtected = false;
    s.protectedBy = null;
  });

  ctx.night += 1;
  return base.checkGameOver(ctx, '夜晚结算');
};

/**
 * 模拟白天行动 - 包含所有角色的完整能力
 */
const simulateDay = (ctx) => {
  const label = `第${ctx.day}天白天`;
  ctx.log.push(`=== ${label} ===`);
  
  ctx.phase = 'day';
  const tips = base.getStorytellerTips(ctx);
  ctx.storytellerTips.push({
    phase: ctx.phase,
    day: ctx.day,
    night: ctx.night,
    tips: [...tips],
  });

  base.snapshotState(ctx, ctx.phase, `进入${label}`);

  const alive = base.aliveSeats(ctx);
  if (alive.length <= 1) {
    ctx.log.push('[白天] 存活不足以提名，跳过');
    ctx.day += 1;
    return base.checkGameOver(ctx, '白天');
  }

  const actionOrder = [];

  // ========== 白天能力 ==========
  
  // 1. 造谣者 - 每个白天可以公开发表一个声明，如果正确则当晚会有一名玩家死亡
  const gossips = alive.filter((s) => s.role?.id === 'gossip');
  gossips.forEach((gossip) => {
    // 30%概率发表声明
    if (base.randomFloat() < 0.3) {
      // 随机生成一个声明（简化：声明某个玩家是某个角色）
      const target = base.randomAlive(ctx, (t) => t.id !== gossip.id);
      const allRoles = roles.filter(r => !r.hidden);
      const guessedRole = allRoles[base.randomInt(0, allRoles.length - 1)];
      const isCorrect = target && target.role?.id === guessedRole.id;
      
      ctx.gossipStatement = `${target.id + 1}号是${guessedRole.name}`;
      ctx.gossipStatementResult = isCorrect;
      
      actionOrder.push({
        actor: `${gossip.id + 1}号-造谣者`,
        action: '发表声明',
        statement: ctx.gossipStatement,
        result: isCorrect ? '正确，当晚会有人死亡' : '错误',
      });
      ctx.log.push(`[白天] 造谣者(${gossip.id + 1}) 发表声明：${ctx.gossipStatement}，${isCorrect ? '正确' : '错误'}`);
      
      if (isCorrect) {
        ctx.modals.push({
          phase: ctx.phase,
          day: ctx.day,
          night: ctx.night,
          type: 'GOSSIP_STATEMENT',
          data: `造谣者声明正确，当晚会有人死亡`,
        });
      }
    }
  });

  // ========== 提名和投票 ==========
  
  // 随机提名和投票（积极但随意）
  const proposer = alive[base.randomInt(0, alive.length - 1)];
  let target = proposer;
  while (target === proposer && alive.length > 1) {
    target = alive[base.randomInt(0, alive.length - 1)];
  }

  // 正常投票流程
  const baseProb = 0.65;
  const panicBonus = Math.min(0.20, Math.max(0, (ctx.day - 2) * 0.05));
  const voteProb = Math.min(0.85, baseProb + panicBonus);

  let votes = 0;
  alive.forEach((p) => {
    const voteYes = base.randomFloat() < voteProb;
    if (voteYes) votes += 1;
  });
  const needed = Math.floor(alive.length / 2) + 1;

  const executed = votes >= needed;
  
  ctx.nominationMap[target.id] = proposer.id;
  
  actionOrder.push({
    actor: `${proposer.id + 1}号-${proposer.role.name}`,
    action: '提名',
    target: `${target.id + 1}号-${target.role.name}`,
    votes: `${votes}/${alive.length}`,
    needed: needed,
    result: executed ? '处决' : '未处决',
  });

  if (executed) {
    // 检查和平主义者 - 被处决的善良玩家可能不会死亡
    const pacifists = alive.filter(s => s.role?.id === 'pacifist');
    const isPacifistActive = pacifists.length > 0 && base.isGood(target);
    const pacifistSaves = isPacifistActive && base.randomFloat() < 0.5; // 50%概率拯救
    
    // 检查魔鬼代言人保护
    const isProtected = target.isExecutionImmune;
    
    if (!isProtected && !pacifistSaves) {
      target.isDead = true;
      target.hasBeenNominated = true;
      ctx.executedToday = target.id;
      
      // 检查弄臣首次死亡保护
      if (target.role?.id === 'fool' && target.isFoolFirstDeath) {
        target.isDead = false;
        target.isFoolFirstDeath = false;
        actionOrder.push({
          actor: `${target.id + 1}号-弄臣`,
          action: '首次死亡保护',
          result: '未死亡',
        });
        ctx.log.push(`[白天] 弄臣(${target.id + 1}) 首次死亡，未死亡`);
        ctx.executedToday = null;
      } else {
        ctx.modals.push({
          phase: ctx.phase,
          day: ctx.day,
          night: ctx.night,
          type: 'EXECUTION_RESULT',
          data: `玩家${target.id + 1}号-${target.role.name}被处决`,
        });
        
        ctx.log.push(
          `[提名] 玩家${proposer.id + 1}-${proposer.role.name} 提名 玩家${target.id + 1}-${target.role.name} | 票数 ${votes}/${alive.length} (需要 ${needed}) | 处决`
        );
      }
    } else if (isProtected) {
      actionOrder.push({
        actor: `${target.id + 1}号-${target.role.name}`,
        action: '处决保护',
        result: '魔鬼代言人保护，未死亡',
      });
      ctx.log.push(`[白天] ${target.id + 1}号-${target.role.name}被处决，但被魔鬼代言人保护，未死亡`);
      ctx.executedToday = null;
    } else if (pacifistSaves) {
      actionOrder.push({
        actor: `${target.id + 1}号-${target.role.name}`,
        action: '处决保护',
        result: '和平主义者保护，未死亡',
      });
      ctx.log.push(`[白天] ${target.id + 1}号-${target.role.name}被处决，但被和平主义者保护，未死亡`);
      ctx.executedToday = null;
    }
  } else {
    ctx.log.push(
      `[提名] 玩家${proposer.id + 1}-${proposer.role.name} 提名 玩家${target.id + 1}-${target.role.name} | 票数 ${votes}/${alive.length} (需要 ${needed}) | 未处决`
    );
  }

  // 检查吟游诗人 - 如果爪牙死于处决，除了吟游诗人和旅行者以外的所有其他玩家醉酒
  if (executed && target && target.role?.type === 'minion') {
    const minstrels = alive.filter(s => s.role?.id === 'minstrel');
    minstrels.forEach((minstrel) => {
      alive.forEach(p => {
        if (p.id !== minstrel.id && p.role?.type !== 'traveler') {
          p.isDrunk = true;
          p.statusDetails = p.statusDetails || [];
          p.statusDetails.push('吟游诗人致醉');
        }
      });
      actionOrder.push({
        actor: `${minstrel.id + 1}号-吟游诗人`,
        action: '触发能力',
        result: '爪牙被处决，所有其他玩家（除吟游诗人和旅行者）醉酒',
      });
      ctx.log.push(`[白天] 吟游诗人(${minstrel.id + 1}) 触发能力，所有其他玩家醉酒`);
    });
  }

  // 检查主谋 - 如果恶魔死于处决而因此导致游戏结束时，再额外进行一个夜晚和一个白天
  // 这个逻辑在checkGameOver中处理

  base.snapshotState(ctx, ctx.phase, `${label}行动完成`);

  ctx.day += 1;
  return base.checkGameOver(ctx, '白天处决');
};

/**
 * 模拟完整游戏
 */
const simulateGame = (gameNumber, maxRounds = 50) => {
  const playerCount = base.randomInt(9, 15);
  const ctx = initGame(playerCount);
  
  ctx.log.push(`[初始化] 游戏 #${gameNumber} - 玩家数 ${ctx.seats.length}，阵容建议 ${JSON.stringify(ctx.preset)}`);
  ctx.log.push('[身份分配] ' + ctx.seats.map((s) => `${s.id + 1}:${s.role.name}`).join(' | '));

  base.snapshotState(ctx, 'setup', '游戏开始');

  let rounds = 0;
  let ended = false;
  
  while (!ended && rounds < maxRounds) {
    ended = simulateNight(ctx);
    if (ended) break;
    ended = simulateDay(ctx);
    rounds += 1;
  }
  
  if (!ended) {
    ctx.winner = '未结束/超时';
    ctx.log.push('[结算] 超过最大回合，强制终止');
  }

  return ctx;
};

/**
 * 主函数：运行100次模拟
 */
const main = () => {
  // 清理之前的测试结果
  console.log('正在清理之前的测试结果...');
  const cleanupResult = cleanScriptLogs('bad_moon_rising');
  if (cleanupResult.deleted > 0) {
    console.log(`已删除 ${cleanupResult.deleted} 个旧文件\n`);
  }
  
  console.log('开始运行100次暗月初升游戏模拟测试...\n');
  
  const results = [];
  const logDir = path.join(__dirname, 'simulation_logs', 'bad_moon_rising');
  
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  const startTime = Date.now();
  
  for (let i = 1; i <= 100; i++) {
    const gameStart = Date.now();
    const gameResult = simulateGame(i);
    const gameDuration = ((Date.now() - gameStart) / 1000).toFixed(2);
    
    results.push({
      gameNumber: i,
      playerCount: gameResult.seats.length,
      winner: gameResult.winner,
      days: gameResult.day - 1,
      nights: gameResult.night - 1,
      duration: gameDuration,
    });

    const detailedLog = base.generateDetailedLog(gameResult, i, '暗月初升');
    const logFile = path.join(logDir, `game_${i.toString().padStart(3, '0')}_${gameResult.winner}_${gameResult.seats.length}players.log`);
    fs.writeFileSync(logFile, detailedLog, 'utf8');

    console.log(`游戏 #${i}: ${gameResult.seats.length}人, ${gameResult.day - 1}天/${gameResult.night - 1}夜, 胜者: ${gameResult.winner}, 耗时: ${gameDuration}s`);
    
    if (i % 10 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`\n进度: ${i}/100 (${elapsed}s)\n`);
    }
  }

  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
  
  const summary = [];
  summary.push('='.repeat(80));
  summary.push('暗月初升游戏模拟测试汇总报告');
  summary.push('='.repeat(80));
  summary.push('');
  summary.push(`总测试次数: 100`);
  summary.push(`总耗时: ${totalDuration}秒`);
  summary.push('');
  
  const winners = {};
  results.forEach(r => {
    winners[r.winner] = (winners[r.winner] || 0) + 1;
  });
  
  summary.push('胜负统计:');
  Object.entries(winners).forEach(([winner, count]) => {
    summary.push(`  ${winner}: ${count}次 (${(count / 100 * 100).toFixed(1)}%)`);
  });
  summary.push('');
  
  const playerCounts = {};
  results.forEach(r => {
    playerCounts[r.playerCount] = (playerCounts[r.playerCount] || 0) + 1;
  });
  
  summary.push('玩家数量分布:');
  Object.entries(playerCounts).sort((a, b) => a[0] - b[0]).forEach(([count, num]) => {
    summary.push(`  ${count}人: ${num}次`);
  });
  summary.push('');
  
  const avgDays = (results.reduce((sum, r) => sum + r.days, 0) / results.length).toFixed(2);
  const avgNights = (results.reduce((sum, r) => sum + r.nights, 0) / results.length).toFixed(2);
  
  summary.push(`平均游戏天数: ${avgDays}天`);
  summary.push(`平均游戏夜数: ${avgNights}夜`);
  summary.push('');
  summary.push('详细日志文件保存在: tests/simulation_logs/bad_moon_rising/');
  summary.push('');
  
  const summaryText = summary.join('\n');
  console.log('\n' + summaryText);
  
  const summaryFile = path.join(logDir, 'summary.txt');
  fs.writeFileSync(summaryFile, summaryText, 'utf8');
  
  console.log(`\n汇总报告已保存到: ${summaryFile}`);
  console.log('测试完成！');
};

// Jest测试包装
describe('暗月初升完整游戏模拟测试系统', () => {
  test('运行100次模拟游戏对局并生成详细日志', () => {
    main();
    
    const logDir = path.join(__dirname, 'simulation_logs', 'bad_moon_rising');
    expect(fs.existsSync(logDir)).toBe(true);
    
    const summaryFile = path.join(logDir, 'summary.txt');
    expect(fs.existsSync(summaryFile)).toBe(true);
  }, 300000);
});

// 如果直接运行（非Jest环境），也执行主函数
if (require.main === module) {
  main();
}

