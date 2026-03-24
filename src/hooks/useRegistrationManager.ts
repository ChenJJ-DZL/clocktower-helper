import { useCallback, useRef } from "react";
import type { Role, Seat } from "@/app/data";
import type { RegistrationOverride } from "../types/registration";
import { getRegistration } from "../utils/gameRules";

export function useRegistrationManager(
  gamePhase: string,
  nightCount: number,
  spyDisguiseMode: "off" | "default" | "on",
  spyDisguiseProbability: number
) {
  const registrationCacheRef = useRef<Map<string, any>>(new Map());
  const registrationCacheKeyRef = useRef<string>("");
  // 注册覆盖规则存储：key是目标玩家ID，value是该玩家的所有覆盖规则
  const registrationOverridesRef = useRef<Map<number, RegistrationOverride[]>>(
    new Map()
  );

  const resetRegistrationCache = useCallback((key: string) => {
    registrationCacheRef.current = new Map();
    registrationCacheKeyRef.current = key;
  }, []);

  const getRegistrationCached = useCallback(
    (targetPlayer: Seat, viewingRole?: Role | null) => {
      const cacheKey =
        registrationCacheKeyRef.current || `${gamePhase}-${nightCount}`;
      // 注意：getRegistration函数不支持overrides参数，需要通过其他方式处理覆盖规则
      // 这里暂时只传递缓存参数，覆盖规则需要在调用getRegistration后单独处理
      return getRegistration(
        targetPlayer,
        viewingRole,
        spyDisguiseMode,
        spyDisguiseProbability,
        { cache: registrationCacheRef.current, cacheKey }
      );
    },
    [gamePhase, nightCount, spyDisguiseMode, spyDisguiseProbability]
  );

  /**
   * 添加注册覆盖规则
   * @param targetPlayerId 目标玩家ID
   * @param override 覆盖规则
   */
  const addRegistrationOverride = useCallback(
    (targetPlayerId: number, override: RegistrationOverride) => {
      const existingOverrides =
        registrationOverridesRef.current.get(targetPlayerId) || [];
      registrationOverridesRef.current.set(targetPlayerId, [
        ...existingOverrides,
        override,
      ]);
      // 添加覆盖后需要清空缓存，确保下次查询使用新规则
      registrationCacheRef.current.clear();
    },
    []
  );

  /**
   * 移除指定来源的注册覆盖规则
   * @param targetPlayerId 目标玩家ID
   * @param sourcePlayerId 来源玩家ID
   * @param dimension 可选：指定要移除的维度，不指定则移除该来源的所有覆盖
   */
  const removeRegistrationOverride = useCallback(
    (targetPlayerId: number, sourcePlayerId: number, dimension?: string) => {
      const existingOverrides =
        registrationOverridesRef.current.get(targetPlayerId) || [];
      const filteredOverrides = existingOverrides.filter(
        (o) =>
          o.sourcePlayerId !== sourcePlayerId ||
          (dimension && o.dimension !== dimension)
      );
      registrationOverridesRef.current.set(targetPlayerId, filteredOverrides);
      registrationCacheRef.current.clear();
    },
    []
  );

  /**
   * 清理过期的注册覆盖规则
   * @param currentTime 当前时间点，如 "黄昏"、"夜晚结算"
   */
  const clearExpiredOverrides = useCallback((currentTime: string) => {
    registrationOverridesRef.current.forEach((overrides, targetPlayerId) => {
      const filteredOverrides = overrides.filter(
        (o) => !o.expiresAt || o.expiresAt !== currentTime
      );
      if (filteredOverrides.length !== overrides.length) {
        registrationOverridesRef.current.set(targetPlayerId, filteredOverrides);
      }
    });
    registrationCacheRef.current.clear();
  }, []);

  /**
   * 清空所有注册覆盖规则
   */
  const clearAllOverrides = useCallback(() => {
    registrationOverridesRef.current.clear();
    registrationCacheRef.current.clear();
  }, []);

  return {
    registrationCacheRef,
    registrationCacheKeyRef,
    registrationOverridesRef,
    resetRegistrationCache,
    getRegistrationCached,
    addRegistrationOverride,
    removeRegistrationOverride,
    clearExpiredOverrides,
    clearAllOverrides,
  };
}
