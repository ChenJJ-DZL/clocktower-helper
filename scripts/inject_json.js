const fs = require("node:fs");
const path = require("node:path");

const jsonDir = path.join(__dirname, "..", "json");
const srcRolesDir = path.join(__dirname, "..", "src", "roles");

// 1. Load all JSON data
const roleDocs = new Map();

const files = fs.readdirSync(jsonDir);
for (const file of files) {
  if (file.endsWith(".json")) {
    try {
      const data = JSON.parse(
        fs.readFileSync(path.join(jsonDir, file), "utf8")
      );
      if (Array.isArray(data)) {
        for (const item of data) {
          if (item.name && item.content) {
            // Trim and clean name just in case
            const name = item.name.trim();
            roleDocs.set(name, item.content);
          }
        }
      }
    } catch (e) {
      console.error(`Failed to parse ${file}: ${e.message}`);
    }
  }
}

console.log(`Loaded docs for ${roleDocs.size} roles.`);

// 2. Parse content into detailedDescription and clarifications
function parseContent(content) {
  let detailedDescription = content;
  const clarifications = [];

  const rulesMatch = content.match(/【规则细节】\n([\s\S]*?)(?=\n【|$)/);
  if (rulesMatch) {
    const rulesText = rulesMatch[1];
    const lines = rulesText.split("\n");
    for (let line of lines) {
      line = line.trim();
      if (line.startsWith("- ")) {
        clarifications.push(line.substring(2).trim());
      } else if (line.length > 0) {
        clarifications.push(line);
      }
    }
    // Remove 【规则细节】 section from detailedDescription?
    // Actually, keeping it as part of detailedDescription is fine, or we can remove it.
    // Let's remove it so it's not duplicated.
    detailedDescription = content
      .replace(/【规则细节】\n[\s\S]*?(?=\n【|$)/, "")
      .trim();
  }

  return { detailedDescription, clarifications };
}

// 3. Update TS files
function processDir(dir) {
  const entries = fs.readdirSync(dir);
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    if (fs.statSync(fullPath).isDirectory()) {
      processDir(fullPath);
    } else if (fullPath.endsWith(".ts") && entry !== "index.ts") {
      const content = fs.readFileSync(fullPath, "utf8");

      // Extract name
      const nameMatch = content.match(/name:\s*["']([^"']+)["']/);
      if (!nameMatch) continue;
      const roleName = nameMatch[1];

      if (roleDocs.has(roleName)) {
        const docContent = roleDocs.get(roleName);
        const { detailedDescription, clarifications } =
          parseContent(docContent);

        // Check if already injected
        if (content.includes("detailedDescription:")) {
          // we could attempt to replace it, but let's assume if it exists we might not want to overwrite,
          // or we do. Let's just do a simple replacement if it doesn't exist.
          continue;
        }

        // We want to insert it right after the `type:` field or `name:` field
        // Since all roles have `type: "...",`
        const typeMatch = content.match(/(type:\s*["'][^"']+["'],?)/);
        if (typeMatch) {
          const insertPos = typeMatch.index + typeMatch[0].length;

          // Format strings:
          const safeDesc =
            "`" +
            detailedDescription.replace(/`/g, "\\`").replace(/\${/g, "\\${") +
            "`";

          let injection = `\n  detailedDescription: ${safeDesc},`;

          if (clarifications.length > 0) {
            const safeClar = clarifications
              .map(
                (c) => `\`${c.replace(/`/g, "\\`").replace(/\${/g, "\\${")}\``
              )
              .join(",\n    ");
            injection += `\n  clarifications: [\n    ${safeClar}\n  ],`;
          }

          const newContent =
            content.slice(0, insertPos) + injection + content.slice(insertPos);
          fs.writeFileSync(fullPath, newContent);
          console.log(`Injected docs for: ${roleName} (${entry})`);
        }
      }
    }
  }
}

processDir(srcRolesDir);
console.log("Injection complete.");
