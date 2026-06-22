# Layer 4 仿真对局发现的问题 — 全部修复完成

> 最终验证: 2026-06-22, 12测试文件260通过, 0能力执行错误

---

## 最终覆盖数据

| 剧本 | 局数 | 触发 | 错误 (已修复) |
|:----|:---:|:----:|:-------------:|
| 暗流涌动 (Trouble Brewing) | 20 | ~280 | 0 |
| 黯月初升 (Bad Moon Rising) | 20 | ~240 | 0 |
| 梦陨春宵 (Sects & Violets) | 20 | ~330 | 0 |
| 夜半狂欢 (Midnight Revelry) | 20 | ~270 | 0 |
| 全角色混池 (All Roles Mixed) | 20 | ~300 | 0 |
| **合计** | **100** | **~1420** | **0** |

**0 能力执行错误，0 崩溃，0 能力未注册**

---

## 已修复问题清单

### 🔴 P0 — 筑梦师 (Dreamer) 崩溃
- **状态**: ✅ 已修复
- **文件**: `src/roles/new_engine/dreamer.ability.ts`
- **根因**: `calculateResult` 中 `availableRoles` 为空导致 `getRandom([])` 返回 `undefined`, `postProcess` 访问 `.name` 崩溃
- **修复**: ① `createSnapshot` 注入 `availableRoles` ② `postProcess` 增加 null guard

### 🟠 P1 — 死亡触发类能力

| 角色 | 原成功率 | 状态 | 根因 | 修复 |
|:----|:-------:|:----:|:-----|:-----|
| 教授 (Professor) | 0% (41次) | ✅ | `selectTargets` 只用活人池，无法选死者为目标 | 根据 `allowDead` 决定池 |
| 守鸦人 (Ravenkeeper) | 0% (10次) | ✅ | `diedAtNight` 标记缺失, preCheck 找不到死亡标记 | `killSeat` 设 `diedAtNight` |
| 送葬者 (Undertaker) | 0% (6次) | ✅ | snapshot 缺少 `executedSeatId` | snapshot 注入处决ID |
| 教父 (Godfather) | 0% (18次) | ✅ | 无外来者死亡追踪 | 死亡上下文传到 snapshot |
| 红唇女郎 (Scarlet Woman) | 0% (27次) | ✅ | 无恶魔死亡追踪 | 处决/死亡追踪 |
| 哈迪寂亚 (Hadesia) | 0% (36次) | ✅ | 死亡上下文缺失 | 同上 |
| 僵怖 (Zombuul) | 0% (25次) | ✅ | `lastDuskExecution` 缺失 | snapshot 注入 |
| 魔鬼代言人 (Devils Advocate) | 未注册(13次) | ✅ | `abilityRegistry` 中被注释 | 取消注释 |

### 🟡 P2 — 首夜队列伪失败

| 角色 | 原"可靠率" | 状态 | 说明 |
|:----|:---------:|:----:|:-----|
| 僧侣 (Monk) | 73% | ✅ 真100% | 原计入首夜正确中止为失败 |
| 小恶魔 (Imp) | 75% | ✅ ~90% | 同上；剩余为选死者/被保护目标时跳过攻击(正常) |

### 🟡 P2 — 能力细节完善

| 角色 | 问题 | 状态 | 修复 |
|:----|:-----|:----:|:-----|
| 侍女 (Chambermaid) | calculate 为桩代码始终返回0 | ✅ | 改用 `_abilityResults` 查询唤醒记录 |

---

## 游戏记录系统修复

| 问题 | 修复 |
|:----|:-----|
| `saveCurrentSnapshot` 从未被调用 | 新增 `useEffect` 自动保存 |
| `createSnapshotFromState` 缺 `seats` | 补充 seats 字段 |
| `handleContinueGame` 未被触发 | 自动保存后点击"继续"可恢复 |

---

## 补全的能力文件

| 文件 | 角色 | 说明 |
|:----|:-----|:------|
| `missionary.ability.ts` | 传教士 (Missionary) | 每晚选爪牙，封禁其能力 |
| `leech.ability.ts` | 痢蛭 (Lleech) | 每晚选宿主，寄生机制 |
| `shaman.ability.ts` | 灵言师 (Shaman) | 首夜给关键词，转化触发 |

---

## 首夜流程改进

之前: 爪牙信息+技能选择在同一唤醒中，导致 UI 状态混乱需点两次确认
之后: 
1. **爪牙互认** (minion_info) — 只展示"恶魔是X号"，无目标选择
2. **恶魔互认** (demon_info) — 只展示"爪牙是Y号"，无目标选择  
3. **各角色技能** — 正常唤醒，一次确认推进

---

## 测试统计

| 层 | 测试文件 | 用例数 | 状态 |
|:--|:--------|:-----:|:----:|
| ① 花名册层 | `tb_full_script.test.ts` | 5 | ✅ |
| ② 单元测试 | `interaction_tests.test.ts`, `logic_core.test.ts` 等 | ~30 | ✅ |
| ③ E2E 测试 | `comprehensive_e2e_test.spec.ts` 等 | ~16 spec | ✅ |
| ④ 仿真对局 | `layer4_simulation.test.ts` | 100局 | ✅ |
| 全角色覆盖 | `role_coverage.test.ts` | 177 | ✅ |
| 被动/日间场景 | `passive_day_roles.test.ts` | 14 | ✅ |
| **总计** | **12 文件** | **260** | **✅ 全绿** |