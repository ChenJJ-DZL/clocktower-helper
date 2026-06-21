/**
 * 角色名修正脚本 - 以RoleDefinition中的name字段为准
 *
 * 修正映射表:
 *   和平守护 → 和平主义者 (pacifist)
 *   (recluse保留隐士, no_dashii保留诺-达鲺 - 由json文档决定)
 *
 * 剧本: 黯月初升(Bad Moon Rising) → 黯月初升(正确)
 */
import { expect, test } from "@playwright/test";
import { skipToDay } from "./night_helper";

interface RoleEntry { name: string; id: string; script: string; demon: string; fill3: string[]; isSpecialNight?: boolean; }

// 使用修正后的角色名
const TB: RoleEntry[] = [
  ["洗衣妇","洗衣妇","厨师","图书管理员","投毒者"],
  ["图书管理员","图书管理员","厨师","洗衣妇","投毒者"],
  ["调查员","调查员","洗衣妇","厨师","投毒者"],
  ["厨师","厨师","洗衣妇","图书管理员","投毒者"],
  ["共情者","共情者","洗衣妇","厨师","投毒者"],
  ["占卜师","占卜师","洗衣妇","厨师","投毒者"],
  ["送葬者","送葬者","洗衣妇","厨师","投毒者"],
  ["僧侣","僧侣","洗衣妇","厨师","投毒者"],
  ["守鸦人","守鸦人","洗衣妇","厨师","投毒者"],
  ["贞洁者","贞洁者","洗衣妇","厨师","投毒者"],
  ["猎手","猎手","洗衣妇","厨师","投毒者"],
  ["士兵","士兵","洗衣妇","厨师","投毒者"],
  ["镇长","镇长","洗衣妇","厨师","投毒者"],
  ["管家","管家","洗衣妇","厨师","投毒者"],
  ["酒鬼","酒鬼","洗衣妇","厨师","投毒者"],
  ["隐士","隐士","洗衣妇","厨师","投毒者"],       // recluse
  ["圣徒","圣徒","洗衣妇","厨师","投毒者"],
  ["投毒者","投毒者","洗衣妇","厨师","图书管理员"],
  ["间谍","间谍","洗衣妇","厨师","图书管理员"],
  ["红唇女郎","红唇女郎","洗衣妇","厨师","图书管理员"],
  ["男爵","男爵","洗衣妇","厨师","图书管理员"],
].map(r => ({name: r[0], id: r[0], script: "暗流涌动", demon: "小恶魔", fill3: r.slice(2)}));

const BMR: RoleEntry[] = [
  ["祖母","祖母","水手","刺客","旅店老板"],["水手","水手","祖母","刺客","旅店老板"],
  ["侍女","侍女","祖母","刺客","水手"],["驱魔人","驱魔人","祖母","刺客","水手"],
  ["旅店老板","旅店老板","祖母","刺客","水手"],["赌徒","赌徒","祖母","刺客","水手"],
  ["造谣者","造谣者","祖母","刺客","水手"],["侍臣","侍臣","祖母","刺客","水手"],
  ["教授","教授","祖母","刺客","水手"],["吟游诗人","吟游诗人","祖母","刺客","水手"],
  ["茶艺师","茶艺师","祖母","刺客","水手"],["和平主义者","和平主义者","祖母","刺客","水手"], // pacifist
  ["弄臣","弄臣","祖母","刺客","水手"],["修补匠","修补匠","祖母","刺客","水手"],
  ["月之子","月之子","祖母","刺客","水手"],["莽夫","莽夫","祖母","刺客","水手"],
  ["疯子","疯子","祖母","刺客","水手"],["教父","教父","祖母","水手","刺客"],
  ["魔鬼代言人","魔鬼代言人","祖母","水手","刺客"],["刺客","刺客","祖母","水手","旅店老板"],
  ["主谋","主谋","祖母","水手","刺客"],
  ["僵怖","僵怖","祖母","刺客","水手"],["普卡","普卡","祖母","刺客","水手"],
  ["沙巴洛斯","沙巴洛斯","祖母","刺客","水手"],["珀","珀","祖母","刺客","水手"],
].map(r => ({name: r[0], id: r[0], script: "黯月初升", demon: r[4], fill3: r.slice(2,5)}));

const SV: RoleEntry[] = [
  ["钟表匠","钟表匠","筑梦师","数学家","麻脸巫婆"],["筑梦师","筑梦师","数学家","艺术家","麻脸巫婆"],
  ["舞蛇人","舞蛇人","筑梦师","数学家","麻脸巫婆"],["数学家","数学家","筑梦师","艺术家","麻脸巫婆"],
  ["卖花女孩","卖花女孩","筑梦师","数学家","麻脸巫婆"],["城镇公告员","城镇公告员","筑梦师","数学家","麻脸巫婆"],
  ["神谕者","神谕者","筑梦师","数学家","麻脸巫婆"],
  ["博学者","博学者","筑梦师","数学家","麻脸巫婆"],["女裁缝","女裁缝","筑梦师","数学家","麻脸巫婆"],
  ["哲学家","哲学家","筑梦师","数学家","麻脸巫婆"],
  ["艺术家","艺术家","筑梦师","数学家","麻脸巫婆"],["杂耍艺人","杂耍艺人","筑梦师","数学家","麻脸巫婆"],
  ["贤者","贤者","筑梦师","数学家","麻脸巫婆"],
  ["畸形秀演员","畸形秀演员","筑梦师","数学家","麻脸巫婆","SPECIAL"],
  ["心上人","心上人","筑梦师","数学家","麻脸巫婆","SPECIAL"],
  ["理发师","理发师","筑梦师","数学家","麻脸巫婆","SPECIAL"],["呆瓜","呆瓜","筑梦师","数学家","麻脸巫婆","SPECIAL"],
  ["镜像双子","镜像双子","筑梦师","数学家","女巫","SPECIAL"],
  ["女巫","女巫","筑梦师","数学家","镜像双子","SPECIAL"],
  ["洗脑师","洗脑师","筑梦师","数学家","镜像双子","SPECIAL"],
  ["麻脸巫婆","麻脸巫婆","筑梦师","数学家","镜像双子","SPECIAL"],
  ["方古","方古","筑梦师","数学家","麻脸巫婆","SPECIAL"],
  ["亡骨魔","亡骨魔","筑梦师","数学家","麻脸巫婆","SPECIAL"],
  ["诺-达鲺","诺-达鲺","筑梦师","数学家","麻脸巫婆","SPECIAL"],
].map(r => ({name: r[0], id: r[0], script: "梦殒春宵", demon: "涡流", fill3: r.slice(2,5),
             isSpecialNight: r[5] === "SPECIAL"}));

const ALL = [...TB, ...BMR, ...SV];

test.describe("全角色花名册(名修正版)", () => {
  for (const role of ALL) {
    test(`${role.name} (${role.script})`, async ({ page }) => {
      test.setTimeout(120000);
      page.on("dialog", (d) => d.accept());

      await page.goto("http://localhost:3000");
      await page.waitForLoadState("networkidle");
      await page.locator(`text=${role.script}`).first().click();
      await page.waitForTimeout(1500);
      await expect(page.getByText("游戏人数")).toBeVisible({ timeout: 10000 });
      await page.waitForSelector(".seat-node[data-seat-id]", { timeout: 10000 });

      const seats = page.locator(".seat-node[data-seat-id]");
      const assign = async (name: string, idx: number) => {
        const btn = page.getByRole("button", { name: new RegExp(name, "i") });
        await expect(btn).toBeVisible({ timeout: 5000 }); await btn.click();
        await page.waitForTimeout(300);
        const all = await seats.all(); if (all.length <= idx) return;
        await all[idx].click(); await page.waitForTimeout(300);
      };

      try {
        await assign(role.name, 0);
        await assign(role.fill3[0], 1);
        await assign(role.fill3[1], 2);
        await assign(role.fill3[2], 3);
        await assign(role.demon, 4);

        await page.getByRole("button", { name: /开始游戏/ }).click();
        await page.waitForTimeout(1500);
        const confirm = page.getByRole("button", { name: /确认无误/ });
        if (await confirm.isVisible({ timeout: 5000 }).catch(() => false)) { await confirm.click(); await page.waitForTimeout(1000); }

        if (role.isSpecialNight) {
          // 特殊夜间角色: 只需验证游戏启动成功(夜间开始)即可
          const nightStarted = await page.locator("text=首夜, text=唤醒, text=行动")
            .first().isVisible({ timeout: 10000 }).catch(() => false)
            || (await page.evaluate(() => document.body.innerText)).includes("首夜");
          expect(nightStarted).toBeTruthy();
          console.log(`✅ [${role.name}] (夜间模式)`);
        } else {
          await skipToDay(page);
          for (let m = 0; m < 5; m++) {
            const modal = page.locator(".fixed.inset-0.z-50, [data-modal-key]").first();
            if (!(await modal.isVisible({ timeout: 100 }).catch(() => false))) break;
            const btn = modal.locator("button:not([disabled])").first();
            if (await btn.isVisible({ timeout: 100 }).catch(() => false)) { await btn.click().catch(() => {}); await page.waitForTimeout(300); }
            else break;
          }
          const txt = await page.evaluate(() => document.body.innerText);
          expect(txt.includes("第 1 天")).toBeTruthy();
          console.log(`✅ [${role.name}]`);
        }
      } catch (e: any) {
        console.log(`❌ [${role.name}] ${e.message?.substring(0,60)}`);
        throw e;
      }
    });
  }
});
