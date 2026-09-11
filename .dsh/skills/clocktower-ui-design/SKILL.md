---
name: clocktower-ui-design
description: 修改或美化血染钟楼 UI(排版、字号、弹窗、间距、主题)时使用。记录本项目的 1600×900 等比缩放舞台、弹窗宽度与字号规范、座位标签规则、双主题作用域,以及用 bsk 量像素验证的方法。
---

# 血染钟楼 · UI 设计与排版

## 0. 先量,再改(最重要的习惯)

**不要凭感觉调字号和间距。** 这个项目套了一层等比缩放舞台,屏幕像素 ≠ 设计像素,凭感觉必然调错方向:

```bash
bsk evaluate "(function(){var d=document.querySelector('[role=dialog][aria-modal=true]');var r=d.getBoundingClientRect();return JSON.stringify({w:Math.round(r.width),h:Math.round(r.height)})})()" --session <id>
```

量出"容器宽 / 内容宽 / scale"三件套,就知道瓶颈是宽度、高度还是上限,再动手。

## 1. 布局坐标系:1600×900 设计舞台

`src/components/layout/ScaleLayout.tsx` 把整个应用渲染在 **1600×900 的设计坐标系**里,再用 `transform: scale(W/1600)` 整体缩放到窗口。

| 含义 | 换算 |
| --- | --- |
| 设计字号 48px(`text-5xl`) | 836px 窗口下屏幕上约 25px |
| 弹窗可用宽度上限 | 1552 设计 px(舞台 1600 减两侧各 24px 内边距) |
| 弹窗可用高度上限 | `min(88%, 800px)` 设计 px |

推论:
- 想让文字**看起来**更大,要么放大设计字号,要么**加宽容器**(让内容占满宽度后等比放大)。
- 窗口变小不会让 UI 变小到不可用 —— 整体等比缩放。

## 2. 弹窗规范

`ModalWrapper`(`src/components/modals/ModalWrapper.tsx`) 是全站弹窗底座:

| 参数 | 默认 | 用途 |
| --- | --- | --- |
| `widthRatio` | 0.92 | 占可用宽度比例 |
| `maxWidthPx` | 1360 | 设计像素宽度上限 |

- **纯文案类弹窗**(通用确认/提示)已用 `widthRatio={0.98}` + `maxWidthPx={1560}` 吃满宽度。
- 弹窗正文统一用 `AutoFitContent`(`src/components/common/AutoFitContent.tsx`)+`whitespace-nowrap`/`whitespace-pre`:**单行不换行、超宽等比缩放**。禁止用固定大字号 + `max-w-*` 让它自然折行(会把首行挤断)。
- 正文基准字号:`text-3xl sm:text-4xl md:text-5xl`。
- ⚠️ 确认/提示弹窗挂在 `nativeDialogShim` 的**独立 React root** 上,改完样式必须**关闭再重开**才生效,热更新不会自动刷新它。

## 3. 撑满,不要留白

弹窗内容根节点用 `flex-1 min-h-0 flex flex-col`,把可伸缩区域(网格/列表)设为 `flex-1`,固定区域(标题、汇总、按钮)设 `shrink-0`。**不要给内容固定高度或顶部对齐**,否则弹窗下方会留出大片空白。

### 自适应列数(座位网格)

血染单局最多 15 人,按实际人数在 3~5 列中挑"末行最空最少"的列数:

```ts
const empty = (cols - (n % cols)) % cols; // 越小越整齐
```

行内用 `justify-center` 让末行居中,卡片用 `flex-1` + `style={{ maxWidth: "calc((100% - (cols-1)*gap) / cols)" }}` 保证末行卡片宽度与整行一致。

## 4. 文案与座位标签

- 座位一律用 `src/utils/seatLabel.ts`:`formatSeatLabel(seatId, playerName)` → `"2号"` 或 `"2号 (张三)`;`displayPlayerName` 单独取名字。**直接渲染 `seat.playerName` 会输出占位名「玩家 N」**,与座位号重复。
- 需要"没名字就显示角色名"时:`displayPlayerName(s.playerName, s.id) || s.role?.name`。

## 5. 双主题(现代 / 经典)

- 两种主题共用同一套状态机与交互;主题只作用于**渲染层**(Tailwind v4 `@custom-variant` 作用域 CSS)。
- 阵营色:镇民圣堂金 / 外来者幽光翡翠 / 爪牙焦木琥珀 / 恶魔猩红魔火。
- **不得改动既有 `data-testid`** —— E2E 与 UI 测试依赖它们。
- 三端断点:桌面 1440 / 平板 834 / 移动 390。

## 6. 更系统的 UI 审查

需要按通用 Web 规范(无障碍、表单、动效、语义)做审查时,加载 `web-design-guidelines` skill,它会拉取最新的 Vercel Web Interface Guidelines 并逐条比对。
与本节的项目内规范冲突时,**以本项目的设计语言为准**(例如本项目刻意使用超大字号与全屏弹窗)。
