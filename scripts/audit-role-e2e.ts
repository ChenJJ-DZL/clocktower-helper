/**
 * 逐角色 E2E 覆盖率台账（机器可判）
 * ==================================================================
 * 为什么需要：`outputs/全剧本全角色覆盖-2026-10-21.md` §15.7 明确写过
 *   「在把『角色 × E2E』做成可计数台账之前，不能说所有角色都验证过」。
 * 本脚本就是那张台账：
 *
 *   ① 从 `outputs/scenes.json` 取每个剧本**实际发到过**的角色 id（唯一真值）；
 *   ② 只读**该剧本自己的**逐角色用例文件，判断角色 id 是否被显式提及；
 *   ③ 输出「剧本 → 覆盖 / 缺失」，`--strict` 时缺失即退出码 1。
 *
 * ⚠️ 两条已踩过的假绿陷阱（都实测过）：
 *   ① **别扫全部 spec**：`full_sim` / 矩阵用例里顺带提到的角色会被算成「已覆盖」
 *      ⇒ 9 个剧本全部假绿 100%；
 *   ② **别跨剧本复用统计**：9 个剧本共享大量角色 id（洗衣妇/投毒者/小恶魔…），
 *      扫全目录会把暗流涌动的 15 条命中算到「无上愉悦」头上 ⇒ 实测出现 15/16。
 *   ⇒ 因此 `SPEC_BY_SCRIPT` 必须**显式登记**，一个剧本一个文件。
 *
 * ⚠️ 口径说明（必要条件，不是充分条件）：
 *   「提及」只证明**有人为这个角色写了用例**，不证明断言有效。
 *   断言有效性由 spec 的真实运行结果负责 —— 报告里必须同时写运行结果。
 *
 * 用法：
 *   npm run audit:roles             # 打印台账
 *   npm run audit:roles -- --strict # 缺失即退出码 1
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const SCENES = path.join(ROOT, "outputs", "scenes.json");

type ScenesFile = {
  scripts: Array<{
    script: string;
    scriptId: string;
    games: Array<{ id: string; seats: Array<{ id: string }> }>;
  }>;
};

/** 剧本 → 逐角色用例文件（**一剧本一文件**，必须显式登记） */
const SPEC_BY_SCRIPT: Record<string, string> = {
  暗流涌动: "e2e/trouble_brewing/role_scenarios.spec.ts",
  黯月初升: "e2e/bad_moon_rising/role_scenarios.spec.ts",
  梦殒春宵: "e2e/sects_and_violets/role_scenarios.spec.ts",
  窃窃私语: "e2e/whispering_secrets/role_scenarios.spec.ts",
  无名之墓: "e2e/tomb_of_the_unknown/role_scenarios.spec.ts",
  无上愉悦: "e2e/high_pleasure/role_scenarios.spec.ts",
  凶宅魅影: "e2e/haunted_manor/role_scenarios.spec.ts",
  游园惊梦: "e2e/garden_of_dreams/role_scenarios.spec.ts",
  罂粟花开: "e2e/poppyganda/role_scenarios.spec.ts",
};

function readSpec(rel: string | undefined): string | null {
  if (!rel) return null;
  const abs = path.join(ROOT, rel);
  return fs.existsSync(abs) ? fs.readFileSync(abs, "utf-8") : null;
}

/** 该角色 id 是否被这个剧本自己的用例文件显式提及 */
function mentioned(id: string, src: string | null): boolean {
  if (!src) return false;
  const forms = [
    new RegExp(`role:\\s*"${id}"`),
    new RegExp(`seatOf\\([^)]*"${id}"`),
    new RegExp(`stepsOf\\([^)]*"${id}"`),
    new RegExp(`"${id}"`),
  ];
  return forms.some((re) => re.test(src));
}

function main() {
  const strict = process.argv.includes("--strict");
  const scenes = JSON.parse(fs.readFileSync(SCENES, "utf-8")) as ScenesFile;

  let totalRoles = 0;
  let coveredRoles = 0;
  const missingByScript: Array<{ script: string; roles: string[]; file: string }> = [];

  console.log("剧本\t角色数\t已写入用例\t缺失");
  console.log("─".repeat(72));

  for (const s of scenes.scripts) {
    const roleIds = Array.from(
      new Set(s.games.flatMap((g) => g.seats.map((x) => x.id)))
    ).sort();
    const rel = SPEC_BY_SCRIPT[s.script];
    const src = readSpec(rel);
    const covered: string[] = [];
    const missing: string[] = [];
    for (const id of roleIds) {
      if (mentioned(id, src)) covered.push(id);
      else missing.push(id);
    }
    totalRoles += roleIds.length;
    coveredRoles += covered.length;
    if (missing.length > 0) {
      missingByScript.push({
        script: s.script,
        roles: missing,
        file: rel ?? "(未登记)",
      });
    }
    console.log(
      `${s.script}\t${roleIds.length}\t${covered.length}\t${
        missing.length === 0 ? "—" : `${missing.length} 个`
      }${src ? "" : "\t(用例文件不存在)"}`
    );
  }

  console.log("─".repeat(72));
  console.log(`合计：${coveredRoles} / ${totalRoles} 个角色已被用例显式引用`);
  console.log(
    "⚠️ 口径：本台账只证明「有用例」，不证明「断言有效」—— 运行结果另行核对。"
  );

  if (missingByScript.length > 0) {
    console.log("\n缺失明细：");
    for (const m of missingByScript) {
      console.log(`  · ${m.script}（${m.file}）：${m.roles.join(", ")}`);
    }
    if (strict) process.exitCode = 1;
  }
}

main();
