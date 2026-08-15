/**
 * L3.5 不变式测试 - 不变式断言集合
 *
 * 每条不变式都是"任何情况下都必须成立"的规则，返回违规描述列表：
 *   [] = 通过；非空 = 违规（每条描述一次违规）。
 *
 * I1 死亡标记一致性    — 死亡状态字段必须协同落地（isDead/isAlive/markedForDeath/...）
 * I2 队列合法性        — 夜间队列不得包含死亡/被动/未注册角色
 * I3 死亡玩家拦截      — 死亡玩家的能力必须被 preCheck 中止（间谍例外）
 * I4 信息干扰          — 中毒/醉酒的信息角色结果必须标记受干扰（isCorrupted）
 * I5 目标合法性        — 执行目标必须符合 targetConfig（存活/非自身）
 * I6 文档对撞          — 能力优先级必须与官方夜晚顺序 JSON 一致（按文档执行）
 * I7 夜间死亡有来源    — 当晚死亡的玩家必须带有 killedBy/deathSource（可追溯）
 */
import type { IRoleAbility } from "../../roles/core/roleAbility.types";
import { collectGlobalRules } from "../globalRuleEngine";
import { runFullAbilityPipeline } from "../middlewarePipeline";
import { nightOrderParser } from "../nightOrderParser";
import type { ExecutedAction, NightSimResult } from "./simulator";
import { buildContextForNode } from "./simulator";

export type InvariantError = string;
export type InvariantCheck = (
  result: NightSimResult,
  abilityMap: Record<string, IRoleAbility>,
  rolePool?: Set<string>
) => InvariantError[] | Promise<InvariantError[]>;

/** 兼容 statusEffects 与遗留字段的中毒/醉酒判断 */
function isCorruptedSeat(seat: any): boolean {
  const effects = seat.statusEffects ?? [];
  const poisoned =
    effects.some((e: any) => e.type === "poisoned") || !!seat.isPoisoned;
  const drunk =
    effects.some((e: any) => e.type === "drunk") || !!seat.isDrunk;
  return poisoned || drunk;
}

// ─── I1 死亡标记一致性 ──────────────────────────────────────────────

export const I1DeathMarkersConsistent: InvariantCheck = (result) => {
  const errs: string[] = [];
  for (const seat of (result.finalSnapshot.seats as any[]) ?? []) {
    const id = seat.id;
    const { isAlive, isDead, markedForDeath, diedAtNight, killedBy, deathSource } = seat;
    if (isDead === true && isAlive !== false) {
      errs.push(`I1: 座位${id + 1} isDead=true 但 isAlive=${isAlive}`);
    }
    if (isAlive === true && isDead === true) {
      errs.push(`I1: 座位${id + 1} isAlive 与 isDead 同时为 true`);
    }
    if (markedForDeath === true && isDead !== true) {
      errs.push(`I1: 座位${id + 1} markedForDeath=true 但 isDead=${isDead}`);
    }
    if (diedAtNight !== undefined && isDead !== true) {
      errs.push(`I1: 座位${id + 1} diedAtNight=${diedAtNight} 但 isDead=${isDead}`);
    }
    if (killedBy !== undefined && isDead !== true) {
      errs.push(`I1: 座位${id + 1} killedBy=${killedBy} 但 isDead=${isDead}`);
    }
    if (deathSource !== undefined && isDead !== true) {
      errs.push(`I1: 座位${id + 1} deathSource=${deathSource} 但 isDead=${isDead}`);
    }
  }
  return errs;
};

// ─── I2 队列合法性 ──────────────────────────────────────────────────

export const I2QueueLegality: InvariantCheck = (result, abilityMap) => {
  const errs: string[] = [];
  const seen = new Set<string>();

  for (const node of result.queue) {
    const seat = (result.initialSnapshot.seats as any[]).find(
      (s) => s.id === node.seatId
    );

    // 2.1 死亡角色不得入队（间谍 deadActorWakes 除外）
    if (seat?.isDead && node.roleId !== "spy") {
      errs.push(`I2: 死亡玩家 ${node.roleId}(${node.seatId + 1}号) 被排入夜间队列`);
    }

    // 2.2 能力必须已注册（否则执行的是空管道 → 静默无效果）
    if (!abilityMap[node.abilityId]) {
      errs.push(`I2: 能力 ${node.abilityId}（${node.roleId}）未在能力注册表注册`);
    }

    // 2.3 同座位同能力不得重复
    const key = `${node.seatId}-${node.abilityId}`;
    if (seen.has(key)) {
      errs.push(`I2: 座位${node.seatId + 1} 能力 ${node.abilityId} 重复入队`);
    }
    seen.add(key);
  }
  return errs;
};

// ─── I3 死亡玩家能力拦截 ────────────────────────────────────────────

export const I3DeadPlayerAbilityBlocked: InvariantCheck = async (
  result,
  abilityMap
) => {
  const errs: string[] = [];
  const finalSeats = (result.finalSnapshot.seats as any[]) ?? [];

  for (const seat of finalSeats) {
    if (!seat.isDead || seat.role?.id === "spy") continue;

    // 找到该角色的夜间能力
    const ability = Object.values(abilityMap).find(
      (a) => a.roleId === seat.role?.id
    );
    if (!ability) continue;

    const deadSeat = { ...seat, isAlive: false, isDead: true };
    const snapshot: any = {
      ...result.finalSnapshot,
      seats: finalSeats.map((s) => (s.id === seat.id ? deadSeat : s)),
    };
    const node: any = {
      seatId: seat.id,
      roleId: ability.roleId,
      roleName: seat.role?.name ?? ability.roleId,
      priority: 49,
      abilityId: ability.abilityId,
      targetIds: [],
      meta: {},
    };
    const context = buildContextForNode(snapshot, node, []);
    const out = await runFullAbilityPipeline(
      {
        preCheck: ability.preCheck,
        calculate: ability.calculate,
        stateUpdate: ability.stateUpdate,
        postProcess: ability.postProcess,
      },
      context
    );
    if (!out.aborted) {
      errs.push(
        `I3: 死亡玩家 ${seat.role?.id}(${seat.id + 1}号) 的能力未被中止（aborted=${out.aborted}）`
      );
    }
  }
  return errs;
};

// ─── I4 信息干扰 ────────────────────────────────────────────────────

/** 信息类角色集合（可扩展） */
export const INFO_ROLES = new Set([
  "washerwoman",
  "librarian",
  "investigator",
  "chef",
  "empath",
  "fortune_teller",
  "undertaker",
  "ravenkeeper",
  "seamstress",
  "flowergirl",
  "dreamer",
  "philosopher",
  "oracle",
  "town_crier",
  "snake_charmer",
  "sage",
  "mathematician",
  "fisherman",
]);

export const I4PoisonedInfoCorrupted: InvariantCheck = (result) => {
  const errs: string[] = [];
  for (const action of result.actions) {
    const meta = action.context.meta ?? {};
    const node = action.node;
    if (!INFO_ROLES.has(node.roleId)) continue;

    // 🔧 用引擎执行当下的判定（abilityEffective，由 abilityPriorityCalculation
    //   在 calculate 前注入）而非夜初快照——同夜前面角色的行动（如投毒者毒到
    //   信息角色）会改变执行当下的状态，夜初快照会误判"未中毒却受干扰"。
    const engineEffective = meta.abilityEffective !== false;

    // 中毒/醉酒的信息角色：结果必须标记 isCorrupted=true 或无结果；
    // 绝不允许"受干扰却产生未受干扰的干净结果"
    const resultInfo = meta.displayInfo ?? meta.abilityResult ?? null;
    if (!engineEffective && resultInfo) {
      const marked = meta.isCorrupted === true || resultInfo.isCorrupted === true;
      if (!marked) {
        errs.push(
          `I4: ${node.roleId}(${node.seatId + 1}号) 引擎判定受干扰但结果未标记 isCorrupted（abilityEffective=${meta.abilityEffective}）`
        );
      }
    }
    // 未受干扰的信息角色：不得标记受干扰（防止误伤）
    if (engineEffective && meta.isCorrupted === true) {
      errs.push(
        `I4: ${node.roleId}(${node.seatId + 1}号) 引擎判定未受干扰却标记 isCorrupted=true（abilityEffective=${meta.abilityEffective}）`
      );
    }
  }
  return errs;
};

// ─── I5 目标合法性 ──────────────────────────────────────────────────

export const I5TargetLegality: InvariantCheck = (result, abilityMap) => {
  const errs: string[] = [];
  for (const action of result.actions) {
    const ability = abilityMap[action.node.abilityId];
    if (!ability) continue;
    const tc = ability.targetConfig;
    const snapshot = action.context.snapshot ?? result.finalSnapshot;
    const seats = (snapshot.seats as any[]) ?? [];

    for (const tid of action.targetIds) {
      const target = seats.find((s) => s.id === tid);
      if (!target) continue;

      if (!tc.allowSelf && tid === action.node.seatId) {
        errs.push(
          `I5: ${action.node.roleId} 选择自己为目标（allowSelf=false）`
        );
      }
      if (!tc.allowDead && target.isDead) {
        errs.push(
          `I5: ${action.node.roleId} 选择死亡玩家 ${tid + 1}号 为目标（allowDead=false）`
        );
      }
    }

    // min>0 的能力必须选满目标（否则"零目标静默通过"）
    if (tc.min > 0 && action.targetIds.length < tc.min && !action.aborted) {
      errs.push(
        `I5: ${action.node.roleId} 目标数 ${action.targetIds.length} < min=${tc.min} 且未中止`
      );
    }
  }
  return errs;
};

// ─── I6 文档对撞（官方夜晚顺序 JSON → 能力必须可实现）─────────────────

/** id 命名漂移映射：官方 JSON 拼写 → 能力注册表实际 roleId */
export const ROLE_ID_ALIASES: Record<string, string> = {
  no_dashi: "no_dashii",
  nightwatchman: "night_watchman",
  choirboy: "choir_boy",
  puppet: "marionette",
};

/** JSON 已收录夜晚顺序但能力确实未实现/未注册的角色（非 8 官方剧本范围） */
export const KNOWN_UNIMPLEMENTED = new Set([
  "pockmarked_witch",
  "tyrant",
  "rumor_monger",
]);

/** 系统级步骤（非角色能力） */
const SYSTEM_STEP_IDS = new Set([
  "info_roles_start",
  "minion_info",
  "demon_info",
  "dusk",
  "dawn",
]);

export const I6PriorityMatchesOfficialOrder: InvariantCheck = (
  _result,
  abilityMap
) => {
  const errs: string[] = [];
  const registryIds = new Set(
    Object.values(abilityMap).map((a) => a.roleId)
  );

  const hasAbility = (roleId: string): boolean => {
    if (registryIds.has(roleId)) return true;
    const alias = ROLE_ID_ALIASES[roleId];
    return alias !== undefined && registryIds.has(alias);
  };

  // 官方夜晚顺序 JSON 中声明的角色 id
  const jsonRoleIds = new Set<string>();
  for (const item of nightOrderParser.getFirstNightOrder()) {
    jsonRoleIds.add(item.roleId);
  }
  for (const item of nightOrderParser.getOtherNightOrder()) {
    jsonRoleIds.add(item.roleId);
  }

  // JSON 声明了该角色唤醒（首夜或每晚），引擎必须存在对应能力实现
  for (const roleId of jsonRoleIds) {
    if (SYSTEM_STEP_IDS.has(roleId)) continue;
    if (hasAbility(roleId)) continue;
    if (KNOWN_UNIMPLEMENTED.has(roleId)) continue;
    errs.push(
      `I6: 官方夜晚顺序 JSON 声明 ${roleId} 唤醒，但能力注册表中无对应能力实现（漏实现/漏注册）`
    );
  }
  return errs;
};

// ─── I7 夜间死亡有来源 ──────────────────────────────────────────────

export const I7NightDeathHasSource: InvariantCheck = (result) => {
  const errs: string[] = [];
  const seats = (result.finalSnapshot.seats as any[]) ?? [];
  const nightCount = result.nightCount;

  for (const seat of seats) {
    // 当晚死亡（diedAtNight === 当前夜）必须能追溯到来源
    if (seat.diedAtNight !== nightCount) continue;
    const hasSource =
      seat.killedBy !== undefined || seat.deathSource !== undefined;
    // 镇长替代死亡 / 自杀类角色（赌徒猜错等）由 killedBy 标识
    if (!hasSource) {
      errs.push(
        `I7: 座位${seat.id + 1}（${seat.role?.id ?? "?"}）当晚死亡但无 killedBy/deathSource`
      );
    }
  }
  return errs;
};

// ─── I8 能力配置自洽 ────────────────────────────────────────────────

/** 系统级角色（阶段节点/占位，不参与角色能力治理） */
const SYSTEM_ROLE_IDS = new Set(["dawn", "dusk", "villager"]);

export const I8AbilityConfigConsistent: InvariantCheck = (
  _result,
  abilityMap,
  rolePool?: Set<string>
) => {
  const errs: string[] = [];
  for (const ability of Object.values(abilityMap)) {
    // 仅检查目标剧本角色池内的角色（默认全量；传池可豁免未完成的自定义角色）
    if (rolePool && !rolePool.has(ability.roleId)) continue;
    if (SYSTEM_ROLE_IDS.has(ability.roleId)) continue;
    const fn = ability.firstNightPriority;
    const on = ability.otherNightPriority;
    const hasFn = fn !== null && fn !== undefined && fn > 0;
    const hasOn = on !== null && on !== undefined && on > 0;
    const tc = ability.targetConfig;

    // 8.1 firstNightOnly 与 otherNightOnly 不得同时为 true（首夜专属又每晚？）
    if (ability.firstNightOnly && (ability as any).otherNightOnly) {
      errs.push(`I8: ${ability.roleId} firstNightOnly 与 otherNightOnly 同时为 true`);
    }
    // 8.2 firstNightOnly=true 必须有首夜优先级；otherNightOnly=true 必须有其他夜优先级
    if (ability.firstNightOnly && !hasFn) {
      errs.push(`I8: ${ability.roleId} firstNightOnly=true 但 firstNightPriority 为空`);
    }
    if ((ability as any).otherNightOnly && !hasOn) {
      errs.push(`I8: ${ability.roleId} otherNightOnly=true 但 otherNightPriority 为空`);
    }
    // 8.3 targetConfig 自洽：min <= max，min >= 0
    if (tc) {
      if (tc.min < 0 || tc.max < 0 || tc.min > tc.max) {
        errs.push(
          `I8: ${ability.roleId} targetConfig 非法（min=${tc.min}, max=${tc.max}）`
        );
      }
    }
    // 8.4 触发时机声明 FIRST_NIGHT 但无首夜优先级 → 永不被唤醒
    //   （排除含 PASSIVE 标签的能力：酒鬼等被动/设置类能力首夜由 setup 驱动，
    //     不依赖夜间队列唤醒优先级）
    const timings: string[] = (ability.triggerTiming ?? []) as string[];
    if (
      timings.includes("first_night") &&
      !hasFn &&
      !timings.includes("passive")
    ) {
      errs.push(
        `I8: ${ability.roleId} 声明 FIRST_NIGHT 触发但 firstNightPriority 为空（首夜永不被唤醒）`
      );
    }
    if (
      (timings.includes("every_night") || timings.includes("other_night")) &&
      !hasFn &&
      !hasOn
    ) {
      errs.push(
        `I8: ${ability.roleId} 声明夜晚触发但两个优先级均为空（永不被唤醒）`
      );
    }
  }
  return errs;
};

// ─── I9 结算产物（技能发动后必须有结算）─────────────────────────────

/**
 * 每个成功执行的夜间动作（非 aborted），必须产生结算产物：
 * meta.displayInfo（UI 弹窗数据）或 meta.abilityLog（日志）或 meta.abilityResult（结果）。
 * 无产物 = "发动了但没结算"（历史 bug：信息角色无结算弹窗/送葬者无结果）。
 */
export const I9SettlementProduced: InvariantCheck = (result) => {
  const errs: string[] = [];
  for (const action of result.actions) {
    if (action.aborted) continue;
    const meta = action.context.meta ?? {};
    // 系统步骤（dusk/dawn/minion_info/demon_info）不要求结算产物
    const roleId = action.node.roleId;
    if (SYSTEM_STEP_IDS.has(roleId) || SYSTEM_ROLE_IDS.has(roleId)) continue;

    const hasProduct =
      meta.displayInfo !== undefined ||
      meta.abilityLog !== undefined ||
      meta.abilityResult !== undefined ||
      meta.prompt !== undefined;
    if (!hasProduct) {
      errs.push(
        `I9: ${roleId}(${action.node.seatId + 1}号) 技能执行成功但无结算产物（displayInfo/abilityLog/abilityResult 均无）`
      );
    }
  }
  return errs;
};

// ─── I10 全局规则声明自洽（B 方案）──────────────────────────────────

/**
 * 声明式规则注册表自洽：扫描能力注册表全部 globalRules 声明，验证
 * 1) 规则 id 全局唯一
 * 2) type / phase 是已知枚举（解释器存在）
 * 3) 声明者（owner）角色确实存在
 * 规则"生效性"由 gf_roles_d2 定向测试覆盖（每种 type 有管线冒烟用例）。
 */
export const I10GlobalRulesConsistent: InvariantCheck = (
  _result,
  abilityMap
) => {
  const errs: string[] = [];
  let rules: Array<{ id: string; type: string; phase: string; owner?: string }> = [];
  try {
    rules = collectGlobalRules() as any;
  } catch (e) {
    errs.push(`I10: 规则收集失败 ${(e as Error).message}`);
    return errs;
  }
  const VALID_TYPES = new Set(["target_redirect", "info_override", "target_collect"]);
  const VALID_PHASES = new Set(["before_calculate", "after_calculate", "after_execute"]);
  const seen = new Set<string>();
  const knownRoles = new Set(
    Object.values(abilityMap).map((a: any) => a.roleId)
  );

  for (const r of rules) {
    if (seen.has(r.id)) errs.push(`I10: 规则 id 重复「${r.id}」`);
    seen.add(r.id);
    if (!VALID_TYPES.has(r.type)) {
      errs.push(`I10: 规则「${r.id}」未知类型「${r.type}」`);
    }
    if (!VALID_PHASES.has(r.phase)) {
      errs.push(`I10: 规则「${r.id}」未知阶段「${r.phase}」`);
    }
    if (r.owner && !knownRoles.has(r.owner)) {
      errs.push(`I10: 规则「${r.id}」声明者「${r.owner}」不在能力注册表`);
    }
  }
  return errs;
};

// ─── I11 效果语义落地（防"空转能力"）────────────────────────────────

/**
 * 每个能力声明 effectSemantics（kill/poison/drunk/swap/transform/revive/protect），
 * I11 对比执行前后快照，验证"声明的效果真的落地"：
 * - kill：出现死亡标记变化，或击杀/免疫记录写入快照（lastKill/fangGuJump/taowuSubstitute）
 * - poison/drunk：目标出现对应 statusEffects / 标记
 * - swap/transform：角色或阵营标记变化
 * - revive：死者复活
 * - protect：出现保护标记
 * 默认语义 "info"（纯信息）豁免校验。抓"发动了但没做该做的事"的空转能力
 * （如原舞蛇人只透传 meta 不交换角色）。
 */
export const I11EffectSemanticsApplied: InvariantCheck = (
  result,
  abilityMap
) => {
  const errs: string[] = [];
  const SYSTEM_IDS = new Set<string>([
    "dusk",
    "dawn",
    "minion_info",
    "demon_info",
    "info_roles_start",
  ]);

  const seatChanged = (prev: any[], cur: any[], id: number, pred: (s: any) => boolean): boolean => {
    const p = prev.find((s) => s.id === id);
    const c = cur.find((s) => s.id === id);
    if (!p || !c) return false;
    return !pred(p) && pred(c);
  };

  for (const action of result.actions) {
    if (action.aborted) continue;
    const roleId = action.node.roleId;
    if (SYSTEM_IDS.has(roleId)) continue;

    const ability = abilityMap[action.node.abilityId];
    const semantics = ability?.effectSemantics ?? "info";
    if (semantics === "info") continue;

    const prev = action.prevSnapshot.seats as any[];
    const cur = action.snapshot.seats as any[];
    const meta = action.context.meta ?? {};
    const snap = action.snapshot as any;

    let ok = false;
    switch (semantics) {
      case "kill": {
        // 死亡标记（引擎契约：恶魔只标 markedForDeath，黎明才落 isDead；
        // 刺客/半兽人等直接落 isAlive:false/isDead:true）
        const isDeadMark = (s: any) =>
          s.markedForDeath === true || s.isAlive === false || s.isDead === true;
        // ① 全新死亡标记（prev 无 → cur 有）
        const prevDeadIds = new Set(
          prev.filter(isDeadMark).map((s) => s.id)
        );
        const newDeath = cur.some(
          (s) => isDeadMark(s) && !prevDeadIds.has(s.id)
        );
        // ② 死亡深化（prev 仅 mfd → cur 死透 isAlive:false/isDead:true）
        const deepDeath = cur.some(
          (s) =>
            (s.isAlive === false || s.isDead === true) &&
            prev.some(
              (x) =>
                x.id === s.id && x.isAlive !== false && x.isDead !== true
            )
        );
        // 条件豁免：能力结果明确声明"未击杀/免疫/不应杀"，或目标被保护
        // （monk/innkeeper 等 statusEffects.protected / isProtected），
        // 或击杀被士兵/镇长免疫（imp 记录 blockedBySoldier）
        const targetProtected = cur.some(
          (s) =>
            s.isProtected === true ||
            (s.statusEffects ?? []).some(
              (e: any) =>
                e.type === "protected" || e.type === "safeguard"
            )
        );
        const exempt =
          meta.abilityResult?.killed === false ||
          meta.abilityResult?.shouldKill === false ||
          meta.abilityResult?.immune === true ||
          meta.impResult?.log?.blockedBySoldier === true ||
          targetProtected;
        ok =
          newDeath ||
          deepDeath ||
          snap.lastKill !== undefined ||
          snap.fangGuJump !== undefined ||
          snap.taowuSubstitute !== undefined ||
          exempt;
        break;
      }
      case "poison": {
        // 执行后场上有中毒标记即视为落地（允许对已中毒目标"刷新毒"；
        // 空转场景下 cur 无任何中毒标记 → 违规）
        ok = cur.some(
          (s) =>
            s.isPoisoned === true ||
            (s.statusEffects ?? []).some(
              (e: any) => e.type === "poisoned" || e.type === "poison"
            )
        );
        break;
      }
      case "drunk": {
        ok = cur.some(
          (s) =>
            s.isDrunk === true ||
            (s.statusEffects ?? []).some((e: any) => e.type === "drunk")
        );
        break;
      }
      case "swap":
      case "transform": {
        // 条件触发：仅在结果声明触发时要求角色变化
        const claimed =
          meta.abilityResult?.swapTriggered === true ||
          meta.abilityResult?.transformed === true;
        if (!claimed) {
          ok = true;
          break;
        }
        ok = cur.some((s) => {
          const p = prev.find((x) => x.id === s.id);
          if (!p) return false;
          const roleChanged = JSON.stringify(p.role) !== JSON.stringify(s.role);
          const alignChanged =
            (p.isEvilConverted ?? false) !== (s.isEvilConverted ?? false) ||
            (p.isGoodConverted ?? false) !== (s.isGoodConverted ?? false);
          return roleChanged || alignChanged;
        });
        break;
      }
      case "revive": {
        const claimed = meta.abilityResult?.revived === true;
        if (!claimed) {
          ok = true;
          break;
        }
        ok = cur.some((s) => {
          const p = prev.find((x) => x.id === s.id);
          return p?.isDead === true && (s.isDead === false || s.isAlive === true);
        });
        break;
      }
      case "protect": {
        ok =
          (snap.protectedTonight ?? []).length > 0 ||
          cur.some((s) =>
            (s.protectedTonight ?? s.protectedBy ?? null) !== null &&
            (s.protectedTonight ?? s.protectedBy ?? false) !== false
          );
        break;
      }
    }

    if (!ok) {
      errs.push(
        `I11: ${roleId}(${action.node.seatId + 1}号) 声明语义 ${semantics} 但执行后无对应状态落地（空转能力）`
      );
    }
  }
  return errs;
};

/** 全部不变式（按序执行） */
export const ALL_INVARIANTS: Array<{ name: string; check: InvariantCheck }> = [
  { name: "I1 死亡标记一致性", check: I1DeathMarkersConsistent },
  { name: "I2 队列合法性", check: I2QueueLegality },
  { name: "I3 死亡玩家拦截", check: I3DeadPlayerAbilityBlocked },
  { name: "I4 信息干扰", check: I4PoisonedInfoCorrupted },
  { name: "I5 目标合法性", check: I5TargetLegality },
  { name: "I6 文档对撞（JSON→能力注册）", check: I6PriorityMatchesOfficialOrder },
  { name: "I7 夜间死亡有来源", check: I7NightDeathHasSource },
  { name: "I8 能力配置自洽", check: I8AbilityConfigConsistent },
  { name: "I9 结算产物", check: I9SettlementProduced },
  { name: "I10 全局规则自洽", check: I10GlobalRulesConsistent },
  { name: "I11 效果语义落地", check: I11EffectSemanticsApplied },
];

/** 运行全部不变式，返回 {invariant: 错误列表} */
export async function runAllInvariants(
  result: NightSimResult,
  abilityMap: Record<string, IRoleAbility>,
  rolePool?: Set<string>
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  for (const { name, check } of ALL_INVARIANTS) {
    const errs = await Promise.resolve(check(result, abilityMap, rolePool));
    if (errs.length > 0) out.set(name, errs);
  }
  return out;
}
