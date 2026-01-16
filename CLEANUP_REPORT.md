# 代码清理完成报告

## ✅ 已删除的废弃文件

### Python 脚本（已删除）
- ✅ `fix_corruption.py` - 数据修复脚本 v1
- ✅ `fix_corruption_v2.py` - 数据修复脚本 v2
- ✅ `fix_corruption_v3.py` - 数据修复脚本 v3
- ✅ `fix_encoding_final.py` - 编码修复脚本

### 废弃代码文件（已删除）
- ✅ `dummy` - 空的 Jupyter notebook 文件
- ✅ `app/utils.ts` - 包含重复的 `calculateNightInfo` 函数（已迁移到 `src/utils/nightLogic.ts`）
- ✅ `app/gameLogic.ts` - 测试用的游戏逻辑函数（未被使用）
- ✅ `TESTING.md` - 测试说明文档（未被引用）

## ⚠️ 需要重构的代码（角色特判）

以下代码包含角色特判（`if (role === 'imp')` 等），应该改为使用统一的 `RoleDefinition` 接口：

### 1. `src/utils/nightLogic.ts` - `calculateNightInfo` 函数

**位置**: 第 144-1473 行  
**问题**: 包含巨大的 switch case，为每个角色硬编码逻辑  
**建议**: 
- 使用 `getRoleDefinition(roleId)` 获取角色定义
- 使用 `roleDef.night?.dialog()` 生成对话
- 使用 `roleDef.night?.handler()` 处理逻辑

**影响范围**: 约 1300+ 行 switch case 代码

### 2. `src/hooks/useGameController.ts` - 角色特判

**位置**: 
- 第 1295 行: `case 'imp': return '小恶魔';`
- 第 1550 行: `if (targetSeat.role?.id === 'imp' && ...)`
- 第 1663 行: `currentRoleId === 'imp' ||`
- 第 2752 行: `if (targetId === impSeat.id && nightInfo.effectiveRole.id === 'imp')`

**建议**: 使用角色定义的统一接口，避免硬编码角色 ID

### 3. `src/hooks/useRoleAction.ts` - 角色特判

**位置**: 第 239 行  
**代码**: `if (roleId === 'imp' && isFirstNight) return false;`  
**建议**: 使用角色定义的 `firstNight` 配置判断

### 4. `src/hooks/roleActionHandlers.ts` - 角色特判

**位置**: 第 570-671 行  
**函数**: `handleImpSuicide`  
**问题**: 小恶魔自杀逻辑硬编码  
**建议**: 可以考虑移到 `imp.ts` 角色定义中，或通过 `onExecution` 处理

## ✅ 类型定义检查

### 已检查的类型定义

- ✅ `src/contexts/GameContext.tsx` - `GameState` 接口（唯一）
- ✅ `src/hooks/useNightLogic.ts` - `NightLogicGameState` 接口（工具接口，非重复）
- ✅ `src/types/game.ts` - 核心类型定义
- ✅ `src/types/roleDefinition.ts` - 角色定义接口（统一接口）

**结论**: 类型定义无重复，结构良好

## 📋 角色定义接口状态

### ✅ 已统一接口的角色

所有角色文件（约 75+ 个）都已遵循 `RoleDefinition` 接口：
- ✅ 所有角色都导出为 `RoleDefinition` 类型
- ✅ 所有角色都通过 `roleRegistry` 注册
- ✅ 使用统一的 `getRoleDefinition(roleId)` 获取角色定义

**示例**:
```typescript
// src/roles/demon/imp.ts
export const imp: RoleDefinition = {
  id: "imp",
  name: "小恶魔",
  type: "demon",
  firstNight: { ... },
  night: { ... },
};
```

## 🎯 下一步建议

### 高优先级

1. **重构 `calculateNightInfo`**
   - 使用角色定义的 `dialog()` 函数生成对话
   - 移除巨大的 switch case
   - 使用角色定义的标准接口

2. **移除角色 ID 硬编码**
   - 在 `useGameController.ts` 中查找所有 `roleId === 'xxx'` 特判
   - 改为使用角色定义或角色类型判断

### 中优先级

3. **统一角色处理逻辑**
   - 将 `handleImpSuicide` 等特殊逻辑移到角色定义中
   - 使用 `onExecution` 处理处决相关逻辑

4. **代码审查**
   - 全面搜索 `case 'xxx':` 和 `if (roleId === 'xxx')` 模式
   - 逐步替换为统一的接口调用

## ✨ 清理成果

### 删除文件统计
- **Python 脚本**: 4 个文件
- **废弃代码文件**: 3 个文件
- **文档文件**: 1 个文件
- **总计**: 8 个废弃文件

### 代码质量提升
- ✅ 移除重复的 `calculateNightInfo` 实现
- ✅ 清理未使用的测试代码
- ✅ 类型定义唯一性确认
- ✅ 角色定义接口统一

## 📝 注意事项

⚠️ **重要**: `src/utils/nightLogic.ts` 中的 `calculateNightInfo` 函数仍包含大量角色特判代码。这是一个大型重构任务，建议：

1. **逐步重构**: 不要一次性替换所有逻辑
2. **保持向后兼容**: 确保重构不影响现有功能
3. **测试覆盖**: 重构后需要全面测试所有角色

## 🔍 查找特判代码的命令

```bash
# 查找角色 ID 硬编码
grep -r "roleId === '" src/
grep -r "role\.id === '" src/
grep -r "case '" src/utils/nightLogic.ts

# 查找角色名称硬编码
grep -r "小恶魔\|占卜师\|毒师" src/ --exclude-dir=roles
```

