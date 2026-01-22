# 如何运行测试和查看结果

## 📋 可用的测试

项目包含5个游戏模拟测试文件，每个测试都会运行100次模拟游戏对局：

1. **暗流涌动（Trouble Brewing）** - `simulation_trouble_brewing.test.js`
2. **暗月初升（Bad Moon Rising）** - `simulation_bad_moon_rising.test.js`
3. **梦殒春宵（Sects & Violets）** - `simulation_sects_violets.test.js`
4. **夜半狂欢（Midnight Revelry）** - `simulation_midnight_revelry.test.js`
5. **完整角色库（All Roles）** - `simulation_all_roles.test.js`

## 🚀 运行测试

### 方法1：使用 npm 脚本（推荐）

在项目根目录下运行以下命令：

```bash
# 运行暗流涌动测试
npm run test:simulation:tb

# 运行暗月初升测试
npm run test:simulation:bmr

# 运行梦殒春宵测试
npm run test:simulation:sv

# 运行夜半狂欢测试
npm run test:simulation:mr

# 运行完整角色库测试
npm run test:simulation:all
```

### 方法2：直接使用 Jest

```bash
# 暗流涌动
jest tests/simulation_trouble_brewing.test.js --testTimeout=300000

# 暗月初升
jest tests/simulation_bad_moon_rising.test.js --testTimeout=300000

# 梦殒春宵
jest tests/simulation_sects_violets.test.js --testTimeout=300000

# 夜半狂欢
jest tests/simulation_midnight_revelry.test.js --testTimeout=300000

# 完整角色库
jest tests/simulation_all_roles.test.js --testTimeout=300000
```

### 方法3：使用 Node.js 直接运行

```bash
# 直接运行测试文件（不通过Jest）
node tests/simulation_trouble_brewing.test.js
node tests/simulation_bad_moon_rising.test.js
node tests/simulation_sects_violets.test.js
node tests/simulation_midnight_revelry.test.js
node tests/simulation_all_roles.test.js
```

## ⏱️ 测试时间

- 每个测试运行100次模拟游戏对局
- 预计耗时：**3-10分钟**（取决于电脑性能）
- 测试超时时间设置为：**300秒（5分钟）**

## 📁 测试结果位置

所有测试结果保存在 `tests/simulation_logs/` 目录下，按剧本分类：

```
tests/simulation_logs/
├── trouble_brewing/          # 暗流涌动测试结果
│   ├── game_001_good_12players.log
│   ├── game_002_evil_9players.log
│   ├── ...
│   └── summary.txt            # 汇总报告
├── bad_moon_rising/          # 暗月初升测试结果
│   ├── game_001_*.log
│   └── summary.txt
├── sects_violets/            # 梦殒春宵测试结果
│   ├── game_001_*.log
│   └── summary.txt
├── midnight_revelry/          # 夜半狂欢测试结果
│   ├── game_001_*.log
│   └── summary.txt
└── all_roles/                # 完整角色库测试结果
    ├── game_001_*.log
    └── summary.txt
```

## 📊 查看测试结果

### 1. 控制台输出

测试运行时会实时显示进度：

```
游戏 #1: 12人, 3天/3夜, 胜者: good, 耗时: 2.34s
游戏 #2: 9人, 4天/4夜, 胜者: evil, 耗时: 1.89s
...
进度: 10/100 (25.67s)

进度: 20/100 (48.23s)
...
```

### 2. 汇总报告（summary.txt）

每个测试完成后会生成一个汇总报告，包含：

- 总测试次数
- 总耗时
- 胜负统计（good/evil 各多少次）
- 玩家数量分布
- 平均游戏天数/夜数

**查看方式：**

```bash
# Windows PowerShell
cat tests/simulation_logs/trouble_brewing/summary.txt

# Windows CMD
type tests\simulation_logs\trouble_brewing\summary.txt

# 或者直接用文本编辑器打开
notepad tests/simulation_logs/trouble_brewing/summary.txt
```

**示例汇总报告：**

```
================================================================================
暗流涌动游戏模拟测试汇总报告
================================================================================

总测试次数: 100
总耗时: 245.67秒

胜负统计:
  good: 52次 (52.0%)
  evil: 48次 (48.0%)

玩家数量分布:
  9人: 12次
  10人: 15次
  11人: 18次
  12人: 20次
  13人: 15次
  14人: 12次
  15人: 8次

平均游戏天数: 3.45天
平均游戏夜数: 3.45夜

详细日志文件保存在: tests/simulation_logs/trouble_brewing/
```

### 3. 详细日志文件

每个游戏对局都会生成一个详细的日志文件，文件名格式：

```
game_001_good_12players.log
game_002_evil_9players.log
```

**文件名说明：**
- `game_001` - 第1局游戏
- `good` / `evil` - 获胜方
- `12players` - 玩家数量

**日志文件包含：**

1. **游戏初始化信息**
   - 玩家数量
   - 角色分配
   - 座位安排

2. **每个阶段的详细信息**
   - 夜晚行动顺序
   - 白天提名和投票
   - 每个角色的状态变化

3. **说书人提示**
   - 每个阶段控制台显示的提示内容

4. **弹窗信息**
   - 每个阶段是否有弹窗
   - 弹窗的内容

5. **游戏状态快照**
   - 每个阶段所有角色的状态
   - 死亡、中毒、醉酒、保护等状态

**查看日志文件：**

```bash
# 查看第一局游戏的日志
cat tests/simulation_logs/trouble_brewing/game_001_good_12players.log

# 或者用文本编辑器打开
notepad tests/simulation_logs/trouble_brewing/game_001_good_12players.log
```

## 🔍 日志文件内容示例

每个日志文件的结构如下：

```
================================================================================
游戏 #1 - 暗流涌动
================================================================================

[初始化] 游戏 #1 - 玩家数 12，阵容建议 {"total":12,"townsfolk":7,"outsider":2,"minion":2,"demon":1}
[身份分配] 1:洗衣妇 | 2:图书管理员 | 3:调查员 | 4:厨师 | 5:共情者 | 6:占卜师 | 7:送葬者 | 8:僧侣 | 9:守鸦人 | 10:投毒者 | 11:间谍 | 12:小恶魔

=== 首夜 ===
[夜晚] 洗衣妇(1) 得知两名玩家中有一名是镇民：2号-图书管理员、3号-调查员
[夜晚] 图书管理员(2) 得知一名玩家是外来者或镇民：4号-厨师
[夜晚] 调查员(3) 得知一名玩家是爪牙或恶魔：10号-投毒者
[夜晚] 厨师(4) 得知有多少对邪恶玩家相邻：1
[夜晚] 共情者(5) 得知有多少名邪恶玩家是邻近的：1
[夜晚] 占卜师(6) 选择了2号、3号，得知其中是否有恶魔：否
[夜晚] 僧侣(7) 保护了8号-守鸦人
[夜晚] 投毒者(10) 毒了 玩家5-共情者
[夜晚] 小恶魔(12) 杀死了9号-守鸦人

=== 第1天白天 ===
[提名] 玩家1-洗衣妇 提名 玩家10-投毒者 | 票数 8/11 (需要 6) | 处决
[白天] 投毒者(10)被处决

=== 第2夜 ===
...
```

## 🧹 自动清理机制

为了保持项目文件大小，系统已实现自动清理机制：

### 1. 测试启动时自动清理

**每次运行测试时，会自动删除该剧本之前的测试结果文件。**

例如，运行 `npm run test:simulation:tb` 时，会先清理 `trouble_brewing` 目录下的所有旧文件，然后开始新的测试。

### 2. 项目启动时自动清理

**每次启动开发服务器或生产服务器时，会自动清空所有测试结果文件。**

- 运行 `npm run dev` 时，会先清理所有测试日志
- 运行 `npm run start` 时，会先清理所有测试日志

### 3. 手动清理

如果需要手动清理测试结果，可以使用：

```bash
# 清理所有测试结果
npm run clean:test-logs

# 或直接运行清理脚本
node tests/cleanup_simulation_logs.js --all
```

## ⚠️ 注意事项

1. **编码问题**：在 Windows PowerShell 中，控制台输出可能显示中文乱码，但**不影响测试功能**，所有日志文件中的中文都是正常的。

2. **磁盘空间**：每次测试会生成约 100 个日志文件，每个文件约 50-200KB，总共约 10-20MB。由于有自动清理机制，不会无限累积。

3. **测试超时**：如果测试运行时间超过 5 分钟，Jest 会报超时错误。可以增加超时时间：
   ```bash
   jest tests/simulation_trouble_brewing.test.js --testTimeout=600000  # 10分钟
   ```

4. **并行运行**：可以同时运行多个测试，但会占用更多系统资源。

5. **清理机制**：自动清理会在测试开始前或服务启动前执行，不会影响正在运行的测试。

## 🐛 常见问题

### Q: 测试运行失败，提示 "Cannot find module"
**A:** 确保已安装所有依赖：
```bash
npm install
```

### Q: 测试运行很慢
**A:** 这是正常的，100次模拟游戏需要时间。可以：
- 减少测试次数（修改测试文件中的循环次数）
- 使用更快的电脑
- 只运行单个测试而不是全部

### Q: 如何只运行一次测试而不是100次？
**A:** 修改测试文件中的 `main()` 函数，将循环次数从 100 改为 1：
```javascript
for (let i = 1; i <= 1; i++) {  // 改为 1
  // ...
}
```

### Q: 如何查看特定游戏的日志？
**A:** 日志文件按游戏编号命名，例如：
- `game_001_*.log` - 第1局
- `game_050_*.log` - 第50局
- `game_100_*.log` - 第100局

## 📝 下一步

运行测试后，你可以：
1. 查看汇总报告了解整体情况
2. 查看具体日志文件分析游戏流程
3. 根据日志发现潜在的BUG
4. 对比不同剧本的测试结果

祝测试顺利！🎮

