/**
 * 全量角色能力语义特征穷举与归类分析脚本
 *
 * 功能：
 * 1. 扫描所有角色定义文件和能力实现文件
 * 2. 提取并穷举非标准/特殊交互机制
 * 3. 自动归类到能力特征矩阵
 * 4. 输出差距分析报告
 */

const fs = require("fs");
const path = require("path");

const ROLES_DIR = path.join(__dirname, "../src/roles");
const DATA_DIR = path.join(__dirname, "../src/data");
const NEW_ENGINE_DIR = path.join(ROLES_DIR, "new_engine");

// 语义特征分类矩阵
const SEMANTIC_CATEGORIES = {
  FAKE_IDENTITY: {
    name: "假象/欺骗/双重身份类",
    keywords: [
      "fakeRole",
      "apparentRole",
      "charadeRole",
      "drunk",
      "lunatic",
      "marionette",
      "spy",
      "widow",
      "damsel",
      "recluse",
      "poisoner",
    ],
    description: "角色具有假象身份或欺骗机制",
  },
  MULTI_CANDIDATE: {
    name: "多候选/模糊信息生成类",
    keywords: [
      "candidate",
      "washerwoman",
      "librarian",
      "investigator",
      "dreamer",
      "savant",
      "juggler",
      "gossip",
      "fisherman",
      "oracle",
    ],
    description: "角色提供模糊或多个候选信息",
  },
  DAY_INSTANT: {
    name: "白天即时结算/公开决斗类",
    keywords: [
      "psychopath",
      "slayer",
      "virgin",
      "golem",
      "witch",
      "gunslinger",
      "nominate",
      "execute",
    ],
    description: "白天即时触发的能力",
  },
  FACTION_SWAP: {
    name: "阵营互换/身份跃迁类",
    keywords: [
      "snake_charmer",
      "fang_gu",
      "pit_hag",
      "barber",
      "klutz",
      "goon",
      "politician",
      "ogre",
    ],
    description: "角色可以改变阵营或身份",
  },
  DELAYED_EFFECT: {
    name: "延迟生效/非标准夜行动力学",
    keywords: [
      "pukka",
      "po",
      "sailor",
      "ojo",
      "al_hadikhia",
      "shabaloth",
      "zombuul",
      "exorcist",
    ],
    description: "延迟或非标准的夜间行动机制",
  },
  GLOBAL_RULE: {
    name: "全局规则接管/特殊终局",
    keywords: [
      "heretic",
      "evil_twin",
      "saint",
      "goblin",
      "mastermind",
      "leviathan",
      "riot",
      "legion",
      "vizier",
      "atheist",
    ],
    description: "影响全局规则或特殊终局条件",
  },
};

// 扫描文件内容
function scanFile(filePath) {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return "";
  }
}

// 从角色定义文件提取语义特征
function extractSemanticFeatures(content, roleId) {
  const features = [];

  // 检查假象身份机制
  if (
    content.includes("charadeRole") ||
    content.includes("fakeRole") ||
    content.includes("apparentRole")
  ) {
    features.push("FAKE_IDENTITY");
  }

  // 检查醉酒/中毒相关
  if (
    content.includes("isDrunk") ||
    content.includes("isPoisoned") ||
    content.includes("abilityEffective")
  ) {
    features.push("FAKE_IDENTITY");
  }

  // 检查多候选信息
  if (
    content.includes("candidate") ||
    content.includes("randomize") ||
    content.includes("shuffle")
  ) {
    features.push("MULTI_CANDIDATE");
  }

  // 检查白天即时结算
  if (
    content.includes("nominate") ||
    content.includes("execute") ||
    content.includes("dayAction")
  ) {
    features.push("DAY_INSTANT");
  }

  // 检查阵营互换
  if (
    content.includes("swap") ||
    content.includes("convert") ||
    content.includes("alignment")
  ) {
    features.push("FACTION_SWAP");
  }

  // 检查延迟生效
  if (
    content.includes("delay") ||
    content.includes("deferred") ||
    content.includes("nextNight")
  ) {
    features.push("DELAYED_EFFECT");
  }

  // 检查全局规则
  if (
    content.includes("winCondition") ||
    content.includes("gameOver") ||
    content.includes("globalRule")
  ) {
    features.push("GLOBAL_RULE");
  }

  return [...new Set(features)];
}

// 分析角色实现完整性
function analyzeRoleCompleteness(roleId, abilityContent, definitionContent) {
  const gaps = [];

  // 检查是否有空壳实现
  if (abilityContent && abilityContent.includes("// TODO")) {
    gaps.push("存在TODO标记");
  }

  // 检查是否有简单的选人逻辑但缺少复杂语义
  if (
    abilityContent &&
    abilityContent.includes("selectPlayer") &&
    !abilityContent.includes("calculate")
  ) {
    gaps.push("仅有简单选人逻辑");
  }

  // 检查是否缺少状态更新
  if (abilityContent && !abilityContent.includes("stateUpdate")) {
    gaps.push("缺少状态更新逻辑");
  }

  // 检查是否缺少后处理
  if (abilityContent && !abilityContent.includes("postProcess")) {
    gaps.push("缺少后处理逻辑");
  }

  return gaps;
}

// 主分析函数
async function analyzeSemanticFeatures() {
  console.log("=== 全量角色能力语义特征穷举与归类分析 ===\n");

  const results = {
    totalRoles: 0,
    rolesWithAbilities: 0,
    semanticCategories: {},
    gapAnalysis: [],
    recommendations: [],
  };

  // 初始化分类统计
  for (const [key, category] of Object.entries(SEMANTIC_CATEGORIES)) {
    results.semanticCategories[key] = {
      ...category,
      roles: [],
      count: 0,
    };
  }

  // 扫描角色定义文件
  const roleDirs = ["townsfolk", "outsider", "minion", "demon", "traveler"];

  for (const dir of roleDirs) {
    const dirPath = path.join(ROLES_DIR, dir);
    if (!fs.existsSync(dirPath)) continue;

    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      if (!file.endsWith(".ts")) continue;

      const roleId = file.replace(".ts", "");
      const content = scanFile(path.join(dirPath, file));

      results.totalRoles++;

      // 提取语义特征
      const features = extractSemanticFeatures(content, roleId);

      for (const feature of features) {
        if (results.semanticCategories[feature]) {
          results.semanticCategories[feature].roles.push(roleId);
          results.semanticCategories[feature].count++;
        }
      }
    }
  }

  // 扫描能力实现文件
  if (fs.existsSync(NEW_ENGINE_DIR)) {
    const abilityFiles = fs
      .readdirSync(NEW_ENGINE_DIR)
      .filter((f) => f.endsWith(".ability.ts"));

    for (const file of abilityFiles) {
      const roleId = file.replace(".ability.ts", "");
      const abilityContent = scanFile(path.join(NEW_ENGINE_DIR, file));
      const definitionContent = scanFile(
        path.join(ROLES_DIR, "**", `${roleId}.ts`)
      );

      results.rolesWithAbilities++;

      // 分析完整性
      const gaps = analyzeRoleCompleteness(
        roleId,
        abilityContent,
        definitionContent
      );
      if (gaps.length > 0) {
        results.gapAnalysis.push({
          roleId,
          gaps,
          hasAbility: true,
        });
      }

      // 提取能力文件中的语义特征
      const abilityFeatures = extractSemanticFeatures(abilityContent, roleId);
      for (const feature of abilityFeatures) {
        if (
          results.semanticCategories[feature] &&
          !results.semanticCategories[feature].roles.includes(roleId)
        ) {
          results.semanticCategories[feature].roles.push(roleId);
          results.semanticCategories[feature].count++;
        }
      }
    }
  }

  // 输出结果
  console.log("📊 语义特征分类统计:");
  console.log("=".repeat(50));

  for (const [key, category] of Object.entries(results.semanticCategories)) {
    console.log(`\n${category.name} (${category.count} 个角色):`);
    console.log(`  描述: ${category.description}`);
    if (category.roles.length > 0) {
      console.log(
        `  角色: ${category.roles.slice(0, 10).join(", ")}${category.roles.length > 10 ? "..." : ""}`
      );
    }
  }

  console.log("\n\n🔍 差距分析:");
  console.log("=".repeat(50));
  console.log(`总角色数: ${results.totalRoles}`);
  console.log(`有能力实现: ${results.rolesWithAbilities}`);

  if (results.gapAnalysis.length > 0) {
    console.log("\n待修复角色:");
    for (const gap of results.gapAnalysis) {
      console.log(`  - ${gap.roleId}: ${gap.gaps.join(", ")}`);
    }
  }

  // 生成建议
  console.log("\n\n💡 修复建议:");
  console.log("=".repeat(50));

  const emptyRoles = results.gapAnalysis.filter((g) =>
    g.gaps.includes("仅有简单选人逻辑")
  );
  if (emptyRoles.length > 0) {
    console.log(`\n1. 需要增强语义的角色 (${emptyRoles.length} 个):`);
    emptyRoles.forEach((r) => console.log(`   - ${r.roleId}`));
  }

  const missingStateUpdate = results.gapAnalysis.filter((g) =>
    g.gaps.includes("缺少状态更新逻辑")
  );
  if (missingStateUpdate.length > 0) {
    console.log(`\n2. 缺少状态更新的角色 (${missingStateUpdate.length} 个):`);
    missingStateUpdate.forEach((r) => console.log(`   - ${r.roleId}`));
  }

  return results;
}

// 运行分析
analyzeSemanticFeatures().catch(console.error);
