# Layer 4 仿真对局发现的问题

> 生成时间: 2026-06-22 (最终版)
> 引擎: tests/headlessGameEngine.ts
> 运行: 5剧本 × 15局 = 75场仿真, 61个角色触发, 35个错误, 0崩溃

---

## 最终覆盖数据

| 剧本 | 局数 | 总触发 | 错误 | 状态 |
|:----|:---:|:-----:|:---:|:----:|
| Trouble Brewing | 15 | 281 | 0 | ✅ |
| Bad Moon Rising | 15 | 242 | 13 | ✅ (devils_advocate未注册) |
| Sects & Violets | 15 | 389 | 22 | ✅ (筑梦师崩溃) |
| Midnight Revelry | 15 | 273 | 0 | ✅ |
| All Roles (Mixed) | 15 | 0 | 0 | ⚠️ 空队列需排查 |
| **合计** | **75** | **1185** | **35** | **0崩溃** |

**总角色覆盖**: 61/98 (62.2%), 其中 206 个注册能力

---

## 🔴 P0 — 能力执行崩溃

### 1. 筑梦师 (dreamer) — Cannot read 'name' of undefined
- **文件**: src/roles/new_engine/dreamer.ability.ts
- **触发次数**: 22次, 成功率 0% (全部崩溃)
- **错误**: TypeError: Cannot read properties of undefined (reading 'name')
- **确定**: 筑梦师在 calculate 阶段访问不存在的 target seat 属性

## 🟠 P1 — 能力成功率 0% (需修复)

| # | 角色ID | 中文名 | 类型 | 触发数 | 成功率 | 推测原因 |
|:-:|:------|:------|:----:|:-----:|:-----:|:---------|
| 2 | professor | 教授 | 镇民 | 41 | 0% | 需死者为目标 |
| 3 | hadesia | 哈迪西亚 | 恶魔 | 27 | 0% | 特殊击杀逻辑 |
| 4 | scarlet_woman | 红唇女郎 | 爪牙 | 27 | 7% | 需恶魔死亡触发 |
| 5 | dreamer | 筑梦师 | 镇民 | 22 | 0% | 同P0崩溃 |
| 6 | witch | 女巫 | 爪牙 | 19 | 95% | 基本正常 |
| 7 | godfather | 教父 | 爪牙 | 18 | 0% | 需外来者死亡 |
| 8 | zombuul | 僵怖 | 恶魔 | 13 | 0% | 假死标记缺失 |
| 9 | monk | 僧侣 | 镇民 | 13 | 69% | 偶发校验失败 |
| 10 | ravenkeeper | 守鸦人 | 镇民 | 10 | 0% | 死亡触发 |
| 11 | imp | 小恶魔 | 恶魔 | 65 | 77% | 偶发目标问题 |
| 12 | undertaker | 掘墓人 | 镇民 | 6 | 0% | 依赖死亡记录 |

## 🟡 P2 — 未注册能力

| # | 能力 | 问题 | 出现次数 |
|:-:|:----|:-----|:-------:|
| 13 | devils_advocate:ability | 在abilityRegistry中被注释 | 13次 |

## ⚪ P3 — __all__ 混池模式

- All Roles (Mixed): 15局, 0触发 — 夜间队列为空
- 说明混池的角色选取和夜间队列生成之间有ID不匹配
- 待进一步排查

## 📋 未触发角色总结 (37个)

### 需要确认是否有夜间能力 (29个)
baron, tea_lady, soldier, bard, monk_female, mayor, miner, saint_townsfolk, professor_female, astrologer, gossip, fool, goon, devils_advocate, missionary, minstrel, pacifist, leech, mastermind, klutz, no_dashii, pit_hag, cannibal, psychopath, atheist, golem, fisherman, ranger, shaman

### 预期无夜间行动 (8个)
drunk, virgin, saint, recluse, slayer, artist, savant, mutant

---

## 🔧 修复优先级建议

1. **P0 筑梦师崩溃** — 有明确堆栈, 修复成本低
2. **devils_advocate 取消注释** — 1行代码
3. **死亡触发类能力** (教授/守鸦人/掘墓人) — 增加死亡上下文
4. **特殊机制角色** (哈迪西亚/红唇女郎/僵怖/教父) — 需深入理解规则
5. **__all__ 混池模式修复** — 排查ID映射
6. **日间能力仿真** — 覆盖 virgin/slayer/artist/savant