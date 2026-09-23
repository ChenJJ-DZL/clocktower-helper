/**
 * 逐剧本「四层」覆盖审计（只读探针，不属于交付物）
 *
 * 目的：回答「9 个剧本是不是都只剩人工验收了」——不能凭台账或文件存在，
 *      必须实测：每个剧本的**每个角色**是否都有 L5 条目、每层文件是否真的存在。
 *
 * 用法：NODE_OPTIONS="" node temp/audit_coverage.js
 */
const fs = require("fs");
const path = require("path");

const raw = fs.readFileSync("app/data.ts", "utf8");
// ⚠️ 本仓文件是 **CRLF** 行尾 ⇒ 必须先归一化，否则 `\n  {\n` 之类的分割全部失效
const src = raw.replace(/\r\n/g, "\n");
const start = src.indexOf("export const scripts");
const region = src.slice(start, src.indexOf("\n];", start));
const blocks = region.split("\n  {\n").slice(1);

const scripts = [];
for (const b of blocks) {
  const id = (b.match(/id:\s*"([a-z_]+)"/) || [])[1];
  const name = (b.match(/name:\s*"([^"]+)"/) || [])[1];
  const rm = b.match(/roleIds:\s*\[([\s\S]*?)\]/);
  if (!id || !rm) continue;
  const roles = [...rm[1].matchAll(/"([a-z_0-9]+)"/g)].map((m) => m[1]);
  scripts.push({ id, name, roles });
}

const dir = "src/roles/__tests__/full";
const files = fs.readdirSync(dir);
const prefix = {
  trouble_brewing: "tb",
  bad_moon_rising: "bmr",
  sects_and_violets: "snv",
  whispering_secrets: "ws",
  haunted_manor: "hm",
  poppyganda: "poppyganda",
};

/**
 * ⚠️ 修正（首版有缺陷）：对「没有专属前缀」的剧本（无名之墓 / 无上愉悦 /
 *   游园惊梦 / 罂粟花开）首版**一个文件都没扫** ⇒ 报 0/N 是**脚本产物**、不是事实。
 *   ⇒ 改为**全仓扫描**：任一测试文件的 `describe(`/`it(` 标题里出现该角色 id 即算有覆盖。
 *   （这对"是否有自动化覆盖"是诚实的口径；「四层齐备」另看是否存在专属套件。）
 */
const TEST_ROOT = "src";
const allTestFiles = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) {
      if (["node_modules", ".next", ".git", "temp"].includes(e.name)) continue;
      walk(p); // 递归**所有**目录（首版条件过严 ⇒ 索引为空）
    } else if (/\.test\.(ts|tsx)$/.test(e.name)) allTestFiles.push(p);
  }
})(TEST_ROOT);

const titleIndex = {};
for (const f of allTestFiles) {
  const t = fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n");
  const titles = t
    .split("\n")
    .filter((l) => /describe\(|it\(|it\.each\(|describe\.each\(/.test(l))
    .join("\n");
  titleIndex[f] = titles;
}
const anyTitle = Object.values(titleIndex).join("\n");

const rows = [];
for (const s of scripts) {
  const p = prefix[s.id];
  const pick = (kw) => files.filter((f) => f.includes(kw)).map((f) => path.join(dir, f));

  const l2 = p ? pick(p + "_l1_l2") : [];
  const l3 = p ? pick(p + "_l3_ui") : [];
  const l5 = p
    ? [...pick(p + "_l5_causal"), ...pick(p + "_l5_causal_plus"), ...pick(p + "_l5_mutation")]
    : [];

  // 专属套件内的命中（体现"这个剧本有自己的 L5"）
  let ownText = "";
  for (const f of l5) ownText += fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n");
  const ownTitleLines = ownText
    .split("\n")
    .filter((l) => /describe\(|it\(/.test(l))
    .join("\n");
  const inTitles = s.roles.filter((r) => ownTitleLines.includes(r));

  // ✅ 全仓标题命中（真正的"有没有自动化覆盖"口径）
  const anywhere = s.roles.filter((r) => anyTitle.includes(r));

  const e2eDir = fs.existsSync("e2e/" + s.id);
  // 第二剧本（与别的剧本配对共享套件）单独标注
  const paired = {
    tomb_of_the_unknown: "窃窃私语 (ws 套件)",
    high_pleasure: "凶宅魅影 (hm 套件)",
    garden_of_dreams: "梦殒春宵 (snv 套件)",
  }[s.id];

  rows.push({
    name: s.name,
    id: s.id,
    roles: s.roles.length,
    l2: l2.length,
    l3: l3.length,
    l5files: l5.length,
    inTitles: inTitles.length,
    anywhere: anywhere.length,
    e2eDir,
    paired,
    missing: s.roles.filter((r) => !anywhere.includes(r)),
  });
}

console.log("剧本".padEnd(20), "角色", "L1/L2", "L3", "L5文件", "L5标题命中", "L5全文命中", "E2E目录");
for (const r of rows) {
  console.log(
    (r.name + " (" + r.id + ")").padEnd(20),
    String(r.roles).padStart(4),
    String(r.l2).padStart(5),
    String(r.l3).padStart(3),
    String(r.l5files).padStart(6),
    String(r.inTitles + "/" + r.roles).padStart(10),
    String(r.anywhere + "/" + r.roles).padStart(10),
    r.e2eDir ? "有" : (r.paired ? "共享" : "无"),
    r.missing.length ? "  ⚠️ 全文未出现: " + r.missing.join(",") : ""
  );
}

/* ══════════════════════════════════════════════════════════════════════
 * ② 角色互斥性分析 —— 回答「某剧本的角色是否 100% 也出现在别的剧本里」
 * ══════════════════════════════════════════════════════════════════════
 * ⚠️ 为什么不能直接用 §19.1 台账的「新增 / 复用」列：
 *   那是**按剧本顺序增量**算的（第 N 个剧本的"新增" = 前 N-1 个里没有的），
 *   **与顺序有关**，也不能回答"这个角色是否**只**属于这一个剧本"。
 *   本段算的是**无顺序**口径：该角色出现在**几个**剧本里（1 = 独家角色）。
 */
console.log("\n② 角色互斥性（无顺序口径：该角色出现在几个剧本里）");
const roleCount = {};
for (const s of scripts) {
  for (const r of s.roles) (roleCount[r] = roleCount[r] || new Set()).add(s.id);
}
const focus = [
  "tomb_of_the_unknown",
  "high_pleasure",
  "garden_of_dreams",
  "poppyganda",
  "haunted_manor",
];
for (const s of scripts) {
  const exclusive = s.roles.filter((r) => roleCount[r].size === 1);
  const shared = s.roles.filter((r) => roleCount[r].size > 1);
  const mark = focus.includes(s.id) ? "★" : " ";
  console.log(
    mark,
    (s.name + " (" + s.id + ")").padEnd(34),
    `共 ${String(s.roles.length).padStart(2)} 角色｜独家 ${String(exclusive.length).padStart(2)}｜共享 ${String(shared.length).padStart(2)}`,
    exclusive.length
      ? "  ⚠️ 独家角色: " + exclusive.join(",")
      : "  ✅ 全部角色均出现在其它剧本中"
  );
}

/* 交叉验证：独家角色是否仍有「角色级」测试覆盖（全仓标题命中） */
console.log("\n③ 独家角色的角色级覆盖（全仓任一测试标题命中）");
for (const s of scripts) {
  const exclusive = s.roles.filter((r) => roleCount[r].size === 1);
  if (!exclusive.length) continue;
  const missed = exclusive.filter((r) => !anyTitle.includes(r));
  console.log(
    " ",
    s.name.padEnd(10),
    `独家 ${exclusive.length} 个 → 有角色级测试 ${exclusive.length - missed.length}/${exclusive.length}`,
    missed.length ? " ⚠️ 无标题命中: " + missed.join(",") : ""
  );
}

/* ══════════════════════════════════════════════════════════════════════
 * ④ 子集关系 —— 比「每个角色都在别处」更强的判据
 * ══════════════════════════════════════════════════════════════════════
 * 若剧本 X 的**整个角色表**都被某个其它剧本 Y 包含（X ⊆ Y），
 * 那么「不为 X 单独建套件」才有真正站得住的依据（引擎行为完全一致）。
 */
console.log("\n④ 是否为某个其它剧本的【完整子集】（X ⊆ Y ⇒ 单独测的必要性最低）");
for (const s of scripts) {
  const supers = scripts.filter(
    (o) => o.id !== s.id && s.roles.every((r) => o.roles.includes(r))
  );
  if (supers.length) {
    const best = supers.sort((a, b) => a.roles.length - b.roles.length)[0];
    const extra = best.roles.filter((r) => !s.roles.includes(r));
    console.log(
      "  ✅",
      s.name.padEnd(6),
      "⊆",
      best.name.padEnd(6),
      `(${s.roles.length}/${best.roles.length}，超集多出 ${extra.length} 个角色)`
    );
  } else {
    const near = scripts
      .filter((o) => o.id !== s.id)
      .map((o) => ({ o, miss: s.roles.filter((r) => !o.roles.includes(r)) }))
      .sort((a, b) => a.miss.length - b.miss.length)[0];
    console.log(
      "  ❌",
      s.name.padEnd(6),
      "不是任何剧本的子集；最接近「" +
        near.o.name +
        "」仍缺 " +
        near.miss.length +
        " 个：" +
        near.miss.join(",")
    );
  }
}

/* 打印指定角色的覆盖文件（诊断用） */
const probe = process.argv[2];
if (probe) {
  console.log("\n⑤ 角色「" + probe + "」被哪些测试文件正文点名：");
  const hits = allTestFiles.filter((f) =>
    fs.readFileSync(f, "utf8").includes(probe)
  );
  for (const h of hits) console.log("   ", h);
  console.log("    共 " + hits.length + " 个文件");
}

/* ══════════════════════════════════════════════════════════════════════
 * ⑥ 剧本级专属机制 —— 角色级测试**结构上覆盖不到**的部分
 * ══════════════════════════════════════════════════════════════════════
 * 剧本的 `description` 里可能写着**剧本专属规则**（如"恶魔不会在夜晚攻击，
 * 固定天数后自动获胜"），但那**未必有实现**。
 * ⇒ 本条把「描述里有规则性措辞」的剧本挑出来，供人工逐条 grep 实现。
 */
console.log("\n⑥ 剧本 description 里的「规则性措辞」自查（需逐条确认是否已实现/已测）");
const RULE_WORDS = /不会在夜晚|自动获胜|固定.{0,4}天|特殊规则|立即|额外|翻倍|禁止/;
for (const b of blocks) {
  const id = (b.match(/id:\s*"([a-z_]+)"/) || [])[1];
  const name = (b.match(/name:\s*"([^"]+)"/) || [])[1];
  const desc = (b.match(/description:\s*"([\s\S]*?)",\n/) || [])[1] || "";
  const hit = desc.match(RULE_WORDS);
  if (!hit) continue;
  const sentence =
    desc
      .split(/[。；;]/)
      .find((x) => RULE_WORDS.test(x))
      ?.slice(0, 60) || "";
  console.log("  ⚠️", (name + " (" + id + ")").padEnd(30), "命中「" + hit[0] + "」→", sentence);
}
