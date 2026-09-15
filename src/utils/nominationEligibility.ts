/**
 * 🗣️ 提名资格判定 —— 「每个黄昏：每名玩家最多发起 1 次提名、最多被提名 1 次」
 * 的**唯一事实来源**。
 *
 * ── 为什么要有这个文件 ─────────────────────────────────────────
 * 这条规则原先散落在 6 个地方各自实现（useDayActions / GameStage /
 * DayActionModal / PlayerContextMenu / SeatNode / useExecutionHandlers），
 * 每份都自己写 `Set.has(...)` 或 `Array.includes(...)`。
 * 结果是「判定条件一致、但**生命周期**不一致」：判定没问题，可记录被
 * 提前删掉了，于是限制失效。
 *
 * 2026-09-14 用户实测缺陷（本文件诞生原因）：
 *   「当前实测可以发起 2 次提名，和被提名 2 次」
 * 根因在 GameStage 的「VOTE_INPUT 模态关闭」effect：**无条件**调用
 * `cancelNomination(lastNominator, pendingVoteFor)`，把**投票已完成**的
 * 提名者/被提名者一并从记录里删除 → 双方资格被恢复。
 *
 * ⇒ 本模块把「记录怎么变」这件事收口：
 *   · `appendNominationRecord`  提名成立时写入（只能加，不能减）
 *   · `revokeNominationOnVoteCancelled` 只有**显式取消**才回退；
 *     传 `voteSettled: true`（投票已计票）时必须原样返回。
 *   · `NOMINATION_RECORDS_RESET` 黄昏推进时整体清空
 */

/** nominationRecords 的规范形态（运行时可能是 Array，见撤销/读档） */
export interface NominationRecords {
  nominators: Set<number> | number[];
  nominees: Set<number> | number[];
}

/** 判定结果：ok=false 时 reason 可直接展示给说书人 */
export interface NominationCheckResult {
  ok: boolean;
  reason?: string;
}

/** 兼容 Set / Array 两种形态（旧快照与 JSON 往返后是数组） */
function has(list: Set<number> | number[] | undefined | null, id: number) {
  if (!list) return false;
  if (list instanceof Set) return list.has(id);
  if (Array.isArray(list)) return (list as number[]).includes(id);
  return false;
}

/** 造一份空的记录（新局 / 新黄昏） */
export function emptyNominationRecords(): {
  nominators: Set<number>;
  nominees: Set<number>;
} {
  return { nominators: new Set<number>(), nominees: new Set<number>() };
}

/**
 * 黄昏推进时的重置值。
 * 用函数而不是共享常量 —— Set 是引用类型，共享会被就地污染。
 */
export function NOMINATION_RECORDS_RESET(): {
  nominators: Set<number>;
  nominees: Set<number>;
} {
  return emptyNominationRecords();
}

/** 该玩家本黄昏是否还能**发起**提名 */
export function canNominate(
  records: NominationRecords | undefined | null,
  seatId: number
): NominationCheckResult {
  if (has(records?.nominators, seatId)) {
    return {
      ok: false,
      reason: `每名玩家每个黄昏只能发起一次提名（${seatId + 1}号本黄昏已发起过提名）`,
    };
  }
  return { ok: true };
}

/** 该玩家本黄昏是否还能**被**提名 */
export function canBeNominated(
  records: NominationRecords | undefined | null,
  seatId: number
): NominationCheckResult {
  if (has(records?.nominees, seatId)) {
    return {
      ok: false,
      reason: `每名玩家每个黄昏只能被提名一次（${seatId + 1}号本黄昏已被提名过）`,
    };
  }
  return { ok: true };
}

/** 一次性校验「提名者 + 被提名者」两侧（executeNomination 的入口守卫） */
export function checkNominationPair(
  records: NominationRecords | undefined | null,
  nominatorId: number,
  nomineeId: number
): NominationCheckResult {
  const asNominator = canNominate(records, nominatorId);
  if (!asNominator.ok) return asNominator;
  const asNominee = canBeNominated(records, nomineeId);
  if (!asNominee.ok) return asNominee;
  return { ok: true };
}

/**
 * 提名成立时写入记录。**只能加，不能减** —— 这是资格被消耗的唯一入口。
 * 纯函数：返回新对象，不改入参。
 */
export function appendNominationRecord(
  records: NominationRecords | undefined | null,
  nominatorId: number,
  nomineeId: number
): { nominators: Set<number>; nominees: Set<number> } {
  const nominators = new Set<number>(
    records?.nominators instanceof Set
      ? records.nominators
      : Array.isArray(records?.nominators)
        ? records.nominators
        : []
  );
  const nominees = new Set<number>(
    records?.nominees instanceof Set
      ? records.nominees
      : Array.isArray(records?.nominees)
        ? records.nominees
        : []
  );
  nominators.add(nominatorId);
  nominees.add(nomineeId);
  return { nominators, nominees };
}

/**
 * 投票流程**取消**（说书人反悔 / 关掉计票窗想重来）时回退资格。
 *
 * ⚠️ 关键契约：`voteSettled === true`（投票已经计票结算）时**必须原样返回**。
 * 这正是用户实测缺陷的修复点 —— 投票完成与投票取消是两件完全不同的事，
 * 前者绝不能恢复资格，否则同一黄昏内就能再提名一次 / 再被提名一次。
 */
export function revokeNominationOnVoteCancelled(
  records: NominationRecords | undefined | null,
  nominatorId: number | null | undefined,
  nomineeId: number | null | undefined,
  options?: { voteSettled?: boolean }
): { nominators: Set<number>; nominees: Set<number> } {
  const nominators = new Set<number>(
    records?.nominators instanceof Set
      ? records.nominators
      : Array.isArray(records?.nominators)
        ? records.nominators
        : []
  );
  const nominees = new Set<number>(
    records?.nominees instanceof Set
      ? records.nominees
      : Array.isArray(records?.nominees)
        ? records.nominees
        : []
  );

  // 🛑 投票已结算 → 记录是既成事实，不得回退。
  if (options?.voteSettled) {
    return { nominators, nominees };
  }

  if (nominatorId !== null && nominatorId !== undefined) {
    nominators.delete(nominatorId);
  }
  if (nomineeId !== null && nomineeId !== undefined) {
    nominees.delete(nomineeId);
  }
  return { nominators, nominees };
}

/**
 * 🗣️ 投票结算闩锁 —— 跨组件传递「本次投票到底结算了没有」。
 *
 * ── 为什么需要它 ─────────────────────────────────────────────
 * 「投票完成」与「投票取消」都会把 currentModal 从 `VOTE_INPUT` 变成 `null`，
 * 光看模态框关闭这一件事**无法区分**。而两者的后果完全相反：
 *   · 完成 → 本黄昏该玩家提名/被提名资格**已消耗**，不得恢复
 *   · 取消 → 说书人反悔，资格**应恢复**
 *
 * 结算发生在 `useExecutionHandlers.submitVotes`（深处），消费发生在
 * `GameStage` 的模态关闭 effect（另一棵树）。用模块级闩锁传递最小且无 prop 穿透。
 *
 * 用法：结算点 `markVoteSettled()`；消费点 `consumeVoteSettled()`（读后自动复位）。
 * 每次「打开投票弹窗」前应调用 `clearVoteSettled()`，避免上一次的残留。
 */
let voteSettledLatch = false;

/** 投票已计票结算（在 submitVotes 开头调用） */
export function markVoteSettled(): void {
  voteSettledLatch = true;
}

/** 读取并复位。返回 true 表示「上一次投票是正常结算的」 */
export function consumeVoteSettled(): boolean {
  const was = voteSettledLatch;
  voteSettledLatch = false;
  return was;
}

/** 显式清空（打开新的投票弹窗 / 开始新黄昏时） */
export function clearVoteSettled(): void {
  voteSettledLatch = false;
}

/** 仅供测试：窥视当前闩锁值而不复位 */
export function peekVoteSettled(): boolean {
  return voteSettledLatch;
}
