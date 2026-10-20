/**
 * 涡流（Vortox）信息契约测试
 * ==================================================================
 * 【官方原文·涡流】"镇民玩家的能力都会产生错误信息。
 *   任何时候角色是镇民的玩家通过能力获取信息时，他们会得知错误信息。
 *   哪怕他们醉酒或中毒，信息也一定是错误的。"
 * 【运作方式】"只要涡流**存活**，每当有镇民因为能力需要你提供信息，你就必须提供错误信息。"
 *
 * 2026-10-20 用户实测报障：「涡流在场，并不是所有的消息都 100% 错误」。
 * 排查结论（本文件即回归锁）：
 *   ① 修行者/女祭司/渔夫/猎人 **完全没有假信息钩子** —— 涡流下仍给真值或 50% 真；
 *   ② 筑梦师/卖花女孩 自拼 `role?.id === "vortox"` **漏了存活判断** ——
 *      涡流死后仍把信息作假（反向错，同样违反官方）。
 *
 * 判据（两条硬线）：
 *   A. 涡流**存活** ⇒ 信息类能力产出必须与真值**不同**（100% 假）；
 *   B. 涡流**已死** ⇒ 信息恢复为真（不得继续作假）。
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { runFullAbilityPipeline } from "../../../utils/middlewarePipeline";
import type { MiddlewareContext } from "../../../utils/middlewareTypes";
import { shugenjaAbility } from "../../new_engine/shugenja.ability";
import { high_priestessAbility } from "../../new_engine/high_priestess.ability";
import { huntsmanAbility } from "../../new_engine/huntsman.ability";
import { fishermanAbility } from "../../new_engine/fisherman.ability";

// 本文件位于 src/roles/__tests__/integration/ ⇒ 4 层上到仓库根
const ROOT = resolve(__dirname, "../../../..");

function seat(
  id: number,
  roleId: string,
  type: "townsfolk" | "outsider" | "minion" | "demon",
  opts: Partial<any> = {}
): any {
  return {
    id,
    playerName: `P${id + 1}`,
    role: { id: roleId, name: roleId, type },
    roleId,
    isDead: false,
    isDrunk: false,
    isPoisoned: false,
    statusEffects: [],
    ...opts,
  };
}

/** 5 人局：修验者(0) / 女祭司(1) / 猎人(2) / 渔夫(3) / 涡流或小恶魔(4) */
function buildSeats(vortoxAlive: boolean, vortoxDead = false): any[] {
  return [
    seat(0, "shugenja", "townsfolk"),
    seat(1, "high_priestess", "townsfolk"),
    seat(2, "huntsman", "townsfolk"),
    seat(3, "fisherman", "townsfolk"),
    vortoxAlive || vortoxDead
      ? seat(4, "vortox", "demon", { isDead: vortoxDead })
      : seat(4, "imp", "demon"),
  ];
}

function ctxFor(
  ability: any,
  seatId: number,
  seats: any[],
  extra: Partial<MiddlewareContext> = {}
): MiddlewareContext {
  return {
    snapshot: {
      nightCount: 1,
      gamePhase: "firstNight",
      seats: seats.map((s) => ({ ...s })),
      statusEffects: {},
    } as any,
    actionNode: {
      seatId,
      roleId: ability.roleId,
      roleName: `${seatId + 1}号`,
      priority: 1,
      abilityId: ability.abilityId,
      wakeMessage: "",
      firstNightPriority: 1,
      otherNightPriority: null,
      targetIds: [],
      processed: false,
      success: false,
      meta: {},
    } as any,
    targetIds: [],
    meta: {},
    aborted: false,
    preview: false,
    ...extra,
  } as MiddlewareContext;
}

const run = (ability: any, ctx: MiddlewareContext) =>
  runFullAbilityPipeline(
    {
      preCheck: ability.preCheck,
      calculate: ability.calculate,
      stateUpdate: ability.stateUpdate,
      postProcess: ability.postProcess,
    },
    ctx
  );

describe("涡流契约 A：存活涡流在场 ⇒ 信息 100% 为假", () => {
  it("修行者：给出的方向必须与「最近邪恶方向」相反", async () => {
    const seats = buildSeats(true);
    // 涡流在 4 号（0 号顺时针 4 步 / 逆时针 1 步）⇒ 真值应为「左」（逆时针更近）
    const out = await run(shugenjaAbility, ctxFor(shugenjaAbility, 0, seats));
    expect(out.aborted).toBe(false);
    const r = out.meta.abilityResult as any;
    expect(["左", "右"]).toContain(r.sunDirection);
    expect(out.meta.hasVortox, "涡流在场却未被识别").toBe(true);
    expect(out.meta.isCorrupted, "涡流在场却未标记受干扰").toBe(true);
    // 真值：逆时针 1 步 < 顺时针 4 步 ⇒ 真方向「左」⇒ 展示必须「右」
    expect(r.sunDirection).toBe("右");
  });

  it("女祭司：指引玩家不得等于说书人给的真值", async () => {
    const seats = buildSeats(true);
    const out = await run(
      high_priestessAbility,
      ctxFor(high_priestessAbility, 1, seats, {
        storytellerInput: { targetId: 2 } as any,
      } as any)
    );
    const r = out.meta.abilityResult as any;
    expect(out.meta.hasVortox).toBe(true);
    expect(r.targetId).not.toBe(2);
  });

  it("猎人：目标角色不得是真角色", async () => {
    const seats = buildSeats(true);
    const out = await run(
      huntsmanAbility,
      ctxFor(huntsmanAbility, 2, seats, {
        targetIds: [4],
        actionNode: {
          seatId: 2,
          roleId: "huntsman",
          roleName: "3号",
          priority: 1,
          abilityId: "huntsman_night",
          wakeMessage: "",
          firstNightPriority: 1,
          otherNightPriority: null,
          targetIds: [4],
          processed: false,
          success: false,
          meta: {},
        } as any,
      } as any)
    );
    const r = out.meta.abilityResult as any;
    expect(out.meta.hasVortox).toBe(true);
    expect(r.targetRole).not.toBe("vortox");
  });

  it("渔夫：必须打受干扰标记，且提示词强制给错误建议", async () => {
    const seats = buildSeats(true);
    const out = await run(
      fishermanAbility,
      ctxFor(fishermanAbility, 3, seats, {
        storytellerInput: { advice: "投 2 号" } as any,
      } as any)
    );
    const r = out.meta.abilityResult as any;
    expect(out.meta.hasVortox).toBe(true);
    expect(r.isCorrupted).toBe(true);
    expect(String(out.meta.prompt)).toContain("必须给出错误");
  });
});

describe("涡流契约 B：涡流已死 ⇒ 信息恢复正常（不得继续作假）", () => {
  it("修行者：涡流死亡后给真方向", async () => {
    const seats = buildSeats(false, true);
    const out = await run(shugenjaAbility, ctxFor(shugenjaAbility, 0, seats));
    const r = out.meta.abilityResult as any;
    expect(out.meta.hasVortox ?? false).toBe(false);
    // 4 号已死涡流仍是恶魔（官方未限定存活）⇒ 逆时针更近 ⇒ 真方向「左」
    expect(r.sunDirection).toBe("左");
  });

  it("女祭司：涡流死亡后给说书人指定的真指引", async () => {
    const seats = buildSeats(false, true);
    const out = await run(
      high_priestessAbility,
      ctxFor(high_priestessAbility, 1, seats, {
        storytellerInput: { targetId: 2 } as any,
      } as any)
    );
    const r = out.meta.abilityResult as any;
    expect(r.targetId).toBe(2);
  });

  it("渔夫：涡流死亡后不再打受干扰标记", async () => {
    const seats = buildSeats(false, true);
    const out = await run(
      fishermanAbility,
      ctxFor(fishermanAbility, 3, seats, {
        storytellerInput: { advice: "投 2 号" } as any,
      } as any)
    );
    expect(out.meta.isCorrupted ?? false).toBe(false);
  });
});

describe("涡流契约 C：所有信息类角色文件必须挂假信息钩子（静态护栏）", () => {
  it("INFORMATION_ROLE_IDS 内每个 new_engine 能力文件都含涡流/干扰判定", () => {
    // 与 utils/informationRoles.ts 的镇民信息角色对齐（表内非镇民项跳过）
    const infoTownsfolk = [
      "washerwoman",
      "librarian",
      "investigator",
      "chef",
      "clockmaker",
      "noble",
      "knight",
      "shugenja",
      "balloonist",
      "empath",
      "fortune_teller",
      "undertaker",
      "ravenkeeper",
      "seamstress",
      "flowergirl",
      "dreamer",
      "oracle",
      "town_crier",
      "sage",
      "mathematician",
      "fisherman",
      "huntsman",
      "high_priestess",
    ];
    const dir = resolve(ROOT, "src/roles/new_engine");
    const files = new Set(readdirSync(dir).filter((f) => f.endsWith(".ability.ts")));
    const missing: string[] = [];
    for (const id of infoTownsfolk) {
      const file = `${id}.ability.ts`;
      if (!files.has(file)) continue; // 未实现的能力另行处理
      const src = readFileSync(resolve(dir, file), "utf-8");
      const hooked =
        src.includes("isVortoxWorldActive") ||
        src.includes("hasVortox") ||
        src.includes("isCorrupted") ||
        src.includes("fakeResult");
      if (!hooked) missing.push(id);
    }
    expect(
      missing,
      `以下信息类能力没有任何涡流/干扰钩子（涡流局会泄漏真值）：${missing.join(", ")}`
    ).toEqual([]);
  });

  it("禁用漏存活判断的内联涡流检测（必须走 isVortoxWorldActive）", () => {
    const dir = resolve(ROOT, "src/roles/new_engine");
    const offenders: string[] = [];
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".ability.ts"))) {
      const src = readFileSync(resolve(dir, f), "utf-8");
      // 命中「角色 id 是 vortox」却没有任何 isDead / isVortoxWorldActive 保护
      const inline = /role\?\.id === "vortox"/.test(src);
      const guarded =
        /role\?\.id === "vortox" && !s\.isDead/.test(src) ||
        /role\?\.id === "vortox" && !.*isDead/.test(src) ||
        src.includes("isVortoxWorldActive");
      if (inline && !guarded) offenders.push(f);
    }
    expect(
      offenders,
      `这些文件内联检测涡流却漏了存活判断（涡流死后仍作假）：${offenders.join(", ")}`
    ).toEqual([]);
  });
});
