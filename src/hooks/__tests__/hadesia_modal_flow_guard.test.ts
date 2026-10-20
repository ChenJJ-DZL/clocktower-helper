/**
 * 🛡️ 哈迪寂亚弹窗链路 + INFO_RESULT 统一出口 源码护栏
 * ==================================================================
 * 锁定两组修复形态（hook 内部无单测先例，按 dusk_to_night_guard 的
 * source_guardrails 传统钉死）：
 *
 * ① 哈迪寂亚生/死抉择弹窗（2026-10-20 修复的 P1 断链三环）：
 *    a. postProcess 在 3 目标齐时派发 HADESIA_KILL_CONFIRM（meta.modal 出口）
 *    b. GameModals 挂载弹窗，onConfirm → confirmHadesia（官方结算）
 *    c. onCancel → cancelHadesia（**必须推进夜队列**——原裸 setCurrentModal
 *       只关弹窗不推进 ⇒ 夜序卡死，本条即防该回归）
 *
 * ② INFO_RESULT 统一出口（known P1「有唤醒无结算弹窗」的收口）：
 *    displayInfo.log 存在 ⇒ 必弹 INFO_RESULT（信息类+行动类统一），
 *    且 meta.modal 优先（else-if 链），防止任何角色绕过结果窗。
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../../..");
const read = (p: string) =>
  readFileSync(resolve(ROOT, p), "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

describe("🛡️ 哈迪寂亚弹窗链路护栏", () => {
  it("a. postProcess 在 3 目标齐时派发 HADESIA_KILL_CONFIRM", () => {
    const code = read("src/roles/new_engine/al_hadikhia.ability.ts");
    expect(code).toContain('type: "HADESIA_KILL_CONFIRM"');
    expect(code).toMatch(/targetIds\?\.length === 3/);
  });

  it("b. GameModals 挂载弹窗且 onConfirm → confirmHadesia", () => {
    const code = read("src/components/game/GameModals.tsx");
    expect(code).toContain("<HadesiaKillConfirmModal");
    expect(code).toMatch(/onConfirm=\{actions\.confirmHadesia\}/);
  });

  it("c. ⭐ onCancel → cancelHadesia（禁止裸 setCurrentModal 断队列）", () => {
    const gameModals = read("src/components/game/GameModals.tsx");
    expect(gameModals).toMatch(/onCancel=\{actions\.cancelHadesia\}/);
    // 哈迪块内不得再出现裸关窗（拿到弹窗挂载段往后再取 400 字符）
    const at = gameModals.indexOf("<HadesiaKillConfirmModal");
    const block = gameModals.slice(at, at + 500);
    expect(block).not.toMatch(/onCancel=\{\(\) => actions\.setCurrentModal\(null\)\}/);

    const handlers = read("src/hooks/useConfirmHandlers.ts");
    // cancelHadesia 必须推进夜队列
    const fnAt = handlers.indexOf("const cancelHadesia");
    expect(fnAt, "cancelHadesia 应存在").toBeGreaterThan(-1);
    const fnBody = handlers.slice(fnAt, fnAt + 800);
    expect(fnBody).toContain("continueToNextAction()");
    expect(fnBody).toContain("HADESIA_KILL_CONFIRM");
    // 导出面
    expect(handlers).toMatch(/cancelHadesia,\s*\n\s*confirmSaintExecution,/);
  });

  it("confirmHadesia 对 nightInfo.seat 有空防护（禁裸解引用）", () => {
    const code = read("src/hooks/useConfirmHandlers.ts");
    const at = code.indexOf("const confirmHadesia = useCallback");
    const body = code.slice(at, at + 2500);
    // 契约：三元防护形必须在场
    //   （`nightInfo.seat ? nightInfo.seat.id + 1 : "?"` —— 与 confirmHadesia 内日志同款范式）
    expect(body).toMatch(/nightInfo\.seat \? nightInfo\.seat\.id/);
    // 且剥掉防护形后，不得残留裸 nightInfo.seat.id（裸解引用会在 seat 为 null 时炸）
    const stripped = body.replaceAll(
      "nightInfo.seat ? nightInfo.seat.id",
      "GUARDED_SEAT"
    );
    expect(stripped).not.toMatch(/nightInfo\.seat\.id/);
  });
});

describe("🛡️ INFO_RESULT 统一出口护栏（结算弹窗不得旁路）", () => {
  it("displayInfo.log 存在 ⇒ 弹 INFO_RESULT 的统一分支在场", () => {
    const code = read("src/hooks/useNightActionHandler.ts");
    // 统一出口：displayInfo && displayInfo.type && displayInfo.log ⇒ INFO_RESULT
    const unified = code.indexOf("displayInfo.log");
    expect(unified, "displayInfo.log 统一出口应存在").toBeGreaterThan(-1);
    expect(code).toMatch(/displayInfo\s*&&[\s\S]{0,120}?displayInfo\.log/);
    expect(code).toContain('type: "INFO_RESULT"');
  });

  it("meta.modal 优先于通用 INFO_RESULT（else-if 链，禁双弹）", () => {
    const code = read("src/hooks/useNightActionHandler.ts");
    const modalBranch = code.indexOf("if (modal) {");
    const infoBranch = code.indexOf("displayInfo.log", modalBranch);
    expect(modalBranch, "modal 分支应存在").toBeGreaterThan(-1);
    expect(infoBranch).toBeGreaterThan(modalBranch);
    // else if 形态（modal 优先，禁 if/if 双弹）
    expect(code).toMatch(/else if \(\s*\n\s*displayInfo &&/);
  });
});
