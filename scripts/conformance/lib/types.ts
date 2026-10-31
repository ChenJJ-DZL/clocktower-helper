/**
 * 规则一致性（Rule Conformance）系统的共享类型定义
 * ======================================================================
 * 设计目标：把「官方规则」变成机器可读的**规范（spec）**，把「项目实现」
 * 变成可枚举的**实现清单（impl）**，再逐条比对，产出**证据台账（ledger）**。
 *
 * 数据源（均为仓库内已落盘事实，不联网、不猜测）：
 *   · 官方规范 ← `json/full/*.json`（wikic dump：类型/首夜与其他夜行动顺序/
 *     角色能力类型标签/角色能力原文/官方范例/运作方式…）
 *   · 项目实现 ← `app/data.ts::roles`、`src/roles/**`（能力注册表、夜间元数据）
 *   · 测试证据 ← `src` 下 __tests__ 目录、`tests`、`e2e` 的引用扫描
 *   · 既有台账 ← `outputs/coverage_ledger.json`（角色 × E2E 覆盖）
 */

/** 项目内部使用的基础角色类型 */
export type ImplRoleType =
  | "townsfolk"
  | "outsider"
  | "minion"
  | "demon"
  | "traveler"
  | "fabled";

/**
 * 官方夜序值：
 *   · number       —— 官方夜序表编号（如小恶魔 45）
 *   · "cannot_act" —— 官方明确「无法行动」
 *   · null         —— 官方该夜未给编号（可能是无夜间行动 / 未收录）
 */
export type OfficialNightOrder = number | "cannot_act" | null;

/** 官方角色规范（每个角色一条，已去重合并） */
export interface OfficialRoleSpec {
  /** 官方中文名（如「小恶魔」） */
  nameCn: string;
  /** 官方英文名（如「Imp」；部分角色缺失） */
  nameEn: string;
  /** 归一化后的基础类型；无法识别时为 null（记录会被计入 dropped 统计） */
  type: ImplRoleType | null;
  /** 官方原文类型（镇民/外来者/爪牙/恶魔/旅行者/传奇角色） */
  typeRaw: string | null;
  /** 官方夜序 */
  firstNightOrder: OfficialNightOrder;
  otherNightOrder: OfficialNightOrder;
  /** 官方夜序原文（保留「无法行动」等非数字形态，便于人读） */
  firstNightOrderRaw: string | null;
  otherNightOrderRaw: string | null;
  /** 所属剧本标签（按「、」拆分，如 ["实验性角色","黯月初升"]） */
  scriptTags: string[];
  /** 角色能力类型标签（官方结构化字段，如 ["获得信息","进场能力"]） */
  capabilityTags: string[];
  /** 角色能力原文（content.角色能力） */
  abilityText: string;
  /** 官方范例（content.范例，按「> 范例:」拆行） */
  examples: string[];
  /** 说书人运作方式（content.运作方式） */
  storytellerOps: string;
  /** 提示标记（content.提示标记） */
  reminderTokens: string;
  /** 规则细节/相克规则原文（content.规则细节，可能为空） */
  rulesDetail: string;
  /** 来源文件（json/full/*.json 文件名） */
  sourceFiles: string[];
  /** 合并了多少条原始记录 */
  sourceRecordCount: number;
  /** 官方 wiki 链接（如有） */
  wikiUrl: string | null;
}

/** 官方规范文件（输出 outputs/rule_spec/official_spec.json） */
export interface OfficialSpecFile {
  generatedAt: string;
  source: "json/full/*.json";
  stats: {
    rawRecords: number;
    validRecords: number;
    droppedRecords: number;
    uniqueRoles: number;
    mergedDuplicateRoles: number;
    missingAbilityText: number;
    rolesWithExamples: number;
    totalExamples: number;
    capabilityTagCounts: Record<string, number>;
  };
  roles: OfficialRoleSpec[];
}

/** 项目实现侧的角色清单 */
export interface ImplRole {
  /** 项目角色 id（英文 snake_case，如 "imp"） */
  roleId: string;
  /** 项目中文名（如「小恶魔」） */
  nameCn: string;
  /** 项目声明的基础类型 */
  type: ImplRoleType;
  /** 是否属于内置剧本（app/data.ts::scripts 的 roleIds 并集） */
  inBuiltInScript: boolean;
  /** 所属剧本名列表（app/data.ts::roles[].script） */
  scripts: string[];
  /** 新引擎能力注册信息（未注册为 null） */
  ability: {
    abilityId: string;
    triggerTiming: string[];
    firstNightPriority: number | null;
    otherNightPriority: number | null;
    targetMin: number | null;
    targetMax: number | null;
    allowSelf: boolean | null;
    allowDead: boolean | null;
  } | null;
}

/** 实现清单文件（内存结构，不单独落盘） */
export interface ImplInventory {
  roles: ImplRole[];
  /** app/data.ts 里所有内置剧本 id 并集（用于判定「官方角色是否已实现」） */
  builtInRoleIds: Set<string>;
  /** app/data.ts 里内置剧本的中文名（用于与官方「所属剧本」标签对账） */
  scriptNames: string[];
  /** 剧本名 → 该剧本的角色 id 列表（按 app/data.ts::scripts 的权威编排） */
  scriptRoleIds: Record<string, string[]>;
  stats: {
    appRoles: number;
    builtInRoles: number;
    rolesWithAbility: number;
  };
}

/** 角色 → 规范映射结果 */
export interface SpecMapping {
  spec: OfficialRoleSpec;
  /** 命中的匹配方式，便于人审与统计 */
  matchedBy: "english_id" | "english_stem" | "chinese_name" | "chinese_stem" | "alias";
}

/** 审计发现的单条问题 */
export interface ConformanceFinding {
  /** P0 = 明确错误；P1 = 高概率规则偏差；P2 = 覆盖/证据缺口；INFO = 台账信息 */
  severity: "P0" | "P1" | "P2" | "INFO";
  /** 检查项 id（稳定，作为棘轮签名的一部分） */
  check: string;
  /** 相关项目角色 id（全局问题可为空） */
  roleId?: string;
  /** 相关官方角色中文名 */
  roleNameCn?: string;
  /** 官方值 */
  official?: string | number | null;
  /** 实现值 */
  impl?: string | number | null;
  /** 人读详情 */
  detail: string;
  /** 是否已被人审 waiver 台账豁免（豁免后降级 INFO，但仍保留可追溯） */
  waived?: boolean;
  /** waiver 理由（来自 scripts/conformance/waivers.json） */
  waiverReason?: string;
}

/** 人审豁免/裁定台账条目（必须写明理由，避免"静默放过"） */
export interface WaiverEntry {
  /** 匹配的检查项 id（必填） */
  check: string;
  /** 可选：精确匹配角色 id */
  roleId?: string;
  /** 可选：精确匹配官方角色中文名（roleId 缺失时使用） */
  roleNameCn?: string;
  /** 裁定理由（必填，会写进报告） */
  reason: string;
  /** 裁定人 */
  owner?: string;
  /** 裁定日期（YYYY-MM-DD） */
  date?: string;
}

/** waivers 文件结构（scripts/conformance/waivers.json） */
export interface WaiverFile {
  waivers: WaiverEntry[];
}

/** 每个角色的台账行（规则一致性 + 证据面） */
export interface RoleConformanceRow {
  roleId: string;
  nameCn: string;
  officialNameCn: string | null;
  officialType: string | null;
  implType: string;
  typeOk: boolean | null;
  firstNightOk: boolean | null;
  otherNightOk: boolean | null;
  officialFirstNightOrder: OfficialNightOrder;
  officialOtherNightOrder: OfficialNightOrder;
  implFirstNightPriority: number | null;
  implOtherNightPriority: number | null;
  hasAbilityImpl: boolean;
  capabilityTags: string[];
  /** 官方范例条数 */
  officialExamples: number;
  /** 测试文件引用数（roleId 或中文名出现在测试源码中的文件数） */
  testReferences: number;
  /** E2E/场次证据（读 outputs/coverage_ledger.json，无则 null） */
  e2eSeen: number | null;
  /** 该角色全部 findings 的 check 列表 */
  findings: string[];
}

/** 审计报告 */
export interface ConformanceReport {
  generatedAt: string;
  stats: {
    officialRoles: number;
    implRoles: number;
    mappedRoles: number;
    /** 内置剧本中「项目有、官方查不到」的角色数 */
    implWithoutSpec: number;
    /** 内置剧本中「官方有、项目没实现」的角色数 */
    officialNotImplemented: number;
    typeChecked: number;
    typeMismatches: number;
    /** 真正做了硬比对的夜序数（官方给了数字且实现可断言） */
    firstNightComparable: number;
    firstNightMismatches: number;
    /**
     * 官方给了夜序、但按人审规则**不作硬断言**而登记裁定的条数
     * （`spec.official_slot_only` 占位槽 / `spec.official_data_conflict` 官方数据自相矛盾 /
     * 被动能力不参与夜间唤醒）。它们不是"没测"，而是"显式裁定过"。
     */
    firstNightExempt: number;
    /** 夜序审计覆盖 = 硬比对 + 显式裁定（棘轮口径：只许上升） */
    firstNightAudited: number;
    otherNightComparable: number;
    otherNightMismatches: number;
    otherNightExempt: number;
    otherNightAudited: number;
    rolesWithTestReference: number;
    rolesWithAbilityImpl: number;
    /** 语义原子层（L3）产生的偏差数 */
    semanticFindings: number;
    /** 官方范例总数 / 已编码为可执行夹具的数量（L3 Oracle 覆盖度） */
    officialExamples: number;
    encodedExamples: number;
    /** 变异测试（L5）：被测试杀死 / 总变异数（未运行则为 0） */
    mutationKilled: number;
    mutationTotal: number;
    /** L4 整局随机仿真：局数 / 执行的动作数 / 不变式违例数 */
    fuzzGames: number;
    fuzzActions: number;
    fuzzViolations: number;
    /**
     * L6 E2E「断言型」覆盖：在 `test()` 块内既提到该角色、块内又有 `expect(` 的角色数。
     * （区别于 reach 口径的 `rolesWithTestReference`：那是"源码里被提到过"。）
     */
    e2eAssertionRoles: number;
    /** E2E test 块内的 `expect(` 总数 */
    e2eAssertions: number;
    /** 被人审 waiver 豁免的 findings 数 */
    waivedFindings: number;
  };
  findings: ConformanceFinding[];
  rows: RoleConformanceRow[];
  /** 按剧本统计（内置 9 剧本） */
  scriptBreakdown: Array<{
    script: string;
    roles: number;
    mapped: number;
    typeOk: number;
    withTestRefs: number;
  }>;
  /** 按官方能力类型标签统计（语义层路线图的数据基础） */
  capabilityTagBreakdown: Array<{
    tag: string;
    roles: number;
    withTestRefs: number;
  }>;
  /**
   * 「全量严格符合官方规则」的**静态判定**结果。
   * 注意：这里只覆盖可静态判定的维度；语义层（技能效果/夜间交互/判胜）见
   * docs/RULE_CONFORMANCE_SYSTEM.md 的分层设计。
   */
  verdict: {
    strictlyConformant: boolean;
    blockerCount: number;
    note: string;
  };
}

/** 棘轮基线（提交到仓库，防止规则一致性回退） */
export interface ConformanceBaseline {
  /**
   * 基线格式版本：
   *   1（或缺省）= 旧签名 `check|roleId`（不带 severity，无法发现"豁免被移除导致严重度回升"）
   *   2 = 现行签名 `severity|check|roleId`
   * 版本不匹配时棘轮**失败关闭**：必须显式跑 `--migrate-baseline` 人审迁移，禁止静默兼容。
   */
  schemaVersion?: number;
  generatedAt: string;
  /** findings 签名集合：`severity|check|roleId`（唯一、排序） */
  findings: string[];
  /** 统计快照（用于报告趋势，不参与硬断言） */
  metrics: Record<string, number>;
}
