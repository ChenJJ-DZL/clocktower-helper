---
name: clocktower-ui-design
description: 修改或美化血染钟楼 UI(排版、字号、弹窗、间距、主题)时使用。含 1600×900 缩放舞台的字号预算表、iPhone 横屏适配、容器查询字号自适应、弹窗宽高旋钮、座位标签规则,以及用 bsk 量像素/查溢出的验证方法。
---

# 血染钟楼 · UI 设计与排版

## 0. 先量,再改 —— 这是本项目最重要的一条

**禁止凭感觉调字号/间距。** 本项目套了一层等比缩放舞台,"设计像素"和"屏幕像素"差 2 倍以上,凭感觉必然调反方向。

```bash
# 量容器 / 内容 / 缩放
bsk evaluate "(function(){var d=document.querySelector('[role=dialog][aria-modal=true]');var r=d.getBoundingClientRect();return JSON.stringify({w:Math.round(r.width),h:Math.round(r.height)})})()" --session <id>
# 查是否溢出(最关键的检查)
bsk evaluate "(function(){var d=document.querySelector('[role=dialog][aria-modal=true]');var b=d.children[1];return JSON.stringify({client:b.clientHeight,scroll:b.scrollHeight,overflow:b.scrollHeight>b.clientHeight})})()" --session <id>
```

**`overflow: true` 意味着底部按钮被挤出视野,必须修到达成 false。**

## 1. 布局坐标系:1600×900 设计舞台(含手机端实算)

`src/components/layout/ScaleLayout.tsx`:`scale = min(视口宽/1600, 视口高/900)`,居中等比,四周留黑边。

| 设备/窗口 | 视口 | scale | 48px 设计字 实际显示 |
| --- | --- | --- | --- |
| PC 1920×1080 | 1920×1080 | 1.2 | 57.6px |
| MacBook 1440×900 | 1440×900 | 0.9 | 43.2px |
| 本仓库调试窗口 | 836×498 | 0.52 | 25px |
| **iPhone 14/17 横屏** | 844×390 | **0.43** | **20.8px** |

> ⚠️ **设计字号必须按最差场景(iPhone 横屏 0.43)来定**,否则在手机上永远偏小。
> 这就是"PC 上看着还行、手机上小到看不清"的根因。

### 字号预算表(设计 px → 实际显示)

| 设计字号 | iPhone 横屏(×0.43) | 用途 |
| --- | --- | --- |
| 24px | **10.4px** ❌ 不可读 | 曾经的计票卡片字号 |
| 32px | 13.9px ⚠️ 勉强 | 辅助/状态文字下限 |
| 40px | 17.3px ✅ | 次级信息 |
| 48px | **20.8px** ✅ | 正文基准(`text-5xl`) |
| 56~64px | 24~28px ✅✅ | 主信息/关键数字 |

**规则:正文别低于 40px 设计;主信息 48~64px。** 中文在小字号下尤其糊,不要照搬 Web 通用的 14~16px。

### ⚠️ 不要用 sm:/md: 断点控制这个应用的字号

本应用永远渲染在 1600×900 舞台里,但 **Tailwind 的 `sm:`/`md:` 断点看的是真实视口宽度**,不是舞台宽度。后果:同一个弹窗在 752px 宽的窗口上按 `sm:` 渲染成 36px,在 1000px 宽窗口上按 `md:` 渲染成 48px —— 明明舞台一样大,字号却不同。

**结论:组件内字号一律写固定设计像素**(如 `text-[52px]`)。需要"随容器变化"时用容器查询 `cqi/cqh`(见第 3 节),不要用视口断点。

## 2. 弹窗规范

`ModalWrapper`(`src/components/modals/ModalWrapper.tsx`) 是全站弹窗底座:

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| `widthRatio` | 0.92 | 占可用宽度比例 |
| `maxWidthPx` | 1360 | 设计像素宽度上限 |
| `autoHeight` | false | true → 高度随内容收缩,上限 94%(受舞台内边距限制,实际约 800 设计 px) |

- 纯文案弹窗用 `widthRatio={0.98}` + `maxWidthPx={1560}` 吃满宽度。
- 网格/卡片类弹窗用 `autoHeight`:人数少时弹窗自动变矮,不再被拉高留白。
- **正文排版要分清场景**:
  - **纯提示/确认类弹窗**(通用 `GenericConfirmModal`/`GenericAlertModal`):**允许换行**,用固定大字 `text-[52px]` + `whitespace-pre-line`。**不要**用 `AutoFitContent` + `whitespace-pre` 强压成单行 —— 长文案会被压缩字号,手机上看不清。按钮 `py-6 text-[34px]`。
  - **特殊角色弹窗**(圣徒处决、疯狂检测等,共 13 个):文案是逐行手写的短句,用 `AutoFitContent` + `whitespace-nowrap` 保持单行大字是刻意的设计,不要改。
- ⚠️ 确认/提示弹窗挂在 `nativeDialogShim` 的**独立 React root**,`改样式后必须关闭再重开`,热更新不会刷新它。

## 3. 卡片/网格:尺寸与字号都要自适应人数

反面教材:用 `flex-1` 让行撑满固定高度 → 7 人时卡片被拉得巨大,15 人时又挤。正确做法:

1. **列数**由 `computeVoteGrid(n)`(`src/utils/voteGrid.ts`)算:在 3~5 列中挑"末行空缺最少"的方案(15→5+5+5、12→4+4+4、7→4+3),末行 `justify-center` 居中。
2. **卡片宽度**上限 `19rem`,用 `maxWidth: min(calc((100% - (cols-1)*gap)/cols), 19rem)` 保证末行卡片与整行等宽。
3. **卡片高度按行数收敛**(行数越多,单卡越矮,才能保证「确认」按钮留在视野内):

| 行数 | 卡片高度 | 实测字号 |
| --- | --- | --- |
| 1 行 | 11rem (176) | 受宽度约束 |
| 2 行 | 10.5rem (168) | 座位号 53 设计 px ≈ iPhone 23px |
| 3 行 | 7.75rem (124) | 座位号 37 设计 px ≈ iPhone 16px |

4. **字号跟随卡片缩放** —— 给卡片 `containerType: "size"`,字号用 `min(cqi, cqh)` 同时受宽高约束:

```tsx
style={{ height: cardHeight, containerType: "size" }}
// 座位号
style={{ fontSize: "min(19cqi, 36cqh)" }}
// 角色名
style={{ fontSize: "min(9.5cqi, 19cqh)" }}
// 状态
style={{ fontSize: "min(7cqi, 14cqh)" }}
```

> 注意 `cqi/cqh` 按**卡片内容盒**(减去 padding)计算。只写 `cqi` 时,矮卡片会横向溢出或被迫换行。

## 3.5 右侧控制台(处决台与提名)

控制台是**操作区**,字号必须够大 —— 曾因根节点用 `text-xs`(12px 设计 = iPhone 横屏 5.2px)而导致手机上完全看不清。

- **宽度**:`GameLayout` 的 `w-[620px]`(原 450px)。RoundTable 半径是动态算的,加宽不会破。
- **字号体系 = 基准 + em 相对**:根节点 `text-[28px]`,子元素一律用 `text-[0.83em]`/`text-[0.92em]`/`text-[1.15em]`/`text-[1.5em]` 相对值。**以后整体放大只需改根节点一个数**,不要再逐个写 px。
- **模块顺序按重要性**:阶段向导 → **资格矩阵(主操作区)** → 处决台看板 → 话术参考。字号放大后内容必然超出一屏(实测内容 1194 设计px vs 可视 675),**主操作区必须留在首屏**。
- **纯参考内容默认收起**:说书人话术/规则指南做成点击展开,省掉约 430 设计px。
- 按钮:`py-4 px-6` + `text-[1.15em]`,不要用 `py-1.5/py-2.5`。

## 4. 验证不同人数的排版(临时预览页)

游戏内很难凑齐 15 人。用**临时路由**注入 N 个合成座位,截图核对后**立即删除**(见 AGENTS.md):

```tsx
// app/tmp-xxx/page.tsx —— 验证完必须删除
<ScaleLayout>
  <div className="w-full h-full bg-slate-950" />
  <VoteInputModalContent voterId={0} seats={fakeSeats} submitVotes={() => {}} setCurrentModal={() => {}} />
</ScaleLayout>
```

用 `<ScaleLayout>` 包住,弹窗才会 portal 进真实舞台、量到真实尺寸。逐个 `?count=7/12/15` 跑 `bsk navigate` + `screenshot` + `evaluate` 查溢出。

## 5. 文案与座位标签

- 座位一律用 `src/utils/seatLabel.ts`:`formatSeatLabel(seatId, playerName)` → `"2号"` 或 `"2号 (张三)`;`displayPlayerName` 单独取名字。**直接渲染 `seat.playerName` 会输出占位名「玩家 N」**,与座位号重复。
- 需要"没名字就显示角色名"时:`displayPlayerName(s.playerName, s.id) || s.role?.name`。

## 6. 双主题(现代 / 经典)

- 主题只作用于**渲染层**(Tailwind v4 `@custom-variant` 作用域 CSS),状态机与交互完全共用。
- 阵营色:镇民圣堂金 / 外来者幽光翡翠 / 爪牙焦木琥珀 / 恶魔猩红魔火。
- **不得改动既有 `data-testid`** —— E2E 与 UI 测试依赖它们。
- 三端断点:桌面 1440 / 平板 834 / 移动 390。

## 7. 更系统的 UI 审查

需要按通用 Web 规范(无障碍、表单、动效、语义)审查时,加载 `web-design-guidelines` skill 逐条比对。
与本项目规范冲突时**以本项目为准**(例如本项目刻意使用超大字号与近全屏弹窗,这是为手机横屏可读性服务的)。
