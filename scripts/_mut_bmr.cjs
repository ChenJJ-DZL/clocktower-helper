#!/usr/bin/env node
/**
 * BMR 细粒度变异检验驱动器
 *   node scripts/_mut_bmr.cjs <role1,role2,...>
 *   node scripts/_mut_bmr.cjs --all
 * 每个角色：备份 -> 精确字符串替换(必须命中1次) -> 跑目标 describe -> **立即还原** -> 判定
 * KILLED   = 测试变红（测试对该逻辑有效）
 * SURVIVED = 测试仍绿（测试对该逻辑无效，需补测试）
 * ⚠️ 只做精确字符串替换；命中数 != 1 直接放弃且不改文件。
 * ⚠️ 逐角色「改—跑—还原」，绝不留变异态。
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const crypto = require("crypto");
const sha = (t) => crypto.createHash("sha256").update(t, "utf8").digest("hex").slice(0, 12);

const ROOT = path.resolve(__dirname, "..");
const ABIL = "src/roles/new_engine/";
const TEST = "src/roles/__tests__/full/bmr_l5_causal.test.ts";

/** role -> [能力文件, describe 过滤器, find, replace] */
const M = {
  grandmother: ["grandmother.ability.ts", "L5 · 祖母",
    `    if (grandchildId === undefined || grandchildId === null) {`,
    `    if (grandchildId === undefined) {`],
  sailor: ["sailor.ability.ts", "L5 · 水手",
    `    const targetIsTownsfolk = targetSeat.role?.type === "townsfolk";`,
    `    const targetIsTownsfolk = targetSeat.role?.type === "minion";`],
  chambermaid: ["chambermaid.ability.ts", "L5 · 侍女",
    `    const realWokenCount = targetIds.filter((tid: number) =>
      wokenPlayers.has(tid)
    ).length;`,
    `    const realWokenCount = targetIds.filter((tid: number) =>
      !wokenPlayers.has(tid)
    ).length;`],
  exorcist: ["exorcist.ability.ts", "L5 · 驱魔人",
    `    (targetSeat?.role?.type === "demon" ||`,
    `    (targetSeat?.role?.type === "minion" ||`],
  innkeeper: ["innkeeper.ability.ts", "L5 · 旅店老板",
    `        (seat.id === result.target1Id || seat.id === result.target2Id);`,
    `        (seat.id === result.target1Id);`],
  gambler: ["gambler.ability.ts", "L5 · 赌徒",
    `  const shouldDie = !isGuessCorrect && !isProtected;`,
    `  const shouldDie = !isGuessCorrect;`],
  gossip: ["gossip.ability.ts", "L5 · 造谣者",
    `  if (!seat || seat.isDead) {`,
    `  if (!seat) {`],
  courtier: ["courtier.ability.ts", "L5 · 侍臣",
    `    if (r.isAbilityActive && r.targetSeatId != null && seat.id === r.targetSeatId) {`,
    `    if (r.isAbilityActive && r.targetSeatId != null && seat.id === ctx.actionNode.seatId) {`],
  professor: ["professor.ability.ts", "L5 · 教授",
    `  const isTownsfolk = actualRole?.type === "townsfolk";`,
    `  const isTownsfolk = actualRole?.type === "minion";`],
  minstrel: ["minstrel.ability.ts", "L5 · 吟游诗人",
    `    (executedSeat.role?.type ?? (executedSeat as any).roleType) === "minion";`,
    `    (executedSeat.role?.type ?? (executedSeat as any).roleType) === "demon";`],
  tea_lady: ["tea_lady.ability.ts", "L5 · 茶艺师",
    `  if (bothGood && left && right) {`,
    `  if (left && right) {`],
  pacifist: ["pacifist.ability.ts", "L5 · 和平主义者",
    `    shouldSave: isGoodExecuted && shouldSave,`,
    `    shouldSave,`],
  fool: ["fool.ability.ts", "L5 · 弄臣",
    `  if (!canFoolSurvive(seat)) {`,
    `  if (canFoolSurvive(seat)) {`],
  tinker: ["tinker.ability.ts", "L5 · 修补匠",
    `  const shouldDie = wantsToKill && !isProtected;`,
    `  const shouldDie = wantsToKill;`],
  moonchild: ["moonchild.ability.ts", "L5 · 月之子",
    `  const shouldKill = targetIsGood && isAbilityEffective;`,
    `  const shouldKill = targetIsGood;`],
  goon: ["goon.ability.ts", "L5 · 莽夫",
    `  const isChooserEvil = !isGoodSeat(chooserSeat);`,
    `  const isChooserEvil = isGoodSeat(chooserSeat);`],
  lunatic: ["lunatic.ability.ts", "L5 · 疯子",
    `    s.id === actorSeatId`,
    `    s.id === -1`],
  godfather: ["godfather.ability.ts", "L5 · 教父",
    `              deathSource: "godfather_kill",`,
    `              deathSource: "minion_kill",`],
  devils_advocate: ["devils_advocate.ability.ts", "L5 · 魔鬼代言人",
    `        protected: isAbilityActive,`,
    `        protected: true,`],
  assassin: ["assassin.ability.ts", "L5 · 刺客",
    `  if (snapshot.isFirstNight) {`,
    `  if (!snapshot.isFirstNight) {`],
  mastermind: ["mastermind.ability.ts", "L5 · 主谋",
    `  const demonExecuted = ctx.snapshot.demonExecutedToday === true;`,
    `  const demonExecuted = ctx.snapshot.demonExecutedToday !== false;`],
  zombuul: ["zombuul.ability.ts", "L5 · 僵怖",
    `  if (lastDuskExecution !== null || dayDeaths > 0) {`,
    `  if (lastDuskExecution !== null && dayDeaths > 0) {`],
  pukka: ["pukka.ability.ts", "L5 · 普卡",
    `          deathSource: "pukka_poison_death",`,
    `          deathSource: "pukka_kill",`],
  shabaloth: ["shabaloth.ability.ts", "L5 · 沙巴洛斯",
    `  if (targetIds.length !== 2) {`,
    `  if (targetIds.length === 2) {`],
  po: ["po.ability.ts", "L5 · 珀",
    `          deathSource: "po_kill",`,
    `          deathSource: "po_attack",`],
};

const args = process.argv.slice(2);
const list = args[0] === "--all" ? Object.keys(M) : (args[0] || "").split(",").filter(Boolean);
if (!list.length) { console.error("用法: node scripts/_mut_bmr.cjs <role,...> | --all"); process.exit(2); }

const results = [];
for (const role of list) {
  const row = M[role];
  if (!row) { console.error(`!! 未知角色 ${role}`); results.push([role, "N/A", "未知角色"]); continue; }
  const [file, filter, find, repl] = row;
  const target = path.join(ROOT, ABIL + file);
  const original = fs.readFileSync(target, "utf8");
  const hits = original.split(find).length - 1;
  if (hits !== 1) {
    console.log(`\n== [${role}] 锚点在 ${file} 命中 ${hits} 次(要求1) -- 放弃，未改动 ==`);
    results.push([role, "ABORT", `锚点命中 ${hits} 次`]);
    continue;
  }
  let verdict = "?", summary = "", extra = "";
  try {
    fs.writeFileSync(target, original.replace(find, repl), "utf8");
    // ⚠️ 三种失败写法都试过，记录在此避免重犯：
    //   ① spawnSync("npx", [...], {shell:true})  —— cmd.exe 拼接时不加引号，
    //      `-t "L5 · 祖母"` 被按空格拆开 ⇒ vitest 参数错误 ⇒ 退出码非 0 ⇒ **全部假 KILLED**。
    //   ② spawnSync(process.execPath, [vitest.mjs, ...]) —— 本机 process.execPath 不是 node，
    //      进程起不来 ⇒ status=null、输出 0 字符。
    //   ③ 最终采用：bash -c + **单引号包裹过滤器**（参数按数组传给 bash，不经 shell 拼接），
    //      中文过滤器与空格都能原样送达，且 exit code 真实反映测试结果。
    const shq = "'" + String(filter).replace(/'/g, "'\\''") + "'";
    const cmd = `NODE_OPTIONS="" npx vitest run ${TEST} --testTimeout=20000 -t ${shq}`;
    // ⚠️ 必须用 **绝对路径** 的 Git Bash：宿主进程的 PATH 里没有 bash（裸 "bash" ⇒ spawn 失败、status=null）。
    const BASH = fs.existsSync("C:/Program Files/Git/bin/bash.exe")
      ? "C:/Program Files/Git/bin/bash.exe"
      : "bash";
    // ⚠️⚠️ 本机沙箱禁止给子进程接 **管道**（stdio:"pipe" ⇒ spawnSync 返回 EBUSY、status=null、
    //     输出 0 字符 ⇒ 会把「命令根本没跑」误判成 KILLED）。必须：
    //       stdio:"ignore" + 把子进程输出**重定向到文件**，再读文件。
    const OUT = path.join(ROOT, "test-results", "_mut_out.txt");
    const r = spawnSync(BASH, ["-c", `${cmd} > "${OUT}" 2>&1`], {
      cwd: ROOT, stdio: "ignore", env: { ...process.env },
    });
    // 去 ANSI 转义（vitest 带颜色输出会打断正则）
    const raw = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";
    const out = raw.replace(/\u001b\[[0-9;]*m/g, "");
    const m = out.match(/Tests\s+([^\n]+)/g);
    summary = m ? m[m.length - 1].replace(/\s+/g, " ").trim() : "(no Tests line)";
    const failed = /Tests\s+.*failed/.test(out) || r.status !== 0;
    verdict = failed ? "KILLED" : "SURVIVED";
    const fl = out.split("\n");
    const failLine = fl.find((l) => /FAIL\s+src\//.test(l)) || "";
    const firstAssert = fl.find((l) => /AssertionError/.test(l)) || "";
    const catchName = (failLine.match(/>\s*(.+)$/) || [])[1] || "";
    extra = (catchName ? "命中用例: " + catchName.trim().slice(0, 90) + "\n   " : "") +
            (firstAssert ? "断言: " + firstAssert.trim().slice(0, 130) : "");
    console.log(`\n== [${role}] ${ABIL}${file}`);
    console.log(`   变异: ${JSON.stringify(find.slice(0, 70))} -> ${JSON.stringify(repl.slice(0, 70))}`);
    console.log(`   ${verdict}  ${summary} (exit=${r.status})` + (extra ? "\n   " + extra : ""));
    if (out.length < 200) console.log("   !! 输出过短(" + out.length + " 字符)，疑为命令未真正执行：" + JSON.stringify(out.slice(0, 200)));
  } finally {
    fs.writeFileSync(target, original, "utf8");
    const same = fs.readFileSync(target, "utf8") === original;
    if (!same) { console.log(`   !!!! 还原失败 ${file} -- 立即人工检查 !!!!`); verdict = "RESTORE_FAIL"; }
    else console.log(`   还原 ${file} OK（逐字节一致，sha256=${sha(original)}）`);
  }
  results.push([role, verdict, summary]);
  fs.writeFileSync(path.join(ROOT, "test-results/_mut_progress.json"), JSON.stringify(results, null, 2), "utf8");
}

console.log("\n================ 汇总 ================");
for (const [a, b, c] of results) console.log(`${b.padEnd(13)} ${a.padEnd(16)} ${c}`);
const killed = results.filter((r) => r[1] === "KILLED").length;
console.log(`KILLED ${killed}/${results.length}`);
