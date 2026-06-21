
# 血染钟楼说书人助手

by 拜甘教成员-大长老
版本：W6.20.1

## 项目简介

这是一个血染钟楼（Blood on the Clocktower）说书人助手项目，基于 Next.js 框架开发。项目旨在为血染钟楼游戏提供完整的说书人辅助工具，包括角色管理、夜晚行动顺序、游戏流程控制等功能。

## 项目状态

| 模块 | 状态 |
|------|------|
| 新引擎能力文件 | ✅ 206个角色全部注册并精修 |
| 旧引擎全部清理 | ✅ 65个handler已删除，仅保留UI配置层 |
| 新引擎优先调度 | ✅ `useNightActionHandler.ts` 优先走新引擎中间件 |
| 双层架构 | ✅ UI配置层(`src/roles/*.ts`) + 新引擎能力层(`src/roles/new_engine/*.ability.ts`) |
| 生产构建 | ✅ 零错误 |
| 单元测试 | ✅ 38/38 通过 |
| 仿真测试 | ✅ 4套全部通过 |
| E2E冒烟测试 | ✅ 通过 |
| 信息弹窗机制 | ✅ 占卜师等"选择+反馈"角色正确弹窗，自动信息类不弹窗 |
| 胜负判定 | ✅ 已修复 |
| 复盘日志 | ✅ 显示"【N】中文名"格式 |
| Vercel 部署配置 | ✅ 已添加 `vercel.json` |
| 质量门禁 check:all | ✅ fix + type + build + test + circular |

## 架构说明

### 双层架构（2026年6月重构）

```
UI配置层 (src/roles/townsfolk|minion|demon|outsider/*.ts)
  → 角色元数据：id, name, type, night.order, night.target, night.dialog, 规则文本
  → 不包含任何 handler（全部已删除）

新引擎能力层 (src/roles/new_engine/*.ability.ts)
  → 游戏逻辑：preCheck→calculate→stateUpdate→postProcess 中间件管道
  → 206个能力文件，统一注册在 abilityRegistry.ts

调度器 (useNightActionHandler.ts)
  → 1. 查新引擎 getRawAbilityMap() → 有则执行新引擎中间件
  → 2. 无新引擎则回退 UI配置层的旧 handler（已不存在）
```

### 弹窗规则

| 类型 | 说明 | 示例角色 |
|:----|:-----|:---------|
| **选择+反馈** → 弹窗 | 选目标后系统返回信息 | 占卜师有/没有、守鸦人得知角色 |
| **自动信息** → 不弹窗 | 系统直接告知信息 | 厨师"相邻邪恶=3"、洗衣妇信息 |
| **选择执行** → 不弹窗 | 选目标后执行无反馈 | 投毒者下毒、小恶魔杀人 |

## 本地开发

```bash
npm run dev        # 启动开发服务器 http://localhost:3000
npm run build      # 生产构建
npm run test       # 运行测试
npm run check:all  # 全量质量门禁
npm run dev -p 3001 # 备用端口
```

## Vercel 部署

```bash
git push
# 在 https://vercel.com 导入仓库，自动部署
```

## 更新日志

### W6.21.5 (2026-06-21)
- 📋 **补充仿真对局层计划**：4层测试体系（花名册→单元→E2E→仿真对局）
- 🤖 **游戏机器人设计**：随机对局 + 日志分析器，覆盖角色间交互验证
- 📘 **全角色测试计划更新**：`docs/全角色测试计划.md` 新增第5章

### W6.21.4 (2026-06-21)
- 🧪 **全量 E2E 测试体系**：21精细 + 70花名册 + 20自建剧本 = 111测试
- 🎯 **覆盖 84% 角色**（110/131），三大剧本全通
- 🔧 **night_helper v7**：强化模态弹窗处理、夜间模式、双阶段选择
- 🆕 **唱诗男孩(Choir Boy) 补全**：RoleDefinition + data.ts + 注册表 + 可用性测试
- 🏷️ **角色名修正**：和平主义者/失意者/巡山人/修行者（以 data.ts 为准）
- 📋 **全角色测试计划**：见 `docs/全角色测试计划.md`
- ✅ **质量门禁**: TypeScript 0 errors, Build 0 warnings, Circular 0
- 🧪 **E2E 测试优化**：workers=1（单线程防内存溢出）、headless 纯无头模式
- ✅ **E2E 核心测试通过**：e2e_scenario_tb, core_e2e_flow, comprehensive_e2e, custom_e2e, game_simulation_log（5 PASS）
- 🛡️ **Playwright 配置优化**：限制并发、清理后台进程、配置文档更新
- 📦 **安装 CodeGraph**：本地代码知识图谱（5,520 节点，15,879 边）
- 🔧 **Playwright 配置文件更新**：workers:1, headless:true

### W6.12.1 (2026-06-12)
- 🧹 **旧引擎全面清理**：删除 5 个旧文件，无遗留旧引擎代码
- 🗑️ **删除旧目录注释文件**：imp.ability.ts, po.ability.ts, fortune_teller.ability.ts
- 🗑️ **删除死代码**：useNightActionQueue.ts, nightQueueGenerator.ts
- 🔄 **重构 unifiedNightOrder**：改用 dynamicQueueGenerator
- ✅ **验证**：TypeScript 0 errors, 测试 38/38, Build 通过

### W6.11.2 (2026-06-11)
- 🐛 **修复黄昏→夜晚过渡卡死**：GameStage 入夜按钮添加 `setGamePhase("night")`
- 🛡️ **修复 statusEffects 空值 bug**：10 处 `?? []` 安全保护，消除 TypeError
- ✅ **仿真测试全通过**：17/17，单元测试 38/38，TypeScript 0 errors
- ✅ **Playwright UI 验证**：首夜→天亮→白天→黄昏→第2夜 完整流程 0 errors
- 🧪 **E2E 测试修复**：core_e2e_flow 移除已废弃的"首夜叫醒顺位"断言

### W6.11.1 (2026-06-11)
- 🏗️ **架构修复**：删除3组重复角色注册，注释旧引擎遗留文件（Step 1）
- 🎯 **能力全覆盖**：补全8个缺失能力文件（bard, golem, hermit, liz, lloam, professor_female, psychopath, titus）
- 🔧 **角色ID修复**：灵言师命名统一（梅泽菲勒斯→灵言师），圣徒 roleId 不匹配修复
- 📦 **134个骨架文件精修**：所有角色展开为完整 preCheck→calculate→stateUpdate→postProcess pipeline
- 🐛 **修复多处逻辑bug**：balloonist阵营混淆、bounty_hunter醉酒分支、widow/wraith/lycanthrope触发时机错误等
- 🛡️ **质量门禁升级**：check:all 新增 build 检查，确保部署前全链路验证
- 🏷️ **版本号规范**：W6.日期.当日推送次数

### W6.2.4 (2026-06-05)
- 🏗️ **架构重构**：彻底废弃旧引擎handler，全部角色走新引擎中间件（65个handler删除，-2011行）
- 🆕 **Conjurer/Shaman迁移**：最后2个旧引擎角色完成新引擎迁移
- 🔄 **弹窗机制重做**：仅"选择目标+获取反馈"类角色弹窗，自动信息类/选择执行类不弹窗
- 🎯 **占卜师弹窗修复**：选2目标→确认→弹"是/否"→执行能力→继续
- 🐛 **胜负判定修复**：使用最新座位数据而非闭包中过期数据
- 📝 **复盘日志格式化**：显示"【N】中文名"不再显示英文角色ID
- 🎨 **猎手/守鸦人UI**：猎手白天技能按钮 + 守鸦人仅恶魔击杀触发
- 🧹 **内部日志清理**：`[能力执行]`/`[系统]`等调试信息不再写入游戏记录
- 🚀 **Vercel部署**：添加 `vercel.json` 配置
