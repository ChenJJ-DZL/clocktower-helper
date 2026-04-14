const fs = require("node:fs");
const path = require("node:path");

const tsFiles = [];
function readDir(dir) {
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    if (item.isDirectory()) readDir(path.join(dir, item.name));
    else if (item.name.endsWith(".ts")) tsFiles.push(path.join(dir, item.name));
  }
}
readDir("./src/roles");

const handlersContent = fs.readFileSync(
  "./src/hooks/roleActionHandlers.ts",
  "utf8"
);
const missing = [];

for (const file of tsFiles) {
  const content = fs.readFileSync(file, "utf8");
  // Match id: "..." or id: '...'
  const roleNameMatch = content.match(/id:\s*['"]([^'"]+)['"]/);
  if (!roleNameMatch) continue;
  const roleId = roleNameMatch[1];

  if (content.includes("night: {")) {
    if (
      !handlersContent.includes(`handle${roleId}`) &&
      !handlersContent.includes(`'${roleId}'`) &&
      !handlersContent.includes(`"${roleId}"`)
    ) {
      missing.push(roleId);
    }
  }
}
console.log(
  "Roles with night config but no explicit handler:",
  missing.join(", ")
);
