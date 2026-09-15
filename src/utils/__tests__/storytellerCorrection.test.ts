/**
 * 🎙️ 说书人「技能修正页」纯函数回归
 *
 * 用户实测（2026-09-14，附图）：
 *   恶魔技能结果页显示「小恶魔试图杀死【1号】，但未能造成伤亡」——
 *   结果页是**给玩家看的**，这直接泄漏"击杀失败"（=有僧侣/士兵挡了）。
 *   用户要求：此类信息改由**结果页之后的「技能修正页」**呈现，
 *   该页**只说书人可见**，避免说书人瞬间搞不清楚状况。
 *
 * 本文件钉死：
 *   ① 玩家可见文案永远是**中性**的「你选择了【X】」，绝不含失败/保护/免疫字样；
 *   ② `buildDemonKillCorrection` 对每种原因给出非空标题/详情，且详情含关键真相；
 *   ③ 修正页详情**必须**包含"请勿展示给玩家"或等价安全提示（僧侣/士兵免疫两类）；
 *   ④ 未支持的原因返回 null（不产生空弹窗）。
 */
import { describe, expect, it } from "vitest";
import {
  buildDemonKillCorrection,
  getDemonPlayerFacingResultText,
  type StorytellerCorrection,
} from "../storytellerCorrection";
import { findPlayerViewLeaks } from "../playerView";

describe("🎙️ getDemonPlayerFacingResultText（玩家可见的中性文案）", () => {
  it("⭐ 只显示「你选择了【X】」，不含任何结果/成败字样", () => {
    const text = getDemonPlayerFacingResultText("1号");
    expect(text).toBe("你选择了【1号】");
  });

  it("⭐ 中性文案**绝不含**「未能造成伤亡 / 保护 / 免疫 / 死亡 / 成功」", () => {
    for (const label of ["1号", "张三(3号)", "13号"]) {
      const text = getDemonPlayerFacingResultText(label);
      expect(text).not.toContain("未能造成伤亡");
      expect(text).not.toContain("保护");
      expect(text).not.toContain("免疫");
      expect(text).not.toContain("死亡");
      expect(text).not.toContain("成功");
      expect(text).not.toContain("失败");
    }
  });

  it("⭐ 中性文案过玩家视角泄漏词表（findPlayerViewLeaks 必须为空）", () => {
    expect(findPlayerViewLeaks(getDemonPlayerFacingResultText("1号"))).toEqual(
      []
    );
  });

  it("保留玩家自己的选择事实（否则玩家不知道点了谁）", () => {
    expect(getDemonPlayerFacingResultText("张三(3号)")).toContain("3号");
  });
});

describe("🎙️ buildDemonKillCorrection（说书人修正页数据）", () => {
  const reasons = [
    "monk_protection",
    "soldier_immunity",
    "mayor_substitution",
    "taowu_substitution",
    "target_already_dead",
    "demon_self_kill",
    "no_kill_other",
  ] as const;

  it("每种原因都产出非空标题与详情", () => {
    for (const reason of reasons) {
      const c = buildDemonKillCorrection({
        reason,
        targetLabel: "1号",
        demonLabel: "13号",
      });
      expect(c, `reason=${reason} 应产出修正页`).not.toBeNull();
      expect((c as StorytellerCorrection).title.length).toBeGreaterThan(0);
      expect((c as StorytellerCorrection).detail.length).toBeGreaterThan(0);
      expect((c as StorytellerCorrection).reason).toBe(reason);
    }
  });

  it("⭐ 僧侣保护：标题/详情点明「僧侣保护」，并含「勿告知恶魔」的安全提示", () => {
    const c = buildDemonKillCorrection({
      reason: "monk_protection",
      targetLabel: "1号",
      demonLabel: "13号",
    })!;
    expect(c.title).toContain("僧侣保护");
    expect(c.title).toContain("1号");
    expect(c.detail).toContain("僧侣保护");
    expect(c.detail).toContain("今晚无人");
    // 官方：恶魔不知道谁被保护 → 必须提醒说书人别透露
    expect(c.detail).toMatch(/请勿|不要|不得|不知道/);
  });

  it("⭐ 士兵免疫：点明士兵，并同样含安全提示", () => {
    const c = buildDemonKillCorrection({
      reason: "soldier_immunity",
      targetLabel: "4号",
      demonLabel: "13号",
    })!;
    expect(c.title).toContain("士兵");
    expect(c.detail).toContain("士兵");
    expect(c.detail).toMatch(/请勿|不要|不得|不告知/);
  });

  it("镇长替死：标题含「镇长替死」，详情带替死者信息", () => {
    const c = buildDemonKillCorrection({
      reason: "mayor_substitution",
      targetLabel: "5号",
      demonLabel: "13号",
      extraNote: "【7号】替代死亡",
    })!;
    expect(c.title).toContain("镇长替死");
    expect(c.detail).toContain("7号");
  });

  it("已死亡目标：标题点明「已死亡」，详情说明无新增伤亡", () => {
    const c = buildDemonKillCorrection({
      reason: "target_already_dead",
      targetLabel: "2号",
      demonLabel: "13号",
    })!;
    expect(c.title).toContain("已死亡");
    expect(c.detail).toContain("无新增伤亡");
  });

  it("恶魔自杀：标题/详情说明血脉传递", () => {
    const c = buildDemonKillCorrection({
      reason: "demon_self_kill",
      targetLabel: "13号",
      demonLabel: "13号",
    })!;
    expect(c.title).toContain("自杀");
    expect(c.detail).toContain("血脉");
  });

  it("sourceRoleId 固定为 imp（供将来按角色渲染）", () => {
    const c = buildDemonKillCorrection({
      reason: "monk_protection",
      targetLabel: "1号",
    })!;
    expect(c.sourceRoleId).toBe("imp");
  });

  it("未支持的 reason → null（不产生空弹窗）", () => {
    expect(
      buildDemonKillCorrection({
        reason: "unknown" as any,
        targetLabel: "1号",
      })
    ).toBeNull();
  });

  it("⭐ 修正页详情**必须**自带「说书人专属」安全提示（提示词表中含『说书人』）", () => {
    // 「僧侣保护」类真相只在说书人侧说明，文案必须明确"请勿告知恶魔"，
    // 而玩家视角词表恰好把「说书人」列为禁忌词 —— 二者互为镜像：
    // 含提示 ⇒ 命中禁忌词 ⇒ 它天然不可能出现在玩家面上。
    const c = buildDemonKillCorrection({
      reason: "monk_protection",
      targetLabel: "1号",
      demonLabel: "13号",
    })!;
    expect(c.detail).toContain("说书人");
    expect(findPlayerViewLeaks(c.detail)).toContain("说书人");
  });
});
