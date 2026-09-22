import { describe, expect, it } from "vitest";
import { pixieAbility } from "../new_engine/pixie.ability";
import { board, runRole } from "./_tbHarness";

/**
 * 小精灵（Pixie）首夜信息 —— 多状态显示验证（2026-09-21 用户要求）
 * ------------------------------------------------------------------
 * 官方：「在你的首个夜晚，你会得知**一个在场的镇民角色**。」
 *
 * 用户已确认**正常态弹窗正确**（截图：「得知【镇长】在场」）。
 * 本文件补的是**异常态**：酒鬼 / 中毒 / 提线木偶 / 涡流 ——
 * 这些情况下必须给**不在场**的镇民角色（错误信息），且弹窗文案格式不变
 * （`得知【XX】在场`），否则玩家会据此推理出真实身份。
 *
 * ⚠️ 判据不锚在文案，锚在**事实**：「给出的角色 id 是否真的在场」。
 */

/** 场上布局：0号=小精灵，其余为在场陪衬（含 1 个镇民 + 1 个爪牙 + 1 个恶魔） */
const BASE = ["pixie", "soldier", "chef", "imp", "baron"];

function inPlayTownsfolkIds(seats: any[]): Set<string> {
  return new Set(
    seats
      .filter((s) => s.role?.type === "townsfolk")
      .map((s) => s.role?.id)
  );
}

async function runPixieFirstNight(
  seats: any[],
  opts: { snapshot?: Record<string, any> } = {}
) {
  return runRole(pixieAbility, seats, 0, {
    night: 1,
    phase: "firstNight",
    ...opts,
  });
}

describe("小精灵首夜信息 · 多状态显示（罂粟花开）", () => {
  it("① 正常态：必须给出【在场】的镇民角色，且未被标记受干扰", async () => {
    const seats = board(BASE);
    const res = await runPixieFirstNight(seats);
    const r = res?.meta?.abilityResult;
    const inPlay = inPlayTownsfolkIds(seats);

    expect(r, "❌ 未产出 abilityResult").toBeTruthy();
    expect(
      r.isCorrupted,
      `❌ 正常态不应被标记受干扰（实际 isCorrupted=${r.isCorrupted}）`
    ).toBe(false);
    expect(
      inPlay.has(r.roleId),
      `❌ 正常态给出的【${r.roleName}】不在场（在场镇民：${[...inPlay].join("、")}）` +
        `—— 小精灵必须得知一个**在场**镇民`
    ).toBe(true);
    expect(
      String(res?.meta?.displayInfo?.log ?? ""),
      "❌ 弹窗文案格式必须保持「得知【X】在场」"
    ).toContain("在场");
  });

  it("② 中毒：必须给出【不在场】的镇民角色（错误信息）", async () => {
    const seats = board(BASE);
    seats[0].isPoisoned = true;
    const res = await runPixieFirstNight(seats);
    const r = res?.meta?.abilityResult;
    const inPlay = inPlayTownsfolkIds(seats);

    expect(r, "❌ 未产出 abilityResult").toBeTruthy();
    expect(
      r.isCorrupted,
      "❌ 中毒态未标记受干扰 —— 中毒玩家应失去能力（给出假信息）"
    ).toBe(true);
    expect(
      inPlay.has(r.roleId),
      `❌ 中毒态给出的【${r.roleName}】**竟然在场** —— 假信息必须是不在场角色，` +
        `否则玩家能反推出真身`
    ).toBe(false);
  });

  it("③ 醉酒：必须给出【不在场】的镇民角色", async () => {
    const seats = board(BASE);
    seats[0].isDrunk = true;
    const res = await runPixieFirstNight(seats);
    const r = res?.meta?.abilityResult;
    const inPlay = inPlayTownsfolkIds(seats);

    expect(r, "❌ 未产出 abilityResult").toBeTruthy();
    expect(r.isCorrupted, "❌ 醉酒态未标记受干扰").toBe(true);
    expect(
      inPlay.has(r.roleId),
      `❌ 醉酒态给出的【${r.roleName}】竟然在场 —— 应为不在场角色`
    ).toBe(false);
  });

  it("④ 涡流在场：必须给出【不在场】的镇民角色（涡流世界信息必须为假）", async () => {
    // 涡流（vortox）在场 —— preCheck 通过 `seats.some(role.id==="vortox" && !isDead)` 判定
    const seats = board(["pixie", "soldier", "chef", "vortox", "baron"]);
    const res = await runPixieFirstNight(seats);
    const r = res?.meta?.abilityResult;
    const inPlay = inPlayTownsfolkIds(seats);

    expect(r, "❌ 未产出 abilityResult").toBeTruthy();
    expect(
      r.isCorrupted,
      "❌ 涡流在场却未标记受干扰 —— 官方：涡流在场时所有信息都是错的"
    ).toBe(true);
    expect(
      inPlay.has(r.roleId),
      `❌ 涡流局给出的【${r.roleName}】竟然在场 —— 涡流世界必须给假信息（不在场角色）`
    ).toBe(false);
    // 弹窗文案格式不变（玩家看不出自己被干扰）
    expect(
      String(res?.meta?.displayInfo?.log ?? ""),
      "❌ 受干扰时文案格式也必须保持「得知【X】在场」（玩家不应察觉）"
    ).toContain("在场");
  });

  it("⑤ 受干扰路径的兜底：不在场候选为空时也绝不回落到在场角色", async () => {
    // 极端构造：场上只有小精灵一个镇民 + 涡流在场
    // → outOfPlayTownsfolk 由剧本/官方库兜底，必须全部**不在场**
    const seats = board(["pixie", "vortox", "baron", "imp", "soldier"]);
    const res = await runPixieFirstNight(seats);
    const r = res?.meta?.abilityResult;
    const inPlay = inPlayTownsfolkIds(seats);

    expect(r, "❌ 未产出 abilityResult").toBeTruthy();
    if (r.isCorrupted) {
      expect(
        inPlay.has(r.roleId),
        `❌ 涡流局的兜底选角【${r.roleName}】落在了在场角色上 —— 泄漏真身`
      ).toBe(false);
    }
  });
});
