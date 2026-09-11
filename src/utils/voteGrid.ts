/**
 * 举手表决计票 —— 座位网格布局计算
 *
 * 血染钟楼单局最多 15 人。列数在 3~5 之间挑选「末行空缺最少」的方案：
 * 能整除则整行铺满(如 15→5+5+5、12→4+4+4)，否则让末行尽量填满(如 7→4+3、8→4+4)。
 * 末行在行内居中由调用方负责，卡片宽度按列数均分并与整行对齐。
 */

export interface VoteGrid {
  /** 列数 */
  columns: number;
  /** 每行的座位下标区间(左闭右开)，用于渲染与测试断言 */
  rows: Array<{ start: number; count: number }>;
}

export function computeVoteGrid(count: number): VoteGrid {
  const n = Math.max(0, Math.floor(count));
  if (n === 0) return { columns: 1, rows: [] };
  if (n <= 1) return { columns: 1, rows: [{ start: 0, count: n }] };
  if (n <= 3) return { columns: n, rows: [{ start: 0, count: n }] };

  let best = 5;
  let bestEmpty = Number.POSITIVE_INFINITY;
  for (const cols of [5, 4, 3]) {
    const empty = (cols - (n % cols)) % cols;
    if (empty < bestEmpty) {
      bestEmpty = empty;
      best = cols;
    }
  }

  const rows: Array<{ start: number; count: number }> = [];
  for (let i = 0; i < n; i += best) {
    rows.push({ start: i, count: Math.min(best, n - i) });
  }
  return { columns: best, rows };
}
