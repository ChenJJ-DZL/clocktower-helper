/**
 * 生成逐剧本的 CLI 派单 prompt（喂给 `cmdc -p ... < prompt.txt`）。
 *
 * 设计原则（吃过亏）：
 *   1. **只让它读两份文件**（brief + 模板前 140 行）—— 它的上下文大部分烧在读文件上；
 *   2. **一条回复只做一件事**，且必须直接写文件（否则会陷入纯 grep/read 循环，实测 39 分钟 0 产出）；
 *   3. **禁止碰 src/ 与 helpers/**：发现产品缺陷只能写 `test.fail` + 证据；
 *   4. **禁止 build、禁止重启 dev**（3100 已在跑，且 build 会写坏 .next）。
 *
 * 用法：node scripts/gen-cli-prompt.mjs <key>
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DIR = {
  bad_moon_rising: "黯月初升",
  sects_and_violets: "梦殒春宵",
  haunted_manor: "凶宅魅影",
  garden_of_dreams: "游园惊梦",
  poppyganda: "罂粟花开",
};

const key = process.argv[2];
if (!key || !DIR[key]) {
  console.error("用法: node scripts/gen-cli-prompt.mjs <bad_moon_rising|sects_and_violets|haunted_manor|garden_of_dreams|poppyganda>");
  process.exit(1);
}

const briefPath = `outputs/cli-briefs/${key}.md`;
if (!fs.existsSync(path.join(ROOT, briefPath))) {
  console.error(`缺少 ${briefPath}，先跑 node scripts/gen-role-brief.mjs ${key}`);
  process.exit(1);
}
const brief = fs.readFileSync(path.join(ROOT, briefPath), "utf-8");
const roleCount = (brief.match(/角色数 \*\*(\d+)\*\*/) ?? [])[1] ?? "?";

const prompt = `你是本仓库的编码代理。工作目录 = C:\\\\Users\\\\chenj\\\\WorkBuddy\\\\血染说书人\\\\clocktower-helper（已在此目录）。
当前 git 干净，dev server 已在 127.0.0.1:3100 运行。

# 唯一任务
新建 \`e2e/${key}/role_scenarios.spec.ts\`，把「${DIR[key]}」剧本的 **${roleCount} 个角色**逐个做定向场景验证。
文件路径必须逐字一致（覆盖率台账按这个路径统计）。

# 只读这两份（各读一次，别重复读、别扫其它文件）
1. \`${briefPath}\` —— 场次阵容（照抄注入）+ 25 个角色的官方能力原文 + 判据模板 + 已踩坑清单。**这是你的主要依据。**
2. \`e2e/whispering_secrets/role_scenarios.spec.ts\` —— **只读前 140 行**，拿 import 与 helper 写法（\`loadScene/bootScene/driveNight/driveDusk/seatByRole/snapNow/stepsOf\`）。

# 硬规则（违反即失败）
- **不得修改** \`src/\` 下任何文件、\`e2e/helpers/\` 下任何文件、其它剧本的 spec。
- **不得跑** \`next build\` / \`next dev\` / \`next start\`；dev 已在 3100 跑着。
- **不得** \`.skip\` / \`.fixme\`；不得为了变绿删断言。
- 发现产品缺陷 → 写 \`test.fail(true, "<一句话结论>")\` + 注释里写「实测证据 + 根因推测 + 修法方向」，并在最终报告里单列。
- 每个 test 只 \`bootScene\` 一次。

# 执行方式（严格按这个节奏；**不许先做长时间分析**）
1. 探针**已经写好了**：\`e2e/${key}/_probe.spec.ts\`。直接跑它拿真实弹窗文案：
   \`npx playwright test e2e/${key}/_probe.spec.ts --retries=0 --workers=1 --timeout=600000\`
   （若它报错，就地小改探针，不要重写成大体量文件。）
2. 然后**立刻开始写正式用例**，节奏是「写一个 describe → 跑一次 → 改到绿 → 写下一个」。
   不许把 25 个角色一次性写完再跑。
3. 全绿后删掉 \`_probe.spec.ts\`，再整体跑一次确认。
4. 最终跑：\`npx playwright test e2e/${key}/role_scenarios.spec.ts --retries=0 --workers=1 --timeout=600000\`

# 输出协议（强制，否则会空转）
- 每条回复思考 ≤ 150 字；
- **一条回复只做一个动作**：写 1 个文件，或跑 1 条命令，二选一；
- 本条回复必须直接调用写文件或跑命令，**不要**输出长篇解释、不要先规划多个文件；
- 禁止派子代理、禁止再 grep/glob 探索（除上面指定的两份文件）；
- **同一份文件不许读第二遍**；读完 brief 就必须开始写；
- **前 3 条回复里必须至少有 1 次写文件**（写 spec 的第一个 describe）——做不到就说明你在空转。

# 完成标准（也是回报格式）
全部跑完后，用这个格式回报一次：
\`\`\`
剧本：${DIR[key]}（${key}）
用例文件：e2e/${key}/role_scenarios.spec.ts
角色覆盖：X/${roleCount}（列出没覆盖的 id 与原因）
运行结果：N passed / M failed（附命令）
登记缺口：逐条列 test.fail 的一句话结论
越界改动：无（若有，逐条列出）
\`\`\`
`;
fs.mkdirSync(path.join(ROOT, "outputs/cli-prompts-v2"), { recursive: true });
const out = path.join(ROOT, "outputs/cli-prompts-v2", `${key}.txt`);
fs.writeFileSync(out, prompt, "utf-8");
console.log(out, `${prompt.length} 字符，角色 ${roleCount}`);
