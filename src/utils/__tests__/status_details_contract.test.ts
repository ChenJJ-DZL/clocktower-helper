import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { addPoisonMark } from "../gameRules";

/**
 * 🛡️ 「statusDetails 只能是字符串」契约
 * ==================================================================
 * 官方数据模型里 `Seat.statusDetails` 的类型就是 `string[]`，全仓有 20+ 处
 * 直接 `d.includes("普卡中毒")` 之类的读取。一旦有人在写入时塞进对象，
 * 这些读取点会**整条链路抛错**。
 *
 * 实测事故（2026-10-21，凶宅魅影 seed=91007）：
 *   普卡（新引擎）把 `{ type:"poison", source:"pukka", timestamp }` 写进
 *   `statusDetails` ⇒ 点击「进入黄昏处决阶段」时 `cleanseTempStatuses`
 *   抛 `includes is not a function` ⇒ 白天永远推进不到夜晚，
 *   整局在 dusk#2 卡死（E2E 报 I6-progress 超时）。
 *
 * 本文件同时用两条互补判据守住它：
 *   ① **行为**：读取方对脏数据必须免疫（不抛错、按字符串语义过滤）；
 *   ② **源码**：写入方不得再往 statusDetails 里塞对象字面量（静态棘轮）。
 */

const ROOT = join(__dirname, "../../..");
const ENGINE_DIR = join(ROOT, "src/roles/new_engine");

/** 去掉注释，避免把说明文字里的代码当真实代码扫描 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

describe("🛡️ statusDetails 字符串契约", () => {
  it("① 读取方对「混入对象」的脏数据不抛错（addPoisonMark 为入口）", () => {
    const seat = {
      id: 0,
      role: { id: "pukka", type: "demon" },
      statusDetails: [
        // 旧存档/其他角色可能写入的脏数据形态
        { type: "poison", source: "pukka", timestamp: 1 },
        "普卡中毒（永久）",
      ],
    } as any;

    // 只要不抛异常即算通过；同时确认字符串标记仍被识别并去重
    const result = addPoisonMark(seat, "pukka", "永久");
    expect(Array.isArray(result.statusDetails)).toBe(true);
    expect(
      result.statusDetails.some((d: unknown) => typeof d === "string" && d.includes("普卡中毒"))
    ).toBe(true);
  });

  it("② 写入方（new_engine 能力）不得往 statusDetails 里放对象字面量", () => {
    const files = [
      "pukka.ability.ts",
      "imp.ability.ts",
      "kazali.ability.ts",
      "liz.ability.ts",
      "night_watchman.ability.ts",
      "farmer.ability.ts",
      "cerenovus.ability.ts",
    ];
    const offenders: string[] = [];

    for (const file of files) {
      const src = stripComments(readFileSync(join(ENGINE_DIR, file), "utf-8"));
      /**
       * 逐行扫描：`statusDetails: [` 之后的数组体内，**数组元素只能是字符串**。
       * ⚠️ 不能用 `/statusDetails:\s*\[([\s\S]{0,900}?)\]/` 这种正则 ——
       *   数组体里常有 `...(s.statusDetails || [])`，第一个 `]` 会提前闭合捕获，
       *   对象就落在窗口外（首版实测漏检）。
       */
      const lines = src.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (!/statusDetails:\s*\[/.test(lines[i])) continue;
        for (let j = i; j < Math.min(i + 16, lines.length); j++) {
          const line = lines[j].trim();
          // 对象字面量元素：`{ ... }` / `{ key: ... }`
          if (/^\{\s*\}/.test(line) || /^\{\s*[\w"']+\s*:/.test(line)) {
            offenders.push(`${file}:${j + 1}`);
            break;
          }
        }
      }
    }

    expect(
      offenders,
      `以下位置把对象写进了 statusDetails（类型是 string[]，会让下游 .includes 抛错）：${offenders.join(
        ", "
      )}`
    ).toEqual([]);
  });
});

/**
 * 🛡️ 「副作用不得写在 setSeats updater 里」
 * ==================================================================
 * 事故（2026-10-21，游园惊梦 seed=91008）：
 *   `useLogicDispatcher` 把 `addLog / setWinResult / setGamePhase("gameOver") /
 *   setCurrentModal` 全写在 `setSeats(prev => …)` 的 updater 内部。updater 属于
 *   React 渲染期路径，可被重复调用或整体丢弃 ⇒ 实测 `setWinResult("evil")` 生效、
 *   `setGamePhase("gameOver")` 被丢掉，状态卡成「已有胜负 + 阶段仍是 day」：
 *   快照停止写入、HUD 不显示终局、剧本级自动获胜被 victoryRef 挡住。
 *
 * 现在改用 `seatsRef` 同步镜像 + `commitSeats()` 纯写入。本棘轮防止回退。
 */
describe("🛡️ useLogicDispatcher 副作用的落点", () => {
  it("③ 不得再用 setSeats(updater) 承载副作用", () => {
    const src = stripComments(
      readFileSync(join(ROOT, "src/hooks/useLogicDispatcher.ts"), "utf-8")
    );
    const bad = src.match(/setSeats\(\s*\(/g) ?? [];
    expect(
      bad,
      "useLogicDispatcher 里出现 setSeats((prev) => …)：updater 内不得有副作用，" +
        "请改用 seatsRef + commitSeats（见文件内长注释）"
    ).toEqual([]);
  });

  /**
   * 🔴 2026-10-21 收紧（贞洁者 E2E 实锤）：
   *   本 hook 曾**自己**持有一份 `seatsRef` 并在渲染期同步 `seats` prop。
   *   而 `useDayActions` 先 `commitSeats(updatedSeats)`（控制器那份 ref 立刻更新）
   *   再调 `checkGameOver(...)` ⇒ 本 hook 的 ref 还是上一帧 ⇒ 旧数组被写回
   *   ⇒ 刚处决的提名者 `isDead` 被抹掉、`hasUsedVirginAbility` 被回滚。
   *   ⇒ 现在要求**只有一份镜像**：调用方把 `useGameController` 的 `seatsRef` 传进来。
   */
  it("④ 必须有共享 seatsRef + commitSeats（单一镜像 + 纯写入）", () => {
    const dispatcher = readFileSync(
      join(ROOT, "src/hooks/useLogicDispatcher.ts"),
      "utf-8"
    );
    // ① hook 必须接受共享镜像，并优先使用它（= 单一事实源）
    expect(dispatcher).toContain("sharedSeatsRef?: { current: Seat[] }");
    expect(dispatcher).toContain(
      "const seatsRef = sharedSeatsRef ?? localSeatsRef;"
    );
    expect(dispatcher).toContain("const commitSeats = useCallback(");

    // ② 控制器必须真的把 ref 传进去（否则共享形同虚设）
    const controller = readFileSync(
      join(ROOT, "src/hooks/useGameController.ts"),
      "utf-8"
    );
    // 锚点用「主谋写入入口」这个**倒数第二个**实参，再断言紧随其后的是 seatsRef
    //   （不能贪心匹配整个文件：注释里也出现过 `useLogicDispatcher(seats, …)` 字样）
    const wired = /setMastermindFinalDay,\s*[\s\S]{0,600}?seatsRef\s*\)\s*;/.test(
      controller
    );
    expect(
      wired,
      "useGameController 调 useLogicDispatcher 时，最后一个实参必须是共享的 seatsRef"
    ).toBe(true);
  });
});
