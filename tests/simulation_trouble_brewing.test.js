/**
 * 暗流涌动（Trouble Brewing）完整游戏模拟测试
 * 包含所有22个角色的完整能力实现
 * 
 * 使用方法：
 * npm run test:simulation:tb
 * 或
 * jest tests/simulation_trouble_brewing.test.js
 */

const fs = require('fs');
const path = require('path');
const base = require('./simulation_base');
const { cleanScriptLogs } = require('./cleanup_simulation_logs');

const { roles } = require('../app/data.ts');

// 暗流涌动标准阵容
const TB_PRESETS = [
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

const pickPreset = (count) => TB_PRESETS.find((p) => p.total === count);
const filterRoles = (type) =>
  roles.filter((r) => (r.script === '暗流涌动' || !r.script) && r.type === type && !r.hidden);

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
  }));

  // 检查是否有男爵，如果有则调整阵容
  const hasBaron = base.randomFloat() < 0.3; // 30%概率有男爵
  let actualPreset = { ...preset };
  if (hasBaron && preset.outsider < 2) {
    // 男爵在场时，+2外来者，-2镇民
    actualPreset = {
      ...preset,
      townsfolk: Math.max(0, preset.townsfolk - 2),
      outsider: preset.outsider + 2,
    };
  }

  const pickByType = (type, count) => base.shuffle(filterRoles(type)).slice(0, count);
  const picked = [
    ...pickByType('townsfolk', actualPreset.townsfolk),
    ...pickByType('outsider', actualPreset.outsider),
    ...pickByType('minion', actualPreset.minion),
    ...pickByType('demon', actualPreset.demon),
  ];

  const shuffled = base.shuffle(picked);
  seats.forEach((s, i) => {
    s.role = shuffled[i];
    if (s.role.id === 'drunk') {
      s.isDrunk = true;
      // 酒鬼需要一个伪装角色
      const townsfolkRoles = filterRoles('townsfolk').filter(r => r.id !== 'drunk');
      s.charadeRole = townsfolkRoles[base.randomInt(0, townsfolkRoles.length - 1)];
      s.displayRole = s.charadeRole;
    }
    // 标记男爵
    if (s.role.id === 'baron') {
      s.statusDetails = s.statusDetails || [];
      s.statusDetails.push('男爵在场，阵容已调整');
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
    executedToday: null, // 今天被处决的玩家
    nominationMap: {}, // 提名映射：{被提名者: 提名者}
    lastExorcistTarget: null, // 驱魔人上次选择的目标（暗流涌动没有，但保留字段）
    lastDevilsAdvocateTarget: null, // 魔鬼代言人上次选择的目标（暗流涌动没有，但保留字段）
    pukkaPoisonedPlayers: [], // 普卡中毒的玩家列表（暗流涌动没有，但保留字段）
    shabalothTargets: [], // 沙巴洛斯上次选择的目标（暗流涌动没有，但保留字段）
    poLastChoice: null, // 珀上次的选择（暗流涌动没有，但保留字段）
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

  // ========== 首夜信息角色 ==========
  if (isFirstNight) {
    // 1. 洗衣妇 - 首夜得知两名玩家和一个镇民角色
    const washerwomen = alive.filter((s) => s.role?.id === 'washerwoman');
    washerwomen.forEach((ww) => {
      if (base.isActorDisabledByPoisonOrDrunk(ww)) {
        ctx.log.push(`[夜晚] 洗衣妇(${ww.id + 1}) 因中毒/醉酒无法行动`);
        return;
      }
      // 选择一个镇民角色（真实信息）
      const townsfolk = alive.filter(t => t.role?.type === 'townsfolk' && t.id !== ww.id);
      if (townsfolk.length === 0) {
        ctx.log.push(`[夜晚] 洗衣妇(${ww.id + 1}) 无法获取信息：场上没有其他镇民`);
        return;
      }
      const realTownsfolk = base.shuffle(townsfolk)[0]; // 真实的镇民玩家
      const realRole = realTownsfolk.role; // 真实的镇民角色
      
      // 选择另一个玩家作为干扰项（可以是任意类型的在场角色，但不能是洗衣妇自己，也不能是真实玩家）
      const availablePlayers = alive.filter(t => t.id !== ww.id && t.id !== realTownsfolk.id);
      if (availablePlayers.length === 0) {
        ctx.log.push(`[夜晚] 洗衣妇(${ww.id + 1}) 无法获取信息：场上没有足够的玩家`);
        return;
      }
      const fakePlayer = availablePlayers[base.randomInt(0, availablePlayers.length - 1)];
      
      // 按照数字小至大排列两个座位号
      const players = [realTownsfolk, fakePlayer].sort((a, b) => a.id - b.id);
      const seat1 = players[0].id + 1;
      const seat2 = players[1].id + 1;
      
      // 显示格式："X号、Y号中存在（镇民）角色名。"
      const info = `${seat1}号、${seat2}号中存在（镇民）${realRole.name}。`;
      actionOrder.push({
        actor: `${ww.id + 1}号-洗衣妇`,
        action: '获得信息',
        result: info,
      });
      ctx.log.push(`[夜晚] 洗衣妇(${ww.id + 1}) 得知：${info}`);
    });

    // 2. 图书管理员 - 首夜得知两名玩家和一个外来者角色
    const librarians = alive.filter((s) => s.role?.id === 'librarian');
    librarians.forEach((lib) => {
      if (base.isActorDisabledByPoisonOrDrunk(lib)) {
        ctx.log.push(`[夜晚] 图书管理员(${lib.id + 1}) 因中毒/醉酒无法行动`);
        return;
      }
      const outsiders = alive.filter(t => t.role?.type === 'outsider' && t.id !== lib.id);
      if (outsiders.length === 0) {
        actionOrder.push({
          actor: `${lib.id + 1}号-图书管理员`,
          action: '获得信息',
          result: '没有外来者在场',
        });
        ctx.log.push(`[夜晚] 图书管理员(${lib.id + 1}) 得知没有外来者在场`);
        return;
      }
      // 选择一个外来者角色（真实信息）
      const realOutsider = base.shuffle(outsiders)[0]; // 真实的外来者玩家
      const realRole = realOutsider.role; // 真实的外来者角色
      
      // 选择另一个玩家作为干扰项（可以是任意类型的在场角色，但不能是图书管理员自己，也不能是真实玩家）
      const availablePlayers = alive.filter(t => t.id !== lib.id && t.id !== realOutsider.id);
      if (availablePlayers.length === 0) {
        ctx.log.push(`[夜晚] 图书管理员(${lib.id + 1}) 无法获取信息：场上没有足够的玩家`);
        return;
      }
      const fakePlayer = availablePlayers[base.randomInt(0, availablePlayers.length - 1)];
      
      // 按照数字小至大排列两个座位号
      const players = [realOutsider, fakePlayer].sort((a, b) => a.id - b.id);
      const seat1 = players[0].id + 1;
      const seat2 = players[1].id + 1;
      
      // 显示格式："X号、Y号中存在（外来者）角色名。"
      const info = `${seat1}号、${seat2}号中存在（外来者）${realRole.name}。`;
      actionOrder.push({
        actor: `${lib.id + 1}号-图书管理员`,
        action: '获得信息',
        result: info,
      });
      ctx.log.push(`[夜晚] 图书管理员(${lib.id + 1}) 得知：${info}`);
    });

    // 3. 调查员 - 首夜得知两名玩家和一个爪牙角色
    const investigators = alive.filter((s) => s.role?.id === 'investigator');
    investigators.forEach((inv) => {
      if (base.isActorDisabledByPoisonOrDrunk(inv)) {
        ctx.log.push(`[夜晚] 调查员(${inv.id + 1}) 因中毒/醉酒无法行动`);
        return;
      }
      const minions = alive.filter(t => t.role?.type === 'minion' && t.id !== inv.id);
      if (minions.length === 0) {
        actionOrder.push({
          actor: `${inv.id + 1}号-调查员`,
          action: '获得信息',
          result: '没有爪牙在场',
        });
        ctx.log.push(`[夜晚] 调查员(${inv.id + 1}) 得知没有爪牙在场`);
        return;
      }
      // 选择一个爪牙角色（真实信息）
      const realMinion = base.shuffle(minions)[0]; // 真实的爪牙玩家
      const realRole = realMinion.role; // 真实的爪牙角色
      
      // 选择另一个玩家作为干扰项（可以是任意类型的在场角色，但不能是调查员自己，也不能是真实玩家）
      const availablePlayers = alive.filter(t => t.id !== inv.id && t.id !== realMinion.id);
      if (availablePlayers.length === 0) {
        ctx.log.push(`[夜晚] 调查员(${inv.id + 1}) 无法获取信息：场上没有足够的玩家`);
        return;
      }
      const fakePlayer = availablePlayers[base.randomInt(0, availablePlayers.length - 1)];
      
      // 按照数字小至大排列两个座位号
      const players = [realMinion, fakePlayer].sort((a, b) => a.id - b.id);
      const seat1 = players[0].id + 1;
      const seat2 = players[1].id + 1;
      
      // 显示格式："X号、Y号中存在（爪牙）角色名。"
      const info = `${seat1}号、${seat2}号中存在（爪牙）${realRole.name}。`;
      actionOrder.push({
        actor: `${inv.id + 1}号-调查员`,
        action: '获得信息',
        result: info,
      });
      ctx.log.push(`[夜晚] 调查员(${inv.id + 1}) 得知：${info}`);
    });

    // 4. 厨师 - 首夜得知相邻邪恶玩家对数
    const chefs = alive.filter((s) => s.role?.id === 'chef');
    chefs.forEach((chef) => {
      if (base.isActorDisabledByPoisonOrDrunk(chef)) {
        ctx.log.push(`[夜晚] 厨师(${chef.id + 1}) 因中毒/醉酒无法行动`);
        return;
      }
      let evilPairs = 0;
      for (let i = 0; i < ctx.seats.length; i++) {
        const next = (i + 1) % ctx.seats.length;
        if (!ctx.seats[i].isDead && !ctx.seats[next].isDead) {
          if (base.isEvil(ctx.seats[i]) && base.isEvil(ctx.seats[next])) {
            evilPairs++;
          }
        }
      }
      actionOrder.push({
        actor: `${chef.id + 1}号-厨师`,
        action: '获得信息',
        result: `相邻邪恶玩家对数：${evilPairs}`,
      });
      ctx.log.push(`[夜晚] 厨师(${chef.id + 1}) 得知相邻邪恶玩家对数：${evilPairs}`);
    });
  }

  // ========== 每夜行动角色 ==========
  
  // 5. 投毒者 - 每夜投毒
  const poisoners = alive.filter((s) => s.role?.id === 'poisoner' || s.role?.id === 'poisoner_mr');
  poisoners.forEach((p) => {
    if (base.isActorDisabledByPoisonOrDrunk(p)) {
      ctx.log.push(`[夜晚] 投毒者(${p.id + 1}-${p.role.name}) 因中毒/醉酒无法行动`);
      return;
    }
    const target = base.randomAlive(ctx, (t) => t.id !== p.id);
    if (target) {
      target.isPoisoned = true;
      target.statusDetails = target.statusDetails || [];
      target.statusDetails.push('投毒者致毒');
      actionOrder.push({
        actor: `${p.id + 1}号-${p.role.name}`,
        action: '投毒',
        target: `${target.id + 1}号-${target.role.name}`,
        result: '成功',
      });
      ctx.log.push(`[夜晚] 投毒者(${p.id + 1}-${p.role.name}) 毒了 玩家${target.id + 1}-${target.role.name}`);
    }
  });

  // 6. 僧侣 - 非首夜保护
  const monks = alive.filter((s) => s.role?.id === 'monk');
  if (!isFirstNight) {
    monks.forEach((m) => {
      if (base.isActorDisabledByPoisonOrDrunk(m)) {
        ctx.log.push(`[夜晚] 僧侣(${m.id + 1}) 因中毒/醉酒无法行动`);
        return;
      }
      const target = base.randomAlive(ctx, (t) => t.id !== m.id);
      if (target) {
        target.isProtected = true;
        target.protectedBy = m.id;
        actionOrder.push({
          actor: `${m.id + 1}号-僧侣`,
          action: '保护',
          target: `${target.id + 1}号-${target.role.name}`,
          result: '成功',
        });
        ctx.log.push(`[夜晚] 僧侣(${m.id + 1}) 保护 玩家${target.id + 1}`);
      }
    });
  }

  // 7. 间谍 - 每夜查看魔典
  const spies = alive.filter((s) => s.role?.id === 'spy');
  spies.forEach((spy) => {
    actionOrder.push({
      actor: `${spy.id + 1}号-间谍`,
      action: '查看魔典',
      result: '已查看所有真实身份和行动日志',
    });
    ctx.log.push(`[夜晚] 间谍(${spy.id + 1}) 查看了魔典`);
  });

  // 8. 共情者 - 每夜得知相邻邪恶玩家数
  const empaths = alive.filter((s) => s.role?.id === 'empath');
  empaths.forEach((empath) => {
    if (base.isActorDisabledByPoisonOrDrunk(empath)) {
      ctx.log.push(`[夜晚] 共情者(${empath.id + 1}) 因中毒/醉酒无法行动`);
      return;
    }
    const neighbors = base.getNeighbors(ctx, empath.id);
    const evilNeighbors = neighbors.filter(n => base.isEvil(n) && !n.isDead);
    const result = evilNeighbors.length;
    actionOrder.push({
      actor: `${empath.id + 1}号-共情者`,
      action: '获得信息',
      result: `相邻邪恶玩家数：${result}`,
    });
    ctx.log.push(`[夜晚] 共情者(${empath.id + 1}) 得知相邻邪恶玩家数：${result}`);
  });

  // 9. 占卜师 - 每夜查验两名玩家
  const fortuneTellers = alive.filter((s) => s.role?.id === 'fortune_teller');
  fortuneTellers.forEach((ft) => {
    if (base.isActorDisabledByPoisonOrDrunk(ft)) {
      ctx.log.push(`[夜晚] 占卜师(${ft.id + 1}) 因中毒/醉酒无法行动`);
      return;
    }
    const targets = base.randomAliveMultiple(ctx, 2, (t) => t.id !== ft.id);
    if (targets.length === 2) {
      // 检查是否有红罗刹
      const hasRedHerring = targets.some(t => t.isFortuneTellerRedHerring);
      // 检查是否有陌客（可能被当作邪恶）
      const hasRecluse = targets.some(t => t.role?.id === 'recluse');
      // 陌客可能被当作邪恶（50%概率）
      const recluseAsEvil = hasRecluse && base.randomFloat() < 0.5;
      const hasEvil = targets.some(t => base.isEvil(t) || (t.role?.id === 'recluse' && recluseAsEvil));
      const result = (hasEvil || hasRedHerring) ? '是' : '否';
      actionOrder.push({
        actor: `${ft.id + 1}号-占卜师`,
        action: '查验',
        targets: targets.map(t => `${t.id + 1}号-${t.role.name}`).join('、'),
        result: `其中至少一人是邪恶：${result}`,
      });
      ctx.log.push(`[夜晚] 占卜师(${ft.id + 1}) 查验 ${targets.map(t => `${t.id + 1}号`).join('、')}，结果：${result}`);
    }
  });

  // 10. 送葬者 - 非首夜得知今天被处决的玩家角色
  const undertakers = alive.filter((s) => s.role?.id === 'undertaker');
  if (!isFirstNight && ctx.executedToday !== null) {
    undertakers.forEach((ut) => {
      if (base.isActorDisabledByPoisonOrDrunk(ut)) {
        ctx.log.push(`[夜晚] 送葬者(${ut.id + 1}) 因中毒/醉酒无法行动`);
        return;
      }
      const executed = ctx.seats.find(s => s.id === ctx.executedToday);
      if (executed) {
        // 送葬者看到被处决的角色（陌客可能被当作其他角色）
        let displayedRole = executed.role.name;
        if (executed.role.id === 'recluse') {
          // 陌客可能被当作其他角色（随机选择）
          const possibleRoles = ['投毒者', '间谍', '小恶魔'];
          displayedRole = base.randomFloat() < 0.5 ? executed.role.name : possibleRoles[base.randomInt(0, possibleRoles.length - 1)];
        }
        actionOrder.push({
          actor: `${ut.id + 1}号-送葬者`,
          action: '获得信息',
          result: `今天被处决的玩家角色：${displayedRole}`,
        });
        ctx.log.push(`[夜晚] 送葬者(${ut.id + 1}) 得知今天被处决的玩家角色：${displayedRole}`);
      }
    });
  }

  // 11. 管家 - 每夜选择主人
  const butlers = alive.filter((s) => s.role?.id === 'butler');
  butlers.forEach((butler) => {
    if (base.isActorDisabledByPoisonOrDrunk(butler)) {
      ctx.log.push(`[夜晚] 管家(${butler.id + 1}) 因中毒/醉酒无法行动`);
      return;
    }
    const target = base.randomAlive(ctx, (t) => t.id !== butler.id);
    if (target) {
      butler.masterId = target.id;
      butler.statusDetails = butler.statusDetails || [];
      butler.statusDetails = butler.statusDetails.filter(d => !d.includes('主人'));
      butler.statusDetails.push(`主人:${target.id + 1}`);
      actionOrder.push({
        actor: `${butler.id + 1}号-管家`,
        action: '选择主人',
        target: `${target.id + 1}号-${target.role.name}`,
        result: '成功',
      });
      ctx.log.push(`[夜晚] 管家(${butler.id + 1}) 选择了${target.id + 1}号作为主人`);
    }
  });

  // ========== 触发式能力 ==========
  
  // 12. 守鸦人 - 夜晚死亡时唤醒
  const deadThisNight = [];
  const ravenkeepers = ctx.seats.filter((s) => s.role?.id === 'ravenkeeper');
  ravenkeepers.forEach((rk) => {
    // 检查是否在今晚死亡（在恶魔杀人后检查）
    // 这里先标记，等恶魔杀人后再处理
  });

  // ========== 恶魔行动 ==========
  
  // 13. 小恶魔 - 非首夜杀人
  const demons = base.aliveDemons(ctx);
  const demonAttackAllowed = !isFirstNight;
  demons.forEach((d) => {
    if (!demonAttackAllowed) {
      // 首夜：告知爪牙信息
      const minions = alive.filter(s => s.role?.type === 'minion');
      actionOrder.push({
        actor: `${d.id + 1}号-${d.role.name}`,
        action: '首夜认队友',
        result: `得知爪牙：${minions.map(m => `${m.id + 1}号`).join('、')}`,
      });
      ctx.log.push(`[夜晚] 首夜规则：恶魔(${d.id + 1}-${d.role.name}) 得知爪牙信息`);
      return;
    }
    
    // 非首夜：选择目标杀人
    const target = base.randomAlive(ctx, (t) => 
      t.id !== d.id && 
      !t.isProtected && 
      t.role?.id !== 'soldier' &&
      !base.hasTeaLadyProtection(t, ctx.seats)
    );
    
    if (target) {
      target.isDead = true;
      deadThisNight.push(target.id);
      
      // 检查守鸦人是否死亡
      const deadRavenkeeper = ravenkeepers.find(rk => rk.id === target.id && !rk.isDead);
      if (deadRavenkeeper) {
        // 守鸦人死亡，立即唤醒
        const rkTarget = base.randomAlive(ctx, (t) => t.id !== deadRavenkeeper.id);
        if (rkTarget) {
          actionOrder.push({
            actor: `${deadRavenkeeper.id + 1}号-守鸦人`,
            action: '死亡触发',
            target: `${rkTarget.id + 1}号-${rkTarget.role.name}`,
            result: `得知角色：${rkTarget.role.name}`,
          });
          ctx.log.push(`[夜晚] 守鸦人(${deadRavenkeeper.id + 1}) 在夜晚死亡，得知${rkTarget.id + 1}号角色：${rkTarget.role.name}`);
        }
      }
      
      // 检查红唇女郎变身（如果恶魔死亡）
      const aliveAfterKill = base.aliveSeats(ctx);
      if (aliveAfterKill.length >= 5) {
        const scarletWomen = aliveAfterKill.filter(s => s.role?.id === 'scarlet_woman' && !s.isDemonSuccessor);
        const deadDemons = ctx.seats.filter(s => s.isDead && (s.role?.type === 'demon' || s.isDemonSuccessor));
        if (deadDemons.length > 0 && scarletWomen.length > 0) {
          // 恶魔死亡且活人>=5，红唇女郎变恶魔
          const sw = scarletWomen[0];
          sw.isDemonSuccessor = true;
          sw.role = { ...sw.role, id: 'imp', name: '小恶魔', type: 'demon' };
          actionOrder.push({
            actor: `${sw.id + 1}号-红唇女郎`,
            action: '变身',
            result: `变成小恶魔`,
          });
          ctx.log.push(`[夜晚] 红唇女郎(${sw.id + 1}) 在恶魔死亡后变成小恶魔`);
          
          ctx.modals.push({
            phase: ctx.phase,
            day: ctx.day,
            night: ctx.night,
            type: 'SCARLET_WOMAN_TRANSFORM',
            data: `红唇女郎${sw.id + 1}号变成小恶魔`,
          });
        }
      }
      
      actionOrder.push({
        actor: `${d.id + 1}号-${d.role.name}`,
        action: '杀死',
        target: `${target.id + 1}号-${target.role.name}`,
        result: '成功',
      });
      ctx.log.push(`[夜晚] 恶魔(${d.id + 1}-${d.role.name}) 杀死了 玩家${target.id + 1}-${target.role.name}`);
      
      ctx.modals.push({
        phase: ctx.phase,
        day: ctx.day,
        night: ctx.night,
        type: 'NIGHT_DEATH_REPORT',
        data: `玩家${target.id + 1}号-${target.role.name}在夜晚死亡`,
      });
    } else {
      ctx.log.push(`[夜晚] 恶魔(${d.id + 1}-${d.role.name}) 未能找到可杀目标（可能被保护/士兵）`);
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
  
  // 检查镇长获胜条件：仅剩3人且无人被处决
  if (alive.length === 3 && ctx.executedToday === null) {
    const mayors = alive.filter(s => s.role?.id === 'mayor');
    if (mayors.length > 0) {
      ctx.winner = 'good';
      ctx.log.push(`[游戏结束] 仅剩3人且无人被处决，镇长(${mayors[0].id + 1})获胜`);
      ctx.modals.push({
        phase: ctx.phase,
        day: ctx.day,
        night: ctx.night,
        type: 'MAYOR_WIN',
        data: `镇长获胜`,
      });
      return true;
    }
  }
  
  if (alive.length <= 1) {
    ctx.log.push('[白天] 存活不足以提名，跳过');
    ctx.day += 1;
    return base.checkGameOver(ctx, '白天');
  }

  const actionOrder = [];

  // ========== 白天能力 ==========
  
  // 1. 猎手 - 白天射击（每局游戏限一次）
  const slayers = alive.filter((s) => s.role?.id === 'slayer' && !s.hasUsedSlayerAbility);
  slayers.forEach((slayer) => {
    // 50%概率使用能力
    if (base.randomFloat() < 0.5) {
      const target = base.randomAlive(ctx, (t) => t.id !== slayer.id);
      if (target) {
        slayer.hasUsedSlayerAbility = true;
        // 检查目标是否是恶魔（陌客可能被当作恶魔）
        const isRecluse = target.role?.id === 'recluse';
        const recluseAsDemon = isRecluse && base.randomFloat() < 0.3; // 30%概率被当作恶魔
        const isDemon = target.role?.type === 'demon' || target.isDemonSuccessor || recluseAsDemon;
        if (isDemon && !recluseAsDemon) {
          target.isDead = true;
          actionOrder.push({
            actor: `${slayer.id + 1}号-猎手`,
            action: '射击',
            target: `${target.id + 1}号-${target.role.name}`,
            result: '成功，恶魔死亡',
          });
          ctx.log.push(`[白天] 猎手(${slayer.id + 1}) 射击 ${target.id + 1}号-${target.role.name}，成功杀死恶魔`);
          
          ctx.modals.push({
            phase: ctx.phase,
            day: ctx.day,
            night: ctx.night,
            type: 'SLAYER_RESULT',
            data: `猎手成功杀死恶魔${target.id + 1}号`,
          });
        } else if (recluseAsDemon) {
          // 陌客被当作恶魔，但实际不是，猎手失败
          actionOrder.push({
            actor: `${slayer.id + 1}号-猎手`,
            action: '射击',
            target: `${target.id + 1}号-${target.role.name}`,
            result: '失败，目标不是真正的恶魔（陌客）',
          });
          ctx.log.push(`[白天] 猎手(${slayer.id + 1}) 射击 ${target.id + 1}号-${target.role.name}，失败（陌客被误判为恶魔）`);
        } else {
          actionOrder.push({
            actor: `${slayer.id + 1}号-猎手`,
            action: '射击',
            target: `${target.id + 1}号-${target.role.name}`,
            result: '失败，目标不是恶魔',
          });
          ctx.log.push(`[白天] 猎手(${slayer.id + 1}) 射击 ${target.id + 1}号-${target.role.name}，失败（不是恶魔）`);
        }
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

  // ========== 触发式能力：贞洁者 ==========
  
  // 检查贞洁者触发
  const virgins = alive.filter((s) => s.role?.id === 'virgin' && !s.hasBeenNominated);
  let virginTriggered = false;
  let virginNominator = null;
  
  if (virgins.some(v => v.id === target.id)) {
    const virgin = virgins.find(v => v.id === target.id);
    // 检查提名者是否是镇民
    const nominatorIsTownsfolk = proposer.role?.type === 'townsfolk';
    if (nominatorIsTownsfolk) {
      virginTriggered = true;
      virginNominator = proposer;
      proposer.isDead = true;
      virgin.hasBeenNominated = true;
      
      actionOrder.push({
        actor: `${target.id + 1}号-贞洁者`,
        action: '触发能力',
        result: `提名者${proposer.id + 1}号-${proposer.role.name}被处决`,
      });
      ctx.log.push(`[白天] 贞洁者(${target.id + 1}) 被镇民提名，提名者${proposer.id + 1}号-${proposer.role.name}被处决`);
      
      ctx.modals.push({
        phase: ctx.phase,
        day: ctx.day,
        night: ctx.night,
        type: 'VIRGIN_TRIGGER',
        data: `贞洁者被提名，提名者被处决`,
      });
      
      // 贞洁者触发后，原提名被取消
      base.snapshotState(ctx, ctx.phase, `${label}行动完成`);
      ctx.day += 1;
      ctx.executedToday = proposer.id;
      return base.checkGameOver(ctx, '白天处决（贞洁者触发）');
    }
  }

  // 正常投票流程
  const baseProb = 0.65;
  const panicBonus = Math.min(0.20, Math.max(0, (ctx.day - 2) * 0.05));
  const voteProb = Math.min(0.85, baseProb + panicBonus);

  let votes = 0;
  alive.forEach((p) => {
    // 管家只能跟随主人投票
    if (p.role?.id === 'butler' && p.masterId !== null) {
      const master = ctx.seats.find(s => s.id === p.masterId);
      if (master && !master.isDead) {
        // 简化：如果主人投票，管家也投票
        const masterVotes = base.randomFloat() < voteProb;
        if (masterVotes) votes += 2; // 主人和管家都投票
      }
    } else {
      const voteYes = base.randomFloat() < voteProb;
      if (voteYes) votes += 1;
    }
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
    // 先记录提名日志
    ctx.log.push(
      `[提名] 玩家${proposer.id + 1}-${proposer.role.name} 提名 玩家${target.id + 1}-${target.role.name} | 票数 ${votes}/${alive.length} (需要 ${needed}) | 处决`
    );
    
    // ========== 触发式能力：圣徒 ==========
    // 检查圣徒被处决（必须在设置死亡状态之前检查）
    if (target.role?.id === 'saint') {
      const disabled = target.isPoisoned || target.isDrunk;
      if (!disabled) {
        // 圣徒被处决，游戏立即结束，邪恶获胜
        target.isDead = true;
        target.hasBeenNominated = true;
        ctx.executedToday = target.id;
        ctx.winner = 'evil';
        ctx.log.push(`[游戏结束] 圣徒被处决，邪恶阵营立即获胜`);
        ctx.modals.push({
          phase: ctx.phase,
          day: ctx.day,
          night: ctx.night,
          type: 'SAINT_EXECUTION',
          data: `圣徒被处决，邪恶获胜`,
        });
        base.snapshotState(ctx, ctx.phase, `${label}行动完成（圣徒被处决，游戏结束）`);
        return true;
      }
    }
    
    // 正常处决流程（非圣徒，或圣徒但中毒/醉酒）
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
  const cleanupResult = cleanScriptLogs('trouble_brewing');
  if (cleanupResult.deleted > 0) {
    console.log(`已删除 ${cleanupResult.deleted} 个旧文件\n`);
  }
  
  console.log('开始运行100次暗流涌动游戏模拟测试...\n');
  
  const results = [];
  const logDir = path.join(__dirname, 'simulation_logs', 'trouble_brewing');
  
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

    const detailedLog = base.generateDetailedLog(gameResult, i, '暗流涌动');
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
  summary.push('暗流涌动游戏模拟测试汇总报告');
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
  summary.push('详细日志文件保存在: tests/simulation_logs/trouble_brewing/');
  summary.push('');
  
  const summaryText = summary.join('\n');
  console.log('\n' + summaryText);
  
  const summaryFile = path.join(logDir, 'summary.txt');
  fs.writeFileSync(summaryFile, summaryText, 'utf8');
  
  console.log(`\n汇总报告已保存到: ${summaryFile}`);
  console.log('测试完成！');
};

// Jest测试包装
describe('暗流涌动完整游戏模拟测试系统', () => {
  test('运行100次模拟游戏对局并生成详细日志', () => {
    main();
    
    const logDir = path.join(__dirname, 'simulation_logs', 'trouble_brewing');
    expect(fs.existsSync(logDir)).toBe(true);
    
    const summaryFile = path.join(logDir, 'summary.txt');
    expect(fs.existsSync(summaryFile)).toBe(true);
  }, 300000);
});

// 如果直接运行（非Jest环境），也执行主函数
if (require.main === module) {
  main();
}

