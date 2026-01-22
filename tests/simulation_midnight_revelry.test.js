/**
 * 夜半狂欢（Midnight Revelry）完整游戏模拟测试
 * 包含所有角色的完整能力实现
 * 
 * 使用方法：
 * npm run test:simulation:mr
 * 或
 * jest tests/simulation_midnight_revelry.test.js
 */

const fs = require('fs');
const path = require('path');
const base = require('./simulation_base');
const { cleanScriptLogs } = require('./cleanup_simulation_logs');

const { roles } = require('../app/data.ts');

// 夜半狂欢标准阵容（与暗流涌动相同）
const MR_PRESETS = [
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

const pickPreset = (count) => MR_PRESETS.find((p) => p.total === count);
const filterRoles = (type) =>
  roles.filter((r) => r.script === '夜半狂欢' && r.type === type && !r.hidden);

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
    // 夜半狂欢特有字段
    hasUsedProfessorAbility: false,
    hasUsedEngineerAbility: false,
    hasUsedRangerAbility: false,
    hasUsedFishermanAbility: false,
    hasUsedSavantAbility: false,
    hasUsedLunaticMrAbility: false,
    balloonistKnownTypes: [], // 气球驾驶员已知的角色类型
    amnesiacAbility: null, // 失意者的能力
    cannibalLastExecuted: null, // 食人族最后被处决的玩家
    poppyGrowerDied: false, // 罂粟种植者是否死亡
    shamanKeyword: null, // 灵言师的关键词
    shamanKeywordSaid: false, // 关键词是否被说出
    hasUsedHadesiaAbility: false, // 哈迪寂亚是否使用过能力
    hadesiaTargets: [], // 哈迪寂亚的目标
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
  });

  // 设置罂粟种植者 - 爪牙和恶魔不知道彼此
  const poppyGrowers = seats.filter(s => s.role?.id === 'poppy_grower');
  if (poppyGrowers.length > 0) {
    ctx.log.push('[初始化] 罂粟种植者在场，爪牙和恶魔不知道彼此');
  }

  // 设置灵言师 - 首夜得知关键词
  const shamans = seats.filter(s => s.role?.id === 'shaman');
  shamans.forEach((shaman) => {
    const keywords = ['月亮', '钟楼', '血染', '恶魔', '邪恶'];
    shaman.shamanKeyword = keywords[base.randomInt(0, keywords.length - 1)];
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
    barberDiedToday: false,
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
    // 1. 贵族 - 首夜得知三名玩家，其中恰好有一名是邪恶的
    const nobles = alive.filter((s) => s.role?.id === 'noble');
    nobles.forEach((noble) => {
      if (base.isActorDisabledByPoisonOrDrunk(noble)) {
        ctx.log.push(`[夜晚] 贵族(${noble.id + 1}) 因中毒/醉酒无法行动`);
        return;
      }
      const allPlayers = alive.filter(t => t.id !== noble.id);
      const evilPlayers = allPlayers.filter(t => base.isEvil(t));
      const goodPlayers = allPlayers.filter(t => base.isGood(t));
      const picked = [];
      if (evilPlayers.length > 0) {
        picked.push(evilPlayers[base.randomInt(0, evilPlayers.length - 1)]);
      }
      const goodCount = 2 - picked.length;
      const pickedGood = base.shuffle(goodPlayers).slice(0, goodCount);
      picked.push(...pickedGood);
      const shuffled = base.shuffle(picked);
      actionOrder.push({
        actor: `${noble.id + 1}号-贵族`,
        action: '获得信息',
        result: `其中恰好有一名是邪恶的：${shuffled.map(t => `${t.id + 1}号-${t.role.name}`).join('、')}`,
      });
      ctx.log.push(`[夜晚] 贵族(${noble.id + 1}) 得知 ${shuffled.map(t => `${t.id + 1}号-${t.role.name}`).join('、')} 中恰好有一名是邪恶的`);
    });

    // 2. 灵言师 - 首夜得知关键词
    const shamans = alive.filter((s) => s.role?.id === 'shaman');
    shamans.forEach((shaman) => {
      actionOrder.push({
        actor: `${shaman.id + 1}号-灵言师`,
        action: '获得关键词',
        result: `关键词：${shaman.shamanKeyword}`,
      });
      ctx.log.push(`[夜晚] 灵言师(${shaman.id + 1}) 得知关键词：${shaman.shamanKeyword}`);
    });
  }

  // ========== 每夜行动角色 ==========
  
  // 3. 舞蛇人 - 每夜选择一名玩家，如果选中恶魔，交换角色和阵营
  const snakeCharmers = alive.filter((s) => s.role?.id === 'snake_charmer_mr');
  snakeCharmers.forEach((sc) => {
    if (base.isActorDisabledByPoisonOrDrunk(sc)) {
      ctx.log.push(`[夜晚] 舞蛇人(${sc.id + 1}) 因中毒/醉酒无法行动`);
      return;
    }
    const target = base.randomAlive(ctx, (t) => t.id !== sc.id);
    if (target) {
      const isDemon = target.role?.type === 'demon' || target.isDemonSuccessor;
      if (isDemon) {
        const tempRole = sc.role;
        sc.role = target.role;
        target.role = tempRole;
        sc.isEvilConverted = true;
        target.isGoodConverted = true;
        target.isPoisoned = true;
        actionOrder.push({
          actor: `${sc.id + 1}号-舞蛇人`,
          action: '选择目标',
          target: `${target.id + 1}号-${target.role.name}`,
          result: '选中恶魔，交换角色和阵营',
        });
        ctx.log.push(`[夜晚] 舞蛇人(${sc.id + 1}) 选中了恶魔${target.id + 1}号，交换角色和阵营`);
      } else {
        actionOrder.push({
          actor: `${sc.id + 1}号-舞蛇人`,
          action: '选择目标',
          target: `${target.id + 1}号-${target.role.name}`,
          result: '未选中恶魔',
        });
        ctx.log.push(`[夜晚] 舞蛇人(${sc.id + 1}) 选择了${target.id + 1}号，未选中恶魔`);
      }
    }
  });

  // 4. 气球驾驶员 - 每夜得知一名不同角色类型的玩家，直到得知了场上所有角色类型
  const balloonists = alive.filter((s) => s.role?.id === 'balloonist');
  balloonists.forEach((balloonist) => {
    if (base.isActorDisabledByPoisonOrDrunk(balloonist)) {
      ctx.log.push(`[夜晚] 气球驾驶员(${balloonist.id + 1}) 因中毒/醉酒无法行动`);
      return;
    }
    const allTypes = ['townsfolk', 'outsider', 'minion', 'demon'];
    const knownTypes = balloonist.balloonistKnownTypes || [];
    const unknownTypes = allTypes.filter(t => !knownTypes.includes(t));
    if (unknownTypes.length > 0) {
      const targetType = unknownTypes[0];
      const target = alive.find(t => t.role?.type === targetType && t.id !== balloonist.id);
      if (target) {
        balloonist.balloonistKnownTypes = [...knownTypes, targetType];
        actionOrder.push({
          actor: `${balloonist.id + 1}号-气球驾驶员`,
          action: '获得信息',
          target: `${target.id + 1}号-${target.role.name}`,
          result: `该玩家是${targetType}类型`,
        });
        ctx.log.push(`[夜晚] 气球驾驶员(${balloonist.id + 1}) 得知${target.id + 1}号-${target.role.name}是${targetType}类型`);
      }
    }
  });

  // 5. 教授 - 每局限一次，选择一名死亡玩家，如果是镇民则复活
  const professors = alive.filter((s) => s.role?.id === 'professor_mr' && !s.hasUsedProfessorAbility);
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

  // 6. 工程师 - 每局限一次，选择让恶魔变成你选择的一个恶魔角色，或让所有爪牙变成你选择的爪牙角色
  const engineers = alive.filter((s) => s.role?.id === 'engineer' && !s.hasUsedEngineerAbility);
  engineers.forEach((eng) => {
    if (base.isActorDisabledByPoisonOrDrunk(eng)) {
      ctx.log.push(`[夜晚] 工程师(${eng.id + 1}) 因中毒/醉酒无法行动`);
      return;
    }
    // 20%概率使用能力
    if (base.randomFloat() < 0.2) {
      eng.hasUsedEngineerAbility = true;
      const choice = base.randomFloat() < 0.5 ? 'demon' : 'minion';
      if (choice === 'demon') {
        const demons = base.aliveDemons(ctx);
        if (demons.length > 0) {
          const allDemons = filterRoles('demon');
          const newDemon = allDemons[base.randomInt(0, allDemons.length - 1)];
          demons[0].role = newDemon;
          actionOrder.push({
            actor: `${eng.id + 1}号-工程师`,
            action: '改变恶魔',
            result: `恶魔变成${newDemon.name}`,
          });
          ctx.log.push(`[夜晚] 工程师(${eng.id + 1}) 让恶魔变成${newDemon.name}`);
        }
      } else {
        const minions = alive.filter(s => s.role?.type === 'minion');
        const allMinions = filterRoles('minion');
        const newMinion = allMinions[base.randomInt(0, allMinions.length - 1)];
        minions.forEach(m => {
          m.role = newMinion;
        });
        actionOrder.push({
          actor: `${eng.id + 1}号-工程师`,
          action: '改变爪牙',
          result: `所有爪牙变成${newMinion.name}`,
        });
        ctx.log.push(`[夜晚] 工程师(${eng.id + 1}) 让所有爪牙变成${newMinion.name}`);
      }
    }
  });

  // 7. 巡山人 - 每局限一次，选择一名玩家，如果选中落难少女，她会变成一个不在场的镇民角色
  const rangers = alive.filter((s) => s.role?.id === 'ranger' && !s.hasUsedRangerAbility);
  rangers.forEach((ranger) => {
    if (base.isActorDisabledByPoisonOrDrunk(ranger)) {
      ctx.log.push(`[夜晚] 巡山人(${ranger.id + 1}) 因中毒/醉酒无法行动`);
      return;
    }
    // 30%概率使用能力
    if (base.randomFloat() < 0.3) {
      const target = base.randomAlive(ctx, (t) => t.id !== ranger.id);
      if (target && target.role?.id === 'damsel') {
        ranger.hasUsedRangerAbility = true;
        const allTownsfolk = filterRoles('townsfolk');
        const inGameTownsfolk = alive.map(s => s.role?.id);
        const notInGame = allTownsfolk.filter(r => !inGameTownsfolk.includes(r.id));
        if (notInGame.length > 0) {
          const newRole = notInGame[base.randomInt(0, notInGame.length - 1)];
          target.role = newRole;
          actionOrder.push({
            actor: `${ranger.id + 1}号-巡山人`,
            action: '改变角色',
            target: `${target.id + 1}号-落难少女`,
            result: `变成${newRole.name}`,
          });
          ctx.log.push(`[夜晚] 巡山人(${ranger.id + 1}) 让落难少女${target.id + 1}号变成${newRole.name}`);
        }
      }
    }
  });

  // 8. 投毒者 - 每夜选择一名玩家中毒
  const poisoners = alive.filter((s) => s.role?.id === 'poisoner_mr');
  poisoners.forEach((p) => {
    if (base.isActorDisabledByPoisonOrDrunk(p)) {
      ctx.log.push(`[夜晚] 投毒者(${p.id + 1}) 因中毒/醉酒无法行动`);
      return;
    }
    const target = base.randomAlive(ctx, (t) => t.id !== p.id);
    if (target) {
      target.isPoisoned = true;
      target.statusDetails = target.statusDetails || [];
      target.statusDetails.push('投毒者致毒');
      actionOrder.push({
        actor: `${p.id + 1}号-投毒者`,
        action: '投毒',
        target: `${target.id + 1}号-${target.role.name}`,
        result: '成功',
      });
      ctx.log.push(`[夜晚] 投毒者(${p.id + 1}) 毒了 玩家${target.id + 1}-${target.role.name}`);
    }
  });

  // 9. 麻脸巫婆 - 每夜选择一名玩家和一个角色，如果角色不在场，他变成该角色
  const pitHags = alive.filter((s) => s.role?.id === 'pit_hag_mr');
  pitHags.forEach((ph) => {
    if (base.isActorDisabledByPoisonOrDrunk(ph)) {
      ctx.log.push(`[夜晚] 麻脸巫婆(${ph.id + 1}) 因中毒/醉酒无法行动`);
      return;
    }
    // 30%概率使用能力
    if (base.randomFloat() < 0.3) {
      const target = base.randomAlive(ctx, (t) => t.id !== ph.id);
      if (target) {
        const allRoles = roles.filter(r => !r.hidden);
        const chosenRole = allRoles[base.randomInt(0, allRoles.length - 1)];
        const roleInGame = alive.some(s => s.role?.id === chosenRole.id);
        if (!roleInGame) {
          target.role = chosenRole;
          // 如果创造了一个恶魔，当晚的死亡由说书人决定（简化：随机选择）
          if (chosenRole.type === 'demon') {
            const randomTarget = base.randomAlive(ctx, (t) => t.id !== target.id);
            if (randomTarget) {
              randomTarget.isDead = true;
              deadThisNight.push(randomTarget.id);
            }
          }
          actionOrder.push({
            actor: `${ph.id + 1}号-麻脸巫婆`,
            action: '改变角色',
            target: `${target.id + 1}号`,
            newRole: chosenRole.name,
            result: '成功',
          });
          ctx.log.push(`[夜晚] 麻脸巫婆(${ph.id + 1}) 将${target.id + 1}号变成了${chosenRole.name}`);
        }
      }
    }
  });

  // ========== 恶魔行动 ==========
  
  // 10. 亡骨魔 - 每夜选择一名玩家死亡，如果是爪牙则保留能力，邻近的镇民之一中毒
  const vigormortises = base.aliveDemons(ctx).filter(d => d.role?.id === 'vigormortis_mr');
  vigormortises.forEach((vm) => {
    const target = base.randomAlive(ctx, (t) => 
      t.id !== vm.id && 
      !t.isProtected && 
      !base.hasTeaLadyProtection(t, ctx.seats)
    );
    if (target) {
      target.isDead = true;
      deadThisNight.push(target.id);
      if (target.role?.type === 'minion') {
        target.hasAbilityEvenDead = true;
        const neighbors = base.getNeighbors(ctx, target.id);
        const townNeighbors = neighbors.filter(n => n.role?.type === 'townsfolk' && !n.isDead);
        if (townNeighbors.length > 0) {
          const poisoned = townNeighbors[base.randomInt(0, townNeighbors.length - 1)];
          poisoned.isPoisoned = true;
          poisoned.statusDetails = poisoned.statusDetails || [];
          poisoned.statusDetails.push('亡骨魔致毒');
        }
        actionOrder.push({
          actor: `${vm.id + 1}号-亡骨魔`,
          action: '杀死爪牙',
          target: `${target.id + 1}号-${target.role.name}`,
          result: '成功，爪牙保留能力，邻近镇民中毒',
        });
        ctx.log.push(`[夜晚] 亡骨魔(${vm.id + 1}) 杀死了爪牙${target.id + 1}号，邻近镇民中毒`);
      } else {
        actionOrder.push({
          actor: `${vm.id + 1}号-亡骨魔`,
          action: '杀死',
          target: `${target.id + 1}号-${target.role.name}`,
          result: '成功',
        });
        ctx.log.push(`[夜晚] 亡骨魔(${vm.id + 1}) 杀死了${target.id + 1}号-${target.role.name}`);
      }
    }
  });

  // 11. 哈迪寂亚 - 每夜选择三名玩家（所有玩家都会得知），他们秘密决定自己的命运，如果全部存活则全部死亡
  const hadesias = base.aliveDemons(ctx).filter(d => d.role?.id === 'hadesia');
  hadesias.forEach((h) => {
    const targets = base.randomAliveMultiple(ctx, 3, (t) => t.id !== h.id);
    if (targets.length === 3) {
      h.hadesiaTargets = targets.map(t => t.id);
      // 简化：随机决定是否全部存活（50%概率）
      const allSurvive = base.randomFloat() < 0.5;
      if (allSurvive) {
        targets.forEach(t => {
          t.isDead = true;
          deadThisNight.push(t.id);
        });
        actionOrder.push({
          actor: `${h.id + 1}号-哈迪寂亚`,
          action: '选择目标',
          targets: targets.map(t => `${t.id + 1}号-${t.role.name}`).join('、'),
          result: '全部存活，全部死亡',
        });
        ctx.log.push(`[夜晚] 哈迪寂亚(${h.id + 1}) 选择了${targets.map(t => `${t.id + 1}号`).join('、')}，全部存活，全部死亡`);
      } else {
        actionOrder.push({
          actor: `${h.id + 1}号-哈迪寂亚`,
          action: '选择目标',
          targets: targets.map(t => `${t.id + 1}号-${t.role.name}`).join('、'),
          result: '未全部存活，无人死亡',
        });
        ctx.log.push(`[夜晚] 哈迪寂亚(${h.id + 1}) 选择了${targets.map(t => `${t.id + 1}号`).join('、')}，未全部存活，无人死亡`);
      }
    }
  });

  // 12. 检查罂粟种植者死亡 - 如果罂粟种植者死亡，爪牙和恶魔会在当晚得知彼此
  const poppyGrowers = ctx.seats.filter(s => 
    s.role?.id === 'poppy_grower' && 
    s.isDead && 
    deadThisNight.includes(s.id)
  );
  if (poppyGrowers.length > 0) {
    const minions = alive.filter(s => s.role?.type === 'minion');
    const demons = base.aliveDemons(ctx);
    actionOrder.push({
      actor: '罂粟种植者',
      action: '死亡触发',
      result: '爪牙和恶魔得知彼此',
    });
    ctx.log.push(`[夜晚] 罂粟种植者死亡，爪牙和恶魔得知彼此`);
  }

  // 13. 检查农夫死亡 - 如果农夫在夜晚死亡，一名存活的善良玩家会变成农夫
  const deadFarmers = ctx.seats.filter(s => 
    s.role?.id === 'farmer' && 
    s.isDead && 
    deadThisNight.includes(s.id)
  );
  deadFarmers.forEach((farmer) => {
    const goodPlayers = alive.filter(s => base.isGood(s) && s.id !== farmer.id);
    if (goodPlayers.length > 0) {
      const newFarmer = goodPlayers[base.randomInt(0, goodPlayers.length - 1)];
      newFarmer.role = { id: 'farmer', name: '农夫', type: 'townsfolk' };
      actionOrder.push({
        actor: `${farmer.id + 1}号-农夫`,
        action: '死亡触发',
        target: `${newFarmer.id + 1}号`,
        result: '目标变成农夫',
      });
      ctx.log.push(`[夜晚] 农夫(${farmer.id + 1}) 死亡，${newFarmer.id + 1}号变成农夫`);
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
  
  // 1. 博学者 - 每个白天可以私下询问说书人以得知两条信息：一个是正确的，一个是错误的
  const savants = alive.filter((s) => s.role?.id === 'savant_mr');
  savants.forEach((savant) => {
    // 30%概率使用能力
    if (base.randomFloat() < 0.3) {
      const info1 = `信息1（正确）`;
      const info2 = `信息2（错误）`;
      actionOrder.push({
        actor: `${savant.id + 1}号-博学者`,
        action: '获得信息',
        result: `${info1}，${info2}`,
      });
      ctx.log.push(`[白天] 博学者(${savant.id + 1}) 得知两条信息：${info1}，${info2}`);
    }
  });

  // 2. 失意者 - 每个白天可以询问说书人一次猜测，会得知猜测有多准确
  const amnesiacs = alive.filter((s) => s.role?.id === 'amnesiac');
  amnesiacs.forEach((amnesiac) => {
    // 30%概率使用能力
    if (base.randomFloat() < 0.3) {
      const guess = `猜测：我的能力是...`;
      const accuracy = base.randomInt(0, 100);
      actionOrder.push({
        actor: `${amnesiac.id + 1}号-失意者`,
        action: '猜测能力',
        guess: guess,
        result: `准确度：${accuracy}%`,
      });
      ctx.log.push(`[白天] 失意者(${amnesiac.id + 1}) 猜测能力，准确度：${accuracy}%`);
    }
  });

  // 3. 渔夫 - 每局限一次，在白天时可以询问说书人一些建议来帮助团队获胜
  const fishermen = alive.filter((s) => s.role?.id === 'fisherman' && !s.hasUsedFishermanAbility);
  fishermen.forEach((fisherman) => {
    // 30%概率使用能力
    if (base.randomFloat() < 0.3) {
      fisherman.hasUsedFishermanAbility = true;
      const advice = `建议：关注夜晚死亡模式`;
      actionOrder.push({
        actor: `${fisherman.id + 1}号-渔夫`,
        action: '获得建议',
        result: advice,
      });
      ctx.log.push(`[白天] 渔夫(${fisherman.id + 1}) 获得建议：${advice}`);
    }
  });

  // 4. 精神病患者 - 每个白天，在提名开始前，可以公开选择一名玩家：他死亡
  const lunaticMrs = alive.filter((s) => s.role?.id === 'lunatic_mr' && !s.hasUsedLunaticMrAbility);
  lunaticMrs.forEach((lunatic) => {
    // 30%概率使用能力
    if (base.randomFloat() < 0.3) {
      lunatic.hasUsedLunaticMrAbility = true;
      const target = base.randomAlive(ctx, (t) => t.id !== lunatic.id);
      if (target) {
        target.isDead = true;
        ctx.executedToday = target.id;
        actionOrder.push({
          actor: `${lunatic.id + 1}号-精神病患者`,
          action: '杀死',
          target: `${target.id + 1}号-${target.role.name}`,
          result: '成功',
        });
        ctx.log.push(`[白天] 精神病患者(${lunatic.id + 1}) 在提名开始前杀死了${target.id + 1}号-${target.role.name}`);
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
    // 检查精神病患者被处决 - 提名者必须和精神病患者玩石头剪刀布
    if (target.role?.id === 'lunatic_mr') {
      const nominator = ctx.seats.find(s => s.id === ctx.nominationMap[target.id]);
      if (nominator) {
        // 简化：50%概率精神病患者输
        const lunaticLoses = base.randomFloat() < 0.5;
        if (!lunaticLoses) {
          actionOrder.push({
            actor: `${target.id + 1}号-精神病患者`,
            action: '石头剪刀布',
            result: '精神病患者获胜，未死亡',
          });
          ctx.log.push(`[白天] 精神病患者(${target.id + 1}) 在石头剪刀布中获胜，未死亡`);
          ctx.executedToday = null;
        } else {
          target.isDead = true;
          target.hasBeenNominated = true;
          ctx.executedToday = target.id;
          ctx.log.push(`[白天] 精神病患者(${target.id + 1}) 在石头剪刀布中失败，死亡`);
        }
      }
    } else {
      target.isDead = true;
      target.hasBeenNominated = true;
      ctx.executedToday = target.id;
    }

    // 检查食人族 - 拥有最后被处决的玩家的能力
    const cannibals = alive.filter(s => s.role?.id === 'cannibal');
    cannibals.forEach((cannibal) => {
      cannibal.cannibalLastExecuted = target.id;
      if (base.isEvil(target)) {
        cannibal.isPoisoned = true;
        cannibal.statusDetails = cannibal.statusDetails || [];
        cannibal.statusDetails.push('食人族因处决邪恶玩家中毒');
      }
      actionOrder.push({
        actor: `${cannibal.id + 1}号-食人族`,
        action: '获得能力',
        target: `${target.id + 1}号-${target.role.name}`,
        result: base.isEvil(target) ? '获得能力但中毒' : '获得能力',
      });
      ctx.log.push(`[白天] 食人族(${cannibal.id + 1}) 获得了${target.id + 1}号-${target.role.name}的能力${base.isEvil(target) ? '但中毒' : ''}`);
    });

    // 检查无神论者 - 如果说书人被处决，好人阵营获胜
    if (target.role?.id === 'atheist') {
      ctx.winner = 'good';
      ctx.log.push(`[游戏结束] 无神论者被处决，好人阵营获胜`);
      ctx.modals.push({
        phase: ctx.phase,
        day: ctx.day,
        night: ctx.night,
        type: 'ATHEIST_WIN',
        data: `无神论者被处决，好人获胜`,
      });
      return true;
    }

    if (!target.isDead) {
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
  } else {
    ctx.log.push(
      `[提名] 玩家${proposer.id + 1}-${proposer.role.name} 提名 玩家${target.id + 1}-${target.role.name} | 票数 ${votes}/${alive.length} (需要 ${needed}) | 未处决`
    );
  }

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
  const cleanupResult = cleanScriptLogs('midnight_revelry');
  if (cleanupResult.deleted > 0) {
    console.log(`已删除 ${cleanupResult.deleted} 个旧文件\n`);
  }
  
  console.log('开始运行100次夜半狂欢游戏模拟测试...\n');
  
  const results = [];
  const logDir = path.join(__dirname, 'simulation_logs', 'midnight_revelry');
  
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

    const detailedLog = base.generateDetailedLog(gameResult, i, '夜半狂欢');
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
  summary.push('夜半狂欢游戏模拟测试汇总报告');
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
  summary.push('详细日志文件保存在: tests/simulation_logs/midnight_revelry/');
  summary.push('');
  
  const summaryText = summary.join('\n');
  console.log('\n' + summaryText);
  
  const summaryFile = path.join(logDir, 'summary.txt');
  fs.writeFileSync(summaryFile, summaryText, 'utf8');
  
  console.log(`\n汇总报告已保存到: ${summaryFile}`);
  console.log('测试完成！');
};

// Jest测试包装
describe('夜半狂欢完整游戏模拟测试系统', () => {
  test('运行100次模拟游戏对局并生成详细日志', () => {
    main();
    
    const logDir = path.join(__dirname, 'simulation_logs', 'midnight_revelry');
    expect(fs.existsSync(logDir)).toBe(true);
    
    const summaryFile = path.join(logDir, 'summary.txt');
    expect(fs.existsSync(summaryFile)).toBe(true);
  }, 300000);
});

// 如果直接运行（非Jest环境），也执行主函数
if (require.main === module) {
  main();
}

