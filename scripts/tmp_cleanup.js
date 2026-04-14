const fs = require("node:fs");
const path = require("node:path");

const filePath = path.join(__dirname, "app/data.ts");
let content = fs.readFileSync(filePath, "utf8");

// Replace regex that matches setupMeta: { ... }, up to the closing brace, handling nested braces if any.
// Actually since setupMeta in data.ts is simple like `setupMeta: { isDrunk: true },` or `setupMeta: { modifiesBag: true }`
content = content.replace(/,\s*setupMeta:\s*\{[^}]*\}/g, "");
content = content.replace(/,\s*triggerMeta:\s*\{[^}]*\}/g, "");
content = content.replace(/,\s*dayMeta:\s*\{[^}]*\}/g, "");

// Also handle if they are without preceding commas but followed by commas
content = content.replace(/setupMeta:\s*\{[^}]*\},\s*/g, "");
content = content.replace(/triggerMeta:\s*\{[^}]*\},\s*/g, "");
content = content.replace(/dayMeta:\s*\{[^}]*\},\s*/g, "");

fs.writeFileSync(filePath, content, "utf8");
console.log("Cleaned up app/data.ts");
