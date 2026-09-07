import type { Seat } from "../types/game";

export interface ResolvedEvilTwinPair {
  evilTwinSeat: Seat | null;
  goodTwinSeat: Seat | null;
  isGoodTwin: (seatId: number) => boolean;
}

/**
 * 全链路可靠解析镜像双子与对立善良双子
 * 跨所有层级（状态机、快照、队列生成器、弹窗处理器）统一对立双子识别标准
 */
export function resolveEvilTwinPair(
  seats: Seat[],
  evilTwinPair?: {
    evilId?: number;
    goodId?: number;
    evilSeatId?: number;
    goodSeatId?: number;
  } | null
): ResolvedEvilTwinPair {
  const evilTwinSeat =
    seats.find((s) => s.role?.id === "evil_twin" && !s.isDead) ||
    seats.find((s) => s.role?.id === "evil_twin") ||
    null;

  if (!evilTwinSeat) {
    return {
      evilTwinSeat: null,
      goodTwinSeat: null,
      isGoodTwin: () => false,
    };
  }

  const explicitGoodId = evilTwinPair?.goodId ?? evilTwinPair?.goodSeatId;

  let goodTwinSeat =
    (explicitGoodId !== undefined
      ? seats.find((s) => s.id === explicitGoodId)
      : null) ||
    seats.find((s) => s.isGoodTwin) ||
    null;

  if (!goodTwinSeat) {
    // 兜底：第一个非镜像双子的善良角色（镇民或外来者）
    goodTwinSeat =
      seats.find(
        (s) =>
          s.id !== evilTwinSeat.id &&
          !s.isDead &&
          (s.role?.type === "townsfolk" || s.role?.type === "outsider") &&
          !s.isEvilConverted
      ) ||
      seats.find(
        (s) =>
          s.id !== evilTwinSeat.id &&
          (s.role?.type === "townsfolk" || s.role?.type === "outsider")
      ) ||
      null;
  }

  return {
    evilTwinSeat,
    goodTwinSeat,
    isGoodTwin: (seatId: number) =>
      goodTwinSeat !== null && goodTwinSeat.id === seatId,
  };
}
