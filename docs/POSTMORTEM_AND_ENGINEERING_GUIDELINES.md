# 🩸 血染钟楼说书助手 — 开发复盘与工程防范规范

> **文档版本**: 1.0  
> **记录日期**: 2026-08-23  
> **适用范围**: 全项目前端交互、状态管理、角色能力管道、规则结算与弹窗体系

---

## 目录

1. [一、 背景概述](#一-背景概述)
2. [二、 今日问题全景清单与深度复盘](#二-今日问题全景清单与深度复盘)
   - [2.1 规则与核心玩法逻辑缺陷](#21-规则与核心玩法逻辑缺陷)
   - [2.2 状态管理与上下文分层缺陷](#22-状态管理与上下文分层缺陷)
   - [2.3 交互生命周期与事务回滚缺陷](#23-交互生命周期与事务回滚缺陷)
   - [2.4 UI 渲染、样式兼容与弹窗架构缺陷](#24-ui-渲染样式兼容与弹窗架构缺陷)
3. [三、 根本原因（Root Cause）深度剖析](#三-根本原因root-cause深度剖析)
4. [四、 系统性防范措施与工程规范](#四-系统性防范措施与工程规范)
   - [4.1 状态与动作上下文严禁混淆（State vs Actions）](#41-状态与动作上下文严禁混淆state-vs-actions)
   - [4.2 弹窗组件统一基于 `ModalWrapper` 构建](#42-弹窗组件统一基于-modalwrapper-构建)
   - [4.3 角色能力三层防护规范（管道 + 元数据 + UI 守卫）](#43-角色能力三层防护规范管道--元数据--ui-守卫)
   - [4.4 临时交互状态必须支持可逆事务（Rollback）](#44-临时交互状态必须支持可逆事务rollback)
   - [4.5 游戏规则状态持久性与重置边界隔离](#45-游戏规则状态持久性与重置边界隔离)
5. [五、 后续开发自检清单（Pre-Flight Checklist）](#五-后续开发自检清单pre-flight-checklist)

---

## 一、 背景概述

在今日的功能迭代、用户体验优化以及规则严谨性校验过程中，暴露了一批涉及**血染钟楼核心规则实现**、**React 状态/上下文架构**、**弹窗生命周期**以及**交互链路闭环**等维度的典型问题。

为了建立长效防范机制，确保后续不论是新增角色、调整交互还是重构 UI 时，均能避免类似问题重复发生，特产出此份深度复盘报告与工程规范指南。

---

## 二、 今日问题全景清单与深度复盘

### 2.1 规则与核心玩法逻辑缺陷

| 编号 | 问题现象 | 规则依据 | 根本原因分析 | 修复方案 |
| :--- | :--- | :--- | :--- | :--- |
| **R-01** | **幽灵票跨天被异常恢复** | 死者幽灵票为「整局游戏仅可使用一次」。 | 跨天/进入新一天重置函数 `cleanStatusesForNewDay` 遍历所有座位时，误将死者的 `hasGhostVote` 重置为 `true`，混淆了「每日状态」与「全局唯一资产」。 | 将 `hasGhostVote: false` 标记为永久消耗状态，跨天重置逻辑严格排除幽灵票。 |
| **R-02** | **处决计票门槛计算偏差** | 14 人存活时，8 人举手（7 票有效）未上处决台。处决门槛为 `Math.ceil(aliveCount / 2)`。 | 门槛计算公式曾误用向下取整或不正确的比较操作符（如 `>` 代替 `>=`），导致边界票数无法上台。 | 严格统一处决门槛为 `Math.max(1, Math.ceil(aliveCount / 2))`，当 `actualVotes >= threshold && actualVotes > currentMax` 时稳定进入处决待定席。 |
| **R-03** | **处决未结算被允许跳过进入下一夜** | 规则要求只有处决明确结算完毕（有人被处决或平票无人被处决）后才可入夜。 | 黄昏阶段流转弹窗默认提供了强行跳转选项，缺乏对处决状态的前置拦截。 | 增加前置状态阻断，将弹窗按钮严格约束为「返回」与「执行处决」，处决未结算前禁止直接入夜。 |
| **R-04** | **管家夜晚选择主人可选自己** | 管家（Butler）夜间选择主人时不能选择自己。 | `butler.ts` 角色定义中缺失首夜目标校验；`nightInfoGenerator` 未排除自身 ID；UI 交互层未对被禁用目标做严格阻断。 | 实现三层校验：角色定义约束、信息生成排除自身、交互处理层前置拦截 `isTargetDisabled`。 |
| **R-05** | **黄昏被提名记录范围混入历史记录** | 提名记录本黄昏只记录当个黄昏被提名的玩家。 | 进入黄昏或新一天时未原子重置 `nominationRecords`，导致此前天数的提名历史累积。 | 在每次进入黄昏及初始化黄昏阶段时显式重置 `nominationRecords`。 |

---

### 2.2 状态管理与上下文分层缺陷

| 编号 | 问题现象 | 根本原因分析 | 修复方案 |
| :--- | :--- | :--- | :--- |
| **S-01** | **游戏结束结算弹窗未弹出（GameOverOverlay 永远为 null）** | `GameOverOverlay` 内部错误地调用了 `const props = useGameActions()`，并试图从中读取 `props.gamePhase` 与 `props.winResult`。由于 `useGameActions` 只包含 Controller 操作函数，这些状态属性全部为 `undefined`，导致 `props.gamePhase !== "gameOver"` 恒为 `true`，弹窗永远返回 `null`。 | 严格分离数据流：从 `useGameState()` 读取响应式状态（`gamePhase`, `winResult`, `winReason` 等），从 `useGameActions()` 读取操作方法，确保弹窗正常受控响应。 |

---

### 2.3 交互生命周期与事务回滚缺陷

| 编号 | 问题现象 | 根本原因分析 | 修复方案 |
| :--- | :--- | :--- | :--- |
| **T-01** | **提名发起后取消，双方仍被锁死在已提/被提状态** | 发起提名阶段即刻向 `nominationRecords` 写入了发起人和被提名人 ID。当说书人关闭弹窗或点击取消时，缺乏逆向回滚事务，导致双方在当个黄昏被永久剥夺提名与被提资格。 | 实现 `cancelNomination(nominatorId, nomineeId)` 事务，在取消计票、关闭弹窗及底部取消按钮触发时，原子回滚资格与标记。 |

---

### 2.4 UI 渲染、样式兼容与弹窗架构缺陷

| 编号 | 问题现象 | 根本原因分析 | 修复方案 |
| :--- | :--- | :--- | :--- |
| **U-01** | **自建剧本弹窗点击无效、无法弹出** | `CustomScriptBuilderModal` 未复用成熟的 `ModalWrapper`，而是自建 `createPortal`，且内部维护了冗余的 `mounted` 延迟状态；同时使用了 Tailwind v4 不支持的 `animate-in` / `zoom-in-95` 类，且校验逻辑在未选恶魔时强行 disable 保存按钮。 | 统一重构接入 `ModalWrapper`，去除不兼容的动画类与多余延迟挂载；提供角色搜索、官方模板快速载入，并增加「🚀 保存并立即开局」与「💾 仅保存」双通道。 |
| **U-02** | **座位状态标签重叠漂移与定位偏差** | “已提”/“被提”标签距离角色过远，且“主人”、“实:酒鬼”等标签相互重叠覆盖。 | 重构 `SeatNode` 标签布局体系：已提/被提固定在序号圆圈右侧，高度与序号等高；状态标签以圆环切线为基准纵向并排左对齐展示。 |
| **U-03** | **技能结果回顾展示未居中放大** | 技能执行结果回顾使用单行文本拼接，未将「【无事发生】」或击杀结果与上下文动作描述解耦。 | 结构化拆分动作描述行与结果高亮块，确保结果状态独立居中放大展示。 |

---

## 三、 根本原因（Root Cause）深度剖析

通过对上述 11 个典型问题的溯源，可以归纳出导致问题的 **4 大深层根因**：

```
                    ┌────────────────────────────────────────────────────────┐
                    │                      深层根因剖析                      │
                    └────────────────────────────────────────────────────────┘
                                                │
         ┌──────────────────┬───────────────────┴───────────────────┬──────────────────┐
         ▼                  ▼                                       ▼                  ▼
┌─────────────────┐┌─────────────────┐                    ┌─────────────────┐┌─────────────────┐
│ 上下文职责混淆  ││ 临时状态缺乏    │                    │ 弹窗实现碎片化  ││ 规则校验孤岛    │
│                 ││ 事务回滚 (Undo) │                    │ 与 CSS 类不兼容 ││ (单层拦截漏洞)  │
└─────────────────┘└─────────────────┘                    └─────────────────┘└─────────────────┘
```

1. **上下文职责混淆（State vs Actions）**：
   - 项目中存在 `useGameState`（存放响应式只读状态）和 `useGameActions`（存放操作 Controller 方法）。
   - 部分组件开发者习惯性地从 `useGameActions()` 中取状态属性，未进行 TypeScript 严格解构检查，导致状态在运行时为 `undefined` 而产生“静默失效”。

2. **临时操作缺乏逆向回滚事务（No Rollback Transaction）**：
   - 在复杂流程（如发起提名 → 打开投票弹窗 → 计票结算）中，初始化时就前置修改了全局数据。当流程被用户取消、关闭或异常中断时，没有对应的回滚函数，破坏了状态机的一致性。

3. **弹窗实现碎片化与样式库兼容性漏洞**：
   - 项目已具备封装完善的 `ModalWrapper`，但个别组件自行使用 `createPortal` 拼接样式，引入了未安装的 Tailwind 插件类名和不必要的 `mounted` 延迟，导致渲染受阻。

4. **规则约束存在单层拦截漏洞**：
   - 规则判定往往只写在后端能力（ability）或只写在前端 UI，缺乏「能力元数据 + 状态生成器 + UI 交互守卫」的端到端三层防护，导致绕过某一层即可触发非法操作。

---

## 四、 系统性防范措施与工程规范

为了在后续开发中彻底杜绝同类问题，全体开发任务必须严格执行以下 **5 项工程规范**：

### 4.1 状态与动作上下文严禁混淆（State vs Actions）

```tsx
// ❌ 错误示范：严禁从 useGameActions 读取状态
const { gamePhase, winResult, setCurrentModal } = useGameActions(); // gamePhase, winResult 为 undefined!

// ✅ 正确规范：状态取自 useGameState，动作取自 useGameActions
const { gamePhase, winResult, selectedScript } = useGameState();
const { setCurrentModal, handleNewGame, saveHistory } = useGameActions();
```

---

### 4.2 弹窗组件统一基于 `ModalWrapper` 构建

所有模态弹窗、面板一律复用 `src/components/modals/ModalWrapper.tsx`，禁止自行编写未经测试的 `createPortal`：

```tsx
// ✅ 统一弹窗标准模板
import { ModalWrapper } from "@/src/components/modals/ModalWrapper";

export function ExampleModal({ isOpen, onClose }: ExampleModalProps) {
  if (!isOpen) return null;

  return (
    <ModalWrapper
      title="📌 弹窗标题"
      onClose={onClose}
      className="max-w-4xl"
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose}>取消</button>
          <button onClick={handleConfirm} className="bg-purple-600 font-bold">确定</button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* 业务内容 */}
      </div>
    </ModalWrapper>
  );
}
```

---

### 4.3 角色能力三层防护规范（管道 + 元数据 + UI 守卫）

任何角色能力的目标选择与合法性限制，必须满足三层互锁：

```
[ 第 1 层: 角色定义层 (role.ts) ]
  └── target.canSelect = (target, self) => target.id !== self.id;

[ 第 2 层: 信息与队列生成层 (nightInfoGenerator.ts) ]
  └── validTargetIds 自动过滤自身，并设置 canSelectSelf: false;

[ 第 3 层: 交互处理层 (useInteractionHandler.ts) ]
  └── handleSeatClick / toggleTarget 前置校验 isTargetDisabled(targetSeat)，若禁用则立即阻断;
```

---

### 4.4 临时交互状态必须支持可逆事务（Rollback）

凡是在用户完成确认前就会修改临时状态的交互流程（如提名、换角预览、待定处决等），必须在 hook 中成对提供 `executeXxx` 与 `cancelXxx`，并在弹窗关闭或取消时无条件触发回滚：

```typescript
// ✅ 必须成对提供发起与取消动作
const executeNomination = (nominatorId: number, nomineeId: number) => { ... };
const cancelNomination = (nominatorId: number, nomineeId: number) => {
  // 1. 从 nominators 移除 nominatorId
  // 2. 从 nominees 移除 nomineeId
  // 3. 清理 nominationMap
  // 4. 记录取消日志
};
```

---

### 4.5 游戏规则状态持久性与重置边界隔离

状态重置函数必须严格区分以下三类生命周期：

1. **单夜临时状态**（如 `deadThisNight`、`isProtectedTonight`）：入夜与天亮时清空；
2. **单日临时状态**（如 `nominationRecords`、`hasNominatedToday`）：进入黄昏或进入新一天时清空；
3. **整局全局唯一状态**（如 `hasGhostVote`、`hasUsedAbility`）：**绝对禁止在跨天重置中恢复**，仅在 `handleNewGame` / `resetGame` 时重置。

---

## 五、 后续开发自检清单（Pre-Flight Checklist）

在完成任何新功能或 Bug 修复后，提交前必须对照此清单自检：

- [ ] **状态读取校验**：检查是否有从 `useGameActions` 读取状态属性的错误代码？
- [ ] **弹窗规范校验**：新增弹窗是否统一接入了 `ModalWrapper`？样式是否在现代主题与经典主题下均表现正常？
- [ ] **取消与回滚校验**：如果用户在弹窗中点击「取消」或「✕」，是否能恢复现场状态？
- [ ] **边界规则校验**：死者幽灵票、处决门槛计算、目标自选限制等边界是否满足官方最新规则？
- [ ] **自动化测试全覆盖**：执行 `npm run test` 确保所有测试套件通过（通过率 $100\%$）。
- [ ] **构建编译校验**：执行 `npm run type` 验证无类型报错。
---

## 六、 判胜类规则缺陷的系统性防范（2026-11-01 增补）

> 触发事故：第 4 天处决 **15号-小精灵（镇民）**，系统误判「善良双子被处决」直接判邪恶胜并提前结案；
> 而真正的善良双子是 **1号-图书管理员**（存活）、恶魔 **11号-小恶魔** 也存活，本局根本没有分出胜负。
> 根因不是"写错一行"，而是**判胜逻辑在证据缺失时用启发式伪造了领域事实**，且同一规则在两处各写一遍。

### 6.1 铁律一：判胜必须「失败关闭」（fail-closed）

判胜是**不可逆操作**（一旦弹窗宣布胜负，对局就结束），因此：**证据不足 ⇒ 条件不成立，禁止任何默认值/启发式/类型推断。**

```ts
// ❌ 事故代码（旧）：没有显式配对就用"第一个镇民"当善良双子
const goodTwinSeat = evilTwinPair?.goodSeatId
  ? seats.find((s) => s.id === evilTwinPair.goodSeatId)
  : seats.find((s) => s.id !== evilTwinId && isTownsfolkOrOutsider(s)); // ← 伪造事实

// ✅ 现行代码：证据只有两种来源，缺失则 unresolved，判胜谓词恒 false
export function resolveEvilTwinPair(seats, pair): ResolvedEvilTwinPair {
  // ① 显式 evilTwinPair（说书人指定/引擎落库） ② 座位 isGoodTwin 标记
  // ③ 都没有 ⇒ { goodTwinSeat: null, resolved: false, source: "unresolved" }
}
```

**接入要求**：任何依赖"身份/配对/角色/座位"等**领域事实**的判胜分支，都必须先写一个
「无证据 ⇒ 不成立」的严格解析函数与单测；禁止在判胜分支里出现 `?? 默认值`、`find(第一个符合的)`、
"类型看起来像"这类兜底。

### 6.2 铁律二：单一事实来源 + 双通道解析（判胜级 / 展示级）

- 同一规则**只允许一处实现**。历史事故（`app/gameLogic.ts` 与 `useExecutionHandlers.ts` 各写一份启发式）
  的教训：修一处漏一处，两处口径必然分叉。
- 需要启发式占位的只有**夜间队列编排 / 信息展示 / 告知画面**，它们使用
  `resolveEvilTwinPairForDisplay`（`source: "heuristic"`、`resolved: false`）。
- **判胜级消费者只能使用严格解析**；架构护栏测试会静态扫描并禁止
  `app/gameLogic.ts` / `useExecutionHandlers.ts` 导入 display 版本。

### 6.3 铁律三：判胜结果必须「可证明、可审计」—— reasonCode + evidence

所有终局返回统一走 `src/utils/winConditions/winReasonCodes.ts::makeWinResult`：

- `reasonCode`：封闭枚举，**新增判胜条件必须登记**；
- `winner`：只能由注册表 `side` 派生，禁止在返回字面量里另写胜负；
- `evidence`：每个 code 声明 `requiredEvidence`（如镜像双子必须给出
  `executedSeatId / goodTwinSeatId / evilTwinSeatId / twinPairSource`），
  测试会泛化断言"证据不全不允许判胜"。
- `rule`：官方规则原文依据，供规则评审逐条对账。

### 6.4 铁律四：用「属性测试 + 回归夹具」替代人肉穷举

人工测试只能覆盖"想到的路径"，组合空间（座位×角色×状态×动作时点）必须交给机器：

1. **确定性属性测试**（`src/utils/__tests__/winConditionSoundness.test.ts`）：
   固定 seed 随机生成盘面/动作，断言 6 条泛化不变量（reasonCode 合法、winner 与 side 一致、
   证据齐全、无配对永不判双子、受限简单盘处决普通好人绝不结束、双子被毒/醉不判胜……）。
2. **用户报障回归夹具**（`tests/reported-bugs/`）：**每一条用户报障都必须固化为夹具**——
   用报障中的座位/天数/操作序列断言"不得结束/必须结束"。人工复测过一次就丢，等于下次还会犯。
3. **判胜原因覆盖矩阵**（`winReasonMatrix.test.ts`）：注册表每个 code 至少 1 正例 + 1 近似反例；
   新增 code 不补场景 → 测试立刻变红（覆盖棘轮）。
4. **架构护栏测试**（`evilTwinSingleSource.test.ts`）：静态扫描源码，禁止启发式/字符串/裸返回
   绕过注册表与严格解析。

### 6.5 铁律五：CI 守门，本地与远端同一口径

- `.github/workflows/ci.yml` 在 push / PR 上执行 `tsc` + `vitest` + `madge`（**能真实拦截规则缺陷**的三项）；
- 本地等价命令：`npm run check:ci`（只读校验，不写文件，与 CI 同口径）；提交流程仍按仓库约定跑一次 `npm run check:all`（其 `fix` 步骤负责格式化）。
- ⚠️ biome 格式化**暂不作为 CI 门禁**：仓库存在历史格式化欠账（一次性 `biome check --write .` 会改写数百个与业务无关的文件）。格式化由本地 `npm run fix` 负责，CI 只保留"能拦截缺陷"的步骤，避免"全红等于没红"。
- 基线与 CI **必须保持全绿**：任何"已知红"都会让新缺陷淹没在噪音里（本次修复同时清理了 3 个既有失败基线：2 个 vitest 失败 + 1 个循环依赖红灯）。循环依赖用 `.madgerc` 开启 `skipTypeImports` —— type-only import 在运行时不存在（`gameLogic → evilTwinHelper → types/game → gameLogic` 是纯类型环）；
- 判胜溯源随 `processGameEvent` 透传：`GameStateSnapshot.reasonCode / evidence`（生产 UI / 复盘可直接读取"凭什么判胜"）。

### 6.6 新增判胜条件接入清单（Checklist）

- [ ] 在 `winReasonCodes.ts` 登记 `reasonCode` / `side` / `rule` / `requiredEvidence`；
- [ ] 用 `makeWinResult` 返回（禁止裸 `{ isGameOver: true, winner, reason }`）；
- [ ] 若依赖领域事实，先写严格解析 + 「无证据 ⇒ 不成立」单测；
- [ ] 在 `winReasonMatrix.test.ts` 补 1 正例 + 1 近似反例；
- [ ] 若规则与既有规则可能冲突（如双子 vs 人数阈值），补优先级注释与边界用例；
- [ ] 用户报障 → 固化到 `tests/reported-bugs/`；
- [ ] `npm run check:ci` 全绿后再提交。

> 🧭 **更上层的"全量符合官方规则"检测**（官方规范 ⇄ 实现 ⇄ 测试证据三方对账 + 棘轮门禁）
> 见 [RULE_CONFORMANCE_SYSTEM.md](./RULE_CONFORMANCE_SYSTEM.md)：
> `npm run conformance:audit` 会输出逐角色台账与静态判定（含官方类型/夜序/实现缺口），
> `npx vitest run src/utils/__tests__/rule_conformance.test.ts` 在 CI 中防止偏差回退。

---

## 附录 A：CI workflow（可直接复制为 `.github/workflows/ci.yml`）

> 本仓库推送凭据为 GitHub OAuth App 且**没有 `workflow` scope**，无法通过 API 创建/更新
> workflow 文件（`git push` 会报 `refusing to allow an OAuth App to create or update workflow`）。
> 因此该文件以文档形式入库：用带 `workflow` 权限的账号/Token 手动创建
> `.github/workflows/ci.yml` 即可，内容与本地 `npm run check:ci` 同口径。

```yaml
name: ci
on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
jobs:
  verify:
    name: verify (tsc + vitest + madge)
    runs-on: ubuntu-latest
    timeout-minutes: 25
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - name: Type check
        run: npx tsc --noEmit
      - name: Tests (unit + integration + invariant + regression)
        run: npx vitest run
      - name: Circular dependency guard (skip type-only imports, see .madgerc)
        run: npx madge --circular src/index.ts
```
