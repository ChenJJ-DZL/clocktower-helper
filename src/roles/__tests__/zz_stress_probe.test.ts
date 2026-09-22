import { describe, it } from "vitest";
import { runStressGame, SV_ROLES } from "../../utils/invariantTesting/stressTest";

describe("ZZ stress probe", () => {
  it("dump violations", async () => {
    for (let g = 0; g < 20; g++) {
      const seed = 20260801 + g;
      const r: any = await runStressGame(SV_ROLES as any, 9, 5, seed);
      if (!r.passed) {
        const lines: string[] = [];
        for (const n of r.nights) {
          n.violations.forEach((msgs: string[], key: string) => {
            msgs.forEach((m: string) => lines.push("  [" + key + "] " + String(m).slice(0, 150)));
          });
        }
        console.log("[PROBE] seed=" + seed + " 违规 " + lines.length + " 条");
        console.log("[PROBE]" + lines.slice(0, 6).join("\n[PROBE]"));
        break;
      }
    }
  });
});
