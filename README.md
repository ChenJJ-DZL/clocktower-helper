# 🩸 血染钟楼 · 线上说书人辅助魔典

> Blood on the Clocktower — Storyteller Grimoire Web App

## 🌐 在线体验

| 节点 | 地址 |
|------|------|
| 🌐 全球节点（Vercel 托管） | https://clocktower-helper.vercel.app/ |
| 🇨🇳 中国大陆直连节点 | http://baigangroup.fun/ |

## 📚 内置 8 大完整剧本

| 剧本 | 英文代号 | 难度 |
|------|---------|------|
| 暗流涌动 | Trouble Brewing (TB) | 初学者 |
| 黯月初升 | Bad Moon Rising (BMR) | 中等 |
| 梦殒春宵 | Sects & Violets (S&V) | 中等 |
| 无名之墓 | Tomb of the Unknown | 中等偏难 |
| 窃窃私语 | Whispering Secrets | 中等 |
| 无上愉悦 | High Pleasure | 简单 |
| 凶宅魅影 | Haunted Manor | 困难 |
| 游园惊梦 | Garden of Dreams | 中等 |

## 🎭 核心亮点

- **全量 200+ 角色** 覆盖镇民/外来者/爪牙/恶魔/旅行者/寓言角色，每个角色均实现独立能力管道
- **6 大深层语义引擎**：疯子假恶魔映射 / 酒鬼认知覆盖 / 弄蛇人阵营互换 / 筑梦师多候选信息 / 哈迪哈生死抉择 / 卡扎丽爪牙转恶魔
- **寓言传奇（Fabled）全局 BUFF 插件**：象牙之魂、哨兵、革命家、末日使者、佛吉、地狱图书管理员、佛教徒、天使
- **自动化夜晚拓扑流转**：动态唤醒队列、首夜/非首夜独立顺序表、醉酒/中毒状态传播
- **时光倒流 Undo/Redo**：原子动作级撤销（夜间单角色行动、白天单次投票、提醒标记增删均可独立回退）
- **自定义剧本工坊**：自由组合角色创建剧本、JSON 导入/导出、阵容合法性自动校验
- **高清复盘长图导出**：一键生成对局复盘截图（html2canvas），支持移动端/桌面端
- **多端响应式**：桌面 (1440px) / 平板 (834px) / 移动 (390px) 三端自适应，毛玻璃深色魔典风格

## 🎨 双主题系统（W8.22.1 起）

魔典 UI 进入**双主题架构**时代——同一套状态机与交互逻辑，两套视觉语言，一键切换、无刷新过渡：

- **✨ 现代 (Modern)** — 暗黑哥特拟物风（默认主题）
  - 深邃暗夜黑曜石暗角渐变背景，磨砂玻璃悬浮顶栏
  - 拟物圆桌代币：金属边缘高光 + 立体内阴影，按阵营散发微光（镇民圣堂金 / 外来者幽光翡翠 / 爪牙焦木琥珀 / 恶魔猩红魔火）
  - 死亡玩家覆盖干裂纹理与血色印记
  - 中央复古法阵罗盘环绕阶段/计时器，倒计时荧光呼吸动效
  - 右侧控制台渐进式信息精简：角色说明折叠为极简手风琴（📖 查看完整规则 Wiki），主操作按钮流光渐变边框
  - 悬浮注解系统：Hover/点击任意代币弹出深色羊皮纸卡片（角色全称 / 阵营 / 一句话能力 / 当前状态标记）
- **🏛️ 经典 (Classic)** — 高对比扁平风完整回退
  - 纯色深蓝底、扁平实心代币，右侧说明默认平铺展开，老玩家零迁移成本

主题偏好持久化于 localStorage；切换入口位于顶栏左侧胶囊。实现上仅作用于渲染层（Tailwind v4 `@custom-variant` 作用域 CSS），核心状态机与既有 data-testid 完全不变。

## 🚀 本地开发

```bash
npm install
npm run dev      # 启动开发服务器 (http://localhost:3000)
npm run test     # 运行 vitest 单元测试 (475+ tests)
npm run build    # 生产构建 (Next.js standalone)
```

## 🧪 E2E 测试

```bash
cd test_automation
npx playwright test --config=playwright.config.js
```

覆盖 26 个 Playwright E2E 测试：全功能模块 / 随机对局 Fuzzing / 多端视觉断言

## 📦 技术栈

Next.js 15 + React 19 + TypeScript + Tailwind CSS 4 + Vitest + Playwright

---

*拜甘教成员-大长老 出品*
