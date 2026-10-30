import { describe, expect, it } from "vitest";
import { roles } from "../../../app/data";

describe("疯子假恶魔约束：疯子不能以为自己是军团", () => {
  it("恶魔候选池中排除军团与疯子", () => {
    const demonList = roles.filter(
      (r) => r.type === "demon" && r.id !== "legion" && r.id !== "lunatic"
    );
    const demonIds = demonList.map((d) => d.id);

    expect(demonIds).not.toContain("legion");
    expect(demonIds).not.toContain("lunatic");
    expect(demonIds).toContain("imp");
  });
});
