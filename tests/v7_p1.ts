import { test } from "@playwright/test";
test.setTimeout(600000);
async function phase(page: any): Promise<string> {
  const b=(t:string)=>page.locator("button:has-text(\""+t+\"\")").isVisible({timeout:30}).catch(()=>false);
  if (await b("再来一局")) return "gameOver";
  if (await b("确认无误，入夜")) return "check";
  if (await b("天亮了")) return "night";
  if (await b("确认 & 下一步")) return "night";
  if (await b("进入黄昏处决阶段")) return "day";
  if (await b("执行处决")) return "dusk";
  if (await b("发起提名")) return "dusk";
  const d = page.locator('div[role="dialog"]');
  if (await d.isVisible({ timeout: 30 }).catch(() => false)) {
    const t = await d.textContent().catch("");
    if (t.includes("昨晚") || t.includes("平安夜")) return "dawnReport";
    if (t.includes("确认夜间行动")) return "previewModal";
  }
  return "unknown";
}
async function BT(page: any) {
  return page.evaluate(() => document.body?.innerText || "");
}
async function CD(page: any): Promise<boolean> {
  const d = page.locator('div[role="dialog"]');
  if (!(await d.isVisible({ timeout: 30 }).catch(() => false))) return false;
  for (const t of ["确认执行", "确认", "关闭", "好的"]) {
    const b=d.locator("button:has-text(\""+t+\"\")").first();
    if (await b.isVisible({ timeout: 40 }).catch(() => false)) {
      await b.click().catch(() => {});
      await page.waitForTimeout(300);
      return true;
    }
  }
  return false;
}
async function GA(page: any): Promise<number[]> {
  return page.evaluate();
  =>Array.from(document.querySelectorAll(".seat-node")).filter(n=>!n.textContent?.includes("已死亡")).map(n=>parseInt(n.getAttribute("data-seat-id")||"-1")).filter(id=>id>=0).sort((a,b)=>a-b))
}
async function CS(page: any, id: number) {
  const s = page.locator('[data-seat-id="' + id + '"]');
  if (await s.isVisible({ timeout: 150 }).catch(() => false)) {
    await s.click();
    await page.waitForTimeout(150);
  }
}
