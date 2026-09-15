import { expect, type Page } from "@playwright/test";

/**
 * 血染钟楼 E2E **剧本无关**共享夹具
 *
 * 一个剧本的落座/入夜/推进/黄昏流程在 UI 上是**同一套**，与具体剧本无关；
 * 因此夹具只把「剧本名」参数化（`scriptName`），
 * 罂粟花开与暗流涌动（乃至其他剧本）共用本文件。
 *
 * ⚠️⚠️ 本机实测踩过的坑（详见 test_automation/剧本测试手册.md §8.14/8.15）
 *
 * 1. **绝不用 `waitUntil: "networkidle"`** —— Next dev 的 HMR WebSocket 会让
 *    networkidle **永不满足**，实测挂死 3 分 51 秒且零输出。
 *
 * 2. **`playwright.config.ts` 刻意不配 `webServer`** —— Playwright 托管
 *    dev server 会导致进程无法退出（挂死 3 分 45 秒，超时参数也不生效）。
 *    由外部先起：`PORT=3100 npx next dev -p 3100`。
 *
 * 3. **必须用 3100 端口**，不要用 3000 —— 本机常驻多个残留 dev server
 *    占着 3000/3001/3002（自动化轮次遗留、权限不足杀不掉），
 *    3000 上返回的可能是**另一个 App**。
 *
 * 4. ⭐ **含「提线木偶 / 酒鬼」的局，必须先配置「伪装身份」才能入夜**。
 *    否则「分发&核对身份」点不动（按钮仍在，流程被伪装配置卡住）。
 *    控制台会出现「待设置伪装身份 待配置 (N/M)」+ 一个「🎲 随机」按钮。
 *    ⇒ 本夹具在点「分发&核对身份」前会自动点「随机」一键分配。
 *    （暗流涌动的**酒鬼**同样触发此流程。）
 */

const T = { visible: 20_000, click: 15_000 };

/** 默认剧本名（向后兼容：原罂粟花开用例不传参即走这个） */
export const DEFAULT_SCRIPT = "罂粟花开";

/**
 * 选剧本 → 快速开始 → 选人数 → 随机落座 → 配置伪装 → 分发核对 → 确认无误入夜
 *
 * @param scriptName 剧本名（需与 `app/data.ts` 的 `Script.name` 一致）。
 *   默认 `罂粟花开`；暗流涌动传 `"暗流涌动"`。
 *   ⚠️ 剧本名是**点击定位的锚点**，写错会点不开配置页 —— 必须逐字一致。
 */
export async function enterFirstNight(
  page: Page,
  playerCount = 5,
  scriptName: string = DEFAULT_SCRIPT
) {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await enterScriptConfig(page, scriptName, playerCount);

  // ⭐ 关键：含提线木偶/酒鬼时必须先配置伪装身份，否则后续按钮无效
  await resolveCharades(page);

  const distribute = page.getByText("分发&核对身份").first();
  await expect(distribute).toBeVisible({ timeout: T.visible });
  await distribute.click({ timeout: T.click });

  const enterNight = page
    .locator("button")
    .filter({ hasText: /确认无误[\s\S]*入夜/ })
    .first();
  await expect(enterNight).toBeVisible({ timeout: T.visible });
  await enterNight.click({ timeout: T.click });

  await expect(page.getByText("夜晚行动顺序").first()).toBeVisible({
    timeout: T.visible,
  });
}

/**
 * 从首页点进指定剧本的配置页，并完成「快速开始 → 人数 → 随机落座」。
 * 停在「随机落座」之后（此时按剧本不同，可能还需配置伪装身份）。
 */
export async function enterScriptConfig(
  page: Page,
  scriptName: string,
  playerCount: number
) {
  // ⚠️ 剧本卡片定位：卡内同时含剧本名与「进入配置」按钮。
  //    用 `:has-text` 收窄到该卡片，再 `.last()` 取真正的交互节点
  //    （列表在页面上可能有重复渲染层）。
  await page
    .locator(`div:has-text("${scriptName}")`)
    .filter({ hasText: "进入配置" })
    .last()
    .getByText("进入配置")
    .first()
    .click({ timeout: T.click });

  await page.getByText("⚡ 快速开始").first().click({ timeout: T.click });
  await page
    .getByText(`${playerCount}人`, { exact: false })
    .first()
    .click({ timeout: T.click });
  await page.getByText("随机落座").first().click({ timeout: T.click });
}

/**
 * 落座 + 随机发牌，**停在「分发&核对身份」可见处**（不点入夜）。
 * 适合只需检查发牌完整性/阵营配额、不需要走夜间的用例。
 */
export async function dealOnly(
  page: Page,
  playerCount: number,
  scriptName: string = DEFAULT_SCRIPT
) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await enterScriptConfig(page, scriptName, playerCount);
  await expect(page.getByText("分发&核对身份").first()).toBeVisible({
    timeout: T.visible,
  });
}

/** 若控制台提示「待设置伪装身份」，点「随机」一键分配 */
export async function resolveCharades(page: Page) {
  const hint = page.getByText(/待设置伪装身份/).first();
  const hasHint = await hint
    .waitFor({ state: "visible", timeout: 2500 })
    .then(() => true)
    .catch(() => false);
  if (!hasHint) return false;

  const rand = page
    .locator("button")
    .filter({ hasText: /随机/ })
    .first();
  if (await rand.count()) {
    await rand.click({ timeout: T.click }).catch(() => {});
    await page.waitForTimeout(600);
  }
  // 等提示消失（配置完成）
  await hint
    .waitFor({ state: "hidden", timeout: 8000 })
    .catch(() => {});
  return true;
}

/**
 * 读取「夜晚行动顺序」列表里的步骤（形如 `1. [4号] 爪牙互认`）。
 *
 * ⚠️⚠️ 踩坑记录（2026-09-14，第二次修正 —— 前一次修法是错的）：
 *
 *   **第一次"修法"（已废弃）**：以为失败是"标题已渲染、列表条目还没渲染"的
 *   读取 race，于是给读取加了轮询等待、并把 `innerText` 换成 `textContent`。
 *   —— 这个诊断是**错的**，而且换 `textContent` 直接制造了 100% 必失败：
 *   `textContent` **不带任何行分隔符**，队列会拼成一整行：
 *       `夜晚行动顺序收起1. [4号] 爪牙互认#12. [6号] 小恶魔(恶魔互认)#2...`
 *   于是 `split("\n")` 永远只得到 1 行、`/^\d+\.\s*\[/` 永远不匹配 → 恒返回 `[]`。
 *   （对照：`innerText` 会插入 18 个 `\n`，条目是分开的 —— 这也是最初能过的原因。）
 *
 *   **正确修法**：不去猜文本分隔符，而是**在浏览器里按 DOM 结构取条目**：
 *   队列每一项都是"叶子节点 / 短文本节点"，其自身文本形如 `N. [M号] 角色`。
 *   于是用 `page.evaluate()` 一次往返、直接筛出这些节点 ——
 *   · 与 `innerText` / `textContent` 谁做分隔**完全无关**（不再依赖分隔符假设）
 *   · 只扫**标题所在容器的子树**，不碰整个 body，避免 `innerText` 的布局开销
 *   · 一次 `evaluate` = 一次往返，符合铁律 #7「循环里别反复读整页」
 *
 *   ⭐ 教训：**"读不到"有两种根因 —— 数据没到，或读法不匹配。**
 *      第一次修法只考虑了前者。定位时**先把原始文本打出来看形状**，
 *      不要凭想当然替换 API。
 *
 * @param timeoutMs 等待队列出现的最长时间（默认 15s）
 */
export async function readNightQueue(
  page: Page,
  timeoutMs = 15000
): Promise<string[]> {
  // 先等「夜晚行动顺序」标题出现（等不到也不报错，交给下面的轮询统一判空）
  await page
    .getByText("夜晚行动顺序")
    .first()
    .waitFor({ state: "visible", timeout: timeoutMs })
    .catch(() => {});

  // ⚠️ 面板是**可折叠**的（`RoundTable.tsx`：`{isNightOrderExpanded && (...)}`）——
  //    折叠时列表条目的 DOM 节点**根本不存在**，只轮询等条目会白等到超时。
  //    ⇒ 先把「展开」按钮点掉（若当前是折叠态）。
  await page
    .locator("button")
    .filter({ hasText: /^展开$/ })
    .first()
    .click({ timeout: 2000 })
    .catch(() => {});

  // 轮询：等条目真的出现（标题在、列表空的窗口由此消除）
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const items = await page.evaluate(() => {
      const HEADING = "夜晚行动顺序";
      const ITEM = /^\d+\.\s*\[\d+号\]/;

      const all = Array.from(document.querySelectorAll("body *"));
      const heading = all.find(
        (el) => (el.textContent ?? "").trim() === HEADING
      );
      if (!heading) return [] as string[];

      // 从标题往上找 1~3 层，取一个能覆盖整个面板的容器
      let root: Element = heading;
      for (let i = 0; i < 3 && root.parentElement; i++) {
        root = root.parentElement;
      }

      const out: string[] = [];
      const seen = new Set<string>();
      for (const el of Array.from(root.querySelectorAll("*"))) {
        // 只看"没有子元素"的叶子，避免把整块容器文本当成一条
        if (el.children.length > 0) continue;
        const t = (el.textContent ?? "").replace(/\s+/g, " ").trim();
        if (!ITEM.test(t)) continue;
        if (seen.has(t)) continue;
        seen.add(t);
        out.push(t);
      }
      return out;
    });

    if (items.length > 0 || Date.now() > deadline) return items;
    await page.waitForTimeout(150);
  }
}

/**
 * 断言夜间队列非空并返回，失败时给出**带页面片段**的可读报错。
 * 供 L4 用例复用，避免每个用例各写一遍"读 + 判空"。
 */
export async function expectNightQueueNonEmpty(
  page: Page,
  hint = ""
): Promise<string[]> {
  const queue = await readNightQueue(page);
  if (queue.length === 0) {
    // 诊断片段：用 textContent 取纯数据（只用于**报错文案**，
    // 不参与解析，故不受分隔符问题影响）
    const diag = await page.evaluate(() => {
      const raw = document.body.textContent ?? "";
      const idx = raw.indexOf("夜晚行动顺序");
      const snippet = idx >= 0 ? raw.slice(idx, idx + 400) : raw.slice(0, 400);
      const all = Array.from(document.querySelectorAll("body *"));
      const toggle = all.find(
        (el) =>
          el.children.length === 0 &&
          /^(收起|展开)$/.test((el.textContent ?? "").trim())
      );
      return {
        snippet,
        toggle: toggle ? (toggle.textContent ?? "").trim() : "(无)",
        atDay: /第\s*\d+\s*天/.test(raw),
        emptyState: raw.includes("暂无顺序"),
      };
    });
    throw new Error(
      `夜间队列为空${hint ? `（${hint}）` : ""}。` +
        `[面板折叠按钮=${diag.toggle}｜已进入白天=${diag.atDay}｜空态文案=${diag.emptyState}]\n` +
        `页面在「夜晚行动顺序」附近的内容片段：\n${diag.snippet}`
    );
  }
  return queue;
}

/**
 * ⭐ 夜间推进：反复点右下角的 **「确认 & 下一步」**，直到进入白天（「第 N 天」）。
 *
 * ⚠️ 踩坑记录（2026-09-13）：
 *   1. 这个按钮**不在 `[role="dialog"]` 里** —— 它是右侧说书人控制台的
 *      **主操作按钮**（橙黄色，右下角）。只在 dialog 里找会永远推不动。
 *   2. 夜间末步的按钮会变成「🌞 天亮了 - 进入白天」，点它即进入黎明；
 *      随后自动落到 **「第 N 天」**（白天阶段）。
 *      实测：一路连点「确认 & 下一步」即可直接走完首夜抵达第 1 天，
 *      **不需要**单独去点「天亮了」。
 *
 * @returns 是否已进入白天（出现「第 N 天」）
 */
/**
 * 在「请选择目标玩家」弹窗里选够目标再确认。
 *
 * ⚠️ 这是**夜间能否推到底的关键**：占卜师需 2 人、僧侣需 1 人……
 *    不选目标时「确认选择 (0/N)」是 disabled，盲目点"下一步"会**永远卡死**在此弹窗。
 *
 * 策略：读取「最少 N 人」里的 N，按座位顺序点选 N 个**可选**座位卡
 *      （跳过带「(自己)」且未标记可自选的），再点「确认选择」。
 *
 * @returns 是否完成了一次选择+确认
 */
async function pickTargetsInDialog(
  page: Page,
  dialog: any
): Promise<boolean> {
  const hintText = (await dialog.innerText().catch(() => "")) as string;
  const m = hintText.match(/最少\s*(\d+)\s*人/);
  const need = m ? Number(m[1]) : 1;
  if (need <= 0) {
    // 不强制选人 → 直接确认
    const okBtn = dialog
      .locator("button")
      .filter({ hasText: /确认选择|确认/ })
      .first();
    if (await okBtn.count()) {
      await okBtn.click({ timeout: 5_000 }).catch(() => {});
      await page.waitForTimeout(250);
      return true;
    }
    return false;
  }

  // 座位卡：文字含「N号」且不是「撤销/确认」这类操作按钮
  const seatCards = dialog
    .locator("button")
    .filter({ hasText: /^\s*\d+号/ });
  const total = await seatCards.count();
  let picked = 0;
  for (let i = 0; i < total && picked < need; i++) {
    const card = seatCards.nth(i);
    const t = ((await card.innerText().catch(() => "")) as string)
      .replace(/\s+/g, "")
      .trim();
    // 跳过「(自己)」——多数技能不允许选自己
    if (t.includes("(自己)")) continue;
    if (await card.isDisabled().catch(() => true)) continue;
    await card.click({ timeout: 5_000 }).catch(() => {});
    picked++;
    await page.waitForTimeout(120);
  }

  const okBtn = dialog
    .locator("button")
    .filter({ hasText: /确认选择/ })
    .first();
  if (!(await okBtn.count())) return false;
  if (await okBtn.isDisabled().catch(() => true)) {
    // 还没选够（可能可选座位不足），退化：直接点第一个可用座位
    for (let i = 0; i < total; i++) {
      const card = seatCards.nth(i);
      if (await card.isDisabled().catch(() => true)) continue;
      await card.click({ timeout: 5_000 }).catch(() => {});
      break;
    }
  }
  await okBtn.click({ timeout: 5_000 }).catch(() => {});
  await page.waitForTimeout(250);
  return true;
}

/**
 * ⭐⭐ **在页面内**驱动整个夜晚，直到进入白天（「第 N 天」）。
 *
 * 为什么不用 Playwright 的定位器逐次点击？
 *   每次定位/点击都要 **Node ↔ 浏览器往返**（几十~几百 ms），
 *   走完一整个夜晚要几十次动作 → 单次 >2 分钟，还会触发 Worker 无法退出。
 *   改为 `page.evaluate()` 把**整个驱动循环塞进页面**里跑，
 *   没有往返开销 → 实测从分钟级降到**秒级**。
 *
 * 驱动规则（对应 UI 上真实要做的事）：
 *   1. 有「请选择目标玩家（最少 N 人）」弹窗 → 先点 N 个可选座位 → 再点「确认选择」
 *   2. 其他弹窗（结果页/告知页）→ 点其可用的确认类按钮
 *   3. 无弹窗 → 点控制台主操作按钮「确认 & 下一步」（夜间末步为「🌞 天亮了 - 进入白天」）
 *   4. 出现「第 N 天」即停
 *
 * ⚠️ 用原生 `element.click()` 派发真实 click 事件，React 能正常接收。
 *
 * @returns "day" | "timeout"
 */
export async function advanceNightFast(page: Page): Promise<"day" | "timeout"> {
  return (await page.evaluate(async () => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const norm = (el: any) =>
      ((el?.textContent as string) || "").replace(/\s+/g, "");
    const btnsIn = (root: any) =>
      Array.from(root.querySelectorAll("button")) as any[];
    // ⚠️ 必须用 `textContent` 而非 `innerText`！
    //    innerText 会触发**布局计算**（100~300ms/次），循环几十次就拖到分钟级
    //    —— 这正是"页内循环也照样挂死"的根因。
    //    textContent 不触发布局，廉价。
    const bodyText = () => document.body.textContent || "";
    const isDay = () => /第\s*\d+\s*天/.test(bodyText());
    const CONFIRM = /确认选择|确认|继续|下一步|确定|知道了|完成了/;

    // ⚠️ 必须有**上界 + 无进展熔断**：
    //    上界过大（如 4000×60ms=240s）会直接拖爆测试超时；
    //    若某步反复点同一个按钮而无变化（例如按钮已 disabled 但被误判），
    //    也要及时跳出，否则同样挂死。
    const MAX_STEPS = 500;
    let stall = 0;
    let lastSig = "";

    for (let i = 0; i < MAX_STEPS; i++) {
      if (isDay()) return "day";

      // 进度签名：用「可见弹窗文本 + 主按钮文本」做指纹
      const dlg = document.querySelector('[role="dialog"]');
      const mainBtn = btnsIn(document).find((b) =>
        /确认&下一步|下一步|天亮了/.test(norm(b))
      );
      const sig = `${dlg ? norm(dlg).slice(0, 80) : ""}||${mainBtn ? norm(mainBtn) : ""}`;
      if (sig === lastSig) {
        stall++;
        if (stall > 120) return "timeout"; // 连续 120 次无变化 → 熔断
      } else {
        stall = 0;
        lastSig = sig;
      }

      if (dlg) {
        const hint = (dlg.textContent || "").replace(/\s+/g, "");
        if (/请选择目标玩家/.test(hint)) {
          const m = hint.match(/最少(\d+)人/);
          const need = m ? Number(m[1]) : 1;
          const cards = btnsIn(dlg).filter((b) => /^\d+号/.test(norm(b)));
          let picked = 0;
          for (const c of cards) {
            if (picked >= need) break;
            if (norm(c).includes("(自己)")) continue;
            if (c.disabled) continue;
            c.click();
            picked++;
            await sleep(20);
          }
        }
        const ok =
          btnsIn(dlg).find((b) => CONFIRM.test(norm(b)) && !b.disabled) ??
          btnsIn(dlg).find((b) => !b.disabled);
        if (ok) {
          ok.click();
          await sleep(45);
          continue;
        }
      }

      const next = btnsIn(document).find(
        (b) => /确认&下一步|下一步|天亮了/.test(norm(b)) && !b.disabled
      );
      if (next) {
        next.click();
        await sleep(45);
        continue;
      }

      await sleep(45);
    }
    return isDay() ? "day" : "timeout";
  })) as "day" | "timeout";
}

/**
 * ⭐⭐ **完成一次完整黄昏并进入下一夜**（在页面内驱动，无往返开销）。
 *
 * 黄昏 UI 实测流程（`e2e` 探针确认）：
 *   1. 点圆桌座位选 **【提名者】** → 该座位出现「📣 提名中」标记
 *   2. 再点另一个座位选 **【被提名者】**
 *   3. 点「📣 确认发起提名 (触发技能检测)」
 *   4. 出现投票 / 处决相关弹窗 → 逐个确认
 *   5. 点「入夜 (下一回合) 🌙」→ 进入下一夜
 *
 * ⚠️ **只跑一次，不做外层循环** —— 上一版把它放进通用循环里，
 *    结果「提名 → 投票 → 回到黄昏 → 再提名」无限交替，签名一直变导致
 *    无进展熔断也拦不住（因为签名在变），最终超时。
 *
 * ⚠️ 判断相位一律用 `textContent`（不触发布局）。
 *
 * @returns "night" | "timeout"
 */
export async function completeDuskEnterNight(
  page: Page,
  maxModalSteps = 60
): Promise<"night" | "timeout"> {
  return (await page.evaluate(async (maxSteps) => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const norm = (el: any) =>
      ((el?.textContent as string) || "").replace(/\s+/g, "");
    const allBtns = () =>
      Array.from(document.querySelectorAll("button")) as any[];
    const text = () => document.body.textContent || "";
    const CONFIRM = /确认|提交|确定|继续|下一步|完成了|知道了/;

    // ── 1~3：提名 ──
    const seatBtns = allBtns().filter((b) => /^[1-9]\d*$/.test(norm(b)));
    if (seatBtns.length >= 2) {
      seatBtns[0].click();
      await sleep(250);
      seatBtns[1].click();
      await sleep(250);
    }
    const nominate = allBtns().find(
      (b) => /确认发起提名/.test(norm(b)) && !b.disabled
    );
    if (nominate) {
      nominate.click();
      await sleep(600);
    }

    // ── 4~5：处理投票/处决弹窗，直到出现「入夜」 ──
    for (let i = 0; i < maxSteps; i++) {
      const dlg = document.querySelector('[role="dialog"]');
      if (dlg) {
        const ok =
          (Array.from(dlg.querySelectorAll("button")) as any[]).find(
            (b) => CONFIRM.test(norm(b)) && !b.disabled
          ) ??
          (Array.from(dlg.querySelectorAll("button")) as any[]).find(
            (b) => !b.disabled
          );
        if (ok) {
          ok.click();
          await sleep(350);
          continue;
        }
      }
      const toNight = allBtns().find(
        (b) => /入夜/.test(norm(b)) && !b.disabled
      );
      if (toNight) {
        toNight.click();
        await sleep(1200);
        return "night";
      }
      await sleep(250);
    }
    return /入夜/.test(text()) ? "night" : "timeout";
  }, maxModalSteps)) as "night" | "timeout";
}

export async function advanceNightToDay(
  page: Page,
  maxSteps = 120
): Promise<boolean> {
  // ⚠️ 性能要点（实测决定成败）：循环里**绝不能**每次做 `body.innerText()`
  //    —— 整页 innerText 在复杂页面上要 100~300ms，几十次循环就拖到几分钟，
  //    进而触发 Worker 无法退出。改用**廉价定位器可见性检查**。
  const dayMarker = page.getByText(/第\s*\d+\s*天/).first();
  const dawnBtn = page.locator("button").filter({ hasText: /天亮了/ }).first();
  const nextBtn = page
    .locator("button")
    .filter({ hasText: /确认\s*&\s*下一步|下一步/ })
    .first();
  const anyDialog = page.locator('[role="dialog"]').last();

  for (let i = 0; i < maxSteps; i++) {
    if (await dayMarker.isVisible().catch(() => false)) return true;

    if (
      (await dawnBtn.isVisible().catch(() => false)) &&
      !(await dawnBtn.isDisabled().catch(() => true))
    ) {
      await dawnBtn.click({ timeout: 5_000 }).catch(() => {});
      continue;
    }

    if (await anyDialog.isVisible().catch(() => false)) {
      // ⭐ 关键：占卜师/僧侣等**需要选目标**的角色，会出现
      //    「请选择目标玩家（最少 N 人）」的座位网格，
      //    此时「确认选择 (0/N)」是 **disabled** —— 盲目点确认永远过不去。
      //    必须先点选 N 个座位再确认。
      const pickHint = anyDialog.getByText(/请选择目标玩家/).first();
      if (await pickHint.isVisible().catch(() => false)) {
        const picked = await pickTargetsInDialog(page, anyDialog);
        if (picked) continue;
      }

      const confirm = anyDialog
        .locator("button")
        .filter({ hasText: /确认|继续|下一步|确定/ })
        .first();
      if (await confirm.count()) {
        await confirm.click({ timeout: 5_000 }).catch(() => {});
        await page.waitForTimeout(250);
        continue;
      }
    }

    if (
      (await nextBtn.isVisible().catch(() => false)) &&
      !(await nextBtn.isDisabled().catch(() => true))
    ) {
      await nextBtn.click({ timeout: 5_000 }).catch(() => {});
      continue;
    }

    await page.waitForTimeout(250);
  }
  return dayMarker.isVisible().catch(() => false);
}

/** 读取「N / N 已分配角色」 */
export async function readAssigned(
  page: Page
): Promise<{ done: number; total: number } | null> {
  const body = await page.locator("body").innerText();
  const m = body.match(/(\d+)\s*\/\s*(\d+)\s*已分配角色/);
  return m ? { done: Number(m[1]), total: Number(m[2]) } : null;
}

/** 读取阵营分布（**先切区块再匹配**，避免「小恶魔」撞「恶魔」、「村民 13 位角色」撞「村民 N」） */
export async function readCamps(
  page: Page
): Promise<Record<string, number> | null> {
  const body = await page.locator("body").innerText();
  const idx = body.indexOf("阵营分布");
  const region = idx >= 0 ? body.slice(idx, idx + 240) : body;
  const pick = (label: string) => {
    const m = region.match(
      new RegExp(`(?<![\\u4e00-\\u9fa5])${label}\\s*(\\d+)(?!\\s*位)`)
    );
    return m ? Number(m[1]) : NaN;
  };
  const out = {
    村民: pick("村民"),
    外来者: pick("外来者"),
    爪牙: pick("爪牙"),
    恶魔: pick("恶魔"),
  };
  return Object.values(out).some((v) => Number.isNaN(v)) ? null : out;
}

export { T };
