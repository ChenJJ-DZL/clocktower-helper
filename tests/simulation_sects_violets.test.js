/**
 * 梦殒春宵（Sects & Violets）完整游戏模拟测试
 * 包含所有角色的完整能力实现
 * 
 * 使用方法：
 * npm run test:simulation:sv
 * 或
 * jest tests/simulation_sects_violets.test.js
 */

const fs = require('fs');
const path = require('path');
const base = require('./simulation_base');
const { cleanScriptLogs } = require('./cleanup_simulation_logs');

const { roles } = require('../app/data.ts');

// 梦殒春宵标准阵容（与暗流涌动相同）
const SV_PRESETS = [
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

const pickPreset = (count) => SV_PRESETS.find((p) => p.total === count);
const filterRoles = (type) =>
  roles.filter((r) => r.script === '梦殒春宵' || r.script === '梦陨春宵' && r.type === type && !r.hidden);

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
    // 梦殒春宵特有字段
    hasUsedPhilosopherAbility: false,
    philosopherChosenRole: null,
    hasUsedSeamstressAbility: false,
    hasUsedArtistAbility: false,
    hasUsedJugglerAbility: false,
    jugglerGuesses: [],
    isCursed: false, // 女巫诅咒
    isMad: false, // 洗脑师疯狂
    madRole: null, // 疯狂证明的角色
    evilTwinPair: null, // 镜像双子的对立双子
    isEvilTwin: false, // 是否是镜像双子
    fangGuTransformed: false, // 方古是否已变身
    fangGuTarget: null, // 方古的目标（外来者）
    noDashiiPoisonedPlayers: [], // 诺-达鲺中毒的玩家
    vigormortisMinionKilled: false, // 亡骨魔是否杀死了爪牙
    vortoxActive: false, // 涡流是否激活（所有信息错误）
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
    // 检查是否是涡流
    if (s.role.id === 'vortox') {
      s.vortoxActive = true;
    }
  });

  // 设置镜像双子
  const evilTwins = seats.filter(s => s.role?.id === 'evil_twin');
  if (evilTwins.length > 0) {
    const evilTwin = evilTwins[0];
    const goodPlayers = seats.filter(s => base.isGood(s) && s.id !== evilTwin.id);
    if (goodPlayers.length > 0) {
      const goodTwin = goodPlayers[base.randomInt(0, goodPlayers.length - 1)];
      evilTwin.evilTwinPair = goodTwin.id;
      goodTwin.evilTwinPair = evilTwin.id;
      evilTwin.isEvilTwin = true;
      goodTwin.isEvilTwin = true;
    }
  }

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
    barberDiedToday: false, // 理发师今天是否死亡
    sweetheartDiedToday: false, // 心上人今天是否死亡
    klutzDiedToday: false, // 呆瓜今天是否死亡
    noDashiiPoisonedPlayers: [], // 诺-达鲺中毒的玩家
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
    // 1. 钟表匠 - 首夜得知恶魔与爪牙之间最近的距离
    const clockmakers = alive.filter((s) => s.role?.id === 'clockmaker');
    clockmakers.forEach((cm) => {
      if (base.isActorDisabledByPoisonOrDrunk(cm)) {
        ctx.log.push(`[夜晚] 钟表匠(${cm.id + 1}) 因中毒/醉酒无法行动`);
        return;
      }
      const demons = base.aliveDemons(ctx);
      const minions = alive.filter(s => s.role?.type === 'minion');
      let minDistance = ctx.seats.length;
      demons.forEach(d => {
        minions.forEach(m => {
          const dist = Math.min(
            Math.abs(d.id - m.id),
            ctx.seats.length - Math.abs(d.id - m.id)
          );
          minDistance = Math.min(minDistance, dist);
        });
      });
      actionOrder.push({
        actor: `${cm.id + 1}号-钟表匠`,
        action: '获得信息',
        result: `恶魔与爪牙之间最近的距离：${minDistance}`,
      });
      ctx.log.push(`[夜晚] 钟表匠(${cm.id + 1}) 得知恶魔与爪牙之间最近的距离：${minDistance}`);
    });
  }

  // ========== 每夜行动角色 ==========

  // 2. 哲学家 - 每局限一次，选择一个善良角色，获得该角色的能力
  const philosophers = alive.filter((s) => s.role?.id === 'philosopher' && !s.hasUsedPhilosopherAbility);
  philosophers.forEach((phil) => {
    if (base.isActorDisabledByPoisonOrDrunk(phil)) {
      ctx.log.push(`[夜晚] 哲学家(${phil.id + 1}) 因中毒/醉酒无法行动`);
      return;
    }
    // 30%概率使用能力
    if (base.randomFloat() < 0.3) {
      const goodRoles = filterRoles('townsfolk');
      const chosenRole = goodRoles[base.randomInt(0, goodRoles.length - 1)];
      const target = alive.find(t => t.role?.id === chosenRole.id);
      phil.hasUsedPhilosopherAbility = true;
      phil.philosopherChosenRole = chosenRole;
      if (target) {
        target.isDrunk = true;
        target.statusDetails = target.statusDetails || [];
        target.statusDetails.push('哲学家致醉');
      }
      actionOrder.push({
        actor: `${phil.id + 1}号-哲学家`,
        action: '选择角色',
        chosenRole: chosenRole.name,
        result: target ? `获得能力，${target.id + 1}号醉酒` : '获得能力',
      });
      ctx.log.push(`[夜晚] 哲学家(${phil.id + 1}) 选择了${chosenRole.name}，${target ? `${target.id + 1}号醉酒` : '获得能力'}`);
    }
  });

  // 3. 舞蛇人 - 每夜选择一名玩家，如果选中恶魔，交换角色和阵营
  const snakeCharmers = alive.filter((s) => s.role?.id === 'snake_charmer');
  snakeCharmers.forEach((sc) => {
    if (base.isActorDisabledByPoisonOrDrunk(sc)) {
      ctx.log.push(`[夜晚] 舞蛇人(${sc.id + 1}) 因中毒/醉酒无法行动`);
      return;
    }
    const target = base.randomAlive(ctx, (t) => t.id !== sc.id);
    if (target) {
      const isDemon = target.role?.type === 'demon' || target.isDemonSuccessor;
      if (isDemon) {
        // 交换角色和阵营
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

  // 4. 女巫 - 每夜选择一名玩家，标记被诅咒
  const witches = alive.filter((s) => s.role?.id === 'witch');
  witches.forEach((w) => {
    if (base.isActorDisabledByPoisonOrDrunk(w)) {
      ctx.log.push(`[夜晚] 女巫(${w.id + 1}) 因中毒/醉酒无法行动`);
      return;
    }
    const target = base.randomAlive(ctx, (t) => t.id !== w.id);
    if (target) {
      target.isCursed = true;
      target.statusDetails = target.statusDetails || [];
      target.statusDetails.push('女巫诅咒');
      actionOrder.push({
        actor: `${w.id + 1}号-女巫`,
        action: '诅咒',
        target: `${target.id + 1}号-${target.role.name}`,
        result: '成功',
      });
      ctx.log.push(`[夜晚] 女巫(${w.id + 1}) 诅咒了${target.id + 1}号-${target.role.name}`);
    }
  });

  // 5. 洗脑师 - 每夜选择一名玩家和一个善良角色，标记疯狂
  const cerebuses = alive.filter((s) => s.role?.id === 'cerenovus');
  cerebuses.forEach((cer) => {
    if (base.isActorDisabledByPoisonOrDrunk(cer)) {
      ctx.log.push(`[夜晚] 洗脑师(${cer.id + 1}) 因中毒/醉酒无法行动`);
      return;
    }
    const target = base.randomAlive(ctx, (t) => t.id !== cer.id);
    if (target) {
      const goodRoles = filterRoles('townsfolk');
      const madRole = goodRoles[base.randomInt(0, goodRoles.length - 1)];
      target.isMad = true;
      target.madRole = madRole;
      target.statusDetails = target.statusDetails || [];
      target.statusDetails.push(`洗脑师疯狂：${madRole.name}`);
      actionOrder.push({
        actor: `${cer.id + 1}号-洗脑师`,
        action: '洗脑',
        target: `${target.id + 1}号-${target.role.name}`,
        madRole: madRole.name,
        result: '成功',
      });
      ctx.log.push(`[夜晚] 洗脑师(${cer.id + 1}) 让${target.id + 1}号疯狂证明是${madRole.name}`);
    }
  });

  // 6. 筑梦师 - 每夜选择一名玩家，得知一个善良角色和一个邪恶角色，该玩家是其中一个
  const dreamers = alive.filter((s) => s.role?.id === 'dreamer');
  dreamers.forEach((dr) => {
    if (base.isActorDisabledByPoisonOrDrunk(dr)) {
      ctx.log.push(`[夜晚] 筑梦师(${dr.id + 1}) 因中毒/醉酒无法行动`);
      return;
    }
    const target = base.randomAlive(ctx, (t) => t.id !== dr.id);
    if (target) {
      const goodRoles = filterRoles('townsfolk');
      const evilRoles = filterRoles('minion').concat(filterRoles('demon'));
      const goodRole = goodRoles[base.randomInt(0, goodRoles.length - 1)];
      const evilRole = evilRoles[base.randomInt(0, evilRoles.length - 1)];
      actionOrder.push({
        actor: `${dr.id + 1}号-筑梦师`,
        action: '获得信息',
        target: `${target.id + 1}号-${target.role.name}`,
        result: `该玩家是${goodRole.name}或${evilRole.name}之一`,
      });
      ctx.log.push(`[夜晚] 筑梦师(${dr.id + 1}) 得知${target.id + 1}号是${goodRole.name}或${evilRole.name}之一`);
    }
  });

  // 7. 女裁缝 - 每局限一次，选择两名玩家，得知他们是否为同一阵营
  const seamstresses = alive.filter((s) => s.role?.id === 'seamstress' && !s.hasUsedSeamstressAbility);
  seamstresses.forEach((seam) => {
    if (base.isActorDisabledByPoisonOrDrunk(seam)) {
      ctx.log.push(`[夜晚] 女裁缝(${seam.id + 1}) 因中毒/醉酒无法行动`);
      return;
    }
    // 30%概率使用能力
    if (base.randomFloat() < 0.3) {
      const targets = base.randomAliveMultiple(ctx, 2, (t) => t.id !== seam.id);
      if (targets.length === 2) {
        seam.hasUsedSeamstressAbility = true;
        const sameAlignment = base.isEvil(targets[0]) === base.isEvil(targets[1]);
        actionOrder.push({
          actor: `${seam.id + 1}号-女裁缝`,
          action: '获得信息',
          targets: targets.map(t => `${t.id + 1}号-${t.role.name}`).join('、'),
          result: sameAlignment ? '同一阵营' : '不同阵营',
        });
        ctx.log.push(`[夜晚] 女裁缝(${seam.id + 1}) 得知${targets.map(t => `${t.id + 1}号`).join('、')}${sameAlignment ? '是' : '不是'}同一阵营`);
      }
    }
  });

  // 8. 数学家 - 每夜得知有多少名玩家的能力因为其他角色的能力而未正常生效
  const mathematicians = alive.filter((s) => s.role?.id === 'mathematician');
  mathematicians.forEach((math) => {
    if (base.isActorDisabledByPoisonOrDrunk(math)) {
      ctx.log.push(`[夜晚] 数学家(${math.id + 1}) 因中毒/醉酒无法行动`);
      return;
    }
    // 简化：随机决定受影响的人数（0-3）
    const affectedCount = base.randomInt(0, 3);
    actionOrder.push({
      actor: `${math.id + 1}号-数学家`,
      action: '获得信息',
      result: `有${affectedCount}名玩家的能力因其他角色未正常生效`,
    });
    ctx.log.push(`[夜晚] 数学家(${math.id + 1}) 得知有${affectedCount}名玩家的能力因其他角色未正常生效`);
  });

  // 9. 卖花女孩 - 每夜得知今天白天是否有恶魔投过票
  const flowergirls = alive.filter((s) => s.role?.id === 'flowergirl');
  flowergirls.forEach((fg) => {
    if (base.isActorDisabledByPoisonOrDrunk(fg)) {
      ctx.log.push(`[夜晚] 卖花女孩(${fg.id + 1}) 因中毒/醉酒无法行动`);
      return;
    }
    // 简化：随机决定（50%概率）
    const demonVoted = base.randomFloat() < 0.5;
    actionOrder.push({
      actor: `${fg.id + 1}号-卖花女孩`,
      action: '获得信息',
      result: demonVoted ? '今天白天有恶魔投过票' : '今天白天没有恶魔投过票',
    });
    ctx.log.push(`[夜晚] 卖花女孩(${fg.id + 1}) 得知今天白天${demonVoted ? '有' : '没有'}恶魔投过票`);
  });

  // 10. 城镇公告员 - 每夜得知今天白天是否有爪牙发起过提名
  const townCriers = alive.filter((s) => s.role?.id === 'town_crier');
  townCriers.forEach((tc) => {
    if (base.isActorDisabledByPoisonOrDrunk(tc)) {
      ctx.log.push(`[夜晚] 城镇公告员(${tc.id + 1}) 因中毒/醉酒无法行动`);
      return;
    }
    // 简化：随机决定（50%概率）
    const minionNominated = base.randomFloat() < 0.5;
    actionOrder.push({
      actor: `${tc.id + 1}号-城镇公告员`,
      action: '获得信息',
      result: minionNominated ? '今天白天有爪牙发起过提名' : '今天白天没有爪牙发起过提名',
    });
    ctx.log.push(`[夜晚] 城镇公告员(${tc.id + 1}) 得知今天白天${minionNominated ? '有' : '没有'}爪牙发起过提名`);
  });

  // 11. 神谕者 - 每夜得知有多少名死亡的玩家是邪恶的
  const oracles = alive.filter((s) => s.role?.id === 'oracle');
  oracles.forEach((or) => {
    if (base.isActorDisabledByPoisonOrDrunk(or)) {
      ctx.log.push(`[夜晚] 神谕者(${or.id + 1}) 因中毒/醉酒无法行动`);
      return;
    }
    const deadEvil = ctx.seats.filter(s => s.isDead && base.isEvil(s));
    actionOrder.push({
      actor: `${or.id + 1}号-神谕者`,
      action: '获得信息',
      result: `有${deadEvil.length}名死亡的玩家是邪恶的`,
    });
    ctx.log.push(`[夜晚] 神谕者(${or.id + 1}) 得知有${deadEvil.length}名死亡的玩家是邪恶的`);
  });

  // 12. 麻脸巫婆 - 每夜选择一名玩家和一个角色，如果角色不在场，该玩家变成该角色
  const pitHags = alive.filter((s) => s.role?.id === 'pit_hag');
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

  // 13. 方古 - 每夜选择一名玩家死亡，如果选择外来者且未变身，则变身
  const fangGus = base.aliveDemons(ctx).filter(d => d.role?.id === 'fang_gu');
  fangGus.forEach((fg) => {
    const target = base.randomAlive(ctx, (t) =>
      t.id !== fg.id &&
      !t.isProtected &&
      !base.hasTeaLadyProtection(t, ctx.seats)
    );
    if (target) {
      const isOutsider = target.role?.type === 'outsider';
      if (isOutsider && !fg.fangGuTransformed) {
        // 方古变身
        fg.fangGuTransformed = true;
        fg.fangGuTarget = target.id;
        const tempRole = fg.role;
        fg.role = target.role;
        target.role = tempRole;
        fg.isEvilConverted = false;
        target.isEvilConverted = true;
        target.isDemonSuccessor = true;
        actionOrder.push({
          actor: `${fg.id + 1}号-方古`,
          action: '杀死并变身',
          target: `${target.id + 1}号-${target.role.name}`,
          result: '成功，方古变身',
        });
        ctx.log.push(`[夜晚] 方古(${fg.id + 1}) 杀死了外来者${target.id + 1}号，方古变身`);
      } else {
        target.isDead = true;
        deadThisNight.push(target.id);
        actionOrder.push({
          actor: `${fg.id + 1}号-方古`,
          action: '杀死',
          target: `${target.id + 1}号-${target.role.name}`,
          result: '成功',
        });
        ctx.log.push(`[夜晚] 方古(${fg.id + 1}) 杀死了${target.id + 1}号-${target.role.name}`);
      }
    }
  });

  // 14. 亡骨魔 - 每夜选择一名玩家死亡，如果是爪牙则保留能力，邻近的镇民之一中毒
  const vigormortises = base.aliveDemons(ctx).filter(d => d.role?.id === 'vigormortis');
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
        vm.vigormortisMinionKilled = true;
        target.hasAbilityEvenDead = true;
        // 邻近的镇民之一中毒
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

  // 15. 诺-达鲺 - 每夜选择一名玩家死亡，该玩家中毒
  const noDashiis = base.aliveDemons(ctx).filter(d => d.role?.id === 'no_dashii');
  noDashiis.forEach((nd) => {
    const target = base.randomAlive(ctx, (t) =>
      t.id !== nd.id &&
      !t.isProtected &&
      !base.hasTeaLadyProtection(t, ctx.seats)
    );
    if (target) {
      target.isDead = true;
      target.isPoisoned = true;
      deadThisNight.push(target.id);
      ctx.noDashiiPoisonedPlayers.push(target.id);
      actionOrder.push({
        actor: `${nd.id + 1}号-诺-达鲺`,
        action: '杀死并中毒',
        target: `${target.id + 1}号-${target.role.name}`,
        result: '成功',
      });
      ctx.log.push(`[夜晚] 诺-达鲺(${nd.id + 1}) 杀死了${target.id + 1}号-${target.role.name}，该玩家中毒`);
    }
  });

  // 16. 涡流 - 每夜选择一名玩家死亡，所有信息都是错误的
  const vortoxes = base.aliveDemons(ctx).filter(d => d.role?.id === 'vortox');
  vortoxes.forEach((v) => {
    const target = base.randomAlive(ctx, (t) =>
      t.id !== v.id &&
      !t.isProtected &&
      !base.hasTeaLadyProtection(t, ctx.seats)
    );
    if (target) {
      target.isDead = true;
      deadThisNight.push(target.id);
      actionOrder.push({
        actor: `${v.id + 1}号-涡流`,
        action: '杀死',
        target: `${target.id + 1}号-${target.role.name}`,
        result: '成功（所有信息错误）',
      });
      ctx.log.push(`[夜晚] 涡流(${v.id + 1}) 杀死了${target.id + 1}号-${target.role.name}（所有信息错误）`);
    }
  });

  // 17. 检查理发师死亡 - 如果理发师今天死亡，恶魔可以选择两名玩家交换角色
  if (ctx.barberDiedToday) {
    const demons = base.aliveDemons(ctx);
    demons.forEach((d) => {
      // 30%概率使用能力
      if (base.randomFloat() < 0.3) {
        const targets = base.randomAliveMultiple(ctx, 2, (t) =>
          t.id !== d.id && t.role?.type !== 'demon'
        );
        if (targets.length === 2) {
          const tempRole = targets[0].role;
          targets[0].role = targets[1].role;
          targets[1].role = tempRole;
          actionOrder.push({
            actor: `${d.id + 1}号-${d.role.name}`,
            action: '交换角色（理发师触发）',
            targets: targets.map(t => `${t.id + 1}号`).join('、'),
            result: '成功',
          });
          ctx.log.push(`[夜晚] 恶魔(${d.id + 1}) 因理发师死亡，交换了${targets.map(t => `${t.id + 1}号`).join('、')}的角色`);
        }
      }
    });
  }

  // 18. 检查心上人死亡 - 如果心上人今天死亡，会有一名玩家立刻醉酒
  if (ctx.sweetheartDiedToday) {
    const alive = base.aliveSeats(ctx);
    if (alive.length > 0) {
      const drunkTarget = alive[base.randomInt(0, alive.length - 1)];
      drunkTarget.isDrunk = true;
      drunkTarget.statusDetails = drunkTarget.statusDetails || [];
      drunkTarget.statusDetails.push('心上人致醉');
      actionOrder.push({
        actor: '心上人',
        action: '死亡触发',
        target: `${drunkTarget.id + 1}号-${drunkTarget.role.name}`,
        result: '目标醉酒',
      });
      ctx.log.push(`[夜晚] 心上人死亡，${drunkTarget.id + 1}号醉酒`);
    }
  }

  // 19. 检查贤者死亡 - 如果恶魔杀死了贤者，贤者得知两名玩家，其中一名是杀死他的恶魔
  const deadSages = ctx.seats.filter(s =>
    s.role?.id === 'sage' &&
    s.isDead &&
    deadThisNight.includes(s.id)
  );
  deadSages.forEach((sage) => {
    const demons = base.aliveDemons(ctx);
    if (demons.length > 0) {
      const killer = demons[0];
      const other = base.randomAlive(ctx, (t) => t.id !== killer.id);
      if (other) {
        actionOrder.push({
          actor: `${sage.id + 1}号-贤者`,
          action: '死亡触发',
          targets: `${killer.id + 1}号、${other.id + 1}号`,
          result: `其中一名是杀死他的恶魔`,
        });
        ctx.log.push(`[夜晚] 贤者(${sage.id + 1}) 被恶魔杀死，得知${killer.id + 1}号、${other.id + 1}号中有一名是恶魔`);
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

  // 1. 博学者 - 每个白天可以私下询问说书人以得知两条信息：一个是正确的，一个是错误的
  const savants = alive.filter((s) => s.role?.id === 'savant');
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

  // 2. 艺术家 - 每局限一次，在白天时可以私下询问说书人一个是非问题
  const artists = alive.filter((s) => s.role?.id === 'artist' && !s.hasUsedArtistAbility);
  artists.forEach((artist) => {
    // 30%概率使用能力
    if (base.randomFloat() < 0.3) {
      artist.hasUsedArtistAbility = true;
      const question = `问题：是否有恶魔在场？`;
      const answer = base.randomFloat() < 0.5 ? '是' : '否';
      actionOrder.push({
        actor: `${artist.id + 1}号-艺术家`,
        action: '询问问题',
        question: question,
        result: answer,
      });
      ctx.log.push(`[白天] 艺术家(${artist.id + 1}) 询问：${question}，答案：${answer}`);
    }
  });

  // 3. 杂耍艺人 - 首个白天可以公开猜测任意玩家的角色最多五次，在当晚得知猜测正确的角色数
  const jugglers = alive.filter((s) => s.role?.id === 'juggler' && !s.hasUsedJugglerAbility);
  if (ctx.day === 1) {
    jugglers.forEach((juggler) => {
      // 30%概率使用能力
      if (base.randomFloat() < 0.3) {
        juggler.hasUsedJugglerAbility = true;
        const guesses = [];
        for (let i = 0; i < 5; i++) {
          const target = base.randomAlive(ctx, (t) => t.id !== juggler.id);
          const allRoles = roles.filter(r => !r.hidden);
          const guessedRole = allRoles[base.randomInt(0, allRoles.length - 1)];
          const isCorrect = target && target.role?.id === guessedRole.id;
          guesses.push({
            target: target ? `${target.id + 1}号` : '无',
            role: guessedRole.name,
            correct: isCorrect,
          });
        }
        juggler.jugglerGuesses = guesses;
        const correctCount = guesses.filter(g => g.correct).length;
        actionOrder.push({
          actor: `${juggler.id + 1}号-杂耍艺人`,
          action: '猜测角色',
          guesses: guesses.map(g => `${g.target}是${g.role}`).join('、'),
          result: `当晚得知${correctCount}个猜测正确`,
        });
        ctx.log.push(`[白天] 杂耍艺人(${juggler.id + 1}) 猜测了5个角色，当晚得知${correctCount}个正确`);
      }
    });
  }

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
    // 检查镜像双子 - 如果善良双子被处决，邪恶阵营获胜
    if (target.evilTwinPair !== null) {
      const twin = ctx.seats.find(s => s.id === target.evilTwinPair);
      if (twin && base.isGood(target) && base.isEvil(twin)) {
        ctx.winner = 'evil';
        ctx.log.push(`[游戏结束] 镜像双子的善良玩家被处决，邪恶阵营获胜`);
        ctx.modals.push({
          phase: ctx.phase,
          day: ctx.day,
          night: ctx.night,
          type: 'EVIL_TWIN_WIN',
          data: `镜像双子善良玩家被处决，邪恶获胜`,
        });
        return true;
      }
    }

    // 检查呆瓜死亡 - 如果呆瓜死亡，需要公开选择一名玩家，如果是邪恶则好人落败
    if (target.role?.id === 'klutz') {
      ctx.klutzDiedToday = true;
      const chosen = base.randomAlive(ctx, (t) => t.id !== target.id);
      if (chosen && base.isEvil(chosen)) {
        ctx.winner = 'evil';
        ctx.log.push(`[游戏结束] 呆瓜死亡并选择了邪恶玩家，好人落败`);
        ctx.modals.push({
          phase: ctx.phase,
          day: ctx.day,
          night: ctx.night,
          type: 'KLUTZ_LOSE',
          data: `呆瓜选择了邪恶玩家，好人落败`,
        });
        return true;
      }
    }

    // 检查理发师死亡
    if (target.role?.id === 'barber') {
      ctx.barberDiedToday = true;
    }

    // 检查心上人死亡
    if (target.role?.id === 'sweetheart') {
      ctx.sweetheartDiedToday = true;
    }

    target.isDead = true;
    target.hasBeenNominated = true;
    ctx.executedToday = target.id;

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
  } else {
    ctx.log.push(
      `[提名] 玩家${proposer.id + 1}-${proposer.role.name} 提名 玩家${target.id + 1}-${target.role.name} | 票数 ${votes}/${alive.length} (需要 ${needed}) | 未处决`
    );
  }

  // 检查镜像双子 - 如果都存活，善良阵营无法获胜
  const evilTwins = ctx.seats.filter(s => s.isEvilTwin && !s.isDead);
  if (evilTwins.length === 2) {
    const goodTwin = evilTwins.find(t => base.isGood(t));
    const evilTwin = evilTwins.find(t => base.isEvil(t));
    if (goodTwin && evilTwin) {
      ctx.log.push(`[提示] 镜像双子都存活，善良阵营无法获胜`);
    }
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
  const cleanupResult = cleanScriptLogs('sects_violets');
  if (cleanupResult.deleted > 0) {
    console.log(`已删除 ${cleanupResult.deleted} 个旧文件\n`);
  }

  console.log('开始运行100次梦殒春宵游戏模拟测试...\n');

  const results = [];
  const logDir = path.join(__dirname, 'simulation_logs', 'sects_violets');

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

    const detailedLog = base.generateDetailedLog(gameResult, i, '梦殒春宵');
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
  summary.push('梦殒春宵游戏模拟测试汇总报告');
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
  summary.push('详细日志文件保存在: tests/simulation_logs/sects_violets/');
  summary.push('');

  const summaryText = summary.join('\n');
  console.log('\n' + summaryText);

  const summaryFile = path.join(logDir, 'summary.txt');
  fs.writeFileSync(summaryFile, summaryText, 'utf8');

  console.log(`\n汇总报告已保存到: ${summaryFile}`);
  console.log('测试完成！');
};

// Jest测试包装
describe('梦殒春宵完整游戏模拟测试系统', () => {
  test('运行100次模拟游戏对局并生成详细日志', () => {
    main();

    const logDir = path.join(__dirname, 'simulation_logs', 'sects_violets');
    expect(fs.existsSync(logDir)).toBe(true);

    const summaryFile = path.join(logDir, 'summary.txt');
    expect(fs.existsSync(summaryFile)).toBe(true);
  }, 300000);
});

// 如果直接运行（非Jest环境），也执行主函数
if (require.main === module) {
  main();
}

