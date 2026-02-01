import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";

import { GameRecord } from "../types/game";

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

  const saveGameRecord = useCallback((record: GameRecord) => {
    try {
      if (typeof window === "undefined") return; // SSR 防护
      const stored = window.localStorage.getItem("clocktower_game_records");
      let records: GameRecord[] = stored ? JSON.parse(stored) : [];
      // 将新记录添加到开头
      records = [record, ...records];
      window.localStorage.setItem("clocktower_game_records", JSON.stringify(records));
      setGameRecords(records);
    } catch (error) {
      console.error("Failed to save game record:", error);
    }
  }, [setGameRecords]);

  return {
    loadGameRecords,
    saveGameRecord,
  };
}


