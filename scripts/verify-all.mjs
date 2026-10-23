#!/usr/bin/env node
/**
 * 全量验证 gate（一条命令出 verdict）
 * ------------------------------------------------------------------
 * 用法：
 *   node scripts/verify-all.mjs --list     # 只列步骤与状态（不跑）
 *   node scripts/verify-all.mjs            # 跑「已实现」的步骤，输出 verdict
 *   node scripts/verify-all.mjs --only=tsc,vitest
 *   node scripts/verify-all.mjs --skip=orphan   # 跳过耗时步做快速回归（与 --only 对称）
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
/**
 * `--skip=orphan,terminal` —— 与 `--only` 对称的减法。
 * 用途：日常快速回归时跳过耗时步（orphan 约 9.3 分钟、terminal 的 45 局矩阵更久），
 * 发版前再完整跑一遍。**跳过不等于通过**：`--list` 与 verdict 会显示实际选了哪几步。
 */
const skipArg = args.find((a) => a.startsWith("--skip="));
const SKIP = skipArg ? skipArg.slice("--skip=".length).split(",").map((s) => s.trim()) : [];

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
    /**
     * ✅ 2026-10-23 接线（原为 pending「计划 W2 未实现」）：
     *   实现落在 `src/utils/__tests__/coverage_ratchet.test.ts`，8 条判据分两组：
     *     A/B 场次台账（`outputs/scenes.json` + 9 套 `role_scenarios.spec.ts`，**已入库**）
     *        —— 9 剧本 / 27 场 / 192 个角色位，逐剧本设下限，且每个角色位都必须被
     *           **本剧本自己的**用例显式引用（一剧本一文件，禁止跨剧本蹭覆盖率）；
     *     C   审计台账（`outputs/coverage_ledger.json`）—— `reachCoverage === 1`，
     *           且「整局模拟执行证据」不得低于 109 对。
     *
     *   同批修掉的两个问题：
     *     ① **口径断裂**：`coverage-audit.ts` 原先只扫 `temp/` 的 18 局整局模拟
     *        ⇒ 报 109/191，而实际上 `role_scenarios` 是 192/192 全覆盖。
     *        现在台账并列三层 `seen`（执行证据）／`scenes`（场次编排）／`specRef`（用例引用），
     *        并分别报 `executedCoverage` 与 `reachCoverage`，棘轮同时盯两个数。
     *     ② **ENTRY_LOST 清零**：`ROLE_CODEX` 补了 `GlobalNavBar`「📖 图鉴」入口，
     *        `ROLE_INFO` 补了座位右键「ℹ️ 角色资料」入口（并删掉 `GameModals` 里
     *        同一 type 渲染两个弹窗的重复分支）。
     */
    id: "ratchet",
    title: "覆盖率台账棘轮（不许回退）",
    status: "ready",
    cmd: NPX,
    args: ["vitest", "run", "src/utils/__tests__/coverage_ratchet.test.ts", "--reporter=dot"],
    env: { NODE_OPTIONS: "" },
    desc: "计划 W2：任一格下降即红（场次 27 / 角色位 192 / 入口覆盖 100% / 执行证据 ≥109）",
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
    /**
     * ✅ 2026-10-22 接线（原为 pending「计划 W7 未实现」）：
     *   实现落在 `e2e/special/x01_night_order.spec.ts`，9 剧本各一场，
     *   读入夜快照的 `wakeQueueIds` 与 `src/data/nightOrder.json` 的 firstNight 下标对账。
     *   真值取自**静态 json**，刻意不走 `nightOrderParser`（否则是自己证自己）。
     *
     * ⚠️ 三个现实（都写在 spec 注释里，别当 bug 改回去）：
     *   ① 同一座位可多次入队（爪牙互认按人展开 / 间谍看魔典 / 赏金猎人告知）
     *      ⇒ 取「最后一次出现」当该角色自身技能步骤；
     *   ② 官方表不含恶魔与部分爪牙（由 di 一步覆盖）⇒ 不参与 rank 比较；
     *   ③ 不做「漏唤醒」反向断言（剧本可自定义角色类型，如罂粟花开把 snitch 当外来者）。
     *
     * ⚠️ 本步依赖外部 dev server（playwright.config 刻意不用 webServer，见其注释）。
     */
    id: "nightOrder",
    title: "夜序对官方顺序（C4）",
    status: "ready",
    cmd: NPX,
    args: [
      "playwright",
      "test",
      "e2e/special/x01_night_order.spec.ts",
      "--workers=1",
      "--retries=0",
      "--reporter=line",
    ],
    env: { NODE_OPTIONS: "" },
    desc: "计划 W7：每局实际唤醒序列 == 官方 rank 过滤后的顺序（9 剧本各一场）",
    needsServer: true,
    timeoutMs: 15 * 60 * 1000,
  },
  {
    /**
     * ✅ 2026-10-22 接线（原为 pending「计划 W6 未实现」）：
     *   43 个可达弹窗的 golden 分 6 个批文件落地，全部真实 render（0 条降级为静态护栏）。
     *   判据比计划更严：标题用 `h2.textContent` **完全相等**、按钮 trim 后完全相等、
     *   关闭回调 `vi.fn()` 断言；每批都做过变异验证。
     *
     * ⚠️ 本步只判「弹窗能开 + 文案没漂移」，**不判文案对不对**。
     *   逐字对账（拿 officialRoleDocs 比）是更深一层，进度写在
     *   `outputs/X02-文案对账-2026-10-22.md`（✅ 2026-10-23 已 43/43 收口）。
     *   `ENTRY_LOST` 收口已同批清零（`ROLE_CODEX` ← GlobalNavBar「📖 图鉴」、
     *   `ROLE_INFO` ← 座位右键「ℹ️ 角色资料」），棘轮见 `coverage_ratchet.test.ts`。
     */
    id: "modals",
    title: "弹窗 golden（C3）",
    status: "ready",
    cmd: NPX,
    args: [
      "vitest",
      "run",
      "src/components/modals/__tests__/x02_night_action_golden.test.tsx",
      "src/components/modals/__tests__/x02_night_info_golden.test.tsx",
      "src/components/modals/__tests__/x02_day_execution_golden.test.tsx",
      "src/components/modals/__tests__/x02_day_actions_golden.test.tsx",
      "src/components/modals/__tests__/x02_traveler_system_golden.test.tsx",
      "src/components/modals/__tests__/x02_traveler_judge_golden.test.tsx",
      "src/utils/__tests__/modal_reachability_ledger.test.ts",
      "--reporter=dot",
    ],
    env: { NODE_OPTIONS: "" },
    desc: "计划 W6：43 个可达弹窗各有 golden（43/43，0 降级）",
    timeoutMs: 10 * 60 * 1000,
  },
  {
    /**
     * ✅ 2026-10-23 转正：原 `e2e/wip/day_cycle.wip.spec.ts` —— 曾被 `testIgnore` 排除、
     *   只能靠 `CT_E2E_WIP=1` 手动跑。现在迁到 `e2e/poppyganda/day_cycle.spec.ts`
     *   并纳入本闸门（`wip` 目录与那个环境变量开关已一并退役）。
     *
     * 覆盖两条：
     *   ① 罂粟花开「首夜 → 第 1 天（白天）→ 进入黄昏处决阶段」的完整真实点击流；
     *   ② 黄昏阶段真的渲染出提名与处决台（门槛 / 步骤 / 上台规则）。
     *
     * 为什么值得单列一步：这是**唯一**一条穿过「夜 → 昼 → 黄昏」阶段边界、
     *   且断言渲染结果（而不是中间变量）的用例 —— 阶段切换类的回归只有它能抓到。
     *
     * ⚠️ 固定 5 人阵容（fortune_teller / mayor / savant / evil_twin / imp），单次约 18s。
     */
    id: "dayCycle",
    title: "夜→昼→黄昏完整点击流（罂粟花开）",
    status: "ready",
    cmd: NPX,
    args: [
      "playwright",
      "test",
      "e2e/poppyganda/day_cycle.spec.ts",
      "--workers=1",
      "--retries=0",
      "--reporter=line",
    ],
    env: { NODE_OPTIONS: "" },
    desc: "2 passed：夜→白天→黄昏进入处决阶段；黄昏提名/处决台渲染齐全",
    needsServer: true,
    timeoutMs: 15 * 60 * 1000,
  },
  {
    /**
     * ✅ 2026-10-23 新接线：**孤儿角色逐角色真实点击流**（58 个）。
     *
     * 为什么必须单列一步：
     *   `roleScenarios` 只覆盖**内置 9 剧本内**的 192 个角色位；
     *   剧本外还有 58 个角色（`astrologer`/`miner`/`lloam`/红罗刹…），
     *   它们进不了任何内置剧本，只能走「🛠️ 自建剧本」构建器 ⇒ 另一条驱动链。
     *   2026-10-23 盘点发现：这 58 个**从未进过任何闸门**（有文件、只手工跑），
     *   正是本项目复发多次的「ENTRY_LOST」死形态 —— 有实现、无调用点。
     *
     * 判据（与 S&V per_role 同口径，绝不拿文案代状态）：
     *   ① 快照 `role.id` 就是该角色；② `role.type` 与独立真值表一致；
     *   ③ 座位数 = 该局人数、`gamePhase` 已推进、`nightCount ≥ 1`；④ 每座位已发牌。
     *
     * ⚠️ 时长：ROSTER 66 ÷ 7 = 10 组，单组上限 15 分钟 ⇒ 实测约 9.3 分钟（11 passed）。
     *    日常快速回归用 `--skip=orphan`，发版前必须完整跑。
     * ⚠️ 依赖外部 dev server（同其它 E2E 步，见 playwright.config 不用 webServer 的原因）。
     */
    id: "orphan",
    title: "孤儿角色点击流（58 个 · 自建剧本）",
    status: "ready",
    cmd: NPX,
    args: [
      "playwright",
      "test",
      "e2e/orphan",
      "--workers=1",
      "--retries=0",
      "--reporter=line",
    ],
    env: { NODE_OPTIONS: "" },
    desc: "58 个剧本外角色各自真实点击流：role.id / type / 座位数 / 发牌 全对上",
    needsServer: true,
    timeoutMs: 60 * 60 * 1000,
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

const selected = steps.filter(
  (s) => (!ONLY || ONLY.includes(s.id)) && !SKIP.includes(s.id)
);

if (LIST_ONLY) {
  console.log("全量验证 gate 步骤：\n");
  for (const s of selected) {
    const tag = s.status === "ready" ? "READY  " : "PENDING";
    console.log(`  [${tag}] ${s.id.padEnd(13)} ${s.title}  —— 期望：${s.desc}`);
    if (s.pending) console.log(`              ↳ ${s.pending}`);
  }
  const pending = selected.filter((s) => s.status === "pending").length;
  /**
   * ⚠️ 结语必须跟着 `pending` 走。
   *   原实现把「还不能说全部验证过」写死了 —— 2026-10-23 清到 PENDING 0 时
   *   清单仍打印这句话，等于自己否认自己，容易让人以为还有欠账。
   */
  console.log(
    pending === 0
      ? `\n共 ${selected.length} 步，PENDING 0 步 ⇒ 清单已全部接线（跑 \`npm run verify:all\` 逐项执行并判红）。`
      : `\n共 ${selected.length} 步，其中 PENDING ${pending} 步 ⇒ 目前**还不能**说「全部验证过」。`
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
