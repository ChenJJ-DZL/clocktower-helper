const fs = require("node:fs");
const path = require("node:path");

const jsonDir = path.join(__dirname, "../../json");
const outRoles = path.join(__dirname, "../data/officialRoleDocs.json");
const outRules = path.join(__dirname, "../data/officialRules.json");

function processRoleFiles() {
  const result = {};
  const files = fs.readdirSync(jsonDir);

  files.forEach((file) => {
    // Only process role definition files
    if (
      file.startsWith("blood_clocktower_") &&
      !file.includes("spider") &&
      file.endsWith(".json") &&
      !file.includes("所有角色能力总览") && // handled differently if exist
      !file.includes("角色能力总览")
    ) {
      console.log(`Processing roles from: ${file}`);
      const content = fs.readFileSync(path.join(jsonDir, file), "utf8");
      try {
        const data = JSON.parse(content);
        data.forEach((role) => {
          if (role.name && role.content) {
            result[role.name.trim()] = role.content;
          }
        });
      } catch (e) {
        console.error(`Error parsing ${file}:`, e);
      }
    } else if (file.includes("角色文档") && file.endsWith(".json")) {
      console.log(`Processing expansion roles from: ${file}`);
      const content = fs.readFileSync(path.join(jsonDir, file), "utf8");
      try {
        const data = JSON.parse(content);
        data.forEach((role) => {
          if (role.name && role.content) {
            result[role.name.trim()] = role.content;
          }
        });
      } catch (e) {
        console.error(`Error parsing ${file}:`, e);
      }
    }
  });

  fs.writeFileSync(outRoles, JSON.stringify(result, null, 2), "utf8");
  console.log(
    `Successfully generated ${outRoles} with ${Object.keys(result).length} roles.`
  );
}

function processRuleFiles() {
  const rules = {};

  const ruleFiles = [
    { source: "游戏简要规则.json", key: "briefRules" },
    { source: "重要细节.json", key: "importantDetails" },
    { source: "夜晚行动顺序.json", key: "nightOrders" },
  ];

  ruleFiles.forEach(({ source, key }) => {
    const fPath = path.join(jsonDir, source);
    if (fs.existsSync(fPath)) {
      console.log(`Processing rule: ${source}`);
      const content = fs.readFileSync(fPath, "utf8");
      try {
        // Some might be pure text labeled json, let's check
        const data = JSON.parse(content);
        rules[key] = data;
      } catch (_e) {
        // If it's pure text ending in .json, just read as string
        rules[key] = content;
      }
    }
  });

  fs.writeFileSync(outRules, JSON.stringify(rules, null, 2), "utf8");
  console.log(`Successfully generated ${outRules}.`);
}

// Ensure dir exists
if (!fs.existsSync(path.join(__dirname, "../data"))) {
  fs.mkdirSync(path.join(__dirname, "../data"), { recursive: true });
}

processRoleFiles();
processRuleFiles();
