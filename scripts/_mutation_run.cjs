/* eslint-disable */
/**
 * 逐角色语义变异检验 · **隔离模式**（临时脚本，用完即删）
 * ---------------------------------------------------------------
 * ⚠️ 工作树是团队共享的（同期有人在改生产代码），所以**不能**在开头一次性
 *   备份 32 个文件 —— 那会把别人的改动当成自己的基线，还原时反向覆盖。
 *
 * 本版安全策略（每轮）：
 *   1. 现读现备：`S = read(file)`（立刻读，不用脚本启动时的旧快照）
 *   2. 若文件 mtime 距今 < 30s ⇒ 判定"有人正在写"，**跳过**
 *   3. 写入变异体 `M`，跑测试
 *   4. 读回 `C`：
 *        · `C === M` ⇒ 期间无人写 ⇒ 还原 `S`（安全）
 *        · `C !== M` ⇒ 期间有人写过 ⇒ **不还原**（避免覆盖别人的修复），标记 CONFLICT
 *   5. 还原后再读一次，断言 === S
 *
 * 用法：node scripts/_mutation_run.cjs
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const ENG = path.join(ROOT, "src", "roles", "new_engine");

// [role, file, kind, find, replace]
const MUT = [
  ["chambermaid", "chambermaid.ability.ts", "LOGIC", "if (!isAbilityActive || hasVortox) {", "if (!isAbilityActive && hasVortox) {"],
  ["gossip", "gossip.ability.ts", "FIELD", "\n    max: 1,", "\n    max: 0,"],
  ["oracle", "oracle.ability.ts", "LOGIC", "const isAbilityActive = meta.isAbilityActive ?? true;", "const isAbilityActive = true;"],
  ["mathematician", "mathematician.ability.ts", "LOGIC", ".filter((n) => n !== abnormalCount);", ".filter((n) => n === abnormalCount);"],
  ["artist", "artist.ability.ts", "LOGIC", "const isAbilityActive = context.meta.abilityEffective ?? true;", "const isAbilityActive = true;"],
  ["flowergirl", "flowergirl.ability.ts", "LOGIC", "if (!isAbilityActive || hasVortox) {", "if (!isAbilityActive && hasVortox) {"],
  ["innkeeper", "innkeeper.ability.ts", "LOGIC", "targetIds.length !== 2", "targetIds.length !== 1"],
  ["fool", "fool.ability.ts", "LOGIC", "if (!canFoolSurvive(seat)) {", "if (canFoolSurvive(seat)) {"],
  ["saint", "saint.ability.ts", "LOGIC", "seat.executedToday === true", "seat.executedToday !== true"],
  ["recluse", "recluse.ability.ts", "LOGIC", 'registersAsRoleType: "minion",', 'registersAsRoleType: "demon",'],
  ["politician", "politician.ability.ts", "LOGIC", '"evil";', '"good";'],
  ["spy", "spy.ability.ts", "LOGIC", "    !abilityEffective,\n    rng\n  );", "    false,\n    rng\n  );"],
  ["witch", "witch.ability.ts", "LOGIC", "filter((s: any) => !s.isDead).length", "filter((s: any) => s.isDead).length"],
  ["assassin", "assassin.ability.ts", "FIELD", "otherNightPriority: 68,", "otherNightPriority: 69,"],
  ["devils_advocate", "devils_advocate.ability.ts", "LOGIC", "lastTarget != null && targetId === lastTarget", "lastTarget != null && targetId !== lastTarget"],
  ["vortox", "vortox.ability.ts", "LOGIC", "  if (!abilityEffective) {", "  if (abilityEffective) {"],
  ["po", "po.ability.ts", "LOGIC", "if (targetIds.length > 3) {", "if (targetIds.length > 2) {"],
  ["zombuul", "zombuul.ability.ts", "LOGIC", "lastDuskExecution !== null || dayDeaths > 0", "lastDuskExecution !== null && dayDeaths > 0"],
  ["plague_doctor", "plague_doctor.ability.ts", "FIELD", "allowDead: true", "allowDead: false"],
  ["undertaker", "undertaker.ability.ts", "LOGIC", 'nightCount === 1 || gamePhase === "firstNight"', 'nightCount === 1 && gamePhase === "firstNight"'],
  ["gambler", "gambler.ability.ts", "LOGIC", "const isGuessCorrect = targetRole === guessedRole;", "const isGuessCorrect = targetRole !== guessedRole;"],
  ["savant", "savant.ability.ts", "LOGIC", "const isCorrupted = !isAbilityActive || !abilityEffective || hasVortox;", "const isCorrupted = !isAbilityActive || !abilityEffective;"],
  ["juggler", "juggler.ability.ts", "LOGIC", "const isCorrupted = !isAbilityActive || hasVortox;", "const isCorrupted = !isAbilityActive;"],
  ["clockmaker", "clockmaker.ability.ts", "LOGIC", "const isAbilityActive = meta.isAbilityActive ?? true;", "const isAbilityActive = true;"],
  ["sailor", "sailor.ability.ts", "FIELD", "firstNightPriority: 23,", "firstNightPriority: 24,"],
  ["farmer", "farmer.ability.ts", "FIELD", "otherNightPriority: 85,", "otherNightPriority: 86,"],
  ["scapegoat", "scapegoat.ability.ts", "FIELD", "min: 0, max: 0, allowSelf: false, allowDead: false", "min: 1, max: 1, allowSelf: false, allowDead: false"],
  ["drunk", "drunk.ability.ts", "LOGIC", 'nightCount !== 1 && gamePhase !== "firstNight"', 'nightCount !== 1 || gamePhase !== "firstNight"'],
  ["mutant", "mutant.ability.ts", "FIELD", "min: 0, max: 0, allowSelf: false, allowDead: false", "min: 1, max: 1, allowSelf: false, allowDead: false"],
  ["baron", "baron.ability.ts", "LOGIC", 'const isDrunk = effects.some((e: any) => e.type === "drunk");', 'const isDrunk = effects.some((e: any) => e.type === "poisoned");'],
  ["poisoner", "poisoner.ability.ts", "LOGIC", "  if (!abilityEffective) {", "  if (abilityEffective) {"],
  ["shabaloth", "shabaloth.ability.ts", "LOGIC", "if (targetIds.length !== 2) {", "if (targetIds.length !== 3) {"],
];

const TEST_CMD =
  'NODE_OPTIONS="" npx vitest run src/roles/__tests__/full/ws_l1_l2.test.ts ' +
  "src/roles/__tests__/full/ws_l3_ui.test.tsx " +
  "src/roles/__tests__/full/ws_l5_causal.test.ts --testTimeout=20000 --reporter=dot";

/** 带重试的写入（沙箱备份层会偶发 EPERM 锁文件） */
function writeRetry(p, content) {
  let last;
  for (let i = 0; i < 8; i++) {
    try {
      fs.writeFileSync(p, content);
      return;
    } catch (e) {
      last = e;
      const t = Date.now() + 400;
      while (Date.now() < t);
    }
  }
  throw last;
}

const results = [];
for (const [role, file, kind, find, replace] of MUT) {
  const p = path.join(ENG, file);
  const rec = { role, file, kind, status: "", detail: "", clean: null, base: "" };
  const rel = path.relative(ROOT, p).replace(/\\/g, "/");

  // 1) 现读现备 + 活跃度检查
  const S = fs.readFileSync(p, "utf8");
  try {
    rec.base = execSync(`git status --porcelain "${rel}"`, { cwd: ROOT })
      .toString()
      .trim()
      ? "DIRTY(基线非 HEAD)"
      : "clean";
  } catch {
    rec.base = "git?";
  }
  const ageMs = Date.now() - fs.statSync(p).mtimeMs;
  if (ageMs < 60_000) {
    rec.status = `SKIP(文件 ${Math.round(ageMs / 1000)}s 前被写过，疑似并发编辑)`;
    results.push(rec);
    console.log(`[${results.length}/${MUT.length}] ${role} ${rec.status}`);
    continue;
  }
  const n = S.split(find).length - 1;
  if (n !== 1) {
    rec.status = `SKIP(变异目标命中 ${n} 处 ≠ 1)`;
    results.push(rec);
    console.log(`[${results.length}/${MUT.length}] ${role} ${rec.status}`);
    continue;
  }
  const M = S.replace(find, replace);

  // 2) 写入变异体
  try {
    writeRetry(p, M);
  } catch (e) {
    rec.status = `SKIP(写入失败 ${e.code})`;
    results.push(rec);
    console.log(`[${results.length}/${MUT.length}] ${role} ${rec.status}`);
    continue;
  }

  // 3) 跑测试
  let red = false;
  try {
    execSync(TEST_CMD, { cwd: ROOT, stdio: "pipe" });
  } catch (e) {
    red = true;
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    const m = out.match(/Tests\s+([^\n]*)/);
    rec.detail = m ? m[1].trim() : "exit!=0";
  }

  // 4) 冲突检测 + 还原
  const C = fs.readFileSync(p, "utf8");
  if (C !== M) {
    rec.status = "CONFLICT(测试期间第三方写入，已放弃还原以免覆盖)";
  } else {
    try {
      writeRetry(p, S);
      rec.clean = fs.readFileSync(p, "utf8") === S;
      rec.status = red ? "RED" : "GREEN(未捕获)";
    } catch (e) {
      rec.status = `RESTORE_FAIL(${e.code})`;
    }
  }
  results.push(rec);
  console.log(
    `[${results.length}/${MUT.length}] ${role.padEnd(16)} ${kind} => ${rec.status} ${rec.detail} | 基线=${rec.base} | 还原=${rec.clean === null ? "n/a" : rec.clean ? "OK" : "FAIL"}`
  );
}

// 5) 汇总
console.log("\n================ 汇总 ================");
for (const r of results) console.log(JSON.stringify(r));
const red = results.filter((r) => r.status === "RED").length;
const green = results.filter((r) => r.status === "GREEN(未捕获)").length;
const skip = results.filter((r) => r.status.startsWith("SKIP") || r.status.startsWith("CONFLICT")).length;
console.log(`\nRED(被捕获)=${red}  GREEN(未捕获)=${green}  SKIP/CONFLICT=${skip}  总=${results.length}`);
const bad = results.filter((r) => r.clean === false || r.status.startsWith("RESTORE_FAIL"));
console.log(`还原失败的文件：${bad.length === 0 ? "0" : bad.map((r) => r.file).join(", ")}`);
