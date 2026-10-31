import type { Seat } from "../types/game";
import { isSeatTownsfolkOrOutsider } from "./seatAlignment";

/**
 * 镜像双子（Evil Twin）配对解析 —— 全仓**唯一事实来源**
 * ======================================================================
 * 官方能力：「你与一名对立阵营的玩家互相知道对方是什么角色。
 *   如果其中善良玩家被处决，邪恶阵营获胜。
 *   如果你们都存活，善良阵营无法获胜。」
 *
 * 🔴 2026-11-01 P0 事故（用户实测）：
 *   第 4 天处决 15号-小精灵（镇民），系统却判「善良双子被处决」直接判邪恶胜。
 *   真正的善良双子是 1号-图书管理员（存活），恶魔 11号-小恶魔也存活。
 *   根因是**两处各自内联的启发式兜底**：只要"没有显式指定对立双子 ID"，
 *   就把「被处决的人（只要不是镜像双子本人）是镇民/外来者」一律当成善良双子。
 *   ⇒ 处决任意镇民都可能触发判负。
 *
 * ✅ 本文件确立的**失败关闭（fail-closed）原则**：
 *   1. **判胜级消费者**（`app/gameLogic.ts::checkGameEnd`、处决确认弹窗路
 *      径）只能使用 `resolveEvilTwinPair`：`goodTwinSeat` 仅在存在**证据**时
 *      非空 —— 证据 = 说书人/引擎显式写入的 `evilTwinPair`，或座位上的显式
 *      `isGoodTwin` 标记。**不存在证据 ⇒ 恒不成立，绝不猜测。**
 *   2. 需要"给谁发双子信息 / 把谁排进夜间队列"的**调度/展示**用途，只能使用
 *      `resolveEvilTwinPairForDisplay` 的启发式占位（`source:"heuristic"`），
 *      该来源**永远不得**作为判胜依据（架构护栏测试
 *      `src/utils/__tests__/evilTwinSingleSource.test.ts` 强制）。
 *   3. 二者必须同源解析（同一套 explicit/seatFlag 规则），避免再次出现
 *      "一处修了、另一处没修"的口径分叉。
 */

/** 配对证据来源。`heuristic` 仅限调度/展示，禁止判胜。 */
export type EvilTwinPairSource =
  | "explicit" // 说书人指定 / 引擎落库的 evilTwinPair（权威）
  | "seatFlag" // 座位上的显式 isGoodTwin 标记（说书人指定或首夜能力落库）
  | "unresolved" // 无任何证据：判胜谓词恒为 false
  | "heuristic"; // 仅展示/调度用的占位猜测，禁止用于判胜

export interface EvilTwinPairLike {
  evilId?: number | null;
  goodId?: number | null;
  evilSeatId?: number | null;
  goodSeatId?: number | null;
}

export interface ResolvedEvilTwinPair {
  /** 场上的镜像双子座位（角色本身可验证，不依赖猜测） */
  evilTwinSeat: Seat | null;
  /**
   * 对立的善良双子座位。
   * ⚠️ 仅当 `source` 为 `explicit`/`seatFlag`（即 `resolved===true`）时，
   * 它才是**可判胜**的权威事实；`heuristic` 来源仅供展示。
   */
  goodTwinSeat: Seat | null;
  /** 证据来源（见类型注释） */
  source: EvilTwinPairSource;
  /** goodTwinSeat 是否具备判胜级证据（explicit/seatFlag） */
  resolved: boolean;
  /**
   * 判胜谓词：只认 `resolved` 的配对。
   * 注意：`resolveEvilTwinPairForDisplay` 返回的实例也使用同一字段，
   * 但调度/展示代码只应把它的 `goodTwinSeat` 当占位，不得据此判胜。
   */
  isGoodTwin: (seatId: number) => boolean;
}

/** 场上是否存在镜像双子（角色真值，无需证据）。优先返回存活者。 */
function findEvilTwinSeat(seats: Seat[]): Seat | null {
  return (
    seats.find((s) => s.role?.id === "evil_twin" && !s.isDead) ||
    seats.find((s) => s.role?.id === "evil_twin") ||
    null
  );
}

function buildResult(
  evilTwinSeat: Seat | null,
  goodTwinSeat: Seat | null,
  source: EvilTwinPairSource,
  resolved: boolean
): ResolvedEvilTwinPair {
  return {
    evilTwinSeat,
    goodTwinSeat,
    source,
    resolved,
    isGoodTwin: (seatId: number) =>
      goodTwinSeat !== null && goodTwinSeat.id === seatId,
  };
}

/**
 * 严格解析（判胜级唯一入口）：只接受**显式证据**，证据缺失 ⇒ `unresolved`。
 *
 * 解析优先级：
 *   1. `evilTwinPair.goodId` / `goodSeatId`（说书人指定或首夜能力显式落库）
 *   2. 座位上的 `isGoodTwin === true`（说书人右键指定 / 旧存档标记）
 *   3. 无证据 ⇒ `unresolved`（**绝不猜测**，判胜谓词恒 false）
 */
export function resolveEvilTwinPair(
  seats: Seat[],
  evilTwinPair?: EvilTwinPairLike | null
): ResolvedEvilTwinPair {
  const evilTwinSeat = findEvilTwinSeat(seats);
  if (!evilTwinSeat) {
    return buildResult(null, null, "unresolved", false);
  }

  // ① 显式配对（权威）。允许 `goodId` 指定的座位已死亡 —— 判胜需要知道
  //    "真正的善良双子是谁"，死亡不影响身份唯一性。
  const explicitGoodId =
    evilTwinPair?.goodId ?? evilTwinPair?.goodSeatId ?? undefined;
  if (typeof explicitGoodId === "number" && !Number.isNaN(explicitGoodId)) {
    const explicitSeat = seats.find((s) => s.id === explicitGoodId) ?? null;
    // 防御脏数据：配对指向镜像双子本人 ⇒ 视为无效证据，继续向下解析。
    if (explicitSeat && explicitSeat.id !== evilTwinSeat.id) {
      return buildResult(evilTwinSeat, explicitSeat, "explicit", true);
    }
  }

  // ② 座位显式标记（说书人指定或能力落库的权威标记）。
  const flaggedSeat =
    seats.find(
      (s) =>
        s.id !== evilTwinSeat.id &&
        (s as { isGoodTwin?: boolean }).isGoodTwin === true
    ) ?? null;
  if (flaggedSeat) {
    return buildResult(evilTwinSeat, flaggedSeat, "seatFlag", true);
  }

  // ③ 无证据：失败关闭。判胜/阻断逻辑都不得据此断言任何事实。
  return buildResult(evilTwinSeat, null, "unresolved", false);
}

/**
 * 展示/调度级解析：在严格解析之上，允许启发式"占位"（找不到明确配对时取
 * 首个镇民/外来者），用于**夜间队列编排、信息展示**这类不决定胜负的场景。
 *
 * ⚠️ 铁律：`source === "heuristic"` 的配对**不得**用于胜负判定；
 *   判胜必须调用 `resolveEvilTwinPair`（无证据 ⇒ 不成立）。
 */
export function resolveEvilTwinPairForDisplay(
  seats: Seat[],
  evilTwinPair?: EvilTwinPairLike | null
): ResolvedEvilTwinPair {
  const authoritative = resolveEvilTwinPair(seats, evilTwinPair);
  const { evilTwinSeat } = authoritative;
  if (authoritative.goodTwinSeat || !evilTwinSeat) return authoritative;

  // 展示用占位：与历史行为保持一致（存活且未转化的镇民/外来者优先）。
  const guessedSeat =
    seats.find(
      (s) =>
        s.id !== evilTwinSeat.id &&
        !s.isDead &&
        isSeatTownsfolkOrOutsider(s) &&
        !(s as { isEvilConverted?: boolean }).isEvilConverted
    ) ||
    seats.find(
      (s) => s.id !== evilTwinSeat.id && isSeatTownsfolkOrOutsider(s)
    ) ||
    null;

  if (!guessedSeat) {
    return buildResult(evilTwinSeat, null, "unresolved", false);
  }
  // 注意：`resolved` 保持 false —— 占位猜测没有判胜资格。
  return buildResult(evilTwinSeat, guessedSeat, "heuristic", false);
}
