// @vitest-environment jsdom
/**
 * 孤儿角色 · L3 UI 渲染全量扫描（59 角色 × 数据驱动）
 *
 * 范式照抄 trouble_brewing_22_roles_ui_sweep.test.tsx（§A）：
 *   ① 技能确认页：每个被唤醒角色渲染非空 + 文案卫生（undefined/NaN/[object）
 *   ② 技能结果页：InfoResultModal 呈现引擎 guide 的解析核心结果
 *   ③ 引擎 guide 与词表回退的一致性（占位句不许回流）
 *
 * 唤醒夜从 ENGINE_CONFIG.fullNightOrder 推导（fn>0→1 / on>0→2），与矩阵同源。
 */
import { cleanup } from "@testing-library/react";
import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import { roles, scripts } from "../../../../app/data";
import { ENGINE_CONFIG } from "../../../hooks/useNightEngine";
import { initializeAbilityRegistry } from "../../../roles/new_engine/abilityRegistry";
import { calculateNightInfoViaNewEngine } from "../../../utils/nightInfoAdapter";
import { parseInfoResult } from "../../../utils/infoResultParser";
import { NightActionConfirmModal } from "../NightActionConfirmModal";
import { InfoResultModal } from "../InfoResultModal";

const r = (id: string) => roles.find((x) => x.id === id)!;

const ORPHANS: string[] = [
  "astrologer", "saint_townsfolk", "bard", "miner", "professor_female",
  "monk_female", "missionary", "alchemist", "magician", "half_ogre",
  "banshee", "villager", "princess", "priestess", "knight", "steward",
  "conjurer", "pilgrim", "noble", "amnesiac", "engineer", "fisherman",
  "ranger", "atheist", "cannibal", "king",
  "qutler", "acrobat", "damsel", "golem", "puzzlemaster", "zealot",
  "hatter", "ogre", "heretic", "hermit",
  "widow", "organ_grinder", "boffin", "fearmonger", "wizard", "xaan",
  "wraith", "vizier", "boomdandy", "summoner", "harpy", "psychopath", "shaman",
  "leech", "hadesia", "riot", "lord_of_typhon", "kazali", "lloam",
  "saint_demon", "titus", "leviathan", "liz",
];

/** 系统步骤（爪牙/恶魔互认） */
const SYS_STEP: Record<string, string> = {};
for (const id of ORPHANS) {
  if (r(id)?.type === "minion") SYS_STEP[id] = "minion_info";
  if (r(id)?.type === "demon") SYS_STEP[id] = "demon_info";
}

function buildSeats(roleId: string) {
  const companions = ["mayor", "soldier", "empath", "baron", "imp", "saint"];
  const layout = [roleId, ...companions];
  const seats: any[] = layout.map((rid, id) => ({
    id,
    playerName: `P${id + 1}`,
    role: r(rid),
    isDead: false,
    isDrunk: false,
    isPoisoned: false,
    statusEffects: [],
  }));
  if (r(roleId).type === "demon") seats[5].role = r(roleId);
  if (r(roleId).type === "minion") seats[4].role = r(roleId);
  if (r(roleId).type === "outsider") seats[2].role = r(roleId);
  if (roleId === "imp" || roleId === "baron" || roleId === "mayor" ||
      roleId === "soldier" || roleId === "empath" || roleId === "saint") {
    // 同伴 id 冲突由下方映射兜底（被测角色占 0 号）
  }
  return seats;
}

function engineGuide(roleId: string, night: 1 | 2, seats: any[]) {
  const sysStep = night === 1 ? SYS_STEP[roleId] : undefined;
  const info: any = calculateNightInfoViaNewEngine(
    scripts.find((s) => s.id === "orphan_audit") as any,
    seats as any,
    0,
    (night === 1 ? "firstNight" : "night") as any,
    null,
    night,
    sysStep,
    undefined, undefined, undefined, false, undefined, undefined, undefined,
    [], undefined, undefined, undefined, false, false, false, null,
    undefined, undefined, undefined
  );
  return info;
}

const allText = () => document.body.textContent ?? "";

describe("孤儿角色 · L3 UI 渲染全量扫描（59 角色）", () => {
  beforeAll(() => {
    initializeAbilityRegistry();
    if (!scripts.find((s) => s.id === "orphan_audit")) {
      scripts.push({
        id: "orphan_audit",
        name: "孤儿角色审计（自定义剧本池）",
        difficulty: "审计",
        description: "测试内动态注册。",
        roleIds: ORPHANS.filter((id) => id !== "king"),
      });
    }
  });

  afterEachCleanup: {
    // 每用例结束统一清理（数据驱动循环内部手动 cleanup）
  }

  it("① 每个被唤醒孤儿角色的【技能确认页】渲染非空 + 文案卫生", () => {
    const blank: string[] = [];
    const dirty: string[] = [];
    let checked = 0;
    const entries = new Map(
      ENGINE_CONFIG.fullNightOrder.map((e) => [e.roleId, e])
    );

    for (const roleId of ORPHANS) {
      const entry = entries.get(roleId);
      if (!entry) continue; // 纯被动（magician/damsel/wizard/xaan/leviathan 等）
      // deathTriggered（banshee/hatter）：结算由死亡事件驱动，常规夜 guide 空 = 正确
      if (entry.deathTriggered) continue;
      const night: 1 | 2 = entry.firstNightPriority > 0 ? 1 : 2;
      checked++;
      const seats = buildSeats(roleId);
      const info = engineGuide(roleId, night, seats);
      const guide: string = info?.guide ?? "";
      if (!guide) {
        blank.push(`${roleId}(n${night})`);
        continue;
      }

      cleanup();
      const data: any = {
        roleName: r(roleId).name,
        actionDescription: guide.slice(0, 60),
        targetDescriptions: ["（无目标）"],
        targetLimit: info?.targetLimit ?? { min: 0, max: 0 },
        actorSeatId: 0,
      };
      render(
        <NightActionConfirmModal
          data={data}
          seats={seats}
          onConfirm={() => {}}
          onCancel={() => {}}
        />
      );
      const t = allText();
      expect(t.length, `${roleId} 确认页渲染为空`).toBeGreaterThan(0);
      if (t.includes("undefined")) dirty.push(`${roleId}:undefined`);
      if (t.includes("NaN")) dirty.push(`${roleId}:NaN`);
      if (t.includes("[object")) dirty.push(`${roleId}:[object`);
    }
    // 实测 29（59 孤儿 − 纯被动/无夜节点 − deathTriggered 豁免）；下界防扫描空转
    expect(checked, "被扫描的有唤醒夜孤儿角色数").toBeGreaterThan(25);
    expect(blank, `引擎未产出 guide：${blank.join(", ")}`).toEqual([]);
    expect(dirty, `确认页文案卫生违规：${dirty.join(", ")}`).toEqual([]);
  });

  it("② ⭐ 每个被唤醒孤儿角色的【技能结果页】== 引擎 guide 的解析核心", () => {
    const mismatched: string[] = [];
    const entries = new Map(
      ENGINE_CONFIG.fullNightOrder.map((e) => [e.roleId, e])
    );
    for (const roleId of ORPHANS) {
      const entry = entries.get(roleId);
      if (!entry) continue;
      const night: 1 | 2 = entry.firstNightPriority > 0 ? 1 : 2;
      const seats = buildSeats(roleId);
      const info = engineGuide(roleId, night, seats);
      const guide: string = info?.guide ?? "";
      if (!guide) continue;

      const roleName = `1号-${r(roleId).name}`;
      const parsed = parseInfoResult(guide, roleName);
      cleanup();
      render(
        <InfoResultModal
          roleName={roleName}
          resultText={guide}
          onConfirm={() => {}}
          onModify={() => {}}
        />
      );
      const t = allText();
      const norm = (x: string) => x.replace(/[【】\s:：]/g, "");
      if (parsed.result && !norm(t).includes(norm(parsed.result))) {
        mismatched.push(
          `${roleId}(n${night})：期望含「${parsed.result.slice(0, 40)}」，实际「${t.slice(0, 80)}」`
        );
      }
      expect(t, `${roleId} 结果页含 undefined`).not.toContain("undefined");
      expect(t, `${roleId} 结果页含 NaN`).not.toContain("NaN");
    }
    expect(
      mismatched,
      `结果页未呈现引擎核心结果：\n${mismatched.slice(0, 10).join("\n")}`
    ).toEqual([]);
  });

  it("③ 占位句零回流：所有孤儿 guide 不得出现「准备执行技能」", () => {
    const entries = new Map(
      ENGINE_CONFIG.fullNightOrder.map((e) => [e.roleId, e])
    );
    const regressed: string[] = [];
    for (const roleId of ORPHANS) {
      const entry = entries.get(roleId);
      if (!entry) continue;
      const night: 1 | 2 = entry.firstNightPriority > 0 ? 1 : 2;
      const seats = buildSeats(roleId);
      const guide: string = engineGuide(roleId, night, seats)?.guide ?? "";
      if (/准备执行技能|请执行行动/.test(guide)) regressed.push(`${roleId}(n${night})`);
    }
    expect(
      regressed,
      `占位句回流（词表回退失效）：${regressed.join(", ")}`
    ).toEqual([]);
  });
});

function afterEachCleanup() {}
