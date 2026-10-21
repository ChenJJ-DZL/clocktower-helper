#!/usr/bin/env node
/**
 * 全量验证 gate（一条命令出 verdict）
 * ------------------------------------------------------------------
 * 用法：
 *   node scripts/verify-all.mjs --list     # 只列步骤与状态（不跑）
 *   node scripts/verify-all.mjs            # 跑「已实现」的步骤，输出 verdict
 *   node scripts/verify-all.mjs --only=tsc,vitest
 *
 * 设计要点（对着《全量验证计划 V1》第 5 节）：
 *   1. **三闸门串行**：tsc → vitest → build。build 与 dev 抢 `.next`，绝不并行。
 *   2. 未实现的判据**不假装通过**：标 PENDING，verdict 直接给 NOT READY。
 *   3. 退出码：0 = 全绿；1 = 有失败；2 = 有 PENDING（还没到能说「全部验证过」的程度）。
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const LIST_ONLY = args.includes("--list");
const onlyArg = args.find((a) => a.startsWith("--only="));
const ONLY = onlyArg ? onlyArg.slice("--only=".length).split(",").map((s) => s.trim()) : null;

const NPX = process.platform === "win32" ? "npx.cmd" : "npx";
const NODE = process.execPath;

/**
 * steps[].status:
 *   ready     —— 已实现，跑就完事
 *   pending   —— 计划里有、代码还没有（**不许算通过**）
 *
 * 🔴 跑之前**必须先停 dev server**：第 3 步是 `next build`，而 build 与 dev 共用 `.next`
 *    ⇒ 并行会把 `.next` 写坏，页面直接 500，E2E 只报「点击超时」（2026-10-22 实测 9 剧场次全红）。
 */
const steps = [
  {
    id: "tsc",
    title: "类型检查（闸门 1）",
    status: "ready",
    cmd: NPX,
    args: ["tsc", "--noEmit"],
    env: { NODE_OPTIONS: "" },
    desc: "0 错",
  },
  {
    id: "vitest",
    title: "全量单测（闸门 2）",
    status: "ready",
    cmd: NPX,
    args: ["vitest", "run", "--reporter=dot"],
    env: { NODE_OPTIONS: "" },
    desc: "全绿",
    timeoutMs: 15 * 60 * 1000,
  },
  {
    id: "build",
    title: "生产构建（闸门 3）",
    status: "ready",
    cmd: NPX,
    args: ["next", "build"],
    env: { NODE_OPTIONS: "" },
    desc: "通过",
    timeoutMs: 15 * 60 * 1000,
  },
  {
    id: "coverage",
    title: "角色覆盖审计（C1/C2 数据源）",
    status: "ready",
    cmd: NPX,
    args: ["tsx", "scripts/coverage-audit.ts"],
    env: { NODE_OPTIONS: "" },
    desc: "产出 outputs/coverage_ledger.json 并打印覆盖率",
    /** 只打印，不判红（完成线在 ratchet 里判） */
    softFail: true,
  },
  {
    id: "ratchet",
    title: "覆盖率台账棘轮（不许回退）",
    status: "pending",
    cmd: NPX,
    args: ["vitest", "run", "src/utils/__tests__/coverage_ratchet.test.ts", "--reporter=dot"],
    env: { NODE_OPTIONS: "" },
    desc: "计划 W2：任一格下降即红",
    pending: "未实现：计划 W2（先落地 coverage_ledger 的 e2e/unit 双台账）",
  },
  {
    id: "terminal",
    title: "终局专项（C5，5 人 × 9 剧本）",
    status: "ready",
    cmd: NPX,
    args: ["playwright", "test", "e2e/full_sim/terminal_state.spec.ts", "--workers=2", "--reporter=line"],
    env: { NODE_OPTIONS: "" },
    desc: "9 passed / terminal.ok 全 true / 违例 0",
    needsServer: true,
    timeoutMs: 20 * 60 * 1000,
  },
  {
    id: "matrix",
    title: "9 剧本矩阵（11 人 × 6 昼夜）",
    status: "ready",
    cmd: NPX,
    args: ["playwright", "test", "e2e/full_sim/all_scripts.spec.ts", "--workers=2", "--reporter=line"],
    env: { NODE_OPTIONS: "" },
    desc: "9 passed / 违例 0",
    needsServer: true,
    timeoutMs: 20 * 60 * 1000,
  },
  {
    id: "roleCoverage",
    title: "逐角色覆盖台账（9 剧本 × 全部角色）",
    status: "ready",
    cmd: NPX,
    args: ["tsx", "scripts/audit-role-e2e.ts", "--strict"],
    env: { NODE_OPTIONS: "" },
    desc: "每个角色都要在自己的 role_scenarios.spec.ts 里被显式引用；缺失即红（--strict）",
    /**
     * 2026-10-22 接线：原先这一步标 pending，理由是「未实现计划 W1 强制阵容注入 +
     * W3 定向角色覆盖 spec」。这两件事已经做完（`window.__CT_FORCE_LINEUP__` +
     * `e2e/<剧本>/role_scenarios.spec.ts` + `npm run audit:roles`），只是脚本没接。
     * ⚠️ 口径：本步骤只证明「有用例文件且角色被引用」，不证明断言有效 ——
     * 真跑绿在下一步 `roleScenarios`。
     */
  },
  {
    id: "roleScenarios",
    title: "逐角色场景层真跑（所有剧本的 role_scenarios.spec.ts）",
    status: "ready",
    cmd: NODE,
    // ⚠️ 不能把 glob 直接交给 playwright：spawn 不过 shell，Node 不展开 `**`
    //    ⇒ 用包装脚本在 Node 里扫出真实文件列表（新增剧本不用改这里）
    args: ["scripts/run-role-scenarios.mjs"],
    env: { NODE_OPTIONS: "" },
    desc: "全绿才算通过；有 test.fail 登记缺口时仍算绿（Playwright 语义）",
    needsServer: true,
    timeoutMs: 40 * 60 * 1000,
  },
  {
    id: "nightOrder",
    title: "夜序对官方顺序（C4）",
    status: "pending",
    cmd: NPX,
    args: ["vitest", "run", "src/utils/__tests__/night_order_official.test.ts", "--reporter=dot"],
    env: { NODE_OPTIONS: "" },
    desc: "计划 W7：每局实际唤醒序列 == 官方 rank 过滤后的顺序",
    pending: "未实现：计划 W7（当前只有 I10：弹窗序 = 队列，不证队列 = 官方序）",
  },
  {
    id: "modals",
    title: "弹窗 golden（C3）",
    status: "pending",
    cmd: NPX,
    args: ["vitest", "run", "src/utils/__tests__/modal_goldens.test.ts", "--reporter=dot"],
    env: { NODE_OPTIONS: "" },
    desc: "计划 W6：43 个可达弹窗各有 golden，ENTRY_LOST = 0",
    pending: "未实现：计划 W6（22 条不可达要逐条收口 + 43 份 golden 待批准）",
  },
];

function runStep(step) {
  const started = Date.now();
  const env = { ...process.env, ...(step.env ?? {}) };
  // Windows 上 npx.cmd 必须走 shell，否则 spawn EINVAL
  const useShell = process.platform === "win32" && step.cmd === NPX;
  const res = spawnSync(step.cmd, step.args, {
    cwd: ROOT,
    env,
    stdio: "inherit",
    shell: useShell,
    timeout: step.timeoutMs ?? 10 * 60 * 1000,
  });
  const ok = res.status === 0;
  return { ok, ms: Date.now() - started, code: res.status };
}

function serverUp() {
  try {
    const out = spawnSync(
      process.platform === "win32" ? "curl.exe" : "curl",
      ["-s", "--noproxy", "*", "-o", osDevNull(), "-w", "%{http_code}", "http://127.0.0.1:3100/"],
      { encoding: "utf-8", timeout: 5000 }
    );
    return String(out.stdout ?? "").trim().startsWith("2");
  } catch {
    return false;
  }
}
const osDevNull = () => (process.platform === "win32" ? "NUL" : "/dev/null");

const selected = steps.filter((s) => !ONLY || ONLY.includes(s.id));

if (LIST_ONLY) {
  console.log("全量验证 gate 步骤：\n");
  for (const s of selected) {
    const tag = s.status === "ready" ? "READY  " : "PENDING";
    console.log(`  [${tag}] ${s.id.padEnd(13)} ${s.title}  —— 期望：${s.desc}`);
    if (s.pending) console.log(`              ↳ ${s.pending}`);
  }
  const pending = selected.filter((s) => s.status === "pending").length;
  console.log(
    `\n共 ${selected.length} 步，其中 PENDING ${pending} 步 ⇒ 目前**还不能**说「全部验证过」。`
  );
  process.exit(0);
}

// ── 跑 ──
const results = [];
for (const step of selected) {
  if (step.status === "pending") {
    console.log(`\n⏸  SKIP(pending) ${step.id} —— ${step.pending}`);
    results.push({ step, state: "pending" });
    continue;
  }
  if (step.needsServer && !serverUp()) {
    console.log(`\n⚠️  ${step.id} 需要 http://127.0.0.1:3100 在线，先执行：`);
    console.log("    npx next build && PORT=3100 npx next start -p 3100 &");
    results.push({ step, state: "blocked" });
    continue;
  }
  console.log(`\n▶  ${step.id} —— ${step.title}`);
  const r = runStep(step);
  if (!r.ok && !step.softFail) {
    console.log(`✗  ${step.id} 失败（退出码 ${r.code}，${(r.ms / 1000).toFixed(1)}s）`);
    results.push({ step, state: "failed" });
    break; // 闸门串行：前面红了不再往下跑
  }
  console.log(`✓  ${step.id}（${(r.ms / 1000).toFixed(1)}s）`);
  results.push({ step, state: "ok" });
}

const failed = results.filter((r) => r.state === "failed");
const pending = results.filter((r) => r.state === "pending");
const blocked = results.filter((r) => r.state === "blocked");
const notRun = selected.length - results.length;

console.log("\n──────── 结果 ────────");
for (const r of results) {
  const mark =
    r.state === "ok" ? "✓" : r.state === "failed" ? "✗" : r.state === "blocked" ? "⚠️" : "⏸";
  console.log(`  ${mark} ${r.step.id.padEnd(13)} ${r.state}`);
}
if (notRun > 0) console.log(`  - 因前面的步骤失败，还有 ${notRun} 步未执行`);

if (failed.length > 0) {
  console.log("\nVERDICT: FAILED —— 有判据报红，禁止说「验证过」。");
  process.exit(1);
}
if (pending.length > 0 || blocked.length > 0 || notRun > 0) {
  console.log(
    `\nVERDICT: NOT READY —— 已跑的全绿，但还有 ${pending.length} 步未实现、` +
      `${blocked.length} 步被阻塞、${notRun} 步未跑。`
  );
  console.log("按《全量验证计划》B1→B4 推进，PENDING 清零才算完成。");
  process.exit(2);
}
console.log("\nVERDICT: ALL GREEN —— 可以按计划 §6 的措辞对外表述。");
process.exit(0);
