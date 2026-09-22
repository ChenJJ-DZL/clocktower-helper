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
  //    坑 1：`div:has-text(...)` 会命中**多层祖先 div**，`.last()` 可能落到
  //          最外层容器 → 其 `.getByText("进入配置")` 解析到**不可点的文本节点**，
  //          点击静默无效 → 仍在剧本列表页 → 下一步「⚡ 快速开始」15s 超时
  //          （实测：重试路径 attempt≥2 才暴露，因为首次 goto 后元素恰好可点）。
  //          故用 `getByRole("button")` 精确锁到**按钮**。
  //    坑 2：列表在页面上可能有重复渲染层 → 取 `.last()` 的真实按钮。
  //    坑 3：点击后必须**等配置页就绪**再继续，否则后续 find 会在旧页面上跑。
  await page
    .getByRole("button", { name: new RegExp(scriptName) })
    .last()
    .click({ timeout: T.click });

  // 等配置页标志元素就绪（「剧本配置」/「快速开始」/「随机落座」任一出现即可）
  const quickStart = page.getByText("⚡ 快速开始").first();
  const ready = await quickStart
    .waitFor({ state: "visible", timeout: T.visible })
    .then(() => true)
    .catch(() => false);

  if (!ready) {
    // 兜底：有些剧本卡片按钮名不完全等于剧本名，退化用 has-text 精确定位
    await page
      .locator(`button:has-text("${scriptName}")`)
      .last()
      .click({ timeout: T.click });
    await expect(quickStart).toBeVisible({ timeout: T.visible });
  }

  await quickStart.click({ timeout: T.click });
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
/**
 * 推进夜间到白天。
 *
 * 返回 `"spy"` 表示：本局抽到了**间谍（spy）**——其「查看魔典」步骤
 * 在 UI 上**没有独立的确认按钮**（说书人只是把魔典递给玩家看，点主按钮即可），
 * `advanceNightFast` 无法自动完成这个语义步骤，会空转到熔断。
 * 调用方（如 `setupToDusk`）应把它当作「这局不适合自动驱动」的信号，
 * **重开一局**（游戏构成是随机发牌，重开即可换掉间谍）。
 *
 * 为什么不硬点过去：间谍步骤里「恶魔 2号，爪牙 」这类文案需要说书人**人工读图**，
 * 自动化点了也拿不到正确的核对结果，属于**不该自动化**的步骤。
 */
export async function advanceNightFast(
  page: Page
): Promise<"day" | "timeout" | "spy"> {
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

    // ⚠️ 间谍（spy）探测：「查看魔典」步骤没有确认按钮，自动驱动会空转。
    //    判定特征：夜间行动顺序 / 当前行动文案里出现「间谍」且含「查看魔典」。
    //    一旦命中就立刻退出，交给调用方重开一局。
    const spyActive = () => {
      const t = bodyText();
      if (/查看魔典/.test(t) && /间谍/.test(t)) return true;
      // 兜底：当前行动栏直接点名间谍
      return /唤醒\d+号【间谍】/.test(t);
    };

    for (let i = 0; i < MAX_STEPS; i++) {
      if (isDay()) return "day";
      if (spyActive()) return "spy";

      // 进度签名：用「可见弹窗文本 + 主按钮文本」做指纹
      const dlg = document.querySelector('[role="dialog"]');
      const mainBtn = btnsIn(document).find((b) =>
        /确认&下一步|下一步|天亮了/.test(norm(b))
      );
      const sig = `${dlg ? norm(dlg).slice(0, 80) : ""}||${mainBtn ? norm(mainBtn) : ""}`;
      // ⚠️ 间谍步骤会「有主按钮可点、但点了不推进」→ 仍按签名无变化熔断；
      //    这里把 stall 上界收紧到 40，避免白等 120 轮（每轮 45ms → 5.4s）。
      if (sig === lastSig) {
        stall++;
        if (stall > 40) return spyActive() ? "spy" : "timeout";
      } else {
        stall = 0;
        lastSig = sig;
      }

      if (dlg) {
        const hint = (dlg.textContent || "").replace(/\s+/g, "");

        /**
         * ⚠️ 双选择弹窗（目标 + 角色）—— 目前已知：洗脑师（cerenovus）。
         *
         * 官方能力：洗脑师选「一名玩家」+「一个善良角色」，让该玩家疯狂扮演这个角色。
         * 因此该弹窗有**两组必选项**，缺任一主按钮都灰显（文案「请先选择目标与疯狂角色」）。
         *
         * 🐛 修复（2026-09-21 探针实测）：上一版 helper 只处理座位卡片（`/^\d+号/`），
         *    **不认识角色胶囊** ⇒ 洗脑师步骤永远满足不了 → 空转熔断 `timeout`。
         *    探针 5 局对照：含洗脑师的 2 局全部 timeout，其余 3 局正常到 day，
         *    根因即此（**不是生产缺陷** —— 弹窗实现完整，人工可正常选）。
         *
         * ✅ 用**稳定测试属性**定位（`data-testid="cerenovus-role-grid"` /
         *    `data-role-id`），不依赖文案 —— 文案改版不会让自动化静默失效。
         */
        const roleGrid = dlg.querySelector('[data-testid="cerenovus-role-grid"]');
        if (roleGrid) {
          // ① 先选目标（座位卡，排除自己/已死/已选）
          const targetCards = Array.from(
            dlg.querySelectorAll('[data-testid="cerenovus-target-grid"] button[data-seat-id]')
          ) as any[];
          const unselected = targetCards.filter(
            (b) => b.getAttribute("data-selected") !== "true" && !b.disabled
          );
          if (unselected.length > 0) {
            unselected[0].click();
            await sleep(30);
          }
          // ② 再选疯狂角色（取第一个未选中的胶囊）
          const roleCaps = Array.from(
            roleGrid.querySelectorAll("button[data-role-id]")
          ) as any[];
          const roleUnsel = roleCaps.find(
            (b) => b.getAttribute("data-selected") !== "true" && !b.disabled
          );
          if (roleUnsel) {
            roleUnsel.click();
            await sleep(30);
          }
        } else if (/请选择目标玩家/.test(hint)) {
          /**
           * 通用「目标选择」弹窗。
           *
           * ⚠️ 军团（legion）特例（2026-09-21 探针实测）：
           *   官方「夜晚**可能**有 1 人死亡」⇒ `targetConfig {min:0,max:1}`
           *   ⇒ 主按钮是 **「确认（不选目标）」**，而 `确认&下一步` 恒 disabled。
           *   本分支的既有逻辑「picked >= need」在 need=0 时**一个都不点**，
           *   随后 `CONFIRM` 正则能匹配到「确认（不选目标）」→ 可以推进 ✅。
           *   但为使**死亡能落库**（便于 L4 断言死亡契约），这里主动选 1 个
           *   非自己/非军团的存活目标，模拟说书人代操作。
           *   —— 军团局邪恶互认，杀自己人无意义；优先选非军团座位。
           */
          const isLegionStep = /军团/.test(hint);
          const m = hint.match(/最少(\d+)人/);
          let need = m ? Number(m[1]) : 1;
          const cards = btnsIn(dlg).filter((b) => /^\d+号/.test(norm(b)));
          if (isLegionStep && need === 0) need = 1; // 主动代选，让伤亡可断言
          let picked = 0;
          // 军团局优先选「非军团」座位（杀军团同伴无意义）
          const ordered = isLegionStep
            ? [
                ...cards.filter(
                  (c) => !/军团/.test(norm(c)) && !/\(自己\)/.test(norm(c))
                ),
                ...cards,
              ]
            : cards;
          for (const c of ordered) {
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
    if (isDay()) return "day";
    return spyActive() ? "spy" : "timeout";
  })) as "day" | "timeout" | "spy";
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
  maxModalSteps = 90
): Promise<"night" | "timeout"> {
  return (await page.evaluate(async (maxSteps) => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const norm = (el: any) =>
      ((el?.textContent as string) || "").replace(/\s+/g, "");
    const allBtns = () =>
      Array.from(document.querySelectorAll("button")) as any[];
    const text = () => document.body.textContent || "";
    const CONFIRM = /确认|提交|确定|继续|下一步|完成了|知道了|好的/;

    /**
     * ⚠️⚠️ 修复（2026-09-21 探针实测）：本函数原先**直接开始提名**，
     *   但 `advanceNightFast` 结束时页面停在 **白天(day)**，
     *   必须先点「进入黄昏处决阶段」才能提名。
     *   ⇒ 原版 3/3 局全部 `timeout`（提名按钮根本不在页面上）。
     *   探针证据：按钮列表里存在「进入黄昏处决阶段」，但 helper 从没点它。
     *
     * 同时处理**日间能力门禁**（记忆里的「白天必须发动才能进黄昏」）：
     *   例：畸形秀演员(mutant) 的「疯狂仲裁」—— 页面会出现
     *   `需先完成畸形秀演员判定【疯狂仲裁】[disabled]`。
     *   此时「进入黄昏」按钮是 disabled，必须先点日间技能按钮。
     *   ⚠️ 这是**生产的正确行为**（门禁），不是缺陷；自动化必须配合它。
     */
    const clickByPattern = async (re: RegExp): Promise<boolean> => {
      const b = allBtns().find((x) => re.test(norm(x)) && !x.disabled);
      if (!b) return false;
      b.click();
      await sleep(400);
      return true;
    };

    // ── 0：日间能力门禁（若存在必须先解决，否则「进入黄昏」永久禁用）──
    /**
     * ⚠️⚠️ 修复（2026-09-21 探针实测，8 局中 2 局失败）：
     *
     * 门禁的真实 DOM（探针抓取，`GT_2`/`GT_4` 实证）：
     *   ✔ `疯狂仲裁`                              → **`disabled: false`** ← 要点这个
     *   ✘ `需先完成畸形秀演员判定【疯狂仲裁】`    → `disabled: true`      ← 只是提示
     *   同理：`疯狂洗脑`（洗脑师门禁）可点；
     *        `需先完成洗脑师判定【疯狂洗脑】` 是 disabled 提示。
     *
     * 原版缺陷：匹配式 `/^(使用|发动|进行).+/` **漏掉了「疯狂仲裁」「疯狂洗脑」**
     *   这两个门禁按钮的文案（既不以"使用"开头，也不含"判定"时的可点项），
     *   于是门禁没完成 → 「进入黄昏」永久 disabled → `timeout`。
     *
     * ✅ 正确策略：**凡是「可点」且**文案命中门禁词（疯狂仲裁/疯狂洗脑/判定/使用/发动）
     *    的按钮，都是候选；并**排除 disabled 的提示按钮**。
     *    ⚠️ 绝不能靠「文案含判定」——提示按钮也含「判定」二字（歧义）。
     */
    const GATE_BTN = /疯狂仲裁|疯狂洗脑|^(使用|发动|进行).+|判定(?!$)/;
    const isHintBtn = (t: string) => /^需先完成|^请先|^待完成/.test(t);
    for (let g = 0; g < 10; g++) {
      const gated = /需先完成|请先完成/.test(text());
      const candidates = allBtns().filter(
        (b) =>
          !b.disabled &&
          !isHintBtn(norm(b)) &&
          GATE_BTN.test(norm(b))
      );
      if (candidates.length === 0) break;
      // 只在门禁提示存在、或「进入黄昏」被禁用时才动手，避免抢走正常流程
      const duskBtnDisabled =
        allBtns().find((b) => /进入黄昏/.test(norm(b)))?.disabled === true;
      if (!gated && !duskBtnDisabled) break;

      /**
       * ⚠️ 2026-09-22：**候选排序曾试过「优先门禁专名」，已撤销**。
       *   动机：`GATE_BTN` 同时匹配 `疯狂洗脑`/`疯狂仲裁` 与 `使用 艺术家` 等通用日间技能，
       *   而 `candidates[0]` 按 DOM 顺序取 ⇒ 理论上可能先点通用技能（还白白消耗一次性技能）。
       *   但我加了 `GATE_PRIORITY` 排序后，实测**该 spec 明显变慢**（>10 分钟未跑完，
       *   而改动前同 spec 约 2 分钟）⇒ **未验证的改动 + 可观测的性能退化 ⇒ 一律撤销**。
       *   📌 若要重做，先写一个"只跑到门禁解除"的小探针量化每步耗时，再决定。
       */
      candidates[0].click();
      await sleep(500);
      // 处理随之弹出的确认/选择弹窗
      for (let k = 0; k < 12; k++) {
        const dlg = document.querySelector('[role="dialog"]');
        if (!dlg) break;
        const dlgBtns = Array.from(dlg.querySelectorAll("button")) as any[];

        /**
         * ⚠️⚠️ 「疯狂仲裁」类门禁弹窗的按钮**不在 CONFIRM 正则里**（探针 `G2_3` 实证）：
         *   弹窗：`🎭判定【1号】玩家是否疯狂证明自己是外来者？`
         *   按钮：`取消` | **`否，无事发生`** | **`是，执行处决`**
         * 原版只找 `/确认|确定|继续|下一步|好的/` ⇒ **一个都匹配不到**
         *   ⇒ 弹窗永不关闭 ⇒ 「进入黄昏」恒 disabled ⇒ `timeout`（8 局中 2 局）。
         *
         * ✅ 策略：只点文案含 **「无事发生」** 的那一项（= 三类弹窗的**保守项**）：
         *   · 疯狂仲裁判定 → `否，无事发生`        （白天继续，不处决）
         *   · 疯狂洗脑判定 → `是 (通过 / 无事发生)`（白天继续，不处决）
         *   两者都**不处决、不跳过黄昏**，把局面保持在"正常走一遍"的形态。
         *   ⚠️ 绝不能点「是，执行处决」/「否(处决并跳入下一夜)」—— 那会**处决玩家并跳过黄昏**，
         *      把测试局面改得与"正常走一遍"完全不同（污染后续断言）。
         *
         * 🔴🔴 2026-09-22 修复（**这是「存活洗脑师【疯狂洗脑】按钮无反应」的真根因**）：
         *   旧判据是 `/^否|无事发生|^取消/` —— 其中
         *     · `^取消` 会命中「**使用技能** · 确定使用 疯狂洗脑 吗？」弹窗的**取消**按钮
         *       ⇒ **每次都把技能取消掉** ⇒ 门禁永不解除 ⇒ 循环 10 次 break ⇒ `timeout`
         *       ⇒ 被误读成「按钮点了没反应 / 门禁无法自动解除」，还差点当成生产缺陷登记。
         *     · `^否` 会命中洗脑师判定里的 **`否(处决并跳入下一夜)`** —— 那是**处决**选项，
         *       一旦 DOM 顺序变化就会被误点（污染局面）。
         *   ⇒ 收紧为 `/无事发生/`：**精确**命中三类保守项，且**不会**命中 `取消` / `否(处决…)`。
         *
         * 🔬 实测证据（2026-09-22 探针，罂粟花开 **与** 梦殒春宵**逐步骤完全镜像**）：
         *   `[step1] gated=true` → 点「疯狂洗脑」成功
         *   `[step2] dlg="使用技能✕确定使用疯狂洗脑吗？取消确认"` → 点「确认」
         *   `[step3] dlg="🧠疯狂洗脑判定…[取消][是(通过/无事发生)][否(处决并跳入下一夜)]"` → 点「是(通过/无事发生)」
         *   `[step4] gated=false` ⇒ 门禁解除、「进入黄昏处决阶段」可点 ✅
         */
        const noop = dlgBtns.find((b) => /无事发生/.test(norm(b)) && !b.disabled);
        if (noop) {
          noop.click();
          await sleep(450);
          continue;
        }
        const ok =
          dlgBtns.find((b) => CONFIRM.test(norm(b)) && !b.disabled) ??
          dlgBtns.find((b) => !b.disabled);
        if (!ok) break;
        ok.click();
        await sleep(350);
      }
    }

    // ── 1：进入黄昏处决阶段（原版缺失的关键一步）──
    for (let i = 0; i < 6; i++) {
      const entered =
        /黄昏/.test(text()) &&
        !allBtns().some((b) => /进入黄昏/.test(norm(b)) && !b.disabled);
      if (entered) break;
      const ok = await clickByPattern(/进入黄昏/);
      if (!ok) break;
    }

    // ── 2：提名（点两个座位 → 确认发起提名）──
    const seatBtns = allBtns().filter((b) => /^[1-9]\d*$/.test(norm(b)));
    if (seatBtns.length >= 2) {
      seatBtns[0].click();
      await sleep(300);
      seatBtns[1].click();
      await sleep(300);
    }
    if (await clickByPattern(/确认发起提名/)) {
      await sleep(700);
    }

    // ── 3：处理投票/处决弹窗，直到出现「入夜」 ──
    for (let i = 0; i < maxSteps; i++) {
      const dlg = document.querySelector('[role="dialog"]');
      if (dlg) {
        const dlgBtns = Array.from(dlg.querySelectorAll("button")) as any[];
        // 门禁/判定类弹窗：只点含「无事发生」的**保守项**（见上面 0 段的详细说明）
        //   ⚠️ 旧判据 `/^否|无事发生|^取消/` 会误点 `取消`（使用技能确认框）与
        //      `否(处决并跳入下一夜)`（洗脑师判定的处决项）⇒ 2026-09-22 收紧为 `/无事发生/`
        const noop = dlgBtns.find(
          (b) => /无事发生/.test(norm(b)) && !b.disabled
        );
        if (noop && /判定|疯狂|仲裁/.test((dlg.textContent || "").replace(/\s+/g, ""))) {
          noop.click();
          await sleep(450);
          continue;
        }
        const ok =
          dlgBtns.find((b) => CONFIRM.test(norm(b)) && !b.disabled) ??
          dlgBtns.find((b) => !b.disabled);
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

// ═══════════════════════════════════════════════════════════════════════
// ⭐ L4 状态断言支持（2026-09-21 新增）
// ═══════════════════════════════════════════════════════════════════════
/**
 * ⚠️⚠️ 为什么需要这一段（诚实审计结论）
 * ---------------------------------------------------------------------
 * 审计发现：`e2e/` 里 **0 个状态断言** —— 全部 36 条断言都是
 * `toBeVisible` / `toContainText` / `getByText`（**文案层**）。
 * 这导致「弹窗文字对了 → 测试绿」，但**状态字段有没有真的变**完全没验：
 *   例：投毒者选人后，中毒者座位有没有真的带 `statusEffects:[{type:"poisoned"}]`？
 *      被杀者有没有 `markedForDeath`？幽灵票有没有被消耗？
 * 这正是本项目「测试全绿、人工实测完全不同」的同一病灶，只是发生在 E2E 层。
 *
 * ✅ 正解：读应用**真实的持久化快照**（`localStorage["clocktower_current_snapshot"]`，
 *    由 `utils/persistence.ts::saveCurrentSnapshot` 写入的是**完整 GameSnapshot**），
 *    在 E2E 里断言状态字段，而不是断言文案。
 *
 * 判据：**弹窗文字可以改、文案可以本地化，但 `isPoisoned` / `markedForDeath`
 *      这类字段是引擎的契约，改了就一定影响结算。**
 */
export const SNAPSHOT_KEY = "clocktower_current_snapshot";

/** 读取应用真实持久化快照（未保存/未开局时返回 null） */
export async function readSnapshot(page: Page): Promise<any | null> {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }, SNAPSHOT_KEY);
}

/** 取某座位（0 基 id）的状态字段；找不到返回 null */
export async function readSeat(page: Page, seatId: number): Promise<any | null> {
  const snap = await readSnapshot(page);
  if (!snap?.seats) return null;
  return snap.seats.find((s: any) => s.id === seatId) ?? null;
}

/** 等待快照满足条件（应用写入是异步的 → 必须重试轮询，不能读一次就断言） */
export async function waitForSnapshot(
  page: Page,
  pred: (snap: any) => boolean,
  timeoutMs = 15_000
): Promise<any | null> {
  const deadline = Date.now() + timeoutMs;
  let last: any = null;
  while (Date.now() < deadline) {
    last = await readSnapshot(page);
    if (last && pred(last)) return last;
    await page.waitForTimeout(150);
  }
  return last;
}

/**
 * ⭐ 断言「某座位在快照里满足条件」——E2E 层的状态断言入口。
 *
 * 用法：
 * ```ts
 * await expectSeatState(page, 2, (s) => s.isPoisoned === true, "3号应已中毒");
 * ```
 * ⚠️ 不要用 `expect(text).toContain(...)` 代替本函数 —— 那测的是文案不是状态。
 */
export async function expectSeatState(
  page: Page,
  seatId: number,
  pred: (seat: any) => boolean,
  message: string,
  timeoutMs = 15_000
): Promise<void> {
  const snap = await waitForSnapshot(
    page,
    (s) => {
      const seat = s?.seats?.find((x: any) => x.id === seatId);
      return Boolean(seat) && pred(seat);
    },
    timeoutMs
  );
  const seat = snap?.seats?.find((x: any) => x.id === seatId);
  if (!seat || !pred(seat)) {
    throw new Error(
      `${message}\n实际座位状态: ${JSON.stringify(
        seat
          ? {
              id: seat.id,
              isDead: seat.isDead,
              isPoisoned: seat.isPoisoned,
              isDrunk: seat.isDrunk,
              markedForDeath: seat.markedForDeath,
              statusEffects: seat.statusEffects,
            }
          : null
      )}`
    );
  }
}

