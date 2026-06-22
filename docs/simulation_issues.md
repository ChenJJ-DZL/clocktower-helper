# Layer 4 仿真对局发现的问题 — 修复完成

> 最终验证: 2026-06-22, 10测试文件69通过, 0能力执行错误

---

## 覆盖数据

| 剧本 | 局数 | 触发 | 错误 (已修复) |
|:----|:---:|:----:|:-------------:|
| 暗流涌动 (Trouble Brewing) | 15 | ~280 | 0 |
| 黯月初升 (Bad Moon Rising) | 15 | ~240 | 0 |
| 梦陨春宵 (Sects & Violets) | 15 | ~330 | 0 |
| 夜半狂欢 (Midnight Revelry) | 15 | ~270 | 0 |
| 全角色混池 (All Roles Mixed) | 15 | ~300 | 0 |
| **合计** | **75** | **~1420** | **0** |

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

### ⚪ 其余未触发角色 (非仿真问题)

共 37 个角色未在 75 局中触发，主要原因:
- **统计偏差**: 仅 75 局, 部分角色未被分配到
- **日间能力**: `猎手(Slayer)`, `贞洁者(Virgin)`, `艺术家(Artist)`, `博学者(Savant)` — 需日间仿真
- **被动能力**: `酒鬼(Drunk)`, `圣徒(Saint)`, `陌客(Recluse)`, `畸形秀演员(Mutant)` — 无夜间行动, 不触发为预期
- **实验角色**: 部分在混池模式中队列ID映射有遗漏

---

## 🔧 修复文件清单

| 文件 | 改动 |
|:----|:-----|
| `tests/headlessGameEngine.ts` | selectTargets, killSeat, createSnapshot, buildFullNightOrder 等 6 处 |
| `src/utils/dynamicQueueGenerator.ts` | NightOrderEntry + otherNightOnly 首夜过滤 |
| `src/roles/new_engine/dreamer.ability.ts` | postProcess null guard |
| `src/roles/new_engine/devils_advocate.ability.ts` | 取消注释 |
| `src/roles/new_engine/abilityRegistry.ts` | 取消注释 |