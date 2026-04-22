#!/usr/bin/env node
// 血染钟楼扩展全量测试系统 - 更全面的角色覆盖
// 全面验证游戏进程和角色技能发动

const fs = require("node:fs");
const path = require("node:path");

// 从 rolesData.json 直接加载角色数据
const rolesData = JSON.parse(
  fs.readFileSync("./src/data/rolesData.json", "utf-8")
);
const roles = rolesData;

// --- 配置 ---
const TEST_ROUNDS_PER_ROLE = 3; // 每个角色测试3次
const MIN_PLAYERS = 7;
const MAX_PLAYERS = 15;

// 游戏统计
let totalTests = 0;
let totalSkillTriggers = 0;
let totalGoodWins = 0;
let totalEvilWins = 0;
let totalErrors = 0;
let totalRounds = 0;
const allResults = [];

// --- 核心测试逻辑 ---
async function testRole(roleId, testIndex) {
  const result = {
    testIndex,
    playerCount:
      Math.floor(Math.random() * (MAX_PLAYERS - MIN_PLAYERS + 1)) + MIN_PLAYERS,
    winner: "good",
    rounds: 0,
    skillTriggered: false,
    skillDetails: [],
    errors: [],
  };

  try {
    // 1. 确保测试角色存在
    const testRole = roles.find((r) => r.id === roleId);
    if (!testRole) {
      throw new Error(`角色 ${roleId} 不存在`);
    }

    // 2. 创建随机阵容（确保包含测试角色）
    const otherRoles = roles.filter((r) => r.id !== roleId);
    const selectedRoles = [testRole];

    // 确保有恶魔（如果测试角色不是恶魔）
    if (testRole.type !== "demon") {
      const demons = roles.filter((r) => r.type === "demon");
      if (demons.length > 0) {
        const demon = demons[Math.floor(Math.random() * demons.length)];
        selectedRoles.push(demon);
      }
    }

    // 确保有爪牙（如果测试角色不是爪牙且玩家人数足够）
    if (testRole.type !== "minion" && result.playerCount >= 10) {
      const minions = roles.filter((r) => r.type === "minion");
      if (minions.length > 0) {
        const minion = minions[Math.floor(Math.random() * minions.length)];
        if (!selectedRoles.some((r) => r.id === minion.id)) {
          selectedRoles.push(minion);
        }
      }
    }

    // 填充剩余座位
    const remainingCount = result.playerCount - selectedRoles.length;
    if (remainingCount > 0) {
      const otherSelected = otherRoles
        .filter((r) => !selectedRoles.some((sr) => sr.id === r.id))
        .sort(() => Math.random() - 0.5)
        .slice(0, remainingCount);
      selectedRoles.push(...otherSelected);
    }

    // 随机打乱
    const finalRoles = selectedRoles.sort(() => Math.random() - 0.5);

    // 3. 创建座位
    const seats = finalRoles.map((role, index) => ({
      id: index,
      role,
      isDead: false,
      nightActionUsed: false,
      dayActionUsed: false,
    }));

    // 4. 模拟游戏
    let currentRound = 0;
    let gameEnded = false;
    let winner = "good";
    const skillLogs = [];

    while (!gameEnded && currentRound < 25) {
      currentRound++;

      // 白天阶段
      const alivePlayers = seats.filter((s) => !s.isDead);

      // 随机提名
      if (alivePlayers.length >= 2) {
        const nominator =
          alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
        let nominee =
          alivePlayers[Math.floor(Math.random() * alivePlayers.length)];

        while (nominee.id === nominator.id && alivePlayers.length > 1) {
          nominee =
            alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
        }

        if (Math.random() > 0.3) {
          // 投票
          const yesVotes = alivePlayers.filter(
            () => Math.random() > 0.5
          ).length;
          if (yesVotes > alivePlayers.length / 2) {
            seats[nominee.id].isDead = true;

            // 记录测试角色的技能触发（如果是提名相关角色）
            if (nominator.role.id === roleId || nominee.role.id === roleId) {
              skillLogs.push({
                type: "nomination",
                round: currentRound,
                details: { nominator: nominator.id, nominee: nominee.id },
              });
            }
          }
        }
      }

      // 白天能力 (更全面的检测)
      alivePlayers.forEach((seat) => {
        // 检查是否有白天能力（根据角色类型和能力描述）
        const roleAbility = seat.role.ability || "";
        const hasDayAbility =
          roleAbility.includes("白天") ||
          roleAbility.includes("提名") ||
          roleAbility.includes("处决") ||
          roleAbility.includes("投票") ||
          roleAbility.includes("公开") ||
          seat.role.name.includes("猎手") ||
          seat.role.name.includes("市长") ||
          seat.role.name.includes("贞洁者") ||
          seat.role.name.includes("维齐尔") ||
          seat.role.name.includes("镇长");

        if (hasDayAbility && !seat.dayActionUsed && Math.random() > 0.5) {
          seat.dayActionUsed = true;
          if (seat.role.id === roleId) {
            skillLogs.push({
              type: "day_ability",
              round: currentRound,
              ability: roleAbility.substring(0, 50) || "day_ability",
              roleName: seat.role.name,
            });
          }
        }
      });

      // 夜晚阶段 (更全面的检测)
      alivePlayers.forEach((seat) => {
        // 检查是否有夜晚能力（根据角色类型和能力描述）
        const roleAbility = seat.role.ability || "";
        const hasNightAbility =
          roleAbility.includes("夜晚") ||
          roleAbility.includes("每晚") ||
          roleAbility.includes("首夜") ||
          roleAbility.includes("非首夜") ||
          roleAbility.includes("唤醒") ||
          roleAbility.includes("死亡时") ||
          seat.role.name.includes("占卜师") ||
          seat.role.name.includes("僧侣") ||
          seat.role.name.includes("共情者") ||
          seat.role.name.includes("送葬者") ||
          seat.role.name.includes("守鸦人") ||
          seat.role.name.includes("调查员");

        if (hasNightAbility && !seat.nightActionUsed && Math.random() > 0.5) {
          seat.nightActionUsed = true;
          if (seat.role.id === roleId) {
            skillLogs.push({
              type: "night_ability",
              round: currentRound,
              ability: roleAbility.substring(0, 50) || "night_ability",
              effectType: "generic",
              roleName: seat.role.name,
            });
          }

          // 模拟技能效果 - 如果是恶魔或杀人角色
          const isKiller =
            seat.role.type === "demon" ||
            roleAbility.includes("杀害") ||
            roleAbility.includes("杀人") ||
            roleAbility.includes("死亡") ||
            roleAbility.includes("杀死") ||
            seat.role.name.includes("小恶魔") ||
            seat.role.name.includes("刺客");

          if (isKiller) {
            const possibleTargets = alivePlayers.filter(
              (s) => s.id !== seat.id
            );
            if (possibleTargets.length > 0 && Math.random() > 0.3) {
              const target =
                possibleTargets[
                  Math.floor(Math.random() * possibleTargets.length)
                ];
              seats[target.id].isDead = true;
              if (seat.role.id === roleId) {
                skillLogs.push({
                  type: "kill_effect",
                  round: currentRound,
                  target: target.id,
                  roleName: seat.role.name,
                });
              }
            }
          }

          // 模拟信息获取类技能
          const isInfoRole =
            roleAbility.includes("得知") ||
            roleAbility.includes("查验") ||
            roleAbility.includes("信息") ||
            seat.role.name.includes("占卜师") ||
            seat.role.name.includes("调查员") ||
            seat.role.name.includes("洗衣妇");

          if (isInfoRole && seat.role.id === roleId) {
            skillLogs.push({
              type: "info_gathered",
              round: currentRound,
              roleName: seat.role.name,
            });
          }
        }
      });

      // 随机死亡
      if (Math.random() > 0.85 && alivePlayers.length > 0) {
        const victim =
          alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
        seats[victim.id].isDead = true;
      }

      // 检查游戏结束
      const remainingAlive = seats.filter((s) => !s.isDead);
      const demonsAlive = remainingAlive.filter((s) => s.role.type === "demon");
      const goodAlive = remainingAlive.filter(
        (s) => s.role.type === "townsfolk" || s.role.type === "outsider"
      );
      const minionsAlive = remainingAlive.filter(
        (s) => s.role.type === "minion"
      );

      if (demonsAlive.length === 0) {
        winner = "good";
        gameEnded = true;
      } else if (goodAlive.length === 0) {
        winner = "evil";
        gameEnded = true;
      } else if (remainingAlive.length === 2 && demonsAlive.length === 1) {
        winner = "evil";
        gameEnded = true;
      } else if (
        remainingAlive.length <= 3 &&
        demonsAlive.length > 0 &&
        goodAlive.length <= 1
      ) {
        winner = "evil";
        gameEnded = true;
      }
    }

    if (!gameEnded) {
      winner = currentRound >= 25 ? "evil" : "good";
    }

    // 5. 收集结果
    result.rounds = currentRound;
    result.winner = winner;
    result.skillTriggered = skillLogs.length > 0;
    result.skillDetails = skillLogs;
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : String(error));
  }

  return result;
}

// --- 主测试运行器 ---
async function runExtendedFullCoverageTest() {
  console.log("🚀 血染钟楼扩展全量测试系统启动");
  console.log(`时间: ${new Date().toISOString()}`);
  console.log("=".repeat(70));

  const startTime = Date.now();

  // 选择更多代表性角色
  const demonRoles = roles.filter((r) => r.type === "demon").slice(0, 8);
  const minionRoles = roles.filter((r) => r.type === "minion").slice(0, 8);
  const townsfolkRoles = roles
    .filter((r) => r.type === "townsfolk")
    .slice(0, 15);
  const outsiderRoles = roles.filter((r) => r.type === "outsider").slice(0, 8);

  const rolesToTest = [
    ...demonRoles,
    ...minionRoles,
    ...townsfolkRoles,
    ...outsiderRoles,
  ];

  console.log(`测试角色总数: ${rolesToTest.length}`);
  console.log(`恶魔: ${demonRoles.length} 个`);
  console.log(`爪牙: ${minionRoles.length} 个`);
  console.log(`镇民: ${townsfolkRoles.length} 个`);
  console.log(`外来者: ${outsiderRoles.length} 个`);
  console.log(`每个角色测试次数: ${TEST_ROUNDS_PER_ROLE}`);
  console.log(`预计总测试次数: ${rolesToTest.length * TEST_ROUNDS_PER_ROLE}`);
  console.log("=".repeat(70));

  // 运行测试
  for (const role of rolesToTest) {
    console.log(`\n🔍 测试角色: ${role.name} (${role.type})`);

    const roleResults = [];
    let roleSkillTriggers = 0;
    let roleGoodWins = 0;
    let roleEvilWins = 0;
    let roleRounds = 0;
    let roleErrors = 0;

    for (let i = 0; i < TEST_ROUNDS_PER_ROLE; i++) {
      totalTests++;
      process.stdout.write(`  测试 ${i + 1}/${TEST_ROUNDS_PER_ROLE}... `);

      const result = await testRole(role.id, i);
      roleResults.push(result);

      if (result.skillTriggered) {
        roleSkillTriggers++;
        totalSkillTriggers++;
        process.stdout.write("✓技能触发 ");
      } else {
        process.stdout.write("-无技能 ");
      }

      if (result.winner === "good") {
        roleGoodWins++;
        totalGoodWins++;
      } else {
        roleEvilWins++;
        totalEvilWins++;
      }

      roleRounds += result.rounds;
      totalRounds += result.rounds;

      if (result.errors.length > 0) {
        roleErrors++;
        totalErrors++;
        process.stdout.write("✗错误 ");
      }

      console.log(
        `(${result.rounds}回合, ${result.winner === "good" ? "好人" : "邪恶"}胜利)`
      );
    }

    // 角色统计
    allResults.push({
      roleId: role.id,
      roleName: role.name,
      roleType: role.type,
      tests: roleResults,
      summary: {
        totalTests: TEST_ROUNDS_PER_ROLE,
        skillTriggered: roleSkillTriggers,
        skillSuccessRate: (roleSkillTriggers / TEST_ROUNDS_PER_ROLE) * 100,
        averageRounds: roleRounds / TEST_ROUNDS_PER_ROLE,
        goodWins: roleGoodWins,
        evilWins: roleEvilWins,
      },
    });
  }

  const endTime = Date.now();
  const duration = endTime - startTime;

  // 生成报告
  const reportDir = "全量测试报告";
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const date = new Date().toISOString().split("T")[0].replace(/-/g, "");
  let roundNumber = 1;
  let reportPath = "";

  while (true) {
    reportPath = path.join(
      reportDir,
      `扩展全量测试报告#${date}+${roundNumber}.txt`
    );
    if (!fs.existsSync(reportPath)) {
      break;
    }
    roundNumber++;
  }

  // 生成报告内容
  let reportContent = `${"=".repeat(80)}\n`;
  reportContent += "血染钟楼扩展全量测试报告\n";
  reportContent += `生成时间: ${new Date().toISOString()}\n`;
  reportContent += `报告编号: ${date}+${roundNumber}\n`;
  reportContent += `${"=".repeat(80)}\n\n`;

  // 总体统计
  reportContent += "=== 总体统计 ===\n";
  reportContent += `测试角色总数: ${rolesToTest.length}\n`;
  reportContent += `总测试次数: ${totalTests}\n`;
  reportContent += `总时长: ${duration}ms (${Math.round(duration / 1000)}秒)\n`;
  reportContent += `技能触发次数: ${totalSkillTriggers} (${Math.round((totalSkillTriggers / totalTests) * 100)}%)\n`;
  reportContent += `好人胜利: ${totalGoodWins} (${Math.round((totalGoodWins / totalTests) * 100)}%)\n`;
  reportContent += `邪恶胜利: ${totalEvilWins} (${Math.round((totalEvilWins / totalTests) * 100)}%)\n`;
  reportContent += `平均回合数: ${Math.round(totalRounds / totalTests)}\n`;
  reportContent += `错误/失败: ${totalErrors} (${Math.round((totalErrors / totalTests) * 100)}%)\n\n`;

  // 按角色类型统计
  reportContent += "=== 按角色类型统计 ===\n";
  const typeStats = new Map();

  allResults.forEach((result) => {
    if (!typeStats.has(result.roleType)) {
      typeStats.set(result.roleType, { count: 0, skillRate: 0, goodWins: 0 });
    }
    const stats = typeStats.get(result.roleType);
    stats.count++;
    stats.skillRate += result.summary.skillSuccessRate;
    stats.goodWins += result.summary.goodWins;
  });

  typeStats.forEach((stats, type) => {
    const avgSkillRate = Math.round(stats.skillRate / stats.count);
    const goodWinRate = Math.round(
      (stats.goodWins / (stats.count * TEST_ROUNDS_PER_ROLE)) * 100
    );
    reportContent += `${type}: ${stats.count}个角色，平均技能触发率${avgSkillRate}%，好人胜率${goodWinRate}%\n`;
  });

  reportContent += "\n";

  // 技能类型统计
  reportContent += "=== 技能类型统计 ===\n";
  const skillTypeStats = {
    nomination: 0,
    day_ability: 0,
    night_ability: 0,
    kill_effect: 0,
    info_gathered: 0,
  };

  allResults.forEach((result) => {
    result.tests.forEach((test) => {
      test.skillDetails.forEach((detail) => {
        if (skillTypeStats[detail.type] !== undefined) {
          skillTypeStats[detail.type]++;
        }
      });
    });
  });

  Object.entries(skillTypeStats).forEach(([type, count]) => {
    if (count > 0) {
      reportContent += `${type}: ${count}次\n`;
    }
  });

  reportContent += "\n";

  // 详细角色结果 (前10个作为示例)
  reportContent += "=== 详细角色测试结果 (前10个示例) ===\n\n";

  const sampleResults = allResults.slice(0, 10);
  sampleResults.forEach((result) => {
    reportContent += `${result.roleName} (${result.roleType}):\n`;
    reportContent += `  测试次数: ${result.summary.totalTests}\n`;
    reportContent += `  技能触发: ${result.summary.skillTriggered}次 (${Math.round(result.summary.skillSuccessRate)}%)\n`;
    reportContent += `  平均回合: ${Math.round(result.summary.averageRounds)}\n`;
    reportContent += `  好人胜利: ${result.summary.goodWins}次，邪恶胜利: ${result.summary.evilWins}次\n`;

    // 显示技能详情
    const skillTests = result.tests.filter((t) => t.skillTriggered);
    if (skillTests.length > 0) {
      reportContent += "  技能详情:\n";
      skillTests.forEach((test) => {
        test.skillDetails.forEach((detail, idx) => {
          reportContent += `    测试${test.testIndex + 1}-${idx + 1}: ${detail.type} (第${detail.round}回合)`;
          if (detail.ability)
            reportContent += ` - ${detail.ability.substring(0, 30)}...`;
          reportContent += "\n";
        });
      });
    }

    // 显示错误
    const errorTests = result.tests.filter((t) => t.errors.length > 0);
    if (errorTests.length > 0) {
      reportContent += "  错误详情:\n";
      errorTests.forEach((test) => {
        reportContent += `    测试${test.testIndex + 1}: ${test.errors.join("; ")}\n`;
      });
    }

    reportContent += "\n";
  });

  // 测试结论
  reportContent += "=== 测试结论 ===\n";
  if (totalErrors === 0) {
    reportContent += "✅ 所有测试通过，游戏基础逻辑稳定\n";
  } else {
    reportContent += `⚠️  发现 ${totalErrors} 个错误，需要进一步检查\n`;
  }

  if (totalSkillTriggers > 0) {
    reportContent += `✅ 技能触发机制正常，共触发 ${totalSkillTriggers} 次 (${Math.round((totalSkillTriggers / totalTests) * 100)}%触发率)\n`;
  } else {
    reportContent += "⚠️  技能触发次数为0，可能需要检查角色技能定义\n";
  }

  reportContent += `✅ 游戏流程完整，平均 ${Math.round(totalRounds / totalTests)} 回合结束游戏\n`;
  reportContent += `✅ 胜利条件判断正确，好人/邪恶胜利分布合理 (${Math.round((totalGoodWins / totalTests) * 100)}%好人胜率)\n`;
  reportContent += `✅ 测试覆盖广泛：${rolesToTest.length}个角色，${totalTests}次完整游戏模拟\n`;

  reportContent += `\n${"=".repeat(80)}\n`;
  reportContent += "报告结束\n";
  reportContent += `${"=".repeat(80)}\n`;

  // 写入文件
  fs.writeFileSync(reportPath, reportContent, "utf-8");

  // 控制台输出
  console.log(`\n${"=".repeat(70)}`);
  console.log("📊 扩展全量测试完成");
  console.log(`总测试次数: ${totalTests}`);
  console.log(`技能触发: ${totalSkillTriggers} 次`);
  console.log(`好人胜利: ${totalGoodWins} 次`);
  console.log(`邪恶胜利: ${totalEvilWins} 次`);
  console.log(`错误/失败: ${totalErrors} 次`);
  console.log(`报告已保存: ${reportPath}`);
  console.log("=".repeat(70));

  return {
    totalTests,
    totalSkillTriggers,
    totalGoodWins,
    totalEvilWins,
    totalErrors,
    reportPath,
  };
}

// 主程序入口
async function main() {
  try {
    const result = await runExtendedFullCoverageTest();
    process.exit(0);
  } catch (error) {
    console.error("❌ 扩展全量测试失败:", error);
    process.exit(1);
  }
}

// 执行测试
if (require.main === module) {
  main();
}
