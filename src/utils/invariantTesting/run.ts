/**
 * L3.5 不变式测试 - 独立运行入口
 *
 * 运行：cd clocktower-helper && npx tsx src/utils/invariantTesting/run.ts [seed] [nights] [playerCount]
 *
 * 输出：逐不变式通过/失败清单 + 违规明细 + 汇总。
 * 退出码：0 = 全部通过；1 = 存在违规。
 */
import {
  buildAbilityMap,
  buildFullNightOrder,
  generateRandomGame,
  I6PriorityMatchesOfficialOrder,
  I8AbilityConfigConsistent,
  runAllInvariants,
  simulateNight,
  TROUBLE_BREWING_ROLES,
} from "./index";

function formatMap(map: Map<string, string[]>): string {
  if (map.size === 0) return "  ✅ 全部不变式通过";
  const lines: string[] = [];
  for (const [name, errs] of map) {
    lines.push(`  ❌ ${name}（${errs.length} 处违规）`);
    for (const e of errs.slice(0, 8)) {
      lines.push(`      - ${e}`);
    }
    if (errs.length > 8) lines.push(`      ... 还有 ${errs.length - 8} 处`);
  }
  return lines.join("\n");
}

async function main() {
  const seed = Number(process.argv[2] ?? 20260814);
  const nights = Number(process.argv[3] ?? 2);
  const playerCount = Number(process.argv[4] ?? 7);

  console.log("========================================");
  console.log("L3.5 不变式测试（随机对局 + 不变式断言）");
  console.log(`种子=${seed} 夜数=${nights} 玩家数=${playerCount}`);
  console.log("========================================");

  const fullNightOrder = buildFullNightOrder();
  const abilityMap = buildAbilityMap();
  console.log(
    `引擎配置：夜间队列条目 ${fullNightOrder.length}，能力注册 ${Object.keys(abilityMap).length}\n`
  );

  // ── 静态不变式（不依赖对局）──
  console.log("── 静态不变式 ──");
  const staticResult = {
    initialSnapshot: {
      nightCount: 1,
      seats: [],
      statusEffects: {},
      gamePhase: "firstNight",
    },
    finalSnapshot: {
      nightCount: 1,
      seats: [],
      statusEffects: {},
      gamePhase: "firstNight",
    },
    queue: [],
    actions: [],
    nightCount: 1,
    isFirstNight: true,
  } as any;
  const i6 = await I6PriorityMatchesOfficialOrder(staticResult, abilityMap);
  const tbPool = new Set(TROUBLE_BREWING_ROLES.map((r) => r.id));
  const i8 = await I8AbilityConfigConsistent(staticResult, abilityMap, tbPool);
  console.log(
    `  I6 文档对撞（JSON→能力注册）: ${i6.length === 0 ? "✅ 通过" : `❌ ${i6.length} 处违规`}`
  );
  for (const e of i6) console.log(`      - ${e}`);
  console.log(
    `  I8 能力配置自洽: ${i8.length === 0 ? "✅ 通过" : `❌ ${i8.length} 处违规`}`
  );
  for (const e of i8) console.log(`      - ${e}`);
  console.log("");

  // ── 随机对局不变式 ──
  const game = generateRandomGame({
    playerCount,
    nights,
    seed,
    poisonPerNight: 1,
    drunkPerNight: 1,
    rolePool: TROUBLE_BREWING_ROLES,
  });

  let totalViolations = 0;
  for (const snapshot of game.snapshots) {
    console.log(
      `── 第 ${snapshot.nightCount} 夜（${snapshot.seats.length} 人局）──`
    );
    const result = await simulateNight(snapshot, {
      nightCount: snapshot.nightCount,
      fullNightOrder,
      abilityMap,
      seed,
    });
    console.log(
      `  夜间队列 ${result.queue.length} 个节点，执行 ${result.actions.length} 个动作`
    );
    for (const a of result.actions) {
      const st = a.aborted ? "⛔中止" : "✓";
      console.log(
        `    ${st} ${a.node.roleId}(${a.node.seatId + 1}号) 目标=[${a.targetIds.map((t) => t + 1).join(",") || "-"}]${a.abortReason ? ` ${a.abortReason}` : ""}`
      );
    }
    const violations = await runAllInvariants(result, abilityMap, tbPool);
    totalViolations += Array.from(violations.values()).reduce(
      (n, arr) => n + arr.length,
      0
    );
    console.log(formatMap(violations));
    console.log("");
  }

  console.log("========================================");
  console.log(
    totalViolations === 0
      ? `✅ 全部 ${nights} 夜不变式通过（种子 ${seed}）`
      : `❌ 共 ${totalViolations} 处违规（种子 ${seed}）`
  );
  console.log("========================================");
  process.exit(totalViolations > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("不变式测试执行异常:", e);
  process.exit(1);
});
