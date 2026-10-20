/**
 * 夜序队列写入点护栏（2026-10-20 新增）
 * ==================================================================
 * 🔴 事故（E2E seed=2026 实锤）：
 *   洗脑师技能执行时有**两处** `insertIntoWakeQueueAfterCurrent(targetId, …)`：
 *     · 「洗脑师桥接」块：`position:"next"` + `stepOverride: CERENOVUS_NOTICE_STEP_ID`
 *       + `reinsertIfProcessed` —— **正确**（紧跟洗脑师、按告知页渲染）；
 *     · 同文件「结果文案」块：只有 `force: true` ——
 *       **无 position**（走默认 "priority" 按夜序插到队尾）、
 *       **无 stepOverride**（适配器按座位**真实角色**解析技能页）。
 *   叠加后实测后果：洗脑目标 = 8号【神谕者】（`firstNightPriority: null`，
 *   首夜本不该行动）被追加到队列末尾并执行「邪恶亡灵侦测」；同一座位因此出现
 *   **两个**队列节点，`systemStepRoleIds`（key = 队列 index）被撑开一位，
 *   导致**小精灵**步骤错位、无弹窗静默跳过。
 *
 * 🔒 铁律：夜序队列的写入点必须**唯一**；任何「目标座位」插入必须显式声明
 *   该节点应当**按什么解析**（`stepOverride` 系统步骤 / `roleOverride` 新身份）。
 *   只写 `force:true` = 让适配器按**真实角色**解析 ⇒ 等于悄悄加了一个技能步骤。
 *
 * 判据（均可执行）：
 *   L1 洗脑告知插入点**恰好 1 处**，且带 `stepOverride`
 *   L2 全库：`force:true` 的插入**必须**同时带 `stepOverride` 或 `roleOverride`
 *   L3 队列写入的**文件集合**受控（新增文件必须评审后登记）
 *
 * ⚠️ 源码级断言必须先剥注释（项目铁律）：`nightInfoAdapter.ts` 的注释里
 *    出现过该函数名，直接 grep 会把它误当调用点。
 */
import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../../..");

/** 剥离 // 行注释与 /* *\/ 块注释（保留字符串内部内容，但本护栏只做粗粒度判据） */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/([^:"'`])\/\/.*$/gm, "$1");
}

function readStripped(rel: string): string {
  return stripComments(fs.readFileSync(path.join(ROOT, rel), "utf8"));
}

function collectTs(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "__tests__" || e.name === "node_modules") continue;
      collectTs(p, out);
    } else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

/** 取出每个 `insertIntoWakeQueueAfterCurrent(...)` 调用的实参块（括号配平） */
function extractCalls(src: string): string[] {
  const out: string[] = [];
  // ⚠️ 只认**调用**形态：`fn(` 或 `fn?.(`。
  //    类型声明写作 `insertIntoWakeQueueAfterCurrent: (seatId: number, …) => void`
  //    （名字与括号之间有 `:`），不能被当成调用点。
  const callRe = /insertIntoWakeQueueAfterCurrent\s*(?:\?\.)?\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = callRe.exec(src))) {
    const open = m.index + m[0].length - 1;
    let depth = 0;
    let j = open;
    for (; j < src.length; j++) {
      const c = src[j];
      if (c === "(") depth++;
      else if (c === ")") {
        depth--;
        if (depth === 0) break;
      }
    }
    out.push(src.slice(open, j + 1));
  }
  return out;
}

/** 已登记（评审通过）的队列写入文件白名单 */
const ALLOWED_FILES = new Set([
  "src/hooks/useNightActionHandler.ts",
  "src/hooks/useGameController.ts",
  "src/hooks/useExecutionHandlers.ts",
  "src/hooks/useNightEngine.ts",
  "src/contexts/GameContext.tsx",
  "src/components/game/GameModals.tsx",
  "src/components/modals/BarberSwapModal.tsx",
  "src/components/modals/DayAbilityModal.tsx",
]);

describe("夜序队列写入点护栏", () => {
  it("L1 洗脑告知插入点恰好 1 处，且带 stepOverride", () => {
    const src = readStripped("src/hooks/useNightActionHandler.ts");
    const calls = extractCalls(src);
    const cerenovusCalls = calls.filter((c) =>
      /CERENOVUS_NOTICE_STEP_ID/.test(c)
    );
    expect(
      cerenovusCalls.length,
      "洗脑告知插入点必须恰好 1 处（带 stepOverride）—— 多出来的那处会按真实角色再醒一次，实测首夜唤醒神谕者"
    ).toBe(1);
    expect(cerenovusCalls[0]).toMatch(/stepOverride\s*:/);
    expect(cerenovusCalls[0]).toMatch(/position\s*:\s*["']next["']/);
  });

  it("L2 force:true 的插入必须显式声明解析方式（stepOverride / roleOverride）", () => {
    const files = collectTs(path.join(ROOT, "src"));
    const offenders: string[] = [];
    for (const f of files) {
      const src = stripComments(fs.readFileSync(f, "utf8"));
      for (const call of extractCalls(src)) {
        if (!/force\s*:\s*true/.test(call)) continue;
        const hasStepOverride = /stepOverride\s*:/.test(call);
        const hasRoleOverride = /roleOverride\s*:/.test(call);
        if (!hasStepOverride && !hasRoleOverride) {
          offenders.push(
            `${path.relative(ROOT, f).replace(/\\/g, "/")}: ${call
              .replace(/\s+/g, " ")
              .slice(0, 180)}`
          );
        }
      }
    }
    expect(
      offenders,
      `「force:true 但无 stepOverride/roleOverride」⇒ 适配器按座位真实角色解析，等于偷偷追加一个技能步骤：\n${offenders.join(
        "\n"
      )}`
    ).toEqual([]);
  });

  it("L3 队列写入文件集合受控（新增文件须评审后登记白名单）", () => {
    const files = collectTs(path.join(ROOT, "src"));
    const offenders: string[] = [];
    for (const f of files) {
      const src = stripComments(fs.readFileSync(f, "utf8"));
      // ⚠️ 必须用 extractCalls 判「调用」——类型声明
      //    （`insertIntoWakeQueueAfterCurrent: (…) => void`）不算写入点。
      if (extractCalls(src).length === 0) continue;
      const rel = path.relative(ROOT, f).replace(/\\/g, "/");
      if (!ALLOWED_FILES.has(rel)) offenders.push(rel);
    }
    expect(
      offenders,
      `出现未登记的夜序队列写入文件（评审是否为第二个写入点后加入白名单）：${offenders.join(", ")}`
    ).toEqual([]);
  });

  /**
   * L4 预览面板快照必须透传 `generateDynamicNightQueue` 读取的全部座位字段。
   *
   * 🔴 事故（2026-10-20 E2E seed=2026）：`useGameController::liveNightOrderPreview`
   *   重建的座位快照漏了 `isEvilConverted` ⇒ 面板队列缺「邪恶阵营告知」首步；
   *   而该步骤与图书管理员**同座位 8**，I10 对账时抢走槽位 ⇒ 4 条「步骤越序」
   *   全是误报。同类事故此前已发生两次（漏 `apparentDemonRole` → 疯子标签错、
   *   漏 `statusDetails` → 赏金猎人每夜白送信息）。
   * ⇒ 用「字段清单」硬锁：新增任何被生成器读取的字段，必须同步加到本清单与快照。
   */
  it("L4 预览面板快照透传队列生成器所需的座位字段", () => {
    const PREVIEW_FIELDS = [
      "isEvilConverted", // 邪恶阵营告知（赏金猎人转化）
      "apparentDemonRole", // 疯子伪装恶魔
      "statusDetails", // 赏金已知 / 洗脑标记等
      "charadeRole", // 酒鬼·提线木偶伪装身份
      "isDead",
      "isDemonSuccessor",
    ];
    const src = readStripped("src/hooks/useGameController.ts");
    // 定位 liveNightOrderPreview 的 useMemo（该 useMemo 内部先建 snapshot 再算队列）
    const anchor = src.indexOf("const liveNightOrderPreview");
    expect(anchor, "未找到 liveNightOrderPreview 定义").toBeGreaterThan(0);
    const block = src.slice(anchor, anchor + 8000);
    const missing = PREVIEW_FIELDS.filter((f) => !new RegExp(`${f}\\s*:`).test(block));
    expect(
      missing,
      `预览面板快照漏字段（会导致「夜晚行动顺序」面板与实际执行队列分叉）：${missing.join(", ")}`
    ).toEqual([]);
  });
});
