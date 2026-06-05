
# 血染钟楼说书人助手

by 拜甘教成员-大长老
版本：W6.2.4

## 项目简介

这是一个血染钟楼（Blood on the Clocktower）说书人助手项目，基于 Next.js 框架开发。项目旨在为血染钟楼游戏提供完整的说书人辅助工具，包括角色管理、夜晚行动顺序、游戏流程控制等功能。

## 项目状态

| 模块 | 状态 |
|------|------|
| 新引擎能力文件 | ✅ 200个角色全部注册 |
| 旧引擎全部清理 | ✅ 65个handler已删除，仅保留UI配置层 |
| 新引擎优先调度 | ✅ `useNightActionHandler.ts` 优先走新引擎中间件 |
| 双层架构 | ✅ UI配置层(`src/roles/*.ts`) + 新引擎能力层(`src/roles/new_engine/*.ability.ts`) |
| 生产构建 | ✅ 零错误 |
| 单元测试 | ✅ 38/38 通过 |
| E2E冒烟测试 | ✅ 通过 |
| 信息弹窗机制 | ✅ 占卜师等"选择+反馈"角色正确弹窗，自动信息类不弹窗 |
| 胜负判定 | ✅ 已修复 |
| 复盘日志 | ✅ 显示"【N】中文名"格式 |
| Vercel 部署配置 | ✅ 已添加 `vercel.json` |

## 架构说明

### 双层架构（2026年6月重构）

```
UI配置层 (src/roles/townsfolk|minion|demon|outsider/*.ts)
  → 角色元数据：id, name, type, night.order, night.target, night.dialog, 规则文本
  → 不包含任何 handler（全部已删除）

新引擎能力层 (src/roles/new_engine/*.ability.ts)
  → 游戏逻辑：preCheck→calculate→stateUpdate→postProcess 中间件管道
  → 200个能力文件，统一注册在 abilityRegistry.ts

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
