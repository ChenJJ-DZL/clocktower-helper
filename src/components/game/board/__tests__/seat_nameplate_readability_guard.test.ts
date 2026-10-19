/**
 * 座位角色名牌「可读性」契约（2026-10-13 用户反馈）
 * ==================================================================
 * 用户反馈：座位上的角色名因为**投影/特效**非常看不清。
 * 根因：`SeatNode` 的角色名同时叠加了内联 `textShadow`（两层暗影）
 *       + Tailwind `drop-shadow-md`，且文字直接压在代币渐变与高光之上；
 *       在 1600→手机 scale≈0.43 的缩放舞台上笔画糊成一团。
 * 修法：改用不透明底板名牌 `.seat-nameplate`，并**彻底移除投影/滤镜**。
 *
 * 本护栏钉住三件事：
 *   ① SeatNode 使用 `seat-nameplate` 且不再出现 drop-shadow / 内联 textShadow；
 *   ② globals.css 定义名牌样式且显式 `text-shadow: none`；
 *   ③ 两主题名牌均为纯文字（无底板盒/无边框），配色随代币底色
 *      （classic 深代币米白字 / 浅灰死亡代币深褐字；modern 白卡墨字）。
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../../../../..");
const SEAT_SRC = readFileSync(resolve(ROOT, "src/components/SeatNode.tsx"), "utf-8");
const CSS = readFileSync(resolve(ROOT, "app/globals.css"), "utf-8");

describe("座位角色名牌可读性契约", () => {
  it("① SeatNode 使用名牌容器，且角色名不再有 drop-shadow / 内联 textShadow", () => {
    expect(SEAT_SRC).toContain("seat-nameplate");
    // 取 RoleNameLines 所在的名称块；切片起点在注释内，先裁掉首个块注释再断言
    let nameBlock = SEAT_SRC.slice(
      SEAT_SRC.indexOf("角色名称牌"),
      SEAT_SRC.indexOf("状态标签容器")
    );
    const commentEnd = nameBlock.indexOf("*/");
    if (commentEnd !== -1) nameBlock = nameBlock.slice(commentEnd + 2);
    expect(nameBlock.length).toBeGreaterThan(50);
    expect(nameBlock).not.toMatch(/drop-shadow/);
    expect(nameBlock).not.toMatch(/textShadow/);
  });

  it("② globals.css 名牌样式显式关闭投影与滤镜，并限制最大宽度防溢出", () => {
    const start = CSS.indexOf(".seat-nameplate {");
    expect(start).toBeGreaterThan(-1);
    const block = CSS.slice(start, CSS.indexOf("}", start));
    expect(block).toMatch(/text-shadow:\s*none/);
    expect(block).toMatch(/box-shadow:\s*none/);
    expect(block).toMatch(/max-width:/);
    // 子元素也不得继承投影
    expect(CSS).toMatch(/\.seat-nameplate \*[\s\S]{0,80}text-shadow:\s*none\s*!important/);
  });

  it("③ 名牌：两主题均为纯文字（2026-10-14 modern / 2026-10-19 classic 用户裁定去底板盒与边框）", () => {
    expect(CSS).toMatch(/\.theme-classic \.seat-nameplate\s*\{/);
    expect(CSS).toMatch(/\.theme-modern \.seat-nameplate\s*\{/);
    // classic：透明底 + 无边框 + 无内衬；存活深代币配米白字
    const classic = CSS.slice(CSS.indexOf(".theme-classic .seat-nameplate {"));
    expect(classic.slice(0, 200)).toMatch(/background:\s*transparent/);
    expect(classic.slice(0, 200)).toMatch(/border:\s*none/);
    expect(classic.slice(0, 200)).toMatch(/padding:\s*0/);
    expect(classic.slice(0, 200)).toMatch(/#fffbeb/);
    // classic 死亡态：浅灰代币 ⇒ 必须换深褐字（去掉底板后可读性前提）
    expect(CSS).toMatch(
      /\.theme-classic \.seat-nameplate\.seat-nameplate-dead\s*\{[^}]*color:\s*#44403c/
    );
    // modern：白卡代币 ⇒ 墨字
    const modern = CSS.slice(CSS.indexOf(".theme-modern .seat-nameplate {"));
    expect(modern.slice(0, 200)).toMatch(/background:\s*transparent/);
    expect(modern.slice(0, 200)).toMatch(/border:\s*none/);
    expect(modern.slice(0, 200)).toMatch(/var\(--ink-900\)/);
  });
});
