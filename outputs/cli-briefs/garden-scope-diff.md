# 任务：梦殒春宵（S07–S10）25 角色「官方分支 × 实现」差集清单

你在仓库根 `C:/Users/chenj/WorkBuddy/血染说书人/clocktower-helper` 工作。

## 目标（只读 + 产出一份 markdown，不改任何产品代码、不改测试）

产出一份**可直接照着写用例**的差集清单，供主控会话继续做逐角色验收。

## 输入

1. `src/data/officialRoleDocs.json` —— 每个角色一个 key（中文名），正文含
   `【角色能力】` `【角色简介】` `【范例】` `【运作方式】` `【提示标记】` `【规则细节】`。
2. `src/roles/new_engine/<role_id>.ability.ts` —— 新引擎实现（`targetConfig` /
   `preCheck` / `calculate` / `stateUpdate` / `postProcess`）。
3. `e2e/garden_of_dreams/role_scenarios.spec.ts` —— 现有 E2E 断言。
4. `outputs/scenes.json` —— 场次编排（S07 15 人 / S08 9 人 / S09 9 人 / S10 15 人）。

## 剧本「梦殒春宵」的 25 个角色（中文名 → 角色 id）

钟表匠 clockmaker、筑梦师 dreamer、舞蛇人 snake_charmer、数学家 mathematician、
卖花女孩 flowergirl、城镇公告员 town_crier、神谕者 oracle、博学者 savant、
女裁缝 seamstress、哲学家 philosopher、艺术家 artist、杂耍艺人 juggler、
贤者 sage、畸形秀演员 mutant、心上人 sweetheart、理发师 barber、呆瓜 klutz、
镜像双子 evil_twin、女巫 witch、洗脑师 cerenovus、坑道巫婆 pit_hag、
方古 fang_gu、亡骨魔 vigormortis、诺-达 no_dashii、涡流 vortox。

> ⚠️ 若某个中文名在 `officialRoleDocs.json` 里找不到，**照实记录「文档缺失」**，
> 不要自己编规则。

## 产出格式（写到 `outputs/梦殒春宵-角色差集-2026-10-22.md`）

```
# 梦殒春宵 25 角色 · 官方分支 × 实现 × 现有断言 差集

| # | 角色(id) | 官方能力(逐字摘录，一行) | 实现要点(targetConfig/关键分支) | 现有 E2E 断言 | 缺口(要有/要补) |
|---|---|---|---|---|---|
```

每行都要有具体内容，禁止「见代码」「同上」。缺口列只写**可验证的**分支，例如：
- 「方古转化外来者后自己死亡 ⇒ 红唇女郎不继承」
- 「亡骨魔杀死爪牙 ⇒ 该爪牙保留能力」
- 「诺-达选择与上一夜相同目标 ⇒ 说书人告知必须换」

## 硬性约束

1. **不得修改任何 `src/` `app/` `e2e/` 下的文件**（本任务只产出 1 份 md）。
2. 不要跑 `next build` / `playwright test`（会占用 3100 端口和 `.next`）。
3. 每条结论必须能追到 `officialRoleDocs.json` 的原文或 `ability.ts` 的具体行号。
4. 表里 25 行一个都不能少；缺文档的角色也要占一行并注明「文档缺失」。

## 验收

- `outputs/梦殒春宵-角色差集-2026-10-22.md` 存在；
- 表格 25 行 + 表头，无空单元格；
- 至少 8 行在「缺口」列给出具体可测分支；
- `git status --short` 里 `src/` `app/` `e2e/` 无改动。
