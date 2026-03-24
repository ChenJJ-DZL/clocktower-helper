/**
 * 历史查询工具
 * 为回溯型能力提供统一的查询接口
 */

import type { RoleType, Seat } from "../../app/data";
import {
  type GameStateSnapshot,
  historySnapshotManager,
} from "./historySnapshot";

/**
 * 玩家死亡记录
 */
export interface DeathRecord {
  seatId: number;
  roleId: string;
  roleType: RoleType;
  timestamp: number;
  nightCount: number;
  dayCount: number;
  deathReason: "executed" | "killed_by_ability" | "other";
  isDrunkAtDeath: boolean;
  isPoisonedAtDeath: boolean;
}

/**
 * 提名记录
 */
export interface NominationRecord {
  nominatorId: number;
  nominatedId: number;
  timestamp: number;
  nightCount: number;
  dayCount: number;
  voteCount: number;
  succeeded: boolean;
}

/**
 * 历史查询工具类
 * 封装常用的历史查询逻辑，供能力实现直接调用
 */
export class HistoryQueryTool {
  /**
   * 获取指定时间段内的死亡记录
   * @param startTime 起始时间戳
   * @param endTime 结束时间戳，默认为当前时间
   */
  public static getDeathRecords(
    startTime: number,
    endTime: number = Date.now()
  ): DeathRecord[] {
    const records: DeathRecord[] = [];
    const snapshots = historySnapshotManager.getAllSnapshots();

    // 按时间顺序遍历快照
    for (let i = 1; i < snapshots.length; i++) {
      const prevSnapshot = snapshots[i - 1];
      const currentSnapshot = snapshots[i];

      if (
        currentSnapshot.timestamp < startTime ||
        currentSnapshot.timestamp > endTime
      ) {
        continue;
      }

      // 找出本轮新增的死亡玩家
      for (const seat of currentSnapshot.seats) {
        const prevSeat = prevSnapshot.seats.find((s) => s.id === seat.id);
        if (prevSeat && !prevSeat.isDead && seat.isDead) {
          // 计算死亡原因
          let deathReason: DeathRecord["deathReason"] = "other";
          if (currentSnapshot.todayExecutedId === seat.id) {
            deathReason = "executed";
          } else if (
            prevSnapshot.phase === "night" ||
            prevSnapshot.phase === "firstNight"
          ) {
            deathReason = "killed_by_ability";
          }

          records.push({
            seatId: seat.id,
            roleId: seat.role?.id || "",
            roleType: seat.role?.type || "townsfolk",
            timestamp: currentSnapshot.timestamp,
            nightCount: currentSnapshot.nightCount,
            dayCount: currentSnapshot.dayCount,
            deathReason,
            isDrunkAtDeath:
              seat.isDrunk ||
              seat.statuses?.some((e) => e.effect === "drunk") ||
              false,
            isPoisonedAtDeath:
              seat.isPoisoned ||
              seat.statuses?.some((e) => e.effect === "poisoned") ||
              false,
          });
        }
      }
    }

    return records;
  }

  /**
   * 获取指定天数处决的玩家
   * @param dayCount 第几天，0表示所有天数
   */
  public static getExecutedByDay(
    dayCount: number = 0
  ): DeathRecord | undefined {
    const deathRecords = HistoryQueryTool.getDeathRecords(0);
    return deathRecords.find(
      (r) =>
        r.deathReason === "executed" &&
        (dayCount === 0 || r.dayCount === dayCount)
    );
  }

  /**
   * 获取所有被处决的玩家记录
   */
  public static getAllExecutedPlayers(): DeathRecord[] {
    return HistoryQueryTool.getDeathRecords(0).filter(
      (r) => r.deathReason === "executed"
    );
  }

  /**
   * 获取指定时间段内的提名记录
   * @param startTime 起始时间戳
   * @param endTime 结束时间戳，默认为当前时间
   */
  public static getNominationRecords(
    startTime: number,
    endTime: number = Date.now()
  ): NominationRecord[] {
    const records: NominationRecord[] = [];
    const snapshots = historySnapshotManager.getAllSnapshots();

    // 过滤出提名完成的快照
    const nominationSnapshots = snapshots.filter(
      (s) =>
        s.triggerAction === "nomination_made" &&
        s.timestamp >= startTime &&
        s.timestamp <= endTime
    );

    for (const snapshot of nominationSnapshots) {
      // 从日志中提取提名信息，日志message格式："玩家A提名了玩家B，获得X票，提名成功/失败"
      const nominateLog = snapshot.gameLogs.find((log) =>
        log.message.includes("提名")
      );
      if (nominateLog) {
        // 简易解析，后续可优化为结构化日志
        const voteMatch = nominateLog.message.match(/获得(\d+)票/);
        const voteCount = voteMatch ? parseInt(voteMatch[1], 10) : 0;
        const succeeded = nominateLog.message.includes("提名成功");

        // 暂时从snapshot元数据获取，后续完善结构化日志后修改
        records.push({
          nominatorId: 0, // 待完善
          nominatedId: snapshot.todayExecutedId || 0, // 待完善
          timestamp: snapshot.timestamp,
          nightCount: snapshot.nightCount,
          dayCount: snapshot.dayCount,
          voteCount,
          succeeded,
        });
      }
    }

    return records;
  }

  /**
   * 获取指定时间点的玩家状态
   * @param seatId 玩家ID
   * @param timestamp 时间点
   */
  public static getPlayerStateAtTime(
    seatId: number,
    timestamp: number
  ): Seat | undefined {
    const snapshot = historySnapshotManager.getSnapshotBeforeTime(timestamp);
    return snapshot?.seats.find((s) => s.id === seatId);
  }

  /**
   * 获取指定夜晚的玩家状态
   * @param seatId 玩家ID
   * @param nightCount 第几个夜晚
   */
  public static getPlayerStateAtNight(
    seatId: number,
    nightCount: number
  ): Seat | undefined {
    const snapshots =
      historySnapshotManager.getSnapshotsByNightCount(nightCount);
    if (snapshots.length === 0) return undefined;
    return snapshots[snapshots.length - 1].seats.find((s) => s.id === seatId);
  }

  /**
   * 获取指定白天的玩家状态
   * @param seatId 玩家ID
   * @param dayCount 第几个白天
   */
  public static getPlayerStateAtDay(
    seatId: number,
    dayCount: number
  ): Seat | undefined {
    const snapshots = historySnapshotManager.getSnapshotsByDayCount(dayCount);
    if (snapshots.length === 0) return undefined;
    return snapshots[snapshots.length - 1].seats.find((s) => s.id === seatId);
  }

  /**
   * 统计指定时间段内满足条件的事件数量
   * @param startTime 起始时间
   * @param endTime 结束时间
   * @param condition 条件函数
   */
  public static countEvents(
    startTime: number,
    endTime: number,
    condition: (snapshot: GameStateSnapshot) => boolean
  ): number {
    const snapshots = historySnapshotManager.getAllSnapshots();
    return snapshots.filter(
      (s) => s.timestamp >= startTime && s.timestamp <= endTime && condition(s)
    ).length;
  }

  /**
   * 查找满足条件的最近快照
   * @param condition 条件函数
   */
  public static findLatestSnapshot(
    condition: (snapshot: GameStateSnapshot) => boolean
  ): GameStateSnapshot | undefined {
    const snapshots = historySnapshotManager.getAllSnapshots();
    for (let i = snapshots.length - 1; i >= 0; i--) {
      if (condition(snapshots[i])) {
        return snapshots[i];
      }
    }
    return undefined;
  }

  /**
   * 检查指定玩家在时间段内是否死亡
   * @param seatId 玩家ID
   * @param startTime 起始时间
   * @param endTime 结束时间
   */
  public static isPlayerDiedInPeriod(
    seatId: number,
    startTime: number,
    endTime: number
  ): boolean {
    const stateAtStart = HistoryQueryTool.getPlayerStateAtTime(
      seatId,
      startTime
    );
    const stateAtEnd = HistoryQueryTool.getPlayerStateAtTime(seatId, endTime);
    return !!stateAtStart && !stateAtStart.isDead && !!stateAtEnd?.isDead;
  }

  /**
   * 获取指定时间段内的阵营变化记录
   * @param seatId 玩家ID
   */
  public static getPlayerAlignmentChanges(
    seatId: number
  ): Array<{ timestamp: number; from: string; to: string }> {
    const changes: Array<{ timestamp: number; from: string; to: string }> = [];
    const snapshots = historySnapshotManager.getAllSnapshots();
    let lastAlignment: string | undefined;

    for (const snapshot of snapshots) {
      const seat = snapshot.seats.find((s) => s.id === seatId);
      if (seat?.role) {
        // 根据角色类型判断阵营
        const alignment = ["townsfolk", "outsider"].includes(seat.role.type)
          ? "good"
          : "evil";
        const actualAlignment = seat.isEvilConverted
          ? "evil"
          : seat.isGoodConverted
            ? "good"
            : alignment;

        if (actualAlignment !== lastAlignment) {
          if (lastAlignment !== undefined) {
            changes.push({
              timestamp: snapshot.timestamp,
              from: lastAlignment,
              to: actualAlignment,
            });
          }
          lastAlignment = actualAlignment;
        }
      }
    }

    return changes;
  }

  /**
   * 获取指定玩家的角色变化历史
   * @param seatId 玩家ID
   */
  public static getPlayerRoleChanges(seatId: number): Array<{
    timestamp: number;
    fromRole: string;
    toRole: string;
    fromType: string;
    toType: string;
  }> {
    const changes: Array<{
      timestamp: number;
      fromRole: string;
      toRole: string;
      fromType: string;
      toType: string;
    }> = [];
    const snapshots = historySnapshotManager.getAllSnapshots();
    let lastRoleId: string | undefined;
    let lastRoleType: string | undefined;

    for (const snapshot of snapshots) {
      const seat = snapshot.seats.find((s) => s.id === seatId);
      if (seat?.role) {
        const roleId = seat.role.id;
        const roleType = seat.role.type;

        if (roleId !== lastRoleId) {
          if (lastRoleId !== undefined && lastRoleType !== undefined) {
            changes.push({
              timestamp: snapshot.timestamp,
              fromRole: lastRoleId,
              toRole: roleId,
              fromType: lastRoleType,
              toType: roleType,
            });
          }
          lastRoleId = roleId;
          lastRoleType = roleType;
        }
      }
    }

    return changes;
  }

  /**
   * 统计指定时间段内的处决次数
   */
  public static countExecutions(
    startTime: number,
    endTime: number = Date.now()
  ): number {
    return HistoryQueryTool.getAllExecutedPlayers().filter(
      (r) => r.timestamp >= startTime && r.timestamp <= endTime
    ).length;
  }

  /**
   * 获取最近N次处决的记录
   * @param count 次数
   */
  public static getLastExecutions(count: number): DeathRecord[] {
    return HistoryQueryTool.getAllExecutedPlayers().slice(-count);
  }

  /**
   * 统计指定玩家在时间段内的提名次数
   * @param seatId 玩家ID
   * @param asNominator 是否作为提名者，false为被提名者
   * @param startTime 起始时间
   * @param endTime 结束时间
   */
  public static countPlayerNominations(
    seatId: number,
    asNominator: boolean = true,
    startTime: number = 0,
    endTime: number = Date.now()
  ): number {
    const records = HistoryQueryTool.getNominationRecords(startTime, endTime);
    return records.filter((r) =>
      asNominator ? r.nominatorId === seatId : r.nominatedId === seatId
    ).length;
  }

  /**
   * 检查是否有玩家在指定时间段内获得过特定角色
   * @param roleId 角色ID
   * @param startTime 起始时间
   * @param endTime 结束时间
   */
  public static hasRoleExistedInPeriod(
    roleId: string,
    startTime: number = 0,
    endTime: number = Date.now()
  ): boolean {
    const snapshots = historySnapshotManager.getAllSnapshots();
    return snapshots.some(
      (s) =>
        s.timestamp >= startTime &&
        s.timestamp <= endTime &&
        s.seats.some((seat) => seat.role?.id === roleId)
    );
  }
}
