/**
 * 完整游戏模拟测试系统
 * 运行100次9-15人随机对局，生成详细行动日志
 * 
 * 使用方法：
 * npm run test:simulation
 * 或
 * jest tests/comprehensive_simulation_test.js
 * 
 * 输出：
 * - 控制台输出每局摘要
 * - 生成 tests/simulation_logs/ 目录下的详细日志文件
 */

const fs = require('fs');
const path = require('path');
const { cleanAllLogs } = require('./cleanup_simulation_logs');

// 由于这是Node环境，我们需要模拟游戏逻辑
// 这里创建一个简化但完整的游戏模拟器

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

// 工具函数
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomFloat = () => Math.random();
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const pickPreset = (count) => TB_PRESETS.find((p) => p.total === count);
const filterRoles = (type) =>
  roles.filter((r) => (r.script === '暗流涌动' || !r.script) && r.type === type);

// 判断阵营
const isEvil = (seat) =>
  seat.role?.type === 'minion' ||
  seat.role?.type === 'demon' ||
  seat.isEvilConverted ||
  seat.isDemonSuccessor;

const isGood = (seat) => seat.role && !isEvil(seat);

// 获取存活玩家
const aliveSeats = (ctx) => ctx.seats.filter((s) => !s.isDead);
const aliveDemons = (ctx) => aliveSeats(ctx).filter((s) => s.role?.type === 'demon' || s.isDemonSuccessor);
const aliveGoods = (ctx) => aliveSeats(ctx).filter((s) => isGood(s));

// 随机选择存活玩家
const randomAlive = (ctx, predicate = () => true) => {
  const candidates = aliveSeats(ctx).filter(predicate);
  if (candidates.length === 0) return null;
  return candidates[randomInt(0, candidates.length - 1)];
};

// 获取所有存活玩家（用于多选）
const randomAliveMultiple = (ctx, count, predicate = () => true) => {
  const candidates = aliveSeats(ctx).filter(predicate);
  if (candidates.length === 0) return [];
  const shuffled = shuffle(candidates);
  return shuffled.slice(0, Math.min(count, candidates.length));
};

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

  const pickByType = (type, count) => shuffle(filterRoles(type)).slice(0, count);
  const picked = [
    ...pickByType('townsfolk', preset.townsfolk),
    ...pickByType('outsider', preset.outsider),
    ...pickByType('minion', preset.minion),
    ...pickByType('demon', preset.demon),
  ];

  const shuffled = shuffle(picked);
  seats.forEach((s, i) => {
    s.role = shuffled[i];
    if (s.role.id === 'drunk') {
      s.isDrunk = true;
      // 酒鬼需要一个伪装角色
      const townsfolkRoles = filterRoles('townsfolk').filter(r => r.id !== 'drunk');
      s.charadeRole = townsfolkRoles[randomInt(0, townsfolkRoles.length - 1)];
      s.displayRole = s.charadeRole;
    }
  });

  return {
    seats,
    day: 1,
    night: 1,
    phase: 'firstNight',
    winner: null,
    log: [],
    actions: [], // 详细行动记录
    stateSnapshots: [], // 状态快照
    storytellerTips: [], // 说书人提示
    modals: [], // 弹窗记录
    preset,
  };
};

/**
 * 检查游戏结束
 */
const checkGameOver = (ctx, reason) => {
  const demons = aliveDemons(ctx);
  const goods = aliveGoods(ctx);
  const alive = aliveSeats(ctx);
  
  if (demons.length === 0) {
    ctx.winner = 'good';
    ctx.log.push(`[游戏结束] 恶魔全部死亡，好人获胜（${reason}）`);
    return true;
  }
  if (goods.length === 0 || alive.length <= 2) {
    ctx.winner = 'evil';
    ctx.log.push(`[游戏结束] 好人全部阵亡或仅余2人，邪恶获胜（${reason}）`);
    return true;
  }
  return false;
};

/**
 * 记录状态快照
 */
const snapshotState = (ctx, phase, actionDescription) => {
  ctx.stateSnapshots.push({
    phase,
    day: ctx.day,
    night: ctx.night,
    action: actionDescription,
    timestamp: new Date().toISOString(),
    seats: ctx.seats.map(s => ({
      id: s.id,
      role: s.role?.name || null,
      isDead: s.isDead,
      isPoisoned: s.isPoisoned,
      isDrunk: s.isDrunk,
      isProtected: s.isProtected,
      protectedBy: s.protectedBy,
      statusDetails: [...(s.statusDetails || [])],
      statuses: (s.statuses || []).map(st => ({ effect: st.effect, duration: st.duration })),
      isEvilConverted: s.isEvilConverted,
      isGoodConverted: s.isGoodConverted,
    })),
  });
};

/**
 * 获取说书人提示（简化版）
 */
const getStorytellerTips = (ctx) => {
  const tips = [];
  const alive = aliveSeats(ctx);
  const aliveGood = alive.filter(s => isGood(s));
  const aliveEvil = alive.filter(s => isEvil(s));

  if (ctx.phase === 'night' || ctx.phase === 'firstNight') {
    tips.push('夜晚选人指向含糊时，走到目标旁竖直指向头顶，双方点头确认，避免误会。');
    tips.push('夜晚刻意多走动、不要只去固定角落，让脚步声难以被猜出是谁被叫醒。');
  }

  if (aliveGood.length === 0 && aliveEvil.length > 0) {
    tips.push('⚠️ 全部存活玩家为邪恶阵营，恶魔无法再被提名，可考虑直接宣布邪恶获胜。');
  }

  if (ctx.phase === 'dusk' && alive.length === 4 && aliveGood.length > 0 && aliveEvil.length > 0) {
    tips.push('⚠️ 仅剩4名存活时若善良处决的不是恶魔，夜里恶魔可直接收割结束；若僧侣或士兵仍活着则需再判一次。');
  }

  return tips;
};

/**
 * 模拟夜晚行动
 * 积极但随意的使用技能
 */
const simulateNight = (ctx) => {
  const phaseLabel = ctx.night === 1 ? '首夜' : `第${ctx.night}夜`;
  ctx.log.push(`=== ${phaseLabel} ===`);
  
  const tips = getStorytellerTips(ctx);
  ctx.storytellerTips.push({
    phase: ctx.phase,
    day: ctx.day,
    night: ctx.night,
    tips: [...tips],
  });

  snapshotState(ctx, ctx.phase, `进入${phaseLabel}`);

  const alive = aliveSeats(ctx);
  const isFirstNight = ctx.night === 1;

  // 记录行动顺序（简化版夜晚顺序）
  const actionOrder = [];

  // 1. 投毒者 - 积极投毒
  const poisoners = alive.filter((s) => s.role?.id === 'poisoner' || s.role?.id === 'poisoner_mr');
  poisoners.forEach((p) => {
    if (isActorDisabledByPoisonOrDrunk(p)) {
      ctx.log.push(`[夜晚] 投毒者(${p.id + 1}-${p.role.name}) 因中毒/醉酒无法行动`);
      return;
    }
    const target = randomAlive(ctx, (t) => t.id !== p.id);
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

  // 2. 僧侣 - 非首夜保护
  const monks = alive.filter((s) => s.role?.id === 'monk');
  if (!isFirstNight) {
    monks.forEach((m) => {
      if (isActorDisabledByPoisonOrDrunk(m)) {
        ctx.log.push(`[夜晚] 僧侣(${m.id + 1}) 因中毒/醉酒无法行动`);
        return;
      }
      const target = randomAlive(ctx, (t) => t.id !== m.id);
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

  // 3. 旅店老板 - 保护两人，一人醉酒
  const innkeepers = alive.filter((s) => s.role?.id === 'innkeeper');
  innkeepers.forEach((i) => {
    if (isActorDisabledByPoisonOrDrunk(i)) {
      ctx.log.push(`[夜晚] 旅店老板(${i.id + 1}) 因中毒/醉酒无法行动`);
      return;
    }
    const picks = randomAliveMultiple(ctx, 2, (t) => t.id !== i.id);
    picks.forEach((t) => {
      t.isProtected = true;
      t.protectedBy = i.id;
    });
    if (picks.length > 0) {
      const drunkOne = picks[0];
      drunkOne.isDrunk = true;
      drunkOne.statusDetails = drunkOne.statusDetails || [];
      drunkOne.statusDetails.push('旅店老板致醉（下个黄昏清除）');
      actionOrder.push({
        actor: `${i.id + 1}号-旅店老板`,
        action: '保护并致醉',
        targets: picks.map(t => `${t.id + 1}号-${t.role.name}`).join('、'),
        drunkTarget: `${drunkOne.id + 1}号-${drunkOne.role.name}`,
        result: '成功',
      });
      ctx.log.push(`[夜晚] 旅店老板(${i.id + 1}) 保护 ${picks.map((t) => t.id + 1).join('、')}，其中 ${drunkOne.id + 1} 醉酒`);
    }
  });

  // 4. 占卜师 - 随机查验（首夜）
  const fortuneTellers = alive.filter((s) => s.role?.id === 'fortune_teller');
  if (isFirstNight) {
    fortuneTellers.forEach((ft) => {
      if (isActorDisabledByPoisonOrDrunk(ft)) {
        ctx.log.push(`[夜晚] 占卜师(${ft.id + 1}) 因中毒/醉酒无法行动`);
        return;
      }
      const targets = randomAliveMultiple(ctx, 2, (t) => t.id !== ft.id);
      if (targets.length === 2) {
        const hasEvil = targets.some(t => isEvil(t));
        const result = hasEvil ? '是' : '否';
        actionOrder.push({
          actor: `${ft.id + 1}号-占卜师`,
          action: '查验',
          targets: targets.map(t => `${t.id + 1}号-${t.role.name}`).join('、'),
          result: `其中至少一人是邪恶：${result}`,
        });
        ctx.log.push(`[夜晚] 占卜师(${ft.id + 1}) 查验 ${targets.map(t => `${t.id + 1}号`).join('、')}，结果：${result}`);
      }
    });
  }

  // 5. 调查员 - 首夜查验
  const investigators = alive.filter((s) => s.role?.id === 'investigator');
  if (isFirstNight) {
    investigators.forEach((inv) => {
      if (isActorDisabledByPoisonOrDrunk(inv)) {
        ctx.log.push(`[夜晚] 调查员(${inv.id + 1}) 因中毒/醉酒无法行动`);
        return;
      }
      const targets = randomAliveMultiple(ctx, 2, (t) => t.id !== inv.id);
      if (targets.length === 2) {
        const hasMinion = targets.some(t => t.role?.type === 'minion');
        const result = hasMinion ? '是' : '否';
        actionOrder.push({
          actor: `${inv.id + 1}号-调查员`,
          action: '查验',
          targets: targets.map(t => `${t.id + 1}号-${t.role.name}`).join('、'),
          result: `其中至少一人是爪牙：${result}`,
        });
        ctx.log.push(`[夜晚] 调查员(${inv.id + 1}) 查验 ${targets.map(t => `${t.id + 1}号`).join('、')}，结果：${result}`);
      }
    });
  }

  // 6. 洗衣妇 - 首夜信息
  const washerwomen = alive.filter((s) => s.role?.id === 'washerwoman');
  if (isFirstNight) {
    washerwomen.forEach((ww) => {
      if (isActorDisabledByPoisonOrDrunk(ww)) {
        ctx.log.push(`[夜晚] 洗衣妇(${ww.id + 1}) 因中毒/醉酒无法行动`);
        return;
      }
      const townsfolk = alive.filter(t => t.role?.type === 'townsfolk' && t.id !== ww.id);
      const picked = shuffle(townsfolk).slice(0, 2);
      if (picked.length === 2) {
        actionOrder.push({
          actor: `${ww.id + 1}号-洗衣妇`,
          action: '获得信息',
          result: `其中一人是镇民：${picked.map(t => `${t.id + 1}号-${t.role.name}`).join('、')}`,
        });
        ctx.log.push(`[夜晚] 洗衣妇(${ww.id + 1}) 得知 ${picked.map(t => `${t.id + 1}号-${t.role.name}`).join('、')} 中有一人是镇民`);
      }
    });
  }

  // 7. 图书管理员 - 首夜信息
  const librarians = alive.filter((s) => s.role?.id === 'librarian');
  if (isFirstNight) {
    librarians.forEach((lib) => {
      if (isActorDisabledByPoisonOrDrunk(lib)) {
        ctx.log.push(`[夜晚] 图书管理员(${lib.id + 1}) 因中毒/醉酒无法行动`);
        return;
      }
      const outsiders = alive.filter(t => t.role?.type === 'outsider' && t.id !== lib.id);
      const picked = shuffle(outsiders).slice(0, 2);
      if (picked.length === 2) {
        actionOrder.push({
          actor: `${lib.id + 1}号-图书管理员`,
          action: '获得信息',
          result: `其中一人是外来者：${picked.map(t => `${t.id + 1}号-${t.role.name}`).join('、')}`,
        });
        ctx.log.push(`[夜晚] 图书管理员(${lib.id + 1}) 得知 ${picked.map(t => `${t.id + 1}号-${t.role.name}`).join('、')} 中有一人是外来者`);
      }
    });
  }

  // 8. 厨师 - 首夜信息
  const chefs = alive.filter((s) => s.role?.id === 'chef');
  if (isFirstNight) {
    chefs.forEach((chef) => {
      if (isActorDisabledByPoisonOrDrunk(chef)) {
        ctx.log.push(`[夜晚] 厨师(${chef.id + 1}) 因中毒/醉酒无法行动`);
        return;
      }
      // 计算相邻邪恶玩家对数
      let evilPairs = 0;
      for (let i = 0; i < ctx.seats.length; i++) {
        const next = (i + 1) % ctx.seats.length;
        if (!ctx.seats[i].isDead && !ctx.seats[next].isDead) {
          if (isEvil(ctx.seats[i]) && isEvil(ctx.seats[next])) {
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

  // 9. 共情者 - 首夜和后续夜晚
  const empath = alive.find((s) => s.role?.id === 'empath');
  if (empath && !isActorDisabledByPoisonOrDrunk(empath)) {
    const neighbors = getNeighbors(ctx, empath.id);
    const evilNeighbors = neighbors.filter(n => isEvil(n) && !n.isDead);
    const result = evilNeighbors.length;
    actionOrder.push({
      actor: `${empath.id + 1}号-共情者`,
      action: '获得信息',
      result: `相邻邪恶玩家数：${result}`,
    });
    ctx.log.push(`[夜晚] 共情者(${empath.id + 1}) 得知相邻邪恶玩家数：${result}`);
  }

  // 10. 恶魔杀人（首夜不攻击）
  const demons = aliveDemons(ctx);
  const demonAttackAllowed = !isFirstNight;
  demons.forEach((d) => {
    if (!demonAttackAllowed) {
      ctx.log.push(`[夜晚] 首夜规则：恶魔(${d.id + 1}-${d.role.name}) 不进行攻击`);
      return;
    }
    // 恶魔积极杀人，避开受保护者和士兵
    const target = randomAlive(ctx, (t) => 
      t.id !== d.id && 
      !t.isProtected && 
      t.role?.id !== 'soldier' &&
      !hasTeaLadyProtection(t, ctx.seats)
    );
    if (target) {
      target.isDead = true;
      actionOrder.push({
        actor: `${d.id + 1}号-${d.role.name}`,
        action: '杀死',
        target: `${target.id + 1}号-${target.role.name}`,
        result: '成功',
      });
      ctx.log.push(`[夜晚] 恶魔(${d.id + 1}-${d.role.name}) 杀死了 玩家${target.id + 1}-${target.role.name}`);
      
      // 检查是否有弹窗（死亡报告）
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

  snapshotState(ctx, ctx.phase, `${phaseLabel}行动完成`);

  // 清除保护状态（下个夜晚前）
  ctx.seats.forEach((s) => {
    s.isProtected = false;
    s.protectedBy = null;
  });

  ctx.night += 1;
  return checkGameOver(ctx, '夜晚结算');
};

/**
 * 获取相邻玩家
 */
const getNeighbors = (ctx, seatId) => {
  const total = ctx.seats.length;
  const prev = (seatId - 1 + total) % total;
  const next = (seatId + 1) % total;
  return [ctx.seats[prev], ctx.seats[next]].filter(Boolean);
};

/**
 * 检查是否有茶女保护
 */
const hasTeaLadyProtection = (targetSeat, allSeats) => {
  const neighbors = getNeighbors({ seats: allSeats }, targetSeat.id);
  return neighbors.some(
    (neighbor) =>
      neighbor.role?.id === 'tea_lady' &&
      !neighbor.isDead &&
      isGood(neighbor) &&
      isGood(targetSeat)
  );
};

/**
 * 检查角色是否因中毒/醉酒无法行动
 */
const isActorDisabledByPoisonOrDrunk = (seat) => {
  return seat.isPoisoned || seat.isDrunk || seat.role?.id === 'drunk';
};

/**
 * 模拟白天行动
 */
const simulateDay = (ctx) => {
  const label = `第${ctx.day}天白天`;
  ctx.log.push(`=== ${label} ===`);
  
  ctx.phase = 'day';
  const tips = getStorytellerTips(ctx);
  ctx.storytellerTips.push({
    phase: ctx.phase,
    day: ctx.day,
    night: ctx.night,
    tips: [...tips],
  });

  snapshotState(ctx, ctx.phase, `进入${label}`);

  const alive = aliveSeats(ctx);
  if (alive.length <= 1) {
    ctx.log.push('[白天] 存活不足以提名，跳过');
    ctx.day += 1;
    return checkGameOver(ctx, '白天');
  }

  // 随机提名和投票（积极但随意）
  const proposer = alive[randomInt(0, alive.length - 1)];
  let target = proposer;
  while (target === proposer && alive.length > 1) {
    target = alive[randomInt(0, alive.length - 1)];
  }

  // 投票意愿：基础 65%，天数 >2 时每天额外 +5%，上限 85%
  const baseProb = 0.65;
  const panicBonus = Math.min(0.20, Math.max(0, (ctx.day - 2) * 0.05));
  const voteProb = Math.min(0.85, baseProb + panicBonus);

  let votes = 0;
  alive.forEach((p) => {
    const voteYes = randomFloat() < voteProb;
    if (voteYes) votes += 1;
  });
  const needed = Math.floor(alive.length / 2) + 1;

  const executed = votes >= needed;
  
  ctx.actions.push({
    phase: ctx.phase,
    day: ctx.day,
    night: ctx.night,
    actionOrder: [{
      actor: `${proposer.id + 1}号-${proposer.role.name}`,
      action: '提名',
      target: `${target.id + 1}号-${target.role.name}`,
      votes: `${votes}/${alive.length}`,
      needed: needed,
      result: executed ? '处决' : '未处决',
    }],
    storytellerTips: tips,
  });

  if (executed) {
    target.isDead = true;
    target.hasBeenNominated = true;
    
    // 检查是否有弹窗（处决结果）
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

  snapshotState(ctx, ctx.phase, `${label}行动完成`);

  ctx.day += 1;
  return checkGameOver(ctx, '白天处决');
};

/**
 * 模拟完整游戏
 */
const simulateGame = (gameNumber, maxRounds = 50) => {
  const playerCount = randomInt(9, 15);
  const ctx = initGame(playerCount);
  
  ctx.log.push(`[初始化] 游戏 #${gameNumber} - 玩家数 ${ctx.seats.length}，阵容建议 ${JSON.stringify(ctx.preset)}`);
  ctx.log.push('[身份分配] ' + ctx.seats.map((s) => `${s.id + 1}:${s.role.name}`).join(' | '));

  // 记录开局状态
  snapshotState(ctx, 'setup', '游戏开始');

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
 * 生成详细日志文件
 */
const generateDetailedLog = (gameResult, gameNumber) => {
  const log = [];
  
  log.push('='.repeat(80));
  log.push(`游戏 #${gameNumber} - 详细行动日志`);
  log.push('='.repeat(80));
  log.push('');
  
  // 1. 开局信息
  log.push('## 开局信息');
  log.push(`- 玩家数量: ${gameResult.seats.length}`);
  log.push(`- 阵容配置: ${JSON.stringify(gameResult.preset)}`);
  log.push('- 角色座位分配:');
  gameResult.seats.forEach((s, idx) => {
    log.push(`  ${idx + 1}号座位: ${s.role.name} (${s.role.type})`);
  });
  log.push('');

  // 2. 每个阶段的行动
  log.push('## 阶段行动记录');
  gameResult.actions.forEach((action, idx) => {
    log.push(`### ${action.phase} - 第${action.day}天/第${action.night}夜`);
    log.push('');
    log.push('#### 行动顺序:');
    action.actionOrder.forEach((a, i) => {
      log.push(`${i + 1}. ${a.actor} - ${a.action}`);
      if (a.target) log.push(`   目标: ${a.target}`);
      if (a.targets) log.push(`   目标: ${a.targets}`);
      if (a.drunkTarget) log.push(`   醉酒目标: ${a.drunkTarget}`);
      log.push(`   结果: ${a.result}`);
      log.push('');
    });
    
    if (action.storytellerTips && action.storytellerTips.length > 0) {
      log.push('#### 说书人提示:');
      action.storytellerTips.forEach(tip => {
        log.push(`- ${tip}`);
      });
      log.push('');
    }
  });
  log.push('');

  // 3. 状态快照
  log.push('## 状态快照');
  gameResult.stateSnapshots.forEach((snapshot, idx) => {
    log.push(`### 快照 #${idx + 1} - ${snapshot.phase} (${snapshot.action})`);
    log.push(`时间: ${snapshot.timestamp}`);
    log.push(`第${snapshot.day}天 / 第${snapshot.night}夜`);
    log.push('');
    log.push('玩家状态:');
    snapshot.seats.forEach(s => {
      const status = [];
      if (s.isDead) status.push('死亡');
      if (s.isPoisoned) status.push('中毒');
      if (s.isDrunk) status.push('醉酒');
      if (s.isProtected) status.push('受保护');
      if (s.statusDetails.length > 0) status.push(...s.statusDetails);
      log.push(`  ${s.id + 1}号: ${s.role || '无角色'} ${status.length > 0 ? `[${status.join(', ')}]` : ''}`);
    });
    log.push('');
  });
  log.push('');

  // 4. 弹窗记录
  if (gameResult.modals.length > 0) {
    log.push('## 弹窗记录');
    gameResult.modals.forEach((modal, idx) => {
      log.push(`${idx + 1}. ${modal.type} - ${modal.phase} (第${modal.day}天/第${modal.night}夜)`);
      log.push(`   数据: ${modal.data}`);
      log.push('');
    });
    log.push('');
  }

  // 5. 游戏结果
  log.push('## 游戏结果');
  log.push(`- 胜者: ${gameResult.winner}`);
  log.push(`- 总回合数: ${gameResult.day - 1}天 / ${gameResult.night - 1}夜`);
  log.push('');

  // 6. 完整日志
  log.push('## 完整日志');
  gameResult.log.forEach(line => {
    log.push(line);
  });

  return log.join('\n');
};

/**
 * 主函数：运行100次模拟
 */
const main = () => {
  // 清理之前的测试结果
  console.log('正在清理之前的测试结果...');
  const cleanupResult = cleanAllLogs();
  if (cleanupResult.deleted > 0) {
    console.log(`已删除 ${cleanupResult.deleted} 个旧文件\n`);
  }
  
  console.log('开始运行100次游戏模拟测试...\n');
  
  const results = [];
  const logDir = path.join(__dirname, 'simulation_logs');
  
  // 创建日志目录
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

    // 生成详细日志文件
    const detailedLog = generateDetailedLog(gameResult, i);
    const logFile = path.join(logDir, `game_${i.toString().padStart(3, '0')}_${gameResult.winner}_${gameResult.seats.length}players.log`);
    fs.writeFileSync(logFile, detailedLog, 'utf8');

    // 控制台输出摘要
    console.log(`游戏 #${i}: ${gameResult.seats.length}人, ${gameResult.day - 1}天/${gameResult.night - 1}夜, 胜者: ${gameResult.winner}, 耗时: ${gameDuration}s`);
    
    // 每10局输出一次进度
    if (i % 10 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`\n进度: ${i}/100 (${elapsed}s)\n`);
    }
  }

  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
  
  // 生成汇总报告
  const summary = [];
  summary.push('='.repeat(80));
  summary.push('游戏模拟测试汇总报告');
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
  
  summary.push('详细日志文件保存在: tests/simulation_logs/');
  summary.push('');
  
  const summaryText = summary.join('\n');
  console.log('\n' + summaryText);
  
  // 保存汇总报告
  const summaryFile = path.join(logDir, 'summary.txt');
  fs.writeFileSync(summaryFile, summaryText, 'utf8');
  
  console.log(`\n汇总报告已保存到: ${summaryFile}`);
  console.log('测试完成！');
};

// Jest测试包装
describe('完整游戏模拟测试系统', () => {
  test('运行100次模拟游戏对局并生成详细日志', () => {
    // 运行主函数
    main();
    
    // 验证日志目录已创建
    const logDir = path.join(__dirname, 'simulation_logs');
    expect(fs.existsSync(logDir)).toBe(true);
    
    // 验证生成了汇总报告
    const summaryFile = path.join(logDir, 'summary.txt');
    expect(fs.existsSync(summaryFile)).toBe(true);
  }, 300000); // 设置超时时间为5分钟
});

// 如果直接运行（非Jest环境），也执行主函数
if (require.main === module) {
  main();
}

