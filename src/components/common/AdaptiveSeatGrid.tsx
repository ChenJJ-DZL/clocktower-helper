"use client";

import type { ReactNode } from "react";
import { computeVoteGrid } from "../../utils/voteGrid";

/**
 * 座位卡片字号常量。
 * 需要卡片容器设置 `container-type: size`(本组件已自动设置)，
 * 字号同时受卡片宽(cqi)与高(cqh)约束，人数变化时按钮与文字同步缩放。
 */
export const SEAT_CARD_FONT = {
  /** 主信息：座位号 */
  primary: "min(19cqi, 34cqh)",
  /** 次要信息：角色名 / 玩家名 */
  secondary: "min(9.5cqi, 18cqh)",
  /** 状态角标：(自己) / (已死亡) / 存活 等 */
  tertiary: "min(7cqi, 13cqh)",
} as const;

/** 行数 → 卡片高度(rem)。行数越多单卡越矮，保证操作按钮留在视野内。 */
const DEFAULT_ROW_HEIGHT = (rows: number) =>
  rows >= 3 ? "7.75rem" : rows === 2 ? "9.5rem" : "10.5rem";

interface AdaptiveSeatGridProps {
  /** 在场人数(或待渲染项数) */
  count: number;
  /** 渲染第 index 项(索引对应调用方传入的数组下标) */
  renderItem: (index: number) => ReactNode;
  /** 卡片间距(rem)，默认 0.75 */
  gap?: number;
  /** 单卡最大宽度(rem)，默认 19 */
  maxCardWidth?: number;
  /** 行数 → 卡片高度(rem) */
  rowHeight?: (rows: number) => string;
  className?: string;
}

/**
 * AdaptiveSeatGrid —— 按在场人数自适应的座位网格。
 *
 * 规则与举手表决页一致：
 * 1. 列数在 3~5 之间挑「末行空缺最少」的方案(见 computeVoteGrid)；
 * 2. 末行在行内居中，卡片宽度按列数均分并与整行对齐(有最大宽度上限)；
 * 3. 卡片高度按行数收敛，人数少时不把单卡拉得过大；
 * 4. 卡片是 `container-type: size` 容器，子元素用 SEAT_CARD_FONT 的 cqi/cqh 字号自适应。
 */
export function AdaptiveSeatGrid({
  count,
  renderItem,
  gap = 0.75,
  maxCardWidth = 19,
  rowHeight = DEFAULT_ROW_HEIGHT,
  className = "",
}: AdaptiveSeatGridProps) {
  const { columns, rows } = computeVoteGrid(count);
  if (count <= 0) return null;

  const height = rowHeight(rows.length);
  const cardStyle = {
    maxWidth: `min(calc((100% - ${(columns - 1) * gap}rem) / ${columns}), ${maxCardWidth}rem)`,
    height,
    containerType: "size" as const,
  };

  return (
    <div
      className={`flex flex-col justify-center ${className}`}
      style={{ gap: `${gap}rem` }}
    >
      {rows.map((row) => (
        <div
          key={row.start}
          className="flex justify-center"
          style={{ gap: `${gap}rem` }}
        >
          {Array.from({ length: row.count }, (_, k) => row.start + k).map(
            (idx) => (
              <div key={idx} className="flex-1 min-w-0" style={cardStyle}>
                {renderItem(idx)}
              </div>
            )
          )}
        </div>
      ))}
    </div>
  );
}
