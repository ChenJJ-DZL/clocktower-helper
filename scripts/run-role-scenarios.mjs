/**
 * 跑「所有已存在的逐角色场景用例」。
 *
 * 为什么需要这层包装：`verify-all.mjs` 是用 `spawn` 直接起 `playwright`（不经过 shell），
 * 而 Node 的 spawn **不会展开 glob**（`e2e/**​/role_scenarios.spec.ts` 会被当成字面路径）。
 * 这里先在 Node 里扫出真实文件列表，再交给 playwright —— 新增剧本不用改脚本。
 *
 * 用法：
 *   node scripts/run-role-scenarios.mjs            # 全跑
 *   node scripts/run-role-scenarios.mjs --list     # 只打印会跑哪些文件
 */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const ROOT = process.cwd();
const E2E = path.join(ROOT, "e2e");

/** 递归找 `role_scenarios.spec.ts` */
function collect(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) collect(p, out);
    else if (e.name === "role_scenarios.spec.ts") out.push(path.relative(ROOT, p));
  }
  return out;
}

const files = collect(E2E).sort();
if (files.length === 0) {
  console.error("❌ 没找到任何 role_scenarios.spec.ts");
  process.exit(1);
}

if (process.argv.includes("--list")) {
  console.log(`共 ${files.length} 个：`);
  for (const f of files) console.log("  ·", f);
  process.exit(0);
}

console.log(`▶ 逐角色场景层：${files.length} 个文件`);
for (const f of files) console.log("  ·", f);

const child = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["playwright", "test", ...files, "--workers=1", "--retries=0", "--reporter=line"],
  { cwd: ROOT, stdio: "inherit", env: { ...process.env, NODE_OPTIONS: "" }, shell: true }
);

child.on("exit", (code) => process.exit(code ?? 1));
