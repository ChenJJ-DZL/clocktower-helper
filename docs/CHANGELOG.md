# 更新日志

## W9.4.2 — 伪装开局弹窗 + 杂耍艺人裁定闭环 + 黄昏点击提名 + 首夜入夜守卫（2026-09-04）

### 一、伪装身份与特殊角色开局规则校准
1. **提线木偶（Marionette）严格邻座与伪装设定**：
   - 保证提线木偶与恶魔（或小怪宝时的爪牙）物理相邻，落座时保持原角色，必须由说书人右键选择“设置伪装”或通过下一步强制弹窗手动选择；
   - 新增 `CharadeConfigModal`（提线木偶、酒鬼、疯子伪装身份配置弹窗），支持说书人手动点选或一键随机分配不在场的有效角色；
   - 彻底将伪装身份（`charadeRole` / `apparentDemonRole`）与真实身份分离，魔典视图呈现真实/伪装双重视图。

### 二、规则对齐与技能优化
1. **占卜师天敌红罗刹规则对齐**：
   - 严格落实“邪恶玩家绝不能是红罗刹”规则：当赏金猎人导致某玩家转变为邪恶阵营时，该玩家绝不能作为红罗刹候选；若已有红罗刹标记，自动剥离并重新指派给真正的善良玩家。
2. **赏金猎人得知信息精准化与防速死机制**：
   - 夜间得知邪恶玩家信息严格对齐：“X号玩家是邪恶的”；
   - 只要场上有其他邪恶玩家（如被转邪恶的镇民、爪牙等），赏金猎人优先得知非恶魔的其他邪恶玩家，避免首夜直接暴露恶魔导致游戏闪电结束。
3. **杂耍艺人（Juggler）真实有效发动闭环**：
   - 白天技能面板新增裁定结果弹窗（`JugglerJudgeModal`），清晰展示全场所有人的座位号与角色，并提供 0~5 的数字确认按钮；
   - 说书人手动确认其猜对次数后予以记录；
   - 当夜唤醒杂耍艺人时，精准展示“得知的数字为 X”，手势比划 X。

### 三、交互体验升级：黄昏点击魔典座位发起提名
1. **魔典座位号独立点击触发提名**：
   - 魔典圆桌左上角的序号徽标升级为交互式按钮，在黄昏提名阶段 hover 与点击有放大和金色脉冲高亮反馈；
   - 点击 1 号激活发起提名（金色呼吸脉冲，显示 `📣 提名中` 徽标），再次点击取消激活；
   - 激活后点击 2 号自动弹出“📣 确认发起提名”弹窗（`🎯 被提` 徽标），确认后直接触发技能判定与举手计票面板；
   - 与控制台原有资格矩阵卡片双向联动。

### 四、首夜入夜空队列死锁排查与彻底修复
1. **入夜合法性前置拦截与友好提示**：
   - 修复未分配角色或少于 5 人时能误进核对阶段的漏洞，增加人数（$\ge 5$ 人）与恶魔角色的前置强校验；
   - 控制台“确认无误，入夜 🌙”在未就绪时禁用并给出醒目文字说明；
2. **首夜空队列智能容错**：
   - 修复首夜全员无唤醒技能时（如军团 + 罂粟种植者阻止恶魔爪牙互认）夜间队列为空导致系统静默卡死的问题；
   - 系统自动提示“🌙 首夜平安度过：场上所有角色在首夜均无唤醒行动，直接进入第一天”，并自动平滑过渡至第一天白天，彻底杜绝死锁。

### 五、验证结果
- Vitest 全量回归：**130 测试文件 / 942 项测试 100% 全部通过**。
- TypeScript：`npx tsc --noEmit` 0 错误。
- 生产构建：`npm run build` 成功。

## W8.28.1 — 干扰机制原则重构 + 白天控制台布局优化 + 全弹窗文字自适应（2026-08-28）

### 一、干扰机制与身份判断重构
1. **“该造成干扰的，默认都造成干扰”全局原则确立与落地**：
   - **陌客（Recluse）**：默认注册为邪恶 / 爪牙 / 恶魔。全量联动厨师、共情者、占卜师（返回恶魔）、猎手（射杀击杀）、调查员（作为爪牙候选）、贵族（作为邪恶候选）、骑士（排除在非恶魔外）、神谕者（计入死亡邪恶）、女裁缝（邪恶阵营）、贞洁者（不触发处决）、城镇公告员（提名计为爪牙提名）。
   - **间谍（Spy）**：默认注册为善良 / 镇民 / 外来者。全量联动洗衣妇（作为镇民候选）、图书管理员（作为外来者候选）、调查员（隐藏不暴露）、贵族（作为善良候选）、神谕者（不计入死亡邪恶）、女裁缝（善良阵营）、贞洁者（提名触发处决）、城镇公告员（提名不计为爪牙提名）。
   - **魔术师（Magician）**：爪牙互认中展示为恶魔；恶魔互认中展示为爪牙。
   - **占卜师红罗刹（Red Herring）**：查验必定返回恶魔。

### 二、说书人控制台（白天阶段）布局升级
1. **控制台区域重组（从上至下）**：
   - **第一位：🎭 阵营快捷调整**（聚合在场且有阵营判定的角色，仅在场时显示，支持陌客/间谍/政治家/呆瓜等实时切换）。
   - **第二位：⚡ 可用主动技能**（聚合在场存活且有白天技能的角色，仅在场时显示）。
   - **第三位：📖 说书人Tips**（原“角色说明”重命名为“说书人Tips”，极简折叠手风琴 Wiki 指引）。

### 三、弹窗与交互细节优化
1. **技能确认框与结果框文字排版**：
   - 优化恶魔互认、管家、占卜师等角色弹窗排版，座位范围与角色范围大字换行展示，省略多余冒号。
   - 弹窗文字自动缩放与防溢出保护。
2. **全局隐私保护**：
   - 身份展示翻牌完毕点击“完成展示，返回入夜”时默认启用全局遮罩。

### 四、验证结果
- **Vitest 全量测试**：118 个测试文件、889 项测试全部通过（100% PASS）。
- **TypeScript**：`npm run type` 0 错误通过。

## W8.27.2 — 《罂粟花开》四轮收尾：军团集成 + 首夜互认 + 测试全量转绿（2026-08-27）

### 一、规则与引擎收尾
1. **军团 setup 反转集成**（`useSeatManager.ts` + `legionSetupSwap.ts`）：选人换入 `legion` 时，全桌善良/邪恶角色类型按官方 setup 规则反转，`displayRole` 同步并写入变更日志。
2. **军团首夜互认**（新增 `legion_mutual_recognition` 步骤）：打通夜晚引擎队列、动态队列生成、夜间提示、纯展示步骤推进和游戏控制器步骤表；所有军团在首夜作为一组同步互认。
3. **洗脑师官方行为校准**（`cerenovus.ability.ts`）：修正死亡判定字段；死亡玩家仍可被指定为“必须疯狂”的目标。

### 二、测试与质量收尾
1. 补齐图书管理员、厨师、占卜师、僧侣、神谕者、农夫、市长、男爵、罂粟种植者等 Poppyganda 独立集成测试。
2. 统一测试座位的 `isAlive` 引擎契约，修复小精灵、贤者、城镇公告员等能力的状态读取边界。
3. 清零受影响代码的 TypeScript 与 Biome 问题。

### 三、验证结果
- Vitest 全量回归：**113 文件 / 851 用例全部通过**。
- TypeScript：`npm run type` 通过。
- 生产构建：`npm run build` 成功。
- 循环依赖检查：存在 1 条历史架构链路（`abilityRegistry → actor.ability → middlewarePipeline → globalRuleEngine`），本轮未引入；后续单独重构。

### 四、遗留
- 赏金猎人与小精灵的 Wiki 六段式副本仍需外部网络抓取，当前列为外部资源阻塞。

## W8.27.1 — 《罂粟花开》二轮规则校准：边界修复 + UI 徽章 + 提线木偶 setup 邻座（2026-08-26）

### 一、规则校准二轮
1. **厨师 / 占卜师 Recluse/Spy 判定改为 50% 概率**（`chef.ability.ts`、`fortune_teller.ability.ts`）：从 100% 改为 `Math.random() < 0.5` + 4 个 `storytellerInput.forceChefRecluseEvil/Spy/forceFtRecluseDemon/forceFtSpyGood` 注入点（稳定测试用）
2. **农夫 6 项边界**（`farmer.ability.ts:102-133`）：`stateUpdate` 清除 `statusEffects` 中的 `cannibal_farmer / philosopher_farmer / pixie_farmer` 标记 + 置 `hasAbilityEvenDead = false` + 清 `acquiredAbilities`
3. **罂粟种植者变农夫后保留迷雾**（`poppy_grower.ability.ts:35-65`）：`calculateResult` 通过 `originalPoppyGrowerSeatId` 字段识别被转农夫的原罂粟种植者
4. **提线木偶 setup 邻座**（`marionette.ability.ts:78-103`）：`IRoleAbility` 加 `onSetup?` 字段；marionette 实现邻座恶魔分配 + `marionetteMasterSeatId` 字段；`calculate` 优先用 `onSetup` 写入的 master
5. **疯子戏子相克**（`lunatic.ability.ts:55-58`）：`preCheck` 显式注释，依赖 `abilityPriorityMiddleware` 醉酒判断时跳过疯子
6. **镜像双子完整测试**（`evil_twin_winner_block.test.ts` 3 用例）：覆盖双存活阻止善良获胜 + 双存活时邪恶过半胜 + 邪恶双子死后阻挡解除

### 二、新增 UI 徽章 + 右键菜单
1. **SeatNode 罂粟迷雾徽章**（`SeatNode.tsx:485-498`）：「🌺 罂粟迷雾」徽章（基于 `s.role?.id === "poppy_grower"`）
2. **NightActionPage 涡流世界徽章**（`NightActionPage.tsx:453-458`）：「🌪️ 涡流世界 · 镇民信息将反相」（基于 `nightInfo.effectiveRole.id === "vortox"`）
3. **PlayerContextMenu 3 个新按钮**（`PlayerContextMenu.tsx:303-342` + `useInteractionHandler.ts:628-678`）：
   - 🦂 畸形秀演员暴露切换（`mutant_reveal`）
   - 🎭 小精灵疯狂证明状态切换（`pixie_madness`）
   - 🧠 洗脑不疯狂 → 立即处决（`cerenovus_execute`）

### 三、IRoleAbility 扩展
- `src/roles/core/roleAbility.types.ts:113-114` 新增 `onSetup?` 字段，让新引擎 ability 也支持 setup 阶段钩子（提线木偶 + 后续角色可挂 setup 逻辑）

### 四、统计
- **53/68 项 ✅ DONE**（含 W8.27.0 34 项 + W8.27.1 19 项），总体完成度 **78%**（含 PARTIAL 为 94%）
- 11 项 PARTIAL + 4 项 NOT DONE（明确为后续 PR）— 详见 `tests/plans/poppyganda-official-vs-implementation-diff-plan.md` 第〇节"完成度追踪"
- 测试：93/793 全绿；build success
- 计划文件：`tests/plans/poppyganda-official-vs-implementation-diff-plan.md`（含 53 项 DONE + 11 项 PARTIAL + 4 项 NOT DONE 详细表）

## W8.27.0 — 《罂粟花开》（Poppyganda）24 角色官方规则校准：涡流 + 军团 + 核心能力重写（2026-08-26）

### 一、24 角色官方规则对比与校准（按计划文件 tests/plans/poppyganda-official-vs-implementation-diff-plan.md 落地）

#### 1. 角色图鉴 A1 — 补全「运作方式」与「规则细节」分区
- `src/components/modals/RoleCodexModal.tsx` 新增「📋 运作方式」+「⚖️ 规则细节」两个分区，渲染 6 段式 Wiki 内容（来自 `getCharacterWikiDetails.operation` / `ruleDetails`）。

#### 2. 角色图鉴 A2 — 6 角色 Wiki 副本补全
- 新增 `src/data/poppyganda_official_extras.json`（不污染 `json/` 目录），收纳罂粟种植者 / 告密者 / 提线木偶 / 军团的 6 段式官方说明（抄自 `docs/poppyganda_official_spec.md`）。
- `src/utils/characterWikiLookup.ts` 把 extras 注入 4 个 lookup 索引。赏金猎人和小精灵待后续补全（需 GStone Wiki 网络抓取，credit 耗尽暂缓）。

#### 3. 涡流（B11-B15）专项
- `src/utils/abilityPriorityMiddleware.ts` 第 47-58 行改用 `charadeRole.type ?? role.type` 触发涡流反相：① 提线木偶（minion + charadeRole=townsfolk）被反相；② 酒鬼（outsider）按官方规则豁免，不被反相。
- `app/gameLogic.ts` 第 661-672 行新增 `lastAction === "check_phase" && isVortoxWorld && !todayHasExecution` 分支：每个黄昏（白天结束）若今日无任何处决，邪恶阵营立即获胜——之前漏掉此分支。

#### 4. 军团（Legion）B12-B14 专项
- `src/utils/dynamicQueueGenerator.ts` 第 240-266 行新增：军团在场时把 `demon_info` 节点按军团数量展开，每个军团独立获得一份「3 个不在场镇民身份」伪装——之前漏掉此分支。
- 6 角色 6 段式 Wiki（含军团）已在 codex 可见。
- 军团 setup 反转（B12 完整反转）作为架构性变更留作后续 PR。

#### 5. 镜像双子（B9）确认
- `app/gameLogic.ts` 行 552-578 已正确实现「两双子均存活时阻止善良获胜」；本轮通过 `evil_twin_winner_block.test.ts`（3 用例）覆盖验证。

#### 6. 重写 3 个偏离官方机制的能力
- **赏金猎人**（`bounty_hunter.ability.ts`）：引入 `bountyHunterKnownTargets: number[]` 维护已告知列表，排除重复；新增 `isRotationTrigger` 标记支持死亡轮转（该 player 死亡后当晚再次告知另一名邪恶玩家）。
- **小精灵**（`pixie.ability.ts`）：重写为两阶段机制：首夜告知一个在场镇民角色（存入 `pixieMadnessRoleId`），不立即获得能力；该镇民死亡时通过 `pixieCopiedRole` 字段被动获得能力。兼容旧测试（保留 `statusDetails: "伪装身份:..."`）。
- **告密者**（`snitch.ability.ts`）：删除「≥2 爪牙暴露身份」分支，重写为「首夜向所有存活爪牙推送 3 个不在场角色」；支持 marionette 相克（marionette 跳过 + 恶魔额外推送）。

#### 7. 杂耍艺人首日守卫
- `src/roles/new_engine/juggler.ability.ts` 新增 `firstDayOnlyCheck` 中间件：仅首个白天（`dayCount === 1`）可猜测。

### 二、新增测试套件（共 30 用例）
- `src/roles/__tests__/integration/vortox_ability_passthrough.test.ts`（9 用例）：能力优先级中间件对各类角色的 abilityEffective 判定（普通镇民/酒鬼豁免/提线木偶/爪牙/恶魔/外来者 + 优先级 barista > vortox > drunk/poisoned）。
- `src/roles/__tests__/integration/legion_setup_swap.test.ts`（6 用例）：军团伪装复数化（1/3/5 军团场景 + 与罂粟种植者共存）。
- `src/roles/__tests__/integration/evil_twin_winner_block.test.ts`（3 用例）：镜像双子均存活时阻止善良获胜。
- `src/roles/__tests__/integration/vortox_dusk_win.test.ts`（3 用例）：涡流黄昏阶段判定（无今日处决 → 邪恶胜；有处决 → 阻止）。
- `tests/wiki-scenarios/poppyganda_outsiders.test.ts` 告密者两 case 更新以适配新 API（minionSeatIds + absentRoles）。

### 三、统计
- Baseline：89 files / 772 cases
- 当前：**93 files / 793 cases**（+4 文件 / +21 用例 / +21 修改）
- 全部 100% 绿灯通过。
- `npm run build`：0 报错（上一轮已验证）。
- `npm run type`：10 个预先存在的错误（lunatic.test.ts、virgin.test.ts 历史遗留），本轮未引入新错误。

### 四、范围外（后续 PR）
- 军团 setup 完整反转（B12 完整实现）需要重写 `app/data.ts` 角色池结构 + `useSeatManager` 步骤。
- 7 角色小机制边界（savant UI / mutant 暴露检测 / cerenovus 疯狂处决 / farmer 6 项边界 / lunatic 首夜伪装 / marionette 邻座 / town crier 标记 / juggler/savant UI 模态）。
- 4 角色 6 段式 UI 模态（JugglerGuessModal / SavantInfoEditor / ApparentDemonRoleSelector / 畸形秀演员暴露按钮）。
- 赏金猎人和小精灵的 Wiki 副本补全（需网络抓取）。

## W8.26.4 — 《暗流涌动》（Trouble Brewing）8 大交互增强与官方规则深度落地（2026-08-26）

### 一、8 项核心交互与规则调整
1. **洗衣妇 / 图书管理员 / 调查员 / 厨师夜间自动推荐与说书人微调双模式**：
   - 默认根据场上状态自动生成合规完整信息；全屏夜间行动页（`NightActionPage.tsx`）内置折叠微调面板，支持说书人自由指定候选人、展示角色（包含酒鬼真实徽章）及厨师 `+/-` 邻座对数，并提供一键重置。
2. **占卜师“红罗刹”官方命名全面规范**：
   - 全系统彻底规范为“**红罗刹**”，状态药丸、日志与查验反馈卡统一标示「🎯 红罗刹」。
3. **贞洁者首次被提名永久消耗**：
   - 校准提名者真实身份（酒鬼为外来者不触发处决）；无论首位提名者是谁，被提名一次后贞洁者能力永久消耗。
4. **杀手射杀小恶魔联动红唇女郎即时继承**：
   - 射杀小恶魔时，若场上有合格红唇女郎（死前≥5人），即刻宣布原小恶魔死亡并完成恶魔继承，不提前误判游戏结束。
5. **镇长恶魔夜杀三选一弹刀选择器**：
   - 恶魔夜杀选中镇长时弹出交互卡：① 镇长死亡；② 弹刀给指定存活玩家（可在所有存活玩家中选择）；③ 弹刀给免疫目标（平安夜）。
6. **陌客白天快捷注册切换**：
   - 在白天控制台与右键菜单中增加「🎭 陌客注册切换」，支持随时在「😈 邪恶（爪牙/恶魔）」与「😇 善良（外来者）」之间实时切换生效。
7. **间谍魔典左侧视图对齐说书人视角**：
   - `SpyGrimoireModal.tsx` 左侧座位排版、阵营光晕与状态药丸（中毒、醉酒、守护、红罗刹、继任、提醒标记）与说书人圆桌完全对齐。
8. **小恶魔自杀传刀指定爪牙交互（不受人数限制）**：
   - 小恶魔夜杀自选时展开存活爪牙候选列表；**不受人数限制**（无论存活几人，只要有存活爪牙即可触发传刀）；若有存活红唇女郎，默认高亮推荐「🌟 推荐 (红唇女郎)」并排在首位，支持直接点击指定继承人。
9. **测试与构建验证**：
   - 全库 86 个测试套件 761 个用例 100% 绿灯；`npm run build` 0 报错通过。

---

## W8.26.3 — 《暗流涌动》（Trouble Brewing）全 22 角色官方百科规则深度校准与专项测试落地（2026-08-26）

### 一、《暗流涌动》全 22 角色官方规则校准
1. **红唇女郎 (Scarlet Woman) 恶魔继任阈值校准**：
   - 官方百科规则："如果在恶魔死前有 5 名或更多玩家存活（即死后剩余 ≥ 4 名幸存者，不含旅行者），红唇女郎立刻变成恶魔。"
   - 修复了 `scarlet_woman.ability.ts` 与 `app/gameLogic.ts` 中死后存活人数判定（恶魔死后存活 `≥ 4` 人即可触发继任），消除了 5 人局恶魔死后误判人数不足的边界缺陷；
   - 在小恶魔（Imp）自杀传刀中，若红唇女郎健康存活且死前 ≥ 5 人，自动优先继承为小恶魔。
2. **送葬者 (Undertaker) 查验死去的酒鬼**：
   - 官方百科规则："如果被处决的玩家是酒鬼，你将会看到真实角色【酒鬼】的角色标记，而不是他以为的镇民角色。"
   - 修正了 `undertaker.ability.ts` 在白天死者为酒鬼时返回伪装角色的问题，确保送葬者准确得知真实角色「酒鬼」。
3. **杀手 (Slayer) 射击恶魔联动红唇女郎**：
   - 官方百科规则：若杀手射杀小恶魔，且场上有合格的红唇女郎（死前 ≥ 5 人），红唇女郎立即继承小恶魔，游戏继续进行而不提前判定好人获胜；若无红唇女郎则好人立即获胜。
4. **镇长 (Mayor) 恶魔夜杀替死候选人放宽**：
   - 官方百科规则：镇长在夜晚被恶魔杀害时，可由场上除镇长外的**任意存活玩家**（包含外来者、爪牙甚至是恶魔自己）代为死亡；
   - 若说书人指定的替代目标受到僧侣保护或具有免死能力（如士兵），则触发免死导致当晚无人死亡（平安夜）。
5. **自动化测试与构建验证**：
   - 新增 `src/roles/__tests__/integration/trouble_brewing_official_almanac.test.ts`（4/4 绿灯）；
   - 全量回归测试：**86 个测试套件，760 个测试用例 100% 绿灯全过**；
   - 生产打包 `npm run build`：0 报错成功通过。

---

## W8.26.2 — 全局保密防窥遮罩（Global Privacy Shield）与夜间自动交接保护（2026-08-26）

### 一、全局保密遮罩与防窥机制实现
1. **全局保密遮罩组件 (`GlobalPrivacyShield.tsx`)**：
   - 采用全屏最高层级（`z-[99999]`）暗色磨砂玻璃背景，完全遮蔽底层控制台、圆桌座位、行动面板与所有玩家角色信息；
   - 提供清晰醒目的交接引导文案与「👁️ 解除遮罩 · 继续行动」大按钮，支持点击背景、按空格/ESC 快捷解除。
2. **夜间技能交接自动遮罩保护**：
   - 在 `NightActionPage` 的「信息页与反馈」环节，玩家/说书人查看完结果并点击「确认并继续」时，系统**自动激活全局防窥遮罩**；
   - 上一个玩家行动结束后屏幕即刻进入保密保护状态，确保设备交接或移动过程中不发生任何信息窥探泄露；
   - 由说书人或下一位行动玩家主动点击解除遮罩后，平滑展开下一顺位角色的夜间行动页。
3. **左上角「相克规则」右侧常驻「遮罩」开关按钮**：
   - 在左上角「相克规则」按钮右侧新增「遮罩」切换按钮；
   - 图标随状态动态变化（未遮罩显示 `👁️ 遮罩（关）`，遮罩中显示 `🙈 遮罩（开）`）；
   - 支持说书人在任意环节（准备、检定、夜晚、白天、黄昏）一键实时开启或解除保密遮罩。
4. **自动化测试与构建验证**：
   - 新增 `src/components/game/__tests__/GlobalPrivacyShield.test.ts`（4/4 绿灯）；
   - 全量 `npm test`：**85 个测试套件，756 个测试用例 100% 绿灯通过**；
   - 生产打包 `npm run build`：0 报错成功通过。

---

## W8.26.1 — 军团（Legion）官方 9 大核心规则与状态机深度重构（2026-08-26）

### 一、军团（Legion）规则全面实现
1. **胜负判定体系（豁免邪恶过半速胜）**：
   - 军团开局占全场多数（如 10 人局 7 军团 3 善良），`app/gameLogic.ts` 中针对军团在场情况严格豁免常规的「存活邪恶 ≥ 存活善良」速胜判定。
   - **好人胜利**：所有军团均死亡时（`totalEffectiveDemons === 0`），善良阵营获胜。
   - **邪恶胜利**：存活善良玩家 ≤ 1 人（或存活总人数 ≤ 2 人且有军团存活），或者所有善良玩家均死亡。
2. **投票与处决判定（全邪恶投票判 0 票）**：
   - 在 `src/components/modals/VoteInputModal.tsx` 与 `src/hooks/useExecutionHandlers.ts` 中实现：当场上有军团时，若某项提名的投票者全部为邪恶阵营（无善良玩家举手），表决结果强制记为 **0 票**，处决宣告无效，并在 UI 与对局日志中高亮预警。
   - 若有至少 1 名善良玩家参与投票，则全额正常计票并结算处决。
3. **双重注册（恶魔 + 爪牙）**：
   - 在 `src/utils/gameRules.ts` 与 `app/gameLogic.ts` 中完善 `isPlayerDemon`、`isPlayerMinion`、`isPlayerEvil` 以及 `getRegistration`，使军团同时作为恶魔与爪牙注册（调查员/送葬者/筑梦师等技能可正确按规则识别）。
4. **夜间行动与技能管线**：
   - 完善 `src/roles/new_engine/legion.ability.ts`，支持说书人每晚主导夜杀目标选择，并联动士兵免疫、僧侣保护、水手免死与市长弹刀等防御机制。
5. **控制台 UI 提示**：
   - 在 `src/components/game/console/GameConsole.tsx` 中增加军团专属全局规则卡片与夜间指引。
6. **自动化测试**：
   - 新建 `src/roles/__tests__/integration/legion_rules.test.ts`，10/10 专项用例全绿覆盖官方 9 大规则；
   - 更新 `tests/wiki-scenarios/poppyganda_demons.test.ts` 中的官方范例；
   - 全量 `npm test` 84 个测试套件 749 个用例 100% 绿灯通过；
   - `npm run build` 0 报错成功通过。

---

## W8.25.1 — 会话进度快照（2026-08-25）

> 本节为会话中断时的进度记录，供后续工作回顾与继续上手。

### 一、已完成并提交的工作（按提交顺序）

| 提交 | 内容 |
|------|------|
| `eb6e3f4` | 右键菜单「身份设定」按钮仅在酒鬼/提线木偶的 setup/check 阶段显示 |
| `c5115cd` | 罂粟花开镇民范例补全：赏金猎人 3 例 + 厨师陌客边界 1 例 + 农夫连锁/间谍 2 例（50/50 绿） |
| `77c28fe` | 罂粟花开 24 角色 UI 交互测试补全（24/24 绿，13 个缺失角色全部补齐） |
| `99a40df` | 移除结果弹窗 `.endsWith("_info")` 门槛，所有有 `displayInfo` 的角色都弹结果窗 |
| `b062bb2` | 新建 `NightActionPage` 全屏夜间行动页组件并接入 `GameStageWithModals` |
| `f7e3c61` | 结果内联展示进 NightActionPage（INFO_RESULT 不再单独弹窗） |
| `d38cb1f` | `IdentityShowcaseModal` 疯子分支：展示 `apparentDemonRole` 而非真实身份 |
| `7f73fff` | `useSeatManager.changeRole` 分配疯子时自动随机指派 `apparentDemonRole` |
| `c88b7af` | 停止页面加载时自动恢复对局；改为剧本选择页显示「继续上局/忽略」提示卡 |

### 二、本地未提交的构建修复（⚠️ 需提交）

- `app/page.tsx`：补 `useState` 与 `clearCurrentSnapshot` 的 import（此前构建报错）
- `src/components/game/NightActionPage.tsx`：补 `useState` import

### 三、验证状态

- vitest 全量：83 个测试文件全绿（含罂粟花开 82 范例 + 24 UI 交互）
- `npm run build`：Compiled successfully（修复 import 后）
- Playwright：桌面端 9/9 视觉断言通过（此前轮次）
- 服务器：http://localhost:3000 已启动（生产模式，任务 s9hlqp4j）

### 四、待用户验证的事项

1. **疯子身份卡**：分配疯子 → 右键身份告知 → 应显示伪装恶魔身份（如「小恶魔 · 恶魔·邪恶阵营」）而非「疯子」。注意：**必须重新分配角色**才会生成 `apparentDemonRole`（分配时机写入）。
2. **刷新恢复行为**：刷新页面应停在剧本选择页；有未完成对局时出现「继续上局/忽略」提示卡。
3. **全屏夜间行动页**：首夜每个角色唤醒时出现全屏遮罩页（角色卡+目标选择+确认按钮），结果内联展示；顶部导航栏保持可点。

### 五、已知遗留问题（下一步工作）

1. **军团 (Legion) 仍是占位实现**：官方 9 条规则中，恶魔/爪牙互认、仅邪恶投票零票、仅剩 1 善良判负、伪装可选等核心规则均未实现。探索报告已产出（见会话记录），修改点集中在：
   - `src/utils/dynamicQueueGenerator.ts`（minion_info/demon_info 分支支持军团）
   - `src/hooks/useExecutionHandlers.ts`（submitVotes 军团零票）
   - `app/gameLogic.ts`（checkGameEnd 军团专属胜负）
   - `VoteInputModal.tsx`（UI 警示与实际计票联动）
2. **lunatic.test.ts 存量类型错误**：6 处 `Property does not exist on type 'never'`（干净 main 上即存在，非本次引入，未修）。
3. **NightActionPage 与双主题样式适配**：未做 theme-classic/theme-modern 皮肤适配。
4. **NightActionPage 未端到端实测**：代码已提交但真实游戏流程中未人工验证完整链路。
5. **其他 7 个剧本角色 UI 交互测试**：仅罂粟花开完成双测试覆盖。
6. **移动端 E2E 功能测试失败**：PortraitLock 拦截点击，干净 main 上复现确认属存量环境问题。

### 六、关键文件索引

| 文件 | 作用 |
|------|------|
| `src/components/modals/IdentityShowcaseModal.tsx` | 身份告知卡片（疯子/酒鬼/木偶伪装展示） |
| `src/hooks/useSeatManager.ts` | 座位角色分配（疯子 apparentDemonRole 写入点） |
| `src/components/game/NightActionPage.tsx` | 全屏夜间行动页（新组件） |
| `src/components/game/GameStage.tsx` | `GameStageWithModals` 集成 NightActionPage |
| `src/hooks/useNightActionHandler.ts` | 夜间能力执行桥接 + 结果弹窗触发 |
| `app/page.tsx` | 页面根组件（pendingResume 恢复提示） |
| `src/components/game/setup/ScriptSelection.tsx` | 剧本选择页（继续上局卡片） |
| `src/utils/dynamicQueueGenerator.ts` | 夜间队列生成（军团改造目标） |

---

## W8.24.2 — 全剧本官方百科范例严密对齐 + 罂粟花开与内置全剧本深度集成测试 (2026-08-24)

### 核心功能与修复
1. **《罂粟花开》(Poppyganda) 剧本与机制完善**：
   - 罂粟种植者健康存活时首夜彻底阻断爪牙互认（`minion_info` 绝不入队），恶魔仅知 3 个不在场伪装而不获知爪牙和提线木偶。
   - 爪牙（镜像双子、洗脑师等）首夜按自身独立技能唤醒；告密者单独唤醒下发伪装。
   - 罂粟种植者死亡当晚自动生成邪恶互认夜序，唤醒爪牙与恶魔互认。
2. **全剧本官方百科真实范例与 UI 同步测试**：
   - 《暗流涌动》(22 角色)、《黯月初升》(25 角色)、《梦殒春宵》(25 角色) 及 5 个内置剧本（《窃窃私语》、《无名之墓》、《无上愉悦》、《凶宅魅影》、《游园惊梦》）全角色百科范例测试 100% 通过。
   - 补全 `abilityRegistry.ts` 中全部角色能力别名与类型定义，全库 76 个测试套件 626 项测试全部通过。

---

## W8.23.2 — 规则严谨性重构 + 弹窗体系标准化 + 自建剧本全流程打通 (2026-08-23)

> 详细工程复盘与根因分析请见文档：[POSTMORTEM_AND_ENGINEERING_GUIDELINES.md](./POSTMORTEM_AND_ENGINEERING_GUIDELINES.md)

### 修复与优化

1. **幽灵票资产全局唯一性**：修复死者幽灵票跨天被异常重置恢复的问题，严格锁定每局游戏只能使用一次。
2. **处决计票门槛公式纠正**：修正 14 人等特定存活人数下门槛计算与比较条件，确保达到 $\lceil N/2 \rceil$ 票数玩家正确进入处决席。
3. **处决不可跳过流转拦截**：处决未结算前禁止直接入夜，弹窗操作收敛为「返回」与「执行处决」。
4. **管家主人自选三层拦截**：首夜与非首夜全面禁止管家选择自己作为主人，交互层、夜间信息层与能力中间件层三重阻断。
5. **提名取消原子回滚**：实现 `cancelNomination`，取消提名时自动解除当个黄昏的发起人和被提名人限制并清除标记。
6. **游戏结束结算弹窗受控展示**：修复 `GameOverOverlay` 上下文读取，大标题展示阵营胜利与详细依据，支持本局复盘、长图导出与随时重唤。
7. **自建剧本全流程标准化**：`CustomScriptBuilderModal` 接入 `ModalWrapper`，支持官方模板快捷载入、角色实时搜索及「🚀 保存并立即开局」。
8. **座位状态标签布局体系重构**：“已提”与“被提”严格定位在序号右侧等高展示，状态标签沿圆环切线左对齐纵向并列。

---

## W8.8.2 — 暗流涌动 4 轮补测 + 信息一致性 + 死亡报告/恶魔队列修复 (2026-08-09)

> 针对「暗流涌动」剧本补测 4 轮完整对局（15/14/10/9 人随机标准配比，全部 FINISHED），
> 全程真实 UI 点击（Playwright + Chromium），重点核对技能结算与各处信息一致性。

### 修复

#### 🔴 P0: 死亡报告跨夜累积（deadThisNight 未重置）

**症状**：夜晚报告"昨晚15号、8号、5号玩家死亡"连续多夜重复出现旧死者名单，
第 1 局第 3 夜起每夜报告都包含此前所有死者。

**根本原因**：`deadThisNight` 只在游戏重置时清空，`enterNightPhase`（useGameFlow.ts）
与处决后自动入夜 `startSubsequentNight`（useExecutionHandlers.ts）都未清空，
导致死亡名单跨夜累积，送葬者等依赖 deadThisNight 的功能读取到历史数据。

**修复**：
- `useGameFlow.ts` `enterNightPhase`：进入夜晚时 `deadThisNight: []`
- `useExecutionHandlers.ts` `startSubsequentNight`（含队列为空兜底分支）：同样清空

**验证**：15 人局死亡报告"昨晚2号玩家死亡"单夜独立、无累积 ✅

#### 🔴 P0: 红唇女郎继承后新恶魔不在夜间队列

**症状**：第 1 天处决小恶魔 → 红唇女郎继承（魔典显示"5号 小恶魔"）→ 但第 2 夜
队列 [占卜师, 送葬者, 间谍] 完全没有新恶魔的杀人步骤，游戏拖长无法结束。

**根本原因**：`startSubsequentNight` 调用 `nightLogic.startNight(false)` 时，
`useNightEngine` 的 `startNight` 闭包捕获的是**旧 gameState**（处决/继承状态变更后
React 尚未重渲染），引擎快照未同步红唇继承 → `generateDynamicNightQueue` 找不到
存活恶魔 → 恶魔步骤缺失。

**修复**：`useNightEngine.ts` 新增 `gameStateRef` 持有最新 gameState；
`startNight`/`finalizeNightStart` 在启动前先用 ref 中的最新状态重建引擎快照，
确保红唇继承/处决死亡等最新状态进入引擎队列。

**验证**：固定阵容（红唇女郎+小恶魔）处决小恶魔后，第 2 夜队列
`[imp(5), fortune_teller(9), spy(4)]` 新恶魔 5 号正常在队列 ✅

#### 🟡 红唇女郎被动能力被错误排入夜间队列

**症状**：红唇女郎（纯被动触发）出现在夜间队列第一位（`scarlet_woman(5)`），
占用夜间步骤。

**根本原因**：`scarlet_woman.ability.ts` `otherNightPriority: 37` 误设数值，
而能力是 `triggerTiming: [PASSIVE]`（被动，无需唤醒），队列生成器按
`on > 0` 判定将其入队。

**修复**：`otherNightPriority: null`（与 firstNightPriority 一致，被动能力不入队）。

### 测试

- 4 轮完整对局（15/14/10/9 人）全部 FINISHED，0 console error / 0 pageerror
- 信息一致性核对：第 3 局投毒者毒调查员——控制台 guide"行动（受干扰）"与
  结算弹窗"【受干扰】"完全一致（受干扰标记 2+2 次同步）
- 幽灵票每日恢复、管家规则、间谍魔典、圣徒处决、酒鬼伪装全部正常
- 11 条记录均为预期行为（管家 alert + 酒鬼 warning）

---

## W8.8.1 — 真实UI随机对局测试修复 + 管家/投票/持久化/新角色 (2026-08-08)

> 本轮通过真实浏览器（Puppeteer + Edge）对「暗流涌动」剧本执行随机对局测试（随机落座、随机技能、随机提名/投票/处决），发现并修复以下问题。

### 修复

#### 🔴 P0: 管家（Butler）选主人后 masterId 从未同步到座位

**症状**：管家夜晚选择主人后，白天投票时弹窗报错「管家(1号)的票不计入：主人(1号)未投票」——主人显示为管家自己；且「移除管家投票后无有效投票者，本次投票作废」拦截 0 票结果。

**根本原因**：
1. 管家选主人后 `masterId` 只存在于引擎执行上下文，从未写回 `seat`，座位上的 `masterId` 一直为初始值 `null`；
2. `null !== undefined` 为 `true`，导致投票校验误判「主人未投票」；
3. 弹窗文案 `主人(${masterId + 1}号)` 中 `null + 1 === 1`，所以显示成管家自己（1号）。

**修复**：
- `useNightActionHandler.ts`：管家（及 Q宝）执行后，将 `masterId` 同步写回对应 `seat`
- `useExecutionHandlers.ts`：管家投票校验增加防御——`masterId` 为 `null/undefined/等于自己` 时不触发拦截
- `useExecutionHandlers.ts`：移除管家票后若剩余投票者为 0，不再弹「投票作废」，允许 0 票结果（无人举手 → 不处决，符合规则）

#### 🔴 P0: 0 票被拦截（不符合规则）

**症状**：提名后计票为 0 票时，系统弹窗「票数必须是自然数大于等于1的整数」，拒绝提交。

**根本原因**：`useExecutionHandlers.ts` 中校验 `v < 1` 拦截了 0 票；但规则上提名后 0 票合法（无人举手则无人上台、无人被处决）。

**修复**：`useExecutionHandlers.ts` 校验改为 `v < 0`，允许 0 票提交；下游 `isCandidate: v >= threshold` 逻辑本就能正确处理 0 票（不产生候选人）。

#### 🟡 localStorage 配额溢出（QuotaExceededError）

**症状**：长时间对局（数百步）后页面报 `QuotaExceededError`，快照保存失败，测试脚本 500 步后崩溃。

**根本原因**：每步操作都向 localStorage 写入完整快照（含完整 `history`），数据无限膨胀超出 5MB 配额。

**修复**：
- `useHistoryController.ts`：`history` 限长 200 条（`slice(-200)`），并防御 `JSON.parse(undefined)` 崩溃
- `persistence.ts`：游戏记录限长 30 条；`createSnapshotFromState` 增加 `safeJsonClone` 安全深拷贝（undefined/null 原样返回）

#### 🟡 能力管道 `meta.stateUpdates` 从未被消费

**症状**：赌徒/水手/吟游诗人/吟游歌手/造谣者/月之子等能力「计算了但不生效」（标记死亡、醉酒等不落地）。

**根本原因**：部分能力通过 `meta.stateUpdates` 下发结构化变更指令，但全项目无消费点。

**修复**：`useNightActionHandler.ts` 新增 `applyStateUpdates()`，在 `executeViaNewEngine` 执行完整管道后应用指令：
- `MARK_FOR_DEATH` → 标记目标死亡（赌徒猜错/造谣者声明正确/月之子诅咒）
- `CANCEL_DEATH` → 取消死亡（和平主义者处决不死亡）
- `ADD_DRUNK` / `MARK_ALL_FOR_DRUNK` → 使目标醉酒（水手/吟游诗人·吟游歌手）

#### 🟡 吟游诗人（Bard）被动未触发

**修复**：`useExecutionHandlers.ts` 处决处理中新增——爪牙死于处决时，除吟游诗人/爪牙/旅行者外的存活玩家醉酒直到明天黄昏。

#### 🟡 吟游歌手（Minstrel）被动未触发

**修复**：`useGameController.ts` 夜晚死亡结算中新增——夜晚有镇民死亡时，爪牙醉酒直到明天黄昏。

#### 🟡 造谣者（Gossip）白天声明缺失

**修复**：
- `GameStage.tsx`：白天新增「🗣 造谣声明」按钮（每天一次，说书人裁定真假，为真当晚额外死亡一人）
- `useGameFlow.ts`：每天重置造谣者声明状态（`gossipStatementToday/gossipTrueTonight/gossipSourceSeatId`）
- `useDayActions.ts`：`gossip` 加入白天技能列表
- `useGameController.ts`：新增 `setGossipTrueTonight/setGossipSourceSeatId/setGossipStatementToday` 状态

#### 🟡 其他

- `useGameState.ts`：`setDayAbilityForm` 支持函数式更新（`(f) => ({...f, info1})` 形式），修复白天技能弹窗状态覆盖
- `useGameFlow.ts`：新增过期引擎状态效果清理（`expiresAtNight/expiresAtDusk` 及数字 duration 的效果）

### 新增功能

- **新角色 Q宝（Qutler）**：管家（Butler）变体，能力与管家完全相同（每晚选主人，主人投票时 Q宝才能投票），复用管家能力管道：
  - `src/roles/new_engine/qutler.ability.ts`（新增）
  - `abilityRegistry.ts`：注册 `qutlerAbility`
  - `useExecutionHandlers.ts` / `useNightActionHandler.ts`：投票校验与主人同步兼容 `qutler`

### 数据完善

- `app/data.ts` + `json/full/*.json`：角色数据完善（所属剧本、能力类型等字段补全）

### 测试

- `src/roles/__tests__/librarian.test.ts`、`washerwoman.test.ts`：适配修正
- 全量单元测试 163 个通过 ✅
- 真实浏览器随机对局测试：流程 night → day → dusk → night 循环全部打通（提名 → 举手投票 → 计票 → 处决 → 入夜）

---

## W7.3.1 — 投毒者中毒标记修复 + 占卜师干扰项修复 (2025-07-02)

### 修复

#### 🔴 P0: 投毒者中毒标记不显示

**症状**：投毒者选择目标并确认后，目标座位不显示"中毒"标记，技能/信息未受干扰。

**根本原因**：`useGameState` 的 `setSeats` 在调用 `dispatch` 时使用闭包中捕获的旧 `state.seats`。当 `executeViaNewEngine` 设置中毒后 `markAbilityUsed` 又调用 `setSeats` 时，后者基于旧状态映射，覆盖了中毒状态。

**修复**：
- `GameContext.tsx`：新增 `UPDATE_SEATS` action 类型 + reducer handler，dispatch 时直接执行 `updater(state.seats)`
- `useGameState.ts`：`setSeats` 对 functional updater 改用 `UPDATE_SEATS` dispatch
- `useNightActionHandler.ts`：导出核心函数供测试

**测试**：4 个新增单元测试全部通过 ✅

#### 🟡 占卜师干扰项修复

**症状**：占卜师选择"红罗刹"（干扰项）时，结果应显示"有"但未体现。

**修复**：`GameStage.tsx` 引入 `FortuneTellerBoonManager`，同时检查恶魔 + 干扰项 + 陌客三重判定。

---

## W6.22.4+ — 全角色覆盖 + 游戏记录修复 (2026-06-22)

### 新增功能

#### Layer 4 仿真对局引擎
- **`tests/headlessGameEngine.ts`** — 无头游戏引擎
  - 不依赖浏览器，直接通过新引擎能力注册表执行游戏
  - 支持多剧本、随机AI决策、能力触发追踪、错误检测
  - 支持 `__all__` 混池模式（从全部角色中随机分配）
- **`tests/layer4_simulation.test.ts`** — 仿真对局测试（5 剧本 × 20 局 = 100 场）
  - 自动生成覆盖度报告：触发角色数、错误列表、可靠率统计
- **`tests/role_coverage.test.ts`** — 全角色能力覆盖验证
  - 177 个核心角色（排除传奇角色/旅行者）逐个验证
  - 验证能力已注册 + 能力管道可执行不崩溃
  - 覆盖率：**100%**
- **`tests/passive_day_roles.test.ts`** — 8个被动/日间角色场景测试

#### 补全能力文件
| 文件 | 角色 | 说明 |
|:----|:-----|:-----|
| `src/roles/new_engine/missionary.ability.ts` | 传教士(Missionary) | 每晚选爪牙，封禁其能力 |
| `src/roles/new_engine/leech.ability.ts` | 痢蛭(Lleech) | 每晚选宿主，寄生机制 |
| `src/roles/new_engine/shaman.ability.ts` | 灵言师(Shaman) | 首夜给关键词，转化触发 |
