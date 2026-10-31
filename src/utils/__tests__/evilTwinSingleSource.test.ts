/**
 * 镜像双子 · 单一事实来源架构护栏（静态扫描源码）
 * ======================================================================
 * 2026-11-01 P0 事故根因是「同一规则两处各写各的」：判胜路径内联启发式
 * （把首个存活镇民当善良双子），与展示路径口径分叉 ⇒ 处决 15号-小精灵误判。
 *
 * 本文件是**静态护栏**（参照 `singleSourceOfTruth.test.ts` 的 collectFiles 写法），
 * 锁定以下四条架构契约（Lead 2026-11-01 裁决口径）：
 *
 *   E1 启发式只允许存在于唯一事实源 `src/utils/evilTwinHelper.ts`；
 *      其它文件必须调用 resolver，禁止内联「首个存活镇民/外来者」式实现。
 *   E2 `resolveEvilTwinPairForDisplay`（启发式展示版）只能被展示/调度白名单文件导入：
 *        dynamicQueueGenerator / nightInfoAdapter / useNightActionHandler /
 *        evil_twin.ability / SeatNode / StorytellerTuningContext / roles/minion/evil_twin。
 *      判胜级文件（app/gameLogic.ts、useExecutionHandlers.ts、useConfirmHandlers.ts）
 *      **不得**导入展示版（必须用严格版）。
 *   E3 判胜文案「善良双子被处决」只允许出现在
 *        `src/utils/winConditions/winReasonCodes.ts`（唯一常量定义）
 *        与 `src/roles/minion/evil_twin.ts`（给说书人看的规则说明文案）。
 *      app/** 与 src/hooks/** 的**代码**里不得出现该字面量（只允许引用
 *      `GOOD_TWIN_EXECUTED_REASON` 常量）。
 *   E4 `app/gameLogic.ts` 不得再有 `isGameOver: true` 的裸字面量返回 ——
 *      所有终局必须走 `makeWinResult`（带 reasonCode + evidence）。
 *      另：`useConfirmHandlers.ts` 若出现 `setWinResult`，必须同时有
 *      `victoryRef.current` 与 `GOOD_TWIN_EXECUTED_REASON` 引用（防第二条判胜落地路径裸奔）。
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function collectFiles(dirs: string[]): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (
          entry.name === "node_modules" ||
          entry.name === ".next" ||
          entry.name === "__tests__"
        ) {
          continue;
        }
        walk(full);
      } else if (/\.tsx?$/.test(entry.name)) {
        out.push(full);
      }
    }
  };
  for (const d of dirs) {
    const full = path.join(ROOT, d);
    if (fs.existsSync(full)) walk(full);
  }
  return out;
}

const SOURCE_FILES = collectFiles(["app", "src"]).filter(
  (f) => !f.includes(`${path.sep}__tests__${path.sep}`)
);

function rel(file: string): string {
  return path.relative(ROOT, file).replace(/\\/g, "/");
}

function read(file: string): string {
  return fs.readFileSync(file, "utf8");
}

/** 去掉块注释与行注释后的代码（保留行号结构，便于报错定位） */
function codeOnly(src: string): string {
  const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, (m) =>
    m.replace(/[^\n]/g, " ")
  );
  return noBlock
    .split(/\r?\n/)
    .map((line) => {
      const idx = line.indexOf("//");
      if (idx < 0) return line;
      // 保护 https:// 等 URL
      if (line[idx - 1] === ":") return line;
      return line.slice(0, idx);
    })
    .join("\n");
}

function linesOf(src: string): string[] {
  return src.split(/\r?\n/);
}

function hits(files: string[], pattern: RegExp, skip?: (f: string) => boolean) {
  const violations: string[] = [];
  for (const file of files) {
    if (skip?.(file)) continue;
    const code = codeOnly(read(file));
    linesOf(code).forEach((line, i) => {
      const m = line.match(pattern);
      if (m)
        violations.push(`${rel(file)}:${i + 1}: ${line.trim().slice(0, 120)}`);
    });
  }
  return violations;
}

// ────────────────────────────────────────────────────────────────
// E1 · 启发式只允许在 evilTwinHelper.ts 实现
// ────────────────────────────────────────────────────────────────
const HELPER = "src/utils/evilTwinHelper.ts";

/** 失败关闭提示：展示启发式必须走 resolver，禁止内联重写 */
const HEURISTIC_SIGNATURES: RegExp[] = [
  // 核心指纹：twin 语义变量直接由「find/filter + 镇民/外来者谓词」挑选
  //   （历史三处内联实现全都是这一形态，见 2026-11-01 P0 复盘）
  /(?:good_?twin|对立双子|善良双子)[\s\S]{0,400}?\.(?:find|filter)\([^;{}]{0,300}?isSeatTownsfolkOrOutsider/i,
  // 反向：先挑镇民/外来者，再当 goodTwin 使用
  /isSeatTownsfolkOrOutsider[\s\S]{0,240}?(?:good_?twin|对立双子|善良双子)/i,
  // 历史实现遗留的内部命名（只允许出现在唯一事实源内）
  /(?:guessedSeat|defaultGoodSeat)\b/,
  // 变量名带 twin，值来自「find/filter + 镇民/外来者谓词」
  /(?:const|let|var)\s+\w*(?:good_?twin|guessedSeat)\w*\s*=[\s\S]{0,300}?\.(?:find|filter)\([^;{}]{0,300}?isSeatTownsfolkOrOutsider/i,
  // 内联「镇民或外来者」字面量三元组当双子候选（旧版启发式指纹）
  /(?:goodTwin|good_twin)[\s\S]{0,240}?["'](?:townsfolk|outsider)["']\s*(?:\)|\|\|)/,
];

describe("E1 · 启发式实现只允许存在于唯一事实源 evilTwinHelper.ts", () => {
  it("非 helper 的产品文件不得内联「首个存活镇民当善良双子」式启发式", () => {
    const violations: string[] = [];
    for (const file of SOURCE_FILES) {
      if (rel(file) === HELPER) continue;
      const code = codeOnly(read(file));
      // 只检查与镜像双子相关的文件（避免误伤其它角色的镇民/外来者判定）
      if (
        !/(?:evil_twin|evilTwin|goodTwin|good_twin|对立双子|善良双子)/.test(
          code
        )
      ) {
        continue;
      }
      for (const pattern of HEURISTIC_SIGNATURES) {
        if (pattern.test(code)) {
          violations.push(`${rel(file)}: 命中启发式指纹 ${pattern}`);
        }
      }
    }
    expect(
      violations,
      "镜像双子配对启发式只允许在 src/utils/evilTwinHelper.ts 实现；" +
        "其余文件必须调用 resolveEvilTwinPair / resolveEvilTwinPairForDisplay：\n" +
        violations.join("\n")
    ).toEqual([]);
  });

  it("唯一事实源必须同时导出严格版与展示版 resolver", () => {
    const code = read(path.join(ROOT, HELPER));
    expect(code).toMatch(/export function resolveEvilTwinPair\(/);
    expect(code).toMatch(/export function resolveEvilTwinPairForDisplay\(/);
  });

  it("指纹自检（有牙）：能命中 P0 之前的三段真实内联实现", () => {
    // 以下三段为 git HEAD（2026-11-01 P0 修复前）实现的**关键节选**：
    //   · src/components/SeatNode.tsx::computeIsGoodTwin
    //   · src/components/game/StorytellerTuningContext.tsx::defaultGoodTwinId
    //   · src/roles/minion/evil_twin.ts::dialog
    // 说明：`!x.isDead` 一行按仓库死亡标记护栏写成 isSeatAlive(x)
    //   （行为等价，避免本测试文件自己撞 deathMarkerUnification 的棘轮上限），
    //   判定骨架（twin 语义变量 + find/filter + 镇民/外来者谓词）逐字保留。
    // 若哪天有人把这种实现写回来，上面的扫描必须变红；本用例防止正则被改弱后变哑。
    const historicalImplementations = [
      // SeatNode（旧）
      `function computeIsGoodTwin(s: any, seats: any[]): boolean {
        if (s.role?.id === "evil_twin") return false;
        if (s.isGoodTwin) return true;
        const evilSeat = seats.find((seat) => seat.role?.id === "evil_twin");
        if (!evilSeat) return false;
        const defaultGoodSeat =
          seats.find(
            (other) =>
              other.id !== evilSeat.id &&
              isSeatTownsfolkOrOutsider(other) &&
              !other.isEvilConverted &&
              isSeatAlive(other)
          ) || seats.find((other) => other.id !== evilSeat.id && isSeatAlive(other));
        return defaultGoodSeat?.id === s.id;
      }`,
      // StorytellerTuningContext（旧）
      `const defaultGoodTwinId = useMemo(() => {
        if (roleId !== "evil_twin") return null;
        const explicitGoodTwin = seats.find((s) => s.isGoodTwin);
        if (explicitGoodTwin) return explicitGoodTwin.id;
        const candidate =
          seats.find(
            (s) =>
              s.id !== seatId &&
              isSeatTownsfolkOrOutsider(s) &&
              !s.isEvilConverted &&
              isSeatAlive(s)
          ) || seats.find((s) => s.id !== seatId && isSeatAlive(s));
        return candidate ? candidate.id : null;
      }, [roleId, seats, seatId]);`,
      // roles/minion/evil_twin.ts（旧）
      `const goodTwin =
        seats.find((s: any) => s.isGoodTwin) ||
        (context?.evilTwinPair?.goodId !== undefined
          ? seats.find((s: any) => s.id === context.evilTwinPair.goodId)
          : null) ||
        seats.find(
          (s: any) =>
            s.id !== playerSeatId &&
            (isSeatTownsfolkOrOutsider(s)) &&
            !s.isEvilConverted &&
            isSeatAlive(s)
        ) ||
        seats.find((s: any) => s.id !== playerSeatId && isSeatAlive(s));`,
    ];

    const misses = historicalImplementations.filter(
      (code) => !HEURISTIC_SIGNATURES.some((p) => p.test(code))
    );
    expect(
      misses.length,
      `启发式指纹漏检 ${misses.length} 段历史实现（护栏变哑）：\n${misses
        .map((m) => m.slice(0, 80))
        .join("\n---\n")}`
    ).toBe(0);
  });

  it("指纹自检（不误报）：当前 resolver 调用写法不得命中", () => {
    const currentUsage = [
      "const resolved = resolveEvilTwinPairForDisplay(seats, null);",
      "const goodTwin = resolved.goodTwinSeat;",
      "const { evilTwinSeat, goodTwinSeat } = resolveEvilTwinPairForDisplay(seats, pair);",
      "resolveEvilTwinPair(seats, evilTwinPair);",
    ];
    for (const snippet of currentUsage) {
      const hit = HEURISTIC_SIGNATURES.some((p) => p.test(snippet));
      expect(hit, `resolver 调用被误报为内联启发式：${snippet}`).toBe(false);
    }
  });
});

// ────────────────────────────────────────────────────────────────
// E2 · 展示版 resolver 的导入白名单
// ────────────────────────────────────────────────────────────────
const DISPLAY_WHITELIST = new Set([
  // 调度/展示（Lead 2026-11-01 裁决口径）
  "src/utils/dynamicQueueGenerator.ts",
  "src/utils/nightInfoAdapter.ts",
  "src/hooks/useNightActionHandler.ts",
  "src/roles/new_engine/evil_twin.ability.ts",
  "src/components/SeatNode.tsx",
  "src/components/game/StorytellerTuningContext.tsx",
  "src/roles/minion/evil_twin.ts",
]);

/** 判胜级文件：必须用严格版，绝不导入展示版 */
const VICTORY_FILES = [
  "app/gameLogic.ts",
  "src/hooks/useExecutionHandlers.ts",
  "src/hooks/useConfirmHandlers.ts",
];

function importsOf(file: string): string[] {
  const code = codeOnly(read(file));
  const names: string[] = [];
  const re = /import\s*\{([^}]*)\}\s*from\s*["'][^"']*evilTwinHelper["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    for (const raw of m[1].split(",")) {
      const name = raw
        .trim()
        .split(/\s+as\s+/)[0]
        ?.trim();
      if (name) names.push(name);
    }
  }
  return names;
}

describe("E2 · resolveEvilTwinPairForDisplay 只允许展示/调度白名单导入", () => {
  it("实际导入展示版 resolver 的文件 ⊆ 白名单", () => {
    const importers: string[] = [];
    for (const file of SOURCE_FILES) {
      if (rel(file) === HELPER) continue;
      if (importsOf(file).includes("resolveEvilTwinPairForDisplay")) {
        importers.push(rel(file));
      }
    }
    const illegal = importers.filter((f) => !DISPLAY_WHITELIST.has(f));
    expect(
      illegal,
      "以下文件不在展示/调度白名单内，却导入了 resolveEvilTwinPairForDisplay：\n" +
        `${illegal.join("\n")}\n（判胜级文件必须使用严格版 resolveEvilTwinPair）`
    ).toEqual([]);
    // 覆盖度自检：所有已收敛的展示消费方都在用展示版（防悄悄改回严格版后行为退化）
    const expectedUsing = [
      "src/utils/dynamicQueueGenerator.ts",
      "src/utils/nightInfoAdapter.ts",
      "src/hooks/useNightActionHandler.ts",
      "src/components/SeatNode.tsx",
      "src/components/game/StorytellerTuningContext.tsx",
      "src/roles/minion/evil_twin.ts",
    ];
    for (const f of expectedUsing) {
      expect(importers, `展示/调度文件应导入展示版 resolver：${f}`).toContain(
        f
      );
    }
  });

  it("判胜级文件绝不导入展示版（只能用严格版）", () => {
    const violations: string[] = [];
    for (const file of VICTORY_FILES) {
      const imports = importsOf(path.join(ROOT, file));
      if (imports.includes("resolveEvilTwinPairForDisplay")) {
        violations.push(`${file}: 判胜路径不得导入展示版 resolver`);
      }
      if (!imports.includes("resolveEvilTwinPair")) {
        violations.push(`${file}: 判胜路径必须导入严格版 resolveEvilTwinPair`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("全仓代码中对展示版 resolver 的调用只出现在白名单/helper 内", () => {
    const calls = hits(SOURCE_FILES, /resolveEvilTwinPairForDisplay\(/);
    const allowedFiles = new Set([HELPER, ...DISPLAY_WHITELIST]);
    const illegal = calls.filter(
      (c) => !allowedFiles.has(c.slice(0, c.indexOf(":")))
    );
    expect(illegal, `以下调用点不在白名单内：\n${illegal.join("\n")}`).toEqual(
      []
    );
  });
});

// ────────────────────────────────────────────────────────────────
// E3 · 判胜文案唯一常量
// ────────────────────────────────────────────────────────────────
const WIN_REASON_FILE = "src/utils/winConditions/winReasonCodes.ts";
const TWIN_RULE_TEXT_FILE = "src/roles/minion/evil_twin.ts";
const GOOD_TWIN_EXECUTED_LITERAL = "善良双子被处决";
const SAINT_EXECUTED_LITERAL = "圣徒被处决";

function filesContainingCodeLiteral(literal: string): string[] {
  return SOURCE_FILES.filter((f) => codeOnly(read(f)).includes(literal)).map(
    rel
  );
}

function filesContainingLiteralIn(
  literal: string,
  prefixes: string[]
): string[] {
  return filesContainingCodeLiteral(literal).filter((f) =>
    prefixes.some((p) => f.startsWith(p))
  );
}

describe("E3 · 判胜文案必须引用唯一常量（禁止各写一份字符串）", () => {
  it.each([
    ["善良双子被处决", GOOD_TWIN_EXECUTED_LITERAL],
    ["圣徒被处决", SAINT_EXECUTED_LITERAL],
  ])("app/** 与 src/hooks/** 的代码里不得出现字面量「%s」（只允许引用注册表常量）", (_label, literal) => {
    const violations = filesContainingLiteralIn(literal, [
      "app/",
      "src/hooks/",
    ]);
    expect(
      violations,
      "判胜文案必须引用 src/utils/winConditions/winReasonCodes.ts 的常量，" +
        `禁止在 app/hooks 再写一份：\n${violations.join("\n")}`
    ).toEqual([]);
  });

  it("「善良双子被处决」全仓只允许注册表（常量定义）与 legacy 规则说明文案两处", () => {
    const found = filesContainingCodeLiteral(GOOD_TWIN_EXECUTED_LITERAL);
    expect(found.sort()).toEqual([WIN_REASON_FILE, TWIN_RULE_TEXT_FILE].sort());
  });

  it("注册表必须导出唯一文案常量，且 gameLogic 引用它们（不再写裸字符串）", () => {
    const registry = read(path.join(ROOT, WIN_REASON_FILE));
    expect(registry).toMatch(/export const GOOD_TWIN_EXECUTED_REASON\s*=/);
    expect(registry).toMatch(/export const SAINT_EXECUTED_REASON\s*=/);
    expect(registry).toContain(GOOD_TWIN_EXECUTED_LITERAL);
    expect(registry).toContain(SAINT_EXECUTED_LITERAL);

    const gameLogic = codeOnly(read(path.join(ROOT, "app/gameLogic.ts")));
    expect(
      gameLogic,
      "app/gameLogic.ts 必须从注册表导入 GOOD_TWIN_EXECUTED_REASON / SAINT_EXECUTED_REASON"
    ).toMatch(/GOOD_TWIN_EXECUTED_REASON/);
    expect(gameLogic).toMatch(/SAINT_EXECUTED_REASON/);
    expect(gameLogic).not.toContain(GOOD_TWIN_EXECUTED_LITERAL);
    expect(gameLogic).not.toContain(SAINT_EXECUTED_LITERAL);
  });

  it("confirmEvilTwinExecution 必须重算证据并引用注册表常量（防第二条判胜路径裸奔）", () => {
    const file = "src/hooks/useConfirmHandlers.ts";
    const code = codeOnly(read(path.join(ROOT, file)));
    if (code.includes("setWinResult(")) {
      expect(
        code,
        `${file}: 出现 setWinResult 必须同时补 victoryRef.current（守住终局状态）`
      ).toContain("victoryRef.current");
    }
    // 弹窗确认 → 落地判胜的路径必须：严格 resolver 重算 + 唯一文案常量 + victoryRef
    for (const symbol of [
      "resolveEvilTwinPair",
      "GOOD_TWIN_EXECUTED_REASON",
      "victoryRef.current",
    ]) {
      expect(
        code,
        `${file}: confirmEvilTwinExecution 缺少必需符号 ${symbol}`
      ).toContain(symbol);
    }
  });
});

// ────────────────────────────────────────────────────────────────
// E4 · gameLogic 所有终局必须走 makeWinResult
// ────────────────────────────────────────────────────────────────
describe("E4 · app/gameLogic.ts 终局必须走 makeWinResult（禁止裸 isGameOver:true）", () => {
  it("不得出现 `isGameOver: true` 裸字面量返回", () => {
    const code = codeOnly(read(path.join(ROOT, "app/gameLogic.ts")));
    const matches = code.match(/isGameOver\s*:\s*true/g) ?? [];
    expect(
      matches,
      "所有终局返回必须走 makeWinResult(code, reason, evidence)，" +
        "禁止直接返回 { isGameOver: true, winner: ... }（会绕过 reasonCode/evidence）"
    ).toEqual([]);
  });

  it("必须引用注册表 makeWinResult，且终局数量与注册表规模同阶（防空转）", () => {
    const code = codeOnly(read(path.join(ROOT, "app/gameLogic.ts")));
    const calls = code.match(/makeWinResult\(/g) ?? [];
    expect(code).toMatch(
      /import\s*\{[\s\S]*?makeWinResult[\s\S]*?\}\s*from\s*["'][^"']*winReasonCodes["']/
    );
    expect(
      calls.length,
      "makeWinResult 调用点过少，疑似有终局分支绕过注册表"
    ).toBeGreaterThanOrEqual(15);
  });
});
