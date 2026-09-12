/**
 * 「受干扰信息」玩家视角假值统一处理层（新引擎链路）
 * ============================================================================
 *
 * 【用户报告的 bug】
 *   酒鬼厨师（12号）在说书人控制台正确显示「行动（受干扰）」，
 *   但**技能结果页仍然给出真值**：「场上有 2 对相邻的邪恶玩家」。
 *
 * 【根因（两个问题一起回答）】
 *   ① 为什么控制台是"受干扰"、结果页却是真值：
 *      控制台的受干扰标记来自 **React Seat 上的 isDrunk/isPoisoned**（GameConsole
 *      自己算的）；而结果页文案来自**能力管道**产出的 `displayInfo.log`。
 *      两者判定链不同：一旦管道侧最终把"真值"写进了 displayInfo.log
 *      （abilityEffective 误判为 true、或该角色走了不走假值分支的路径），
 *      结果页就会把真值直接交给玩家——标记与内容来自两个互不校验的来源。
 *   ② 是个例还是普遍：**普遍**。新引擎链路没有"校验层"——
 *      nightInfoGenerator 只把 isPoisoned/isDrunk/vortox 写进 `reason`，
 *      真正替换成假值的逻辑只存在于 legacy 的 utils/nightLogic.ts
 *      （generateFakeNightInfo / _fakeInspectionResult / drunkFirstInfoMap）。
 *      因此在被干扰时，凡是"管道算完直接把 displayInfo.log 当结果"的信息类角色
 *      （厨师/共情者/洗衣妇/图书管理员/调查员/占卜师/神谕者/博学者/杂耍艺人/
 *        送葬者/守鸦人/解谜大师…）都会把真值泄给玩家页。
 *
 * 【本模块的做法（唯一收口，绝不"没假值就显示真值"）】
 *   在执行链路生成结果文案的**唯一出口**（useNightActionHandler 的
 *   INFO_RESULT / modal 构造处）加一道"校验层"：
 *     若"受干扰"成立 → 玩家文案 = 假值文案（说书人设定值 > 确定性假值），
 *     真值只写进玩家看不到的 `realResultText`（说书人视图/控制台可见）。
 *   - 受干扰判定：`meta.isCorrupted`、`meta.abilityEffective === false`、
 *     nightInfo 的 isPoisoned、actor 的 isDrunk / drunk / marionette、
 *     以及涡流世界对**信息类角色**的干扰（isInformationRole）。
 *   - 假值来源优先级：
 *       1. 说书人在"信息微调"里设定的值（storytellerOverrides，模块级快照）；
 *       2. 确定性随机（createDeterministicRandom + nightInfoSeed）：
 *          同一局、同一夜、同一角色恒定，撤销/重做不变。
 *   假值按信息类型生成：
 *       - number（厨师对数 / 共情者计数…）：取 [0,max] 中 != 真值的确定值；
 *       - boolean（占卜师是/否）：直接取反；
 *       - targets（洗衣妇/图书管理员/调查员/守鸦人…）：换一批座位；
 *       - text（博学者/解谜大师/艺术家…）：给出中性兜底文案（绝不复用真值）。
 */

import { createDeterministicRandom, nightInfoSeed } from "../roles/core/deterministicRandom";

export type CorruptedInfoKind = "number" | "boolean" | "targets" | "text";

interface KindSpec {
  kind: CorruptedInfoKind;
  /** 数值型假值上界（含） */
  max?: number;
}

/** 信息类角色的"信息形态"表（决定假值怎么造）。 */
export const INFO_ROLE_KIND: Record<string, KindSpec> = {
  // 数值型
  chef: { kind: "number", max: 5 },
  empath: { kind: "number", max: 2 },
  clockmaker: { kind: "number", max: 6 },
  oracle: { kind: "number", max: 9 },
  mathematician: { kind: "number", max: 5 },
  juggler: { kind: "number", max: 5 },
  chambermaid: { kind: "number", max: 4 },
  flowergirl: { kind: "number", max: 3 },
  seamstress: { kind: "number", max: 3 },
  balloonist: { kind: "number", max: 3 },
  // 是 / 否
  fortune_teller: { kind: "boolean" },
  // 目标型
  bounty_hunter: { kind: "targets" },
  washerwoman: { kind: "targets" },
  librarian: { kind: "targets" },
  investigator: { kind: "targets" },
  undertaker: { kind: "targets" },
  ravenkeeper: { kind: "targets" },
  dreamer: { kind: "targets" },
  grandmother: { kind: "targets" },
  // 文本型
  savant: { kind: "text" },
  puzzlemaster: { kind: "text" },
  artist: { kind: "text" },
  amnesiac: { kind: "text" },
};

/** 文本型角色的中性兜底假文案（绝不包含真值）。 */
export const TEXT_FAKE_FALLBACK = "你获得了一条信息（内容由说书人裁定）。";

export function classifyCorruptedInfoRole(
  roleId: string | null | undefined
): KindSpec | null {
  if (!roleId) return null;
  return INFO_ROLE_KIND[roleId] ?? null;
}

// ─── 说书人设定值（模块级快照）────────────────────────────────────────────
/**
 * 说书人在"信息微调"面板里设定的假值。
 * 微调状态在 React Context 里（StorytellerTuningContext），而结果文案在
 * 非 React 的管道出口生成，因此这里放一份**只读快照**由 Provider 单向写入。
 * 单一对局、单一实例，不存在并发写；Provider 每次 state 变化覆盖一次。
 */
let storytellerOverrideSnapshot: Record<string, unknown> = {};

export function setStorytellerInfoOverrides(next: Record<string, unknown>): void {
  storytellerOverrideSnapshot = { ...next };
}

export function getStorytellerInfoOverrides(): Record<string, unknown> {
  return storytellerOverrideSnapshot;
}

export function resetStorytellerInfoOverrides(): void {
  storytellerOverrideSnapshot = {};
}

// ─── 假值生成 ────────────────────────────────────────────────────────────

/** 数值型假值：确定性、且 != 真值。 */
export function pickFakeNumber(
  trueValue: number | null | undefined,
  max: number,
  rng: () => number
): number {
  const candidates: number[] = [];
  for (let i = 0; i <= Math.max(0, max); i++) candidates.push(i);
  const pool = candidates.filter((n) => n !== trueValue);
  if (pool.length === 0) return trueValue === 0 ? 1 : 0;
  return pool[Math.floor(rng() * pool.length)];
}

/** 目标型假值：从候选座位里确定性地换一批（不与真目标完全相同）。 */
export function pickFakeTargets(
  trueTargetIds: number[],
  candidateSeatIds: number[],
  count: number,
  rng: () => number
): number[] {
  const pool = candidateSeatIds.filter((id) => !trueTargetIds.includes(id));
  const source = pool.length >= count ? pool : candidateSeatIds;
  const shuffled = [...source];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const picked = shuffled.slice(0, Math.min(count, shuffled.length));
  // 极端情况（可用座位不足）：硬保证与真值不同
  if (
    picked.length > 0 &&
    picked.length === trueTargetIds.length &&
    picked.every((id, idx) => id === trueTargetIds[idx])
  ) {
    picked[0] = trueTargetIds[0] === picked[0] ? picked[0] + 1 : picked[0];
  }
  return picked;
}

/** 从文本里抽取「X号」座位号（1-based，按出现顺序、去重）。 */
export function extractSeatNumbers(text: string | null | undefined): number[] {
  const out: number[] = [];
  const re = /(\d+)\s*号/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text || ""))) {
    const n = Number(m[1]);
    if (!out.includes(n)) out.push(n);
  }
  return out;
}

/**
 * 【同形最小改动】把文本里的座位号换成"别的座位号"，句式一字不改。
 * 这是所有兜底路径的**唯一形态**：只替换座位号/角色名，绝不退化成数字或空值。
 */
export function shiftSeatNumbers(
  text: string,
  candidateSeatIds: number[] | undefined,
  rng: () => number,
  keepNumbers: number[] = []
): string {
  const numbers = extractSeatNumbers(text).filter((n) => !keepNumbers.includes(n));
  if (numbers.length === 0) return text;
  const pool = (candidateSeatIds ?? []).map((id) => id + 1);
  const used = new Set<number>(keepNumbers);
  const replacement = new Map<number, number>();
  for (const n of numbers) {
    const candidates = pool.filter((p) => p !== n && !used.has(p));
    const pick =
      candidates.length > 0
        ? candidates[Math.floor(rng() * candidates.length)]
        : n === 1
          ? 2
          : 1;
    replacement.set(n, pick);
    used.add(pick);
  }
  return text.replace(/(\d+)\s*号/g, (whole, d) => {
    const to = replacement.get(Number(d));
    return to === undefined ? whole : `${to}号`;
  });
}

/** 把真值文案改写成假值文案（"只做替换，不泄露真值"）。 */
export function rewriteTextWithFakeValue(
  truthText: string,
  kind: CorruptedInfoKind,
  fakeValue: unknown,
  trueValue: unknown,
  opts?: {
    candidateSeatIds?: number[];
    rng?: () => number;
    keepNumbers?: number[];
  }
): string {
  const text = truthText ?? "";
  if (kind === "number") {
    const t = String(trueValue ?? "");
    const f = String(fakeValue ?? "");
    if (!t) return text;
    // 只替换"独立数字"（避免把座位号里的数字也换掉，如 "3号"→ 保留）
    return text.replace(new RegExp(`(?<![0-9号])${t}(?![0-9])`, "g"), f);
  }
  if (kind === "boolean") {
    const fake = Boolean(fakeValue);
    // ⚠️ 必须先判「没有恶魔」：它本身包含「有恶魔」子串，
    //    否则 replace 会原地不动，导致玩家文案 == 真值（真实 bug）。
    if (text.includes("没有恶魔") || text.includes("有恶魔")) {
      return text.replace(/没有恶魔|有恶魔/g, fake ? "有恶魔" : "没有恶魔");
    }
    if (text.includes("✅ 是") || text.includes("❌ 否")) {
      return text
        .replace("✅ 是", fake ? "✅ 是" : "❌ 否")
        .replace("❌ 否", fake ? "✅ 是" : "❌ 否");
    }
    if (text.includes("是")) {
      return text.replace("是", fake ? "是" : "否");
    }
    return text;
  }
  if (kind === "targets") {
    const trueIds = Array.isArray(trueValue) ? (trueValue as number[]) : [];
    const fakeIds = Array.isArray(fakeValue) ? (fakeValue as number[]) : [];
    let out = text;
    if (trueIds.length > 0 && fakeIds.length > 0) {
      trueIds.forEach((tid, idx) => {
        const fid = fakeIds[idx];
        if (fid === undefined) return;
        out = out.split(`${tid + 1}号`).join(`${fid + 1}号`);
      });
      if (out !== text) return out;
    }
    // ⚠️ 兜底（用户实测 bug 的根因）：真值没带座位数组时（例如图书管理员的结果
    //    来自 meta.librarianResult，而不是 selectedTargets），旧实现原地返回真值，
    //    于是 ensureNotTruth 退化成裸数字「你获得的信息：2」。
    //    这里改为**从真值文案里直接抽座位号**做同形替换（句式一字不改）。
    const rng = opts?.rng ?? (() => Math.random());
    return shiftSeatNumbers(
      text,
      opts?.candidateSeatIds,
      rng,
      opts?.keepNumbers ?? []
    );
  }
  // text 型：绝不复用真值
  return TEXT_FAKE_FALLBACK;
}

export interface CorruptedMaskInput {
  roleId: string;
  roleName: string;
  /** 管道产出的真值文案（会显示给玩家，必须被替换掉） */
  truthText: string;
  /** 真值（number / boolean / number[]），用于避开真值 */
  trueValue?: unknown;
  /** 行动者座位号（种子用） */
  actorSeatId: number;
  nightCount: number;
  /** 座位池（目标型假值用） */
  candidateSeatIds?: number[];
  /** 需要造几个目标 */
  targetCount?: number;
}

export interface CorruptedMaskResult {
  kind: CorruptedInfoKind;
  /** 玩家视角可以看到的文案（假值） */
  playerText: string;
  /** 说书人视角的真值文案 */
  truthText: string;
  fakeValue: unknown;
  /** 假值来源：说书人设定 / 确定性默认 */
  source: "storyteller" | "deterministic";
}

/**
 * 构造"受干扰"下的玩家文案。
 * ⚠️ 只要调用本函数，返回的 `playerText` 一定不是真值文案。
 */
export function buildCorruptedInfoMask(
  input: CorruptedMaskInput
): CorruptedMaskResult {
  const spec = classifyCorruptedInfoRole(input.roleId);
  const kind: CorruptedInfoKind = spec?.kind ?? "text";
  const rng = createDeterministicRandom(
    `corrupted-info|${nightInfoSeed(input.roleId, input.actorSeatId, input.nightCount)}`
  );
  const overrides = getStorytellerInfoOverrides();
  const override = overrides[input.roleId];

  let fakeValue: unknown;
  let source: "storyteller" | "deterministic" = "deterministic";

  if (override !== undefined && override !== null && (override as any) !== "") {
    fakeValue = override;
    source = "storyteller";
  } else if (kind === "number") {
    fakeValue = pickFakeNumber(
      typeof input.trueValue === "number" ? input.trueValue : null,
      spec?.max ?? 3,
      rng
    );
  } else if (kind === "boolean") {
    fakeValue = !Boolean(input.trueValue);
  } else if (kind === "targets") {
    fakeValue = pickFakeTargets(
      Array.isArray(input.trueValue) ? (input.trueValue as number[]) : [],
      input.candidateSeatIds ?? [],
      input.targetCount ?? (Array.isArray(input.trueValue) ? input.trueValue.length : 1),
      rng
    );
  } else {
    fakeValue = TEXT_FAKE_FALLBACK;
  }

  const playerText = rewriteTextWithFakeValue(
    input.truthText,
    kind,
    fakeValue,
    input.trueValue,
    {
      candidateSeatIds: input.candidateSeatIds,
      rng,
      // 不修改"行动者自己的座位号"（如「唤醒6号【图书管理员】」里的 6号）
      keepNumbers: [input.actorSeatId + 1],
    }
  );

  return {
    kind,
    playerText,
    truthText: input.truthText,
    fakeValue,
    source,
  };
}

/**
 * 最终兜底：任何情况下玩家文案都不得等于真值文案。
 * （说书人设定值恰好等于真值时，也会在这里被改写为确定性的不同值。）
 */
export function ensureNotTruth(
  playerText: string,
  truthText: string,
  roleId: string,
  actorSeatId: number,
  nightCount: number,
  candidateSeatIds?: number[]
): string {
  if (playerText && playerText !== truthText) return playerText;
  const truth = truthText ?? "";
  const rng = createDeterministicRandom(
    `corrupted-info-fallback|${nightInfoSeed(roleId, actorSeatId, nightCount)}`
  );
  // 【兜底原则】只做"与真值同形的最小改动"，优先级：
  //   ① 换座位号（X号 → Y号），句式完全不变；
  //   ② 换数字（把 X 改成 X±1），句式完全不变；
  //   ③ 以上都不成立时，给一句**完整的中性句子**。
  // ⚠️ 绝不允许退化成裸数字（例如「你获得的信息：2」）或空值 ——
  //    那正是用户实测到的"结果页只有【2】"的根因。
  const bySeat = shiftSeatNumbers(truth, candidateSeatIds, rng);
  if (bySeat && bySeat !== truth) return bySeat;
  const byDigit = truth.replace(/\d+/g, (d) => {
    const n = Number(d);
    return String(n === 0 ? 1 : n - 1);
  });
  if (byDigit && byDigit !== truth) return byDigit;
  return TEXT_FAKE_FALLBACK;
}

/**
 * 从引擎结果里收集"真值座位数组"。
 * 不同角色的真值落点不同（displayInfo.targetIds / meta.<role>Result.seat1,seat2 /
 * selectedTargets / abilityResult），这里统一扫描，避免各角色各写一套。
 */
export function collectInfoTargets(
  meta: any,
  displayInfo: any,
  selectedTargets: number[] = []
): number[] {
  const out: number[] = [];
  const push = (v: unknown) => {
    if (typeof v === "number" && Number.isFinite(v) && v >= 0 && !out.includes(v)) {
      out.push(v);
    }
  };
  const fromObject = (o: any) => {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o.targetIds)) o.targetIds.forEach(push);
    if (Array.isArray(o.players)) o.players.forEach(push);
    push(o.seat1);
    push(o.seat2);
    if (typeof o.targetId === "number") push(o.targetId);
  };
  if (Array.isArray(meta?.abilityResult)) (meta.abilityResult as unknown[]).forEach(push);
  fromObject(displayInfo);
  if (meta && typeof meta === "object") {
    Object.values(meta).forEach(fromObject);
  }
  (selectedTargets ?? []).forEach(push);
  return out;
}

/**
 * 玩家视角的"信息文案"统一入口（guide / speak / 大字 / 副标题 / modal 共用）。
 *
 * 受干扰（中毒/醉酒/涡流/酒鬼/提线木偶）时返回**与真值同形**的假文本；
 * 未受干扰时原样返回。任何调用方都不得绕过它自己拼玩家文案。
 */
export function buildCorruptedInfoPlayerText(input: {
  roleId: string;
  roleName: string;
  truthText: string;
  trueValue?: unknown;
  meta?: any;
  displayInfo?: any;
  selectedTargets?: number[];
  actorSeatId: number;
  nightCount: number;
  candidateSeatIds?: number[];
  /** 该角色是否信息类（表外角色用 classifyCorruptedInfoRole 兜底） */
  roleIsInformation?: boolean;
  corrupted: boolean;
}): string {
  if (!input.corrupted || !input.truthText) return input.truthText ?? "";
  const trueTargets =
    Array.isArray(input.trueValue) && input.trueValue.length > 0
      ? (input.trueValue as number[])
      : collectInfoTargets(
          input.meta,
          input.displayInfo,
          input.selectedTargets ?? []
        );
  const masked = buildCorruptedInfoMask({
    roleId: input.roleId,
    roleName: input.roleName,
    truthText: input.truthText,
    trueValue: trueTargets,
    actorSeatId: input.actorSeatId,
    nightCount: input.nightCount,
    candidateSeatIds: input.candidateSeatIds,
    targetCount: Math.max(1, trueTargets.length),
  });
  return ensureNotTruth(
    masked.playerText,
    input.truthText,
    input.roleId,
    input.actorSeatId,
    input.nightCount,
    input.candidateSeatIds
  );
}

// ─── 受干扰判定（纯函数，供测试与执行链路共用）──────────────────────────────

interface SeatLike2 {
  role?: { id?: string | null; type?: string | null } | null;
  isDrunk?: boolean;
  isPoisoned?: boolean;
}

export interface PlayerInfoCorruptionInput {
  /** 执行用的角色 id（酒鬼/提线木偶时为伪装角色的 id，与 nightInfo.effectiveRole.id 一致） */
  roleId: string;
  /** 能力管道的受干扰标记 */
  metaIsCorrupted?: boolean;
  /** 能力管道的"能力是否生效" */
  metaAbilityEffective?: boolean;
  /** nightInfo 的 isPoisoned（含涡流对信息类角色的置真） */
  nightInfoIsPoisoned?: boolean;
  actorSeat?: SeatLike2 | null;
  /** 是否为涡流世界 */
  isVortoxWorld?: boolean;
  /** 该角色是否信息类（表外角色用 classifyCorruptedInfoRole 兜底） */
  roleIsInformation?: boolean;
}

/**
 * 「本次结果是否必须给玩家假值」。
 *
 * 覆盖五种来源：
 *   1. 管道标记 isCorrupted / abilityEffective=false（中毒/醉酒/涡流/咖啡师…）；
 *   2. nightInfo.isPoisoned；
 *   3. React Seat 上的 isDrunk；
 *   4. **酒鬼 / 提线木偶**（官方：能力"不会产生任何效果，但说书人会假装生效"）；
 *   5. 涡流世界对信息类角色的干扰。
 */
export function isPlayerInfoCorrupted(
  input: PlayerInfoCorruptionInput
): boolean {
  const isDisguised =
    input.actorSeat?.role?.id === "drunk" ||
    input.actorSeat?.role?.id === "marionette";
  const roleIsInfo =
    input.roleIsInformation ??
    (classifyCorruptedInfoRole(input.roleId) !== null ||
      input.roleId === "drunk" ||
      input.roleId === "marionette");
  if (!roleIsInfo) return false;
  return (
    input.metaIsCorrupted === true ||
    input.metaAbilityEffective === false ||
    input.nightInfoIsPoisoned === true ||
    input.actorSeat?.isDrunk === true ||
    isDisguised ||
    (input.isVortoxWorld === true && input.roleIsInformation !== false)
  );
}

/** 酒鬼 / 提线木偶：能力"不会产生任何效果"。 */
export function isDisguisedIneffectiveActor(
  seat: SeatLike2 | null | undefined
): boolean {
  return seat?.role?.id === "drunk" || seat?.role?.id === "marionette";
}

/**
 * 丢弃伪装身份（酒鬼/提线木偶）能力对座位状态的一切改动。
 * 官方（提线木偶条目）：「……抽取到的善良角色对应的能力不会产生任何效果，
 * 但说书人会假装这些效果生效了。这与酒鬼的运作方式相似。」
 * → 不真杀、不真改状态、不真影响他人；玩家页另由假值校验层给出"生效了"的结果。
 */
export function discardDisguisedSideEffects<T>(
  originalSeats: T[],
  syncedSeats: T[],
  actorSeat: SeatLike2 | null | undefined
): T[] {
  if (!isDisguisedIneffectiveActor(actorSeat)) return syncedSeats;
  return originalSeats;
}
