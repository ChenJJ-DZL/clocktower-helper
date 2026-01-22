/**
 * 游戏模拟测试基础模板
 * 包含所有通用函数和结构
 */

const fs = require('fs');
const path = require('path');

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

// 获取相邻玩家
const getNeighbors = (ctx, seatId) => {
  const total = ctx.seats.length;
  const prev = (seatId - 1 + total) % total;
  const next = (seatId + 1) % total;
  return [ctx.seats[prev], ctx.seats[next]].filter(Boolean);
};

// 检查角色是否因中毒/醉酒无法行动
const isActorDisabledByPoisonOrDrunk = (seat) => {
  return seat.isPoisoned || seat.isDrunk || seat.role?.id === 'drunk';
};

// 检查是否有茶女保护
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

// 检查游戏结束
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

// 记录状态快照
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

// 获取说书人提示（简化版）
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

// 生成详细日志文件
const generateDetailedLog = (gameResult, gameNumber, scriptName) => {
  const log = [];
  
  log.push('='.repeat(80));
  log.push(`游戏 #${gameNumber} - ${scriptName} - 详细行动日志`);
  log.push('='.repeat(80));
  log.push('');
  
  // 1. 开局信息
  log.push('## 开局信息');
  log.push(`- 玩家数量: ${gameResult.seats.length}`);
  if (gameResult.preset) {
    log.push(`- 阵容配置: ${JSON.stringify(gameResult.preset)}`);
  }
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
      if (a.votes) log.push(`   投票: ${a.votes} (需要 ${a.needed})`);
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
  if (gameResult.modals && gameResult.modals.length > 0) {
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

module.exports = {
  randomInt,
  randomFloat,
  shuffle,
  isEvil,
  isGood,
  aliveSeats,
  aliveDemons,
  aliveGoods,
  randomAlive,
  randomAliveMultiple,
  getNeighbors,
  isActorDisabledByPoisonOrDrunk,
  hasTeaLadyProtection,
  checkGameOver,
  snapshotState,
  getStorytellerTips,
  generateDetailedLog,
};

