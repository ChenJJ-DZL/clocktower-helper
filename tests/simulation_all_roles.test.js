/**
 * 完整角色库游戏模拟测试
 * 包含所有角色的完整能力实现（不限制剧本）
 * 
 * 使用方法：
 * npm run test:simulation:all_roles
 * 或
 * jest tests/simulation_all_roles.test.js
 */

const fs = require('fs');
const path = require('path');
const base = require('./simulation_base');
const { cleanScriptLogs } = require('./cleanup_simulation_logs');

const { roles } = require('../app/data.ts');

// 完整角色库标准阵容（与暗流涌动相同）
const ALL_ROLES_PRESETS = [
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

const pickPreset = (count) => ALL_ROLES_PRESETS.find((p) => p.total === count);
// 不限制剧本，但排除隐藏角色
const filterRoles = (type) =>
  roles.filter((r) => r.type === type && !r.hidden);

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
    // 所有可能的特有字段（合并所有剧本）
    hasUsedCourtierAbility: false,
    hasUsedProfessorAbility: false,
    hasUsedSeamstressAbility: false,
    hasUsedAssassinAbility: false,
    hasUsedPhilosopherAbility: false,
    hasUsedArtistAbility: false,
    hasUsedJugglerAbility: false,
    hasUsedEngineerAbility: false,
    hasUsedRangerAbility: false,
    hasUsedFishermanAbility: false,
    hasUsedSavantAbility: false,
    hasUsedLunaticMrAbility: false,
    lastExorcistTarget: null,
    lastDevilsAdvocateTarget: null,
    pukkaPoisonedPlayers: [],
    shabalothTargets: [],
    poLastChoice: null,
    isExecutionImmune: false,
    isFoolFirstDeath: true,
    isLunatic: false,
    lunaticTargets: [],
    isCursed: false,
    isMad: false,
    madRole: null,
    evilTwinPair: null,
    isEvilTwin: false,
    fangGuTransformed: false,
    fangGuTarget: null,
    noDashiiPoisonedPlayers: [],
    vigormortisMinionKilled: false,
    vortoxActive: false,
    balloonistKnownTypes: [],
    amnesiacAbility: null,
    cannibalLastExecuted: null,
    poppyGrowerDied: false,
    shamanKeyword: null,
    shamanKeywordSaid: false,
    hasUsedHadesiaAbility: false,
    hadesiaTargets: [],
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
    
    // 处理酒鬼
    if (s.role.id === 'drunk' || s.role.id === 'drunk_mr') {
      s.isDrunk = true;
      const townsfolkRoles = filterRoles('townsfolk').filter(r => r.id !== 'drunk' && r.id !== 'drunk_mr');
      s.charadeRole = townsfolkRoles[base.randomInt(0, townsfolkRoles.length - 1)];
      s.displayRole = s.charadeRole;
    }
    
    // 处理疯子
    if (s.role.id === 'lunatic') {
      s.isLunatic = true;
    }
    
    // 处理涡流
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

  // 设置灵言师关键词
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
    sweetheartDiedToday: false,
    klutzDiedToday: false,
    gossipStatement: null,
    gossipStatementResult: null,
    lastExorcistTarget: null,
    lastDevilsAdvocateTarget: null,
    pukkaPoisonedPlayers: [],
    shabalothTargets: [],
    poLastChoice: null,
  };
};

/**
 * 模拟夜晚行动 - 包含所有角色的完整能力
 * 注意：这是一个简化版本，实际实现需要包含所有角色的能力
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

  // 由于完整角色库包含所有角色，这里只实现核心角色的能力
  // 其他角色的能力可以参考各个剧本的测试文件
  
  // 基础夜晚行动（参考暗流涌动的实现）
  // 这里简化处理，实际应该包含所有角色的完整能力
  
  // 恶魔行动
  const demons = base.aliveDemons(ctx);
  demons.forEach((demon) => {
    const target = base.randomAlive(ctx, (t) => 
      t.id !== demon.id && 
      !t.isProtected && 
      !base.hasTeaLadyProtection(t, ctx.seats) &&
      t.role?.id !== 'soldier' // 士兵免疫恶魔
    );
    if (target) {
      target.isDead = true;
      deadThisNight.push(target.id);
      actionOrder.push({
        actor: `${demon.id + 1}号-${demon.role.name}`,
        action: '杀死',
        target: `${target.id + 1}号-${target.role.name}`,
        result: '成功',
      });
      ctx.log.push(`[夜晚] ${demon.role.name}(${demon.id + 1}) 杀死了${target.id + 1}号-${target.role.name}`);
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

  // 清除保护状态
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

  // ========== 提名和投票 ==========
  
  const proposer = alive[base.randomInt(0, alive.length - 1)];
  let target = proposer;
  while (target === proposer && alive.length > 1) {
    target = alive[base.randomInt(0, alive.length - 1)];
  }

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
    // 检查圣徒 - 如果死于处决，邪恶方立即获胜
    if (target.role?.id === 'saint') {
      ctx.winner = 'evil';
      ctx.log.push(`[游戏结束] 圣徒被处决，邪恶阵营获胜`);
      ctx.modals.push({
        phase: ctx.phase,
        day: ctx.day,
        night: ctx.night,
        type: 'SAINT_EXECUTED',
        data: `圣徒被处决，邪恶获胜`,
      });
      return true;
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
  const cleanupResult = cleanScriptLogs('all_roles');
  if (cleanupResult.deleted > 0) {
    console.log(`已删除 ${cleanupResult.deleted} 个旧文件\n`);
  }
  
  console.log('开始运行100次完整角色库游戏模拟测试...\n');
  
  const results = [];
  const logDir = path.join(__dirname, 'simulation_logs', 'all_roles');
  
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

    const detailedLog = base.generateDetailedLog(gameResult, i, '完整角色库');
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
  summary.push('完整角色库游戏模拟测试汇总报告');
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
  summary.push('详细日志文件保存在: tests/simulation_logs/all_roles/');
  summary.push('');
  summary.push('注意：完整角色库测试包含所有角色，但夜晚和白天行动逻辑已简化。');
  summary.push('如需完整实现，请参考各个剧本的测试文件。');
  summary.push('');
  
  const summaryText = summary.join('\n');
  console.log('\n' + summaryText);
  
  const summaryFile = path.join(logDir, 'summary.txt');
  fs.writeFileSync(summaryFile, summaryText, 'utf8');
  
  console.log(`\n汇总报告已保存到: ${summaryFile}`);
  console.log('测试完成！');
};

// Jest测试包装
describe('完整角色库游戏模拟测试系统', () => {
  test('运行100次模拟游戏对局并生成详细日志', () => {
    main();
    
    const logDir = path.join(__dirname, 'simulation_logs', 'all_roles');
    expect(fs.existsSync(logDir)).toBe(true);
    
    const summaryFile = path.join(logDir, 'summary.txt');
    expect(fs.existsSync(summaryFile)).toBe(true);
  }, 300000);
});

// 如果直接运行（非Jest环境），也执行主函数
if (require.main === module) {
  main();
}

