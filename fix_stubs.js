const fs = require("node:fs");
const path = require("node:path");

const srcRolesDir = path.join(__dirname, "src", "roles");

function processDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDir(fullPath);
    } else if (fullPath.endsWith(".ts")) {
      const content = fs.readFileSync(fullPath, "utf8");

      if (
        content.includes("TODO: 实现角色逻辑") ||
        content.includes(
          "Logic handled in game controller/roleActionHandlers for revival"
        )
      ) {
        const handlerIndex = content.indexOf("handler:");
        if (handlerIndex !== -1) {
          let i = handlerIndex;
          let braceCount = 0;
          let started = false;
          let end = -1;
          while (i < content.length) {
            if (content[i] === "{") {
              braceCount++;
              started = true;
            } else if (content[i] === "}") {
              braceCount--;
              if (started && braceCount === 0) {
                end = i;
                if (content[i + 1] === ",") end++;
                break;
              }
            }
            i++;
          }
          if (end !== -1) {
            const before = content.slice(0, handlerIndex);
            const after = content.slice(end + 1);
            const newContent =
              before +
              "handler: undefined, /* TODO: Migrate to OOP */\n" +
              after;
            fs.writeFileSync(fullPath, newContent);
            console.log(`Patched: ${fullPath}`);
          }
        }
      }
    }
  }
}

processDir(srcRolesDir);
console.log("Done!");
