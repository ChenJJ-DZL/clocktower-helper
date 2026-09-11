import type { Dispatch, SetStateAction } from "react";
import { useCallback } from "react";

import type { GameRecord } from "../types/game";

/** 对局记录最多保留条数：防止 localStorage 写爆配额导致保存静默失败 */
const MAX_GAME_RECORDS = 20;

export interface UseGameRecordsOptions {
  setGameRecords: Dispatch<SetStateAction<GameRecord[]>>;
}

/**
 * 轻量级对局记录 Hook：
 * - 仅负责 localStorage 的读写与解析
 * - 不关心游戏流程本身，由上层通过 GameRecord 结构喂数据进来
 */
export function useGameRecords({ setGameRecords }: UseGameRecordsOptions) {
  const loadGameRecords = useCallback(() => {
    try {
      if (typeof window === "undefined") return; // SSR 防护
      const stored = window.localStorage.getItem("clocktower_game_records");
      if (!stored) return;
      const records = JSON.parse(stored) as GameRecord[];
      setGameRecords(records);
    } catch (error) {
      console.error("Failed to load game records:", error);
    }
  }, [setGameRecords]);

  const saveGameRecord = useCallback(
    (record: GameRecord) => {
      if (typeof window === "undefined") return; // SSR 防护
      try {
        const stored = window.localStorage.getItem("clocktower_game_records");
        let records: GameRecord[] = stored ? JSON.parse(stored) : [];
        // 将新记录添加到开头
        records = [record, ...records];

        // 上限裁剪：只保留最近 MAX_GAME_RECORDS 条，
        // 否则长期使用后 localStorage 写爆配额，保存会静默失败（用户看不到任何提示）。
        if (records.length > MAX_GAME_RECORDS) {
          records = records.slice(0, MAX_GAME_RECORDS);
        }

        // 配额兜底：若仍然写不下（单条记录过大），逐条丢弃最旧记录重试；
        // 直到写入成功或只剩 1 条，避免"记录丢失且无提示"。
        for (;;) {
          try {
            window.localStorage.setItem(
              "clocktower_game_records",
              JSON.stringify(records)
            );
            break;
          } catch (quotaError) {
            if (records.length <= 1) throw quotaError;
            records = records.slice(0, records.length - 1);
          }
        }

        setGameRecords(records);
      } catch (error) {
        console.error("Failed to save game record:", error);
      }
    },
    [setGameRecords]
  );

  return {
    loadGameRecords,
    saveGameRecord,
  };
}
