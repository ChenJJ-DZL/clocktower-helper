#!/usr/bin/env node
/**
 * L6 · E2E 断言型覆盖台账 CLI
 * ======================================================================
 * 口径见 `lib/e2eAssertions.ts`：把 `e2e/**\/*.ts` 切成 `test()` 块，
 * 统计「块内既提到该角色、又有 `expect(`」的块数 —— reach（被发到过）之外的
 * 第二个口径：**这个角色在 E2E 里被断言过吗**。
 *
 * 用法：
 *   npx tsx scripts/conformance/e2e-assertions.ts            # 打印摘要 + 落盘台账
 *   npx tsx scripts/conformance/e2e-assertions.ts --verbose   # 列出"只提到未断言"的角色
 *
 * 产物：outputs/rule_conformance/e2e_assertions.json（gitignore；指标进 audit 台账）
 */
import fs from "node:fs";
import path from "node:path";
import { collectE2eAssertions } from "./lib/e2eAssertions";
import { buildImplInventory } from "./lib/impl";

const ROOT = process.cwd();
const OUT_FILE = path.join(
  ROOT,
  "outputs",
  "rule_conformance",
  "e2e_assertions.json"
);

function main(): void {
  const impl = buildImplInventory();
  const ledger = collectE2eAssertions(
    impl.roles.map((role) => ({ roleId: role.roleId, nameCn: role.nameCn })),
    ROOT
  );
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");

  console.log("");
  console.log("🧪 L6 E2E 断言型覆盖");
  console.log(
    `   ${ledger.totals.files} 个 spec · ${ledger.totals.testBlocks} 个 test 块 · ${ledger.totals.assertions} 条 expect`
  );
  console.log(
    `   被断言的角色 ${ledger.rolesWithAssertions} / ${Object.keys(ledger.roles).length}`
  );
  if (process.argv.includes("--verbose")) {
    console.log(
      `   只提到未断言（${ledger.rolesMentionedOnly.length}）：${ledger.rolesMentionedOnly.join("、") || "无"}`
    );
  }
  console.log(`   台账：${path.relative(ROOT, OUT_FILE)}`);
}

main();
