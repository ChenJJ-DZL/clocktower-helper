/**
 * 🛡️ 弹窗可达性台账（ModalType 全量清单 × 能否被打开）
 * ======================================================================
 * 为什么需要这条护栏：
 *   本项目反复出现「类型 + 组件 + 消费端齐全，**唯独没有生产点**」的死形态
 *   （已抓到 4 次：KLUTZ_CHOICE / mastermindFinalDay / VIRGIN_TRIGGER / DAMSEL_GUESS）。
 *   这种缺陷单测与整局 E2E 都不会红 —— 因为没人能点开它，自然没有断言。
 *
 * 判据：
 *   对 `src/types/modal.ts` 里声明的每一种弹窗，在 `src/` + `app/` 的非测试源码中找
 *   **生产点** —— 即该字面量作为对象值出现（`setModal({type:"X"})`、`meta.modal`、
 *   弹窗描述符），而**不是**比较/分支（`currentModal.type === "X"`、`case "X"`）。
 *
 * 台账三分类（`LEGACY`）：
 *   · SUPERSEDED  已被另一套机制取代（有替代物，删或留都不影响规则）
 *   · ZERO_REF    全仓零引用（纯声明残留）
 *   · ENTRY_LOST  弹窗完整、语义仍需要，但**入口丢失** ⇒ 待补接线（技术债）
 *
 * 三条断言：
 *   ① 声明 = 有生产点 ∪ 台账（不许有未登记的新弹窗）
 *   ② 台账里的类型必须**确实没有**生产点（防止名单过期后自我欺骗）
 *   ③ 台账每条必须有 kind + reason（禁止「无理由豁免」）
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../../..");
const MODAL_TYPES_FILE = resolve(ROOT, "src/types/modal.ts");
const SKIP_DIR = new Set([
  "node_modules",
  ".next",
  ".git",
  "dist",
  "coverage",
  "temp",
  "outputs",
  "e2e",
]);

type LegacyKind = "SUPERSEDED" | "ZERO_REF" | "ENTRY_LOST";

/** 已登记的「无生产点」弹窗。⚠️ 新增条目必须写明证据；接了线必须删掉这一条。 */
const LEGACY: Record<string, { kind: LegacyKind; reason: string }> = {
  ATTACK_BLOCKED: {
    kind: "SUPERSEDED",
    reason:
      "被说书人修正页取代：`roles/new_engine/imp.ability.ts` 用 buildDemonKillCorrection 产出 storytellerCorrection，玩家侧只给中性文案",
  },
  COURTIER_SELECT_ROLE: {
    kind: "SUPERSEDED",
    reason: "侍臣改走通用 ROLE_SELECT 弹窗（types/modal.ts 里 ROLE_SELECT 的 type 之一即 courtier）",
  },
  DAWN_REPORT: {
    kind: "ZERO_REF",
    reason: "全仓零引用；黎明播报由 NIGHT_DEATH_REPORT 承担",
  },
  DREAMER_RESULT: {
    kind: "SUPERSEDED",
    reason: "筑梦师改走 INFO_RESULT（`dreamer.ability.ts` displayInfo.type = dreamer_info）",
  },
  GAME_RECORDS: {
    kind: "SUPERSEDED",
    reason: "对局记录由 GlobalNavBar 的本地 state 直渲染 GameRecordsModal",
  },
  GENERIC_ALERT: {
    kind: "SUPERSEDED",
    reason: "全站 alert 已收敛到 utils/nativeDialogShim::showAlert（W10.19 收口）",
  },
  GENERIC_CONFIRM: {
    kind: "SUPERSEDED",
    reason: "同上，确认框统一走 showConfirm",
  },
  KILL_CONFIRM: {
    kind: "SUPERSEDED",
    reason: "夜间击杀统一走 NIGHT_ACTION_CONFIRM（10 个生产点）",
  },
  MAYOR_REDIRECT: {
    kind: "SUPERSEDED",
    reason: "市长转火真相改由说书人修正页/日志承载",
  },
  MAYOR_THREE_ALIVE: {
    kind: "SUPERSEDED",
    reason:
      "规则已由 app/gameLogic.ts 的 hasMayorPeacefulWin 自动结算（平安日 + 恰好 3 人存活 + 活镇长），不需要说书人再点一次",
  },
  PIT_HAG: {
    kind: "SUPERSEDED",
    reason: "麻脸巫婆改走 ROLE_SELECT（types/modal.ts 的 ROLE_SELECT.type 含 pit_hag）",
  },
  POISON_CONFIRM: {
    kind: "SUPERSEDED",
    reason: "投毒统一走 NIGHT_ACTION_CONFIRM",
  },
  POISON_EVIL_CONFIRM: {
    kind: "SUPERSEDED",
    reason: "邪恶方投毒确认同样并入 NIGHT_ACTION_CONFIRM，不再单独弹窗",
  },
  RANGER: {
    kind: "SUPERSEDED",
    reason: "巡山改走 INFO_RESULT（`ranger.ability.ts` displayInfo.type = ranger_guess）",
  },
  RAVENKEEPER_FAKE: {
    kind: "SUPERSEDED",
    reason: "守鸦人假信息并入 INFO_RESULT + storytellerCorrection",
  },
  /**
   * ✅ 2026-10-23 `ROLE_CODEX` / `ROLE_INFO` 两条 **ENTRY_LOST 已清零**，条目已删除
   * （台账规则②要求「登记的类型必须确实没有生产点」，所以接线后必须删条目，不能留在名单里）。
   *
   *   补的两个真实入口：
   *     · `ROLE_CODEX` ← `GlobalNavBar` 右侧「📖 图鉴」按钮
   *       （原来全仓唯一能开的地方是开局前的 `ScriptSelection`，那里用本地 state 直渲染，
   *        不走 modal 系统 ⇒ 对局中零入口）
   *     · `ROLE_INFO`  ← 座位右键菜单「ℹ️ 角色资料」，带 `data.roleId` 直达该角色
   *       （原来唯一入口在 `GameHeader`，而 `GameHeader` 全仓 0 个渲染点）
   *   同批还修了真 bug：`GameModals` 对 `ROLE_INFO` 同时渲染 `RoleInfoModal` +
   *   `RoleCodexModal` 两个弹窗（叠加双窗），已收敛为只渲染 `RoleCodexModal`。
   */
  SPY_GRIMOIRE: {
    kind: "SUPERSEDED",
    reason: "魔典由 SPY_RECORDS 复用同一个 SpyGrimoireModal 组件",
  },
  STORYTELLER_DEATH: {
    kind: "SUPERSEDED",
    reason: "说书人代杀统一走 NIGHT_ACTION_CONFIRM + killPlayer",
  },
  SWEETHEART_DRUNK: {
    kind: "SUPERSEDED",
    reason: "甜心改走状态效果（`sweetheart.ability.ts` 直接写 statusEffects type=drunk）",
  },
  VIRGIN_GUIDE: {
    kind: "SUPERSEDED",
    reason: "由 virginGuideInfo 状态直渲染（GameModals 里 {virginGuideInfo && <VirginGuideModal/>}）",
  },
  VIRGIN_TRIGGER: {
    kind: "SUPERSEDED",
    reason: "同上：生产路径走 virginGuideInfo，VirginTriggerModal 是早期双写残留",
  },
};

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (SKIP_DIR.has(name)) continue;
      collectSourceFiles(p, out);
    } else if (/\.(ts|tsx)$/.test(name)) {
      if (name.includes(".test.") || name.includes(".spec.")) continue;
      if (resolve(p) === MODAL_TYPES_FILE) continue;
      out.push(p);
    }
  }
  return out;
}

function declaredTypes(): string[] {
  const src = readFileSync(MODAL_TYPES_FILE, "utf-8");
  const out = new Set<string>();
  const re = /\btype:\s*"([A-Z][A-Z0-9_]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out.add(m[1]);
  return [...out];
}

/** 比较/分支位置：字面量前面是这些符号 ⇒ 只读，不是生产点 */
const COMPARISON_TAIL = /(===|!==|==|!=|case)\s*$/;

/** 源码缓存：一次性读盘，避免 65 个类型 × 数百文件 = 上万次 readFileSync（会超时） */
let SOURCE_CACHE: Array<{ rel: string; src: string }> | null = null;
function sources(): Array<{ rel: string; src: string }> {
  if (SOURCE_CACHE) return SOURCE_CACHE;
  const files = [
    ...collectSourceFiles(join(ROOT, "src")),
    ...collectSourceFiles(join(ROOT, "app")),
  ];
  SOURCE_CACHE = files.map((f) => ({
    rel: relative(ROOT, f).replace(/\\/g, "/"),
    src: readFileSync(f, "utf-8"),
  }));
  return SOURCE_CACHE;
}

function productionPoints(type: string): string[] {
  const hits: string[] = [];
  const needle = `"${type}"`;
  for (const { rel, src } of sources()) {
    let idx = src.indexOf(needle);
    while (idx !== -1) {
      const before = src.slice(Math.max(0, idx - 20), idx);
      if (!COMPARISON_TAIL.test(before)) {
        hits.push(`${rel}:${src.slice(0, idx).split(/\r?\n/).length}`);
      }
      idx = src.indexOf(needle, idx + needle.length);
    }
  }
  return hits;
}

describe("🛡️ 弹窗可达性台账", () => {
  const declared = declaredTypes();

  it("声明数量合理（防止正则失效后变成空测）", () => {
    expect(declared.length).toBeGreaterThanOrEqual(60);
  });

  it("① 每个弹窗要么有生产点，要么已登记进台账", () => {
    const unregistered = declared.filter(
      (t) => productionPoints(t).length === 0 && !(t in LEGACY)
    );
    expect(
      unregistered,
      `以下弹窗**永远不会被打开**，且没有登记台账：\n` +
        `${unregistered.join("\n")}\n` +
        `⇒ 要么补一个 setModal({type:"X"}) 生产点，要么在 LEGACY 里写明理由。`
    ).toEqual([]);
  });

  it("② 台账里的类型必须确实没有生产点（名单过期即报红）", () => {
    const stale = Object.keys(LEGACY).filter(
      (t) => productionPoints(t).length > 0
    );
    expect(
      stale,
      `以下弹窗已经有生产点了，请从 LEGACY 台账里删掉：${stale.join(", ")}`
    ).toEqual([]);
  });

  it("③ 台账每条必须有 kind + reason", () => {
    const bad = Object.entries(LEGACY)
      .filter(([, v]) => !v.kind || !v.reason || v.reason.length < 8)
      .map(([k]) => k);
    expect(bad, `台账缺证据：${bad.join(", ")}`).toEqual([]);
  });

  it("④ 台账不得登记未声明的类型（删了弹窗要同步删台账）", () => {
    const orphans = Object.keys(LEGACY).filter((t) => !declared.includes(t));
    expect(orphans, `台账里有已不存在的弹窗：${orphans.join(", ")}`).toEqual([]);
  });

  it("⑤ 三条关键规则弹窗必须活着（回归锚点）", () => {
    // 落难少女猜测（本轮新接）、主谋额外一天、呆瓜选择
    for (const t of ["DAMSEL_GUESS", "KLUTZ_CHOICE", "STORYTELLER_SELECT"]) {
      expect(productionPoints(t).length, `${t} 没有生产点`).toBeGreaterThan(0);
    }
  });
});
