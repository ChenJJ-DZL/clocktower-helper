/**
 * 生成「逐角色 E2E 派单 brief」：把每个剧本的角色、官方能力原文、场次阵容
 * 一次性摊平，供 CLI 照着写用例（避免它自己去翻全库、把上下文烧在读文件上）。
 *
 * 用法：node scripts/gen-role-brief.mjs bad_moon_rising
 * 产出：outputs/cli-briefs/<key>.md
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const key = process.argv[2];
if (!key) {
  console.error("用法: node scripts/gen-role-brief.mjs <script-key>");
  process.exit(1);
}

const SCRIPT_DIR = {
  暗流涌动: "trouble_brewing",
  黯月初升: "bad_moon_rising",
  梦殒春宵: "sects_and_violets",
  窃窃私语: "whispering_secrets",
  无名之墓: "tomb_of_the_unknown",
  无上愉悦: "high_pleasure",
  凶宅魅影: "haunted_manor",
  游园惊梦: "garden_of_dreams",
  罂粟花开: "poppyganda",
};

const scenes = JSON.parse(fs.readFileSync(path.join(ROOT, "outputs/scenes.json"), "utf-8"));
const docs = JSON.parse(
  fs.readFileSync(path.join(ROOT, "src/data/officialRoleDocs.json"), "utf-8")
);

// app/data.ts 里抠 id / name / type（避免引入 TS 运行时）
const dataSrc = fs.readFileSync(path.join(ROOT, "app/data.ts"), "utf-8");
const meta = new Map();
for (const m of dataSrc.matchAll(/id:\s*"([a-z_]+)"[\s\S]{0,200}?name:\s*"([^"]+)"[\s\S]{0,200}?type:\s*"(townsfolk|outsider|minion|demon|traveler)"/g)) {
  if (!meta.has(m[1])) meta.set(m[1], { name: m[2], type: m[3] });
}

const TYPE_CN = {
  townsfolk: "镇民",
  outsider: "外来者",
  minion: "爪牙",
  demon: "恶魔",
  traveler: "旅行者",
};

const target = scenes.scripts.find((s) => s.scriptId === key || SCRIPT_DIR[s.script] === key || s.script === key);
if (!target) {
  console.error(`scenes.json 里找不到剧本 ${key}`);
  process.exit(1);
}

const roleIds = [...new Set(target.games.flatMap((g) => g.seats.map((s) => s.id)))];

function abilityOf(name) {
  const t = docs[name];
  if (!t) return "(官方文档缺这个角色)";
  const m = String(t).match(/【角色能力】([\s\S]*?)(【|$)/);
  return (m ? m[1] : "(缺【角色能力】段)").replace(/\s+/g, " ").trim();
}

const lines = [];
lines.push(`# 派单 brief · ${target.script}（${key}）`);
lines.push("");
lines.push(`> 自动生成（scripts/gen-role-brief.mjs）。角色数 **${roleIds.length}**，` +
  `场次 ${target.games.length} 个。用例文件路径必须是 ` +
  "`e2e/" + SCRIPT_DIR[target.script] + "/role_scenarios.spec.ts`。");
lines.push("");
lines.push("## 场次与阵容（照此注入，切勿改动顺序）");
lines.push("");
for (const g of target.games) {
  lines.push(`### ${g.id} · ${g.players} 人 · seed=${g.seed}`);
  lines.push("");
  lines.push("```");
  lines.push(g.seats.map((s, i) => `${i + 1}. ${s.id}`).join("\n"));
  lines.push("```");
  lines.push("");
  lines.push(`配比（发牌必须完全一致）：镇民 ${g.counts.townsfolk} / 外来者 ${g.counts.outsider} / 爪牙 ${g.counts.minion} / 恶魔 ${g.counts.demon}`);
  lines.push("");
}

lines.push("## 角色清单与官方能力（判据的唯一依据）");
lines.push("");
lines.push("| # | id | 名称 | 类型 | 官方能力 |");
lines.push("|---|---|---|---|---|");
roleIds.forEach((id, i) => {
  const m = meta.get(id) ?? { name: id, type: "?" };
  lines.push(
    `| ${i + 1} | \`${id}\` | ${m.name} | ${TYPE_CN[m.type] ?? m.type} | ${abilityOf(m.name)} |`
  );
});
lines.push("");

lines.push(`## 每类能力的判据模板（照着写，别自由发挥）
`);
const judgeTpl = `### 信息类（镇民/外来者，夜里「获得信息」）
1. **必须被唤醒**：\`stepsOf(report, "<id>").length > 0\`；
2. **弹窗与真值一致**：解析文案里的数字/座位，再**从快照独立复算**一遍（不要相信弹窗自述）；
3. **反证**：不该出现在结果里的人/数字不得出现（如间谍算好人、陌客可能算邪恶）。

### 击杀类（恶魔/刺客/沙巴洛斯等）
1. **落库**：目标 \`isDead === true\` 且 \`diedAtNight === 当前夜数\`；
2. **不多杀**：当晚死亡集合必须**正好**等于计划目标（保护/转移/替死要单独放行）；
3. **目标数契约**：官方说几名就几名（如珀「平时 1 名，上次未选人则 3 名」）。

### 保护/免死类（僧侣/旅店老板/士兵/魔鬼代言人/弄臣）
1. **被保护者不死**；
2. **保护只挡对应死因**（夜杀 vs 处决），另一条死因仍要能杀死他；
3. **一次性能力要消费掉**（第二次不再生效）。

### 限一次类（刺客/艺术家/猎手/哲学家…）
用过之后**不得再被唤醒**（\`stepsOf(...).length === 0\`），或入口从 UI 消失。

### 被动/触发类（圣徒/市长/农夫/瘟疫医生/政客/呆瓜）
触发条件必须能构造出来；触发后要有**可观测落点**（状态字段 / 胜因 / 日志 / 弹窗）。
若该落点当前不存在，先写 \`test.fail(true, "…")\` + 实测证据 + 修法方向，**不要**删断言变绿。
`;
lines.push(judgeTpl);

lines.push("## 已踩过的坑（必须避开）");
lines.push(`
1. \`stepsOf(report, role)\` 里**爪牙/恶魔也有一段「-结果」**（互认）⇒ 用 \`resultStep\` 会取错，必须用内容锚（\`/保护了/\`、\`/不在场伪装/\`、\`/目标\\d+号/\`）。
2. 日间技能入口文案是「使用 艺术家」（**中间有空格**）⇒ 正则写 \`使用\\s*艺术家\`；点完还有一层「确定使用…吗」，真正的表单在第二段。
3. 旅店老板会让两人之一**醉酒** ⇒ 拿它当保护对象时别选被测的信息角色（信息会变成「由说书人裁定」）。
4. 涡流会**杀人** ⇒ 别把被测的信息角色当攻击目标。
5. 同一个 test 里只 \`bootScene\` 一次（第二次会卡住，click 15s 超时）。
6. \`snapNow(page)\` 读的是持久化快照：**终局后停止写入** ⇒ 终局用例只能断言「终局卡片 + 胜因」，别再断言 \`isDead\`。
7. 涡流局（含 vortox 的剧本）「白天无人被处决 ⇒ 邪恶获胜」已实装到入夜收口点 ⇒ 想进第 2 夜必须当天真的处决一个人。
8. 驱动器点不动某些投票弹窗（12 人剧本）⇒ 需要「处决」的用例先跑一次确认 \`dusk.deadAfter\` 非空，否则改用 \`test.fail\` 登记。
`);

lines.push("## 验收命令（自己跑，跑绿为止）");
lines.push("");
lines.push("```bash");
lines.push(`npx playwright test e2e/${SCRIPT_DIR[target.script]}/role_scenarios.spec.ts --retries=0 --workers=1 --timeout=600000`);
lines.push("```");
lines.push("");
lines.push("⚠️ **不要**跑 `next build`、**不要**重启 dev server（3100 已在跑）。");
lines.push("⚠️ **不要**修改 `e2e/helpers/scenario.ts` / `e2e/helpers/scriptFlow.ts` / `src/` 下任何文件；发现产品缺陷 → 写 `test.fail` + 证据。");

const outDir = path.join(ROOT, "outputs/cli-briefs");
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, `${key}.md`);
fs.writeFileSync(outPath, lines.join("\n"), "utf-8");
console.log(outPath, `角色 ${roleIds.length}，场次 ${target.games.length}`);
