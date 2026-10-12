/**
 * L1 + L2 · 罂粟花开（Poppyganda）**24 个角色**
 * ==================================================================
 * 缺口补齐计划 · P1：罂粟花开是 9 剧本中唯一「零四层套件」的剧本
 * （此前只有散落的 utils 单测 + 4 个 E2E spec）。本文件补齐 L1/L2。
 *
 * 验收门槛（`outputs/角色全层测试规范.md` §0）：
 *   · 每角色 ≥3 用例（L1 两条 + L2 两条）
 *   · 每用例 ≥3 expect
 *   · 每角色 ≥1 负向对照（L2④：无夜序角色不得入队）
 *
 * 🔒 判据来源
 *   · `src/data/rolesData.json`   —— 官方夜序表（唯一数据源）
 *   · `src/data/officialRoleDocs.json` —— 官方角色文档，键为中文名
 *   · `app/data.ts`               —— 剧本 roleIds 归属 + 中文名 + type
 *   · `abilityRegistry`           —— 新引擎能力注册表（isRoleMigrated）
 *   · `ENGINE_CONFIG.fullNightOrder` —— 生产夜序（对拍见 night_order_mirror）
 *
 * ⚠️ 特征化分歧（只登记不回改，与 tb_l1_l2 同哲学）：
 *   ① `snitch`：app/data.ts type=**outsider**（官方口径：告密者是外来者，
 *      给爪牙加首夜信息），rolesData.json type=**minion** —— 两源分歧，
 *      以 officialRoleDocs/official 剧本归属为准（poppyganda 归在外来者段）。
 *   ② `baron`：rolesData.json 记 firstNightOrder=33，但能力对象
 *      firstNightPriority=null（男爵是**设置期**能力，不进夜序）——
 *      与 tb 的 scarlet_woman（记 37 / 声明 null）同类分歧。
 */
import { describe, expect, it } from "vitest";
import rolesData from "../../../data/rolesData.json";
import officialRoleDocs from "../../../data/officialRoleDocs.json";
import { roles, scripts } from "../../../../app/data";
import { isRoleMigrated } from "../../../utils/nightInfoAdapter";
import { ENGINE_CONFIG } from "../../../hooks/useNightEngine";
import {
  getAbilityForRole,
  initializeAbilityRegistry,
  isRoleAbilitiesRegistered,
} from "../../new_engine/abilityRegistry";

const PG = scripts.find((s) => s.id === "poppyganda")!;
const r = (id: string) => roles.find((x) => x.id === id)!;
const rdata = (id: string): any => (rolesData as any[]).find((x) => x.id === id);
const docs = officialRoleDocs as Record<string, string>;

/**
 * 无夜序被动角色册（2026-10-12 L1/L2 实测登记）：
 * 这些角色有 ability 对象（isRoleAbilitiesRegistered=true），但
 * triggerTiming 为 PASSIVE / 设置期 ⇒ 不进任何夜晚队列。
 * ⚠️ 与 tb 的架构现状互锁：「PASSIVE 零消费方」——死亡触发/认知覆盖
 *   等写在 legacy 层。此册只用于夜序负向断言，**不是**「无能力」豁免。
 */
const PASSIVE_NO_NIGHT_QUEUE = new Set([
  "savant",
  "mayor",
  "poppy_grower",
  "drunk",
  "mutant",
  "baron",
]);

initializeAbilityRegistry();
const nightEntries = ENGINE_CONFIG.fullNightOrder;

describe("L1 · 罂粟花开 · 静态数据层（24 角色）", () => {
  it("0) 清单自洽：24 个唯一 id，与 poppyganda.roleIds 严格一致", () => {
    const ids = PG.roleIds!;
    expect(new Set(ids).size).toBe(24);
    expect(ids.length).toBe(24);
    // 阵营配比（13 镇民 / 4 外来者 / 4 爪牙 / 3 恶魔）
    const byType = {
      townsfolk: ids.filter((id) => r(id).type === "townsfolk").length,
      outsider: ids.filter((id) => r(id).type === "outsider").length,
      minion: ids.filter((id) => r(id).type === "minion").length,
      demon: ids.filter((id) => r(id).type === "demon").length,
    };
    expect(byType).toEqual({ townsfolk: 13, outsider: 4, minion: 4, demon: 3 });
  });

  it.each(PG.roleIds!)("① %s：type / 中文名 / 官方文档 / rolesData 条目四源对齐", (id) => {
    const role = r(id);
    const rd = rdata(id);
    // 1) roles 数组存在且中文名非空
    expect(role, `roles 应含 ${id}`).toBeTruthy();
    expect(role.name.length, `${id} 中文名非空`).toBeGreaterThan(0);
    // 2) 官方文档（键为中文名）有条目
    expect(docs[role.name], `officialRoleDocs 应有「${role.name}」`).toBeTruthy();
    // 3) rolesData 条目存在且 type 一致（snitch 分歧除外，见文件头②）
    expect(rd, `rolesData 应有 ${id}`).toBeTruthy();
    if (id !== "snitch") {
      expect(rd.type, `${id} type 两源一致`).toBe(role.type);
    }
  });

  it.each(PG.roleIds!)("② %s：能力已注册（isRoleMigrated + isRoleAbilitiesRegistered）", (id) => {
    // ⚠️ 判注册必须用 isRoleAbilitiesRegistered（getAbilityForRole 是
    //   startsWith 模糊匹配，会误判）——元教训铁律。
    // ⚠️ 本文件模块级显式 initializeAbilityRegistry() ⇒ isRoleMigrated
    //   口径稳定（否则注册表未初始化时会误报 false）。
    expect(isRoleMigrated(id), `${id} 应已迁移`).toBe(true);
    expect(isRoleAbilitiesRegistered(id), `${id} 应有注册能力`).toBe(true);
    // rolesData 夜序字段：有夜间行动者必须有字段；纯被动角色（豁免册）
    // 允许整条无夜序数据——但必须显式登记，不允许静默缺失。
    const rd = rdata(id);
    const hasNightField =
      "firstNightOrder" in rd ||
      "otherNightOrder" in rd ||
      "firstNightMeta" in rd ||
      "otherNightMeta" in rd;
    if (!hasNightField) {
      expect(
        PASSIVE_NO_NIGHT_QUEUE.has(id),
        `${id} rolesData 无任何夜序字段 ⇒ 必须登记在 PASSIVE_NO_NIGHT_QUEUE 豁免册`
      ).toBe(true);
    }
  });

  it("③ 特征化分歧登记：snitch type 两源不一致（outsider vs minion）", () => {
    expect(r("snitch").type).toBe("outsider");
    expect(rdata("snitch").type).toBe("minion");
    // 官方文档口径：告密者是外来者（poppyganda roleIds 归在外来者段）
    expect(docs["告密者"], "官方应有告密者条目").toBeTruthy();
    expect(docs["告密者"]).toContain("爪牙");
  });

  it("④ 特征化分歧登记：baron 记 firstNightOrder=33 但设置期不入夜序", () => {
    expect(rdata("baron").firstNightOrder).toBe(33);
    expect(
      nightEntries.some((e) => e.roleId === "baron"),
      "baron 是设置期能力，不得入夜序"
    ).toBe(false);
  });
});

describe("L2 · 罂粟花开 · 引擎不变量层（24 角色）", () => {
  it.each(PG.roleIds!)("③ %s：夜序优先级与 rolesData 一致；无夜序者不得入队", (id) => {
    const rd = rdata(id);
    const entry = nightEntries.find((e) => e.roleId === id);
    const hasFn = typeof rd.firstNightOrder === "number";
    const hasOn = typeof rd.otherNightOrder === "number";
    if (id === "baron") {
      // 设置期豁免：rolesData 记 fn=33 但能力 firstNightPriority=null
      // （男爵在开局换角色，不进任何夜晚）——与 ④ 特征化分歧互锁
      expect(entry, "baron 设置期 ⇒ 不得入队").toBeUndefined();
      return;
    }
    if (hasFn || hasOn) {
      expect(entry, `${id} 有夜序数据 ⇒ 必须入 fullNightOrder`).toBeTruthy();
      if (hasFn) expect(entry!.firstNightPriority).toBeGreaterThan(0);
      if (hasOn) expect(entry!.otherNightPriority).toBeGreaterThan(0);
    } else {
      // 负向对照：无夜序数据的角色不得入队
      expect(entry, `${id} 无夜序数据 ⇒ 不得入队`).toBeUndefined();
    }
  });

  it.each(PG.roleIds!)("④ %s：triggerTiming 与夜序自洽；四段中间件可解释", (id) => {
    if (PASSIVE_NO_NIGHT_QUEUE.has(id)) {
      // 无夜序被动/设置期角色：ability 对象存在但 triggerTiming 为
      // PASSIVE/设置期；夜序负向由 ③⑤ 保障，此处只断言「确实不入队」。
      const entry = nightEntries.find((e) => e.roleId === id);
      expect(entry, `${id} 被动 ⇒ 不应入夜序`).toBeUndefined();
      return;
    }
    const ability: any = getAbilityForRole(id);
    expect(ability, `注册表应有 ${id} 能力对象`).toBeTruthy();
    expect(ability.roleId).toBe(id);
    const timing: string = ability.triggerTiming ?? "";
    const entry = nightEntries.find((e) => e.roleId === id);
    if (entry) {
      // 入队 ⇒ 必须声明夜间触发
      expect(
        timing.length > 0,
        `${id} 入队但 triggerTiming 为空`
      ).toBe(true);
    }
    // 四段中间件：至少一段非空（纯设置期如 baron 走 preCheck 或空管道路径）
    const stages = [
      ability.preCheck,
      ability.calculate,
      ability.stateUpdate,
      ability.postProcess,
    ].filter(Boolean);
    expect(stages.length, `${id} 四段中间件不应全空`).toBeGreaterThan(0);
  });

  it("⑤ 被动/设置期角色全局负向：drunk/mutant/mayor/poppy_grower/savant 不入夜序", () => {
    for (const id of ["drunk", "mutant", "mayor", "poppy_grower", "savant", "baron"]) {
      expect(
        nightEntries.some((e) => e.roleId === id),
        `${id} 不应入夜序`
      ).toBe(false);
    }
  });

  it("⑥ 首夜/其他夜分派正确性：firstNightOnly 角色无 otherNightPriority", () => {
    for (const entry of nightEntries) {
      if (!PG.roleIds!.includes(entry.roleId)) continue;
      if (entry.firstNightOnly) {
        expect(
          entry.otherNightPriority,
          `${entry.roleId} firstNightOnly ⇒ otherNightPriority 必须为 0`
        ).toBe(0);
      }
    }
  });

  it("⑦ 罂粟花开专属系统步骤：军团互认在 legion 在场剧本的首夜存在（镜像对拍已锁）", () => {
    // legion 是 poppyganda 恶魔之一 ⇒ 首夜军团互认步骤必须在生产夜序中
    const legionStep = nightEntries.find(
      (e) => e.roleId === "legion_mutual_recognition"
    );
    expect(legionStep).toBeTruthy();
    expect(legionStep!.firstNightPriority).toBe(2.25);
  });
});
