import { useCallback, useRef, useState } from "react";
import type { GamePhase, LogEntry, Seat, WinResult } from "@/app/data";
import { roles } from "../../../app/data";
import { getWinningPlayersList } from "../../utils/reviewHelper";
import { ModalWrapper } from "./ModalWrapper";

// 角色ID到中文名的映射
const roleNameMap = new Map(roles.map((r) => [r.id, r.name]));

interface ReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  seats: Seat[];
  victorySnapshot: Seat[];
  gameLogs: LogEntry[];
  gamePhase: GamePhase;
  winResult: WinResult;
  winReason: string | null;
  isPortrait: boolean;
}

export function ReviewModal({
  isOpen,
  onClose,
  seats,
  victorySnapshot,
  gameLogs,
  gamePhase,
  winResult,
  winReason,
  isPortrait,
}: ReviewModalProps) {
  const [exporting, setExporting] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const handleExport = useCallback(async () => {
    if (!contentRef.current || exporting) return;
    setExporting(true);
    try {
      const { exportReviewAsImage } = await import(
        "../../../src/utils/exportReview"
      );
      await exportReviewAsImage({
        targetElement: contentRef.current,
        scriptName: "对局复盘",
        winResult,
        scale: window.devicePixelRatio > 1 ? 2 : 1,
      });
    } catch (e) {
      console.error("导出失败:", e);
    } finally {
      setExporting(false);
    }
  }, [exporting, winResult]);

  if (!isOpen) return null;

  // 复盘需要展示当前座位信息；若尚未设置胜利快照（游戏中/部分结算路径），
  // 回退到实时座位，保证“复盘”按钮任何时候都能打开。
  const displaySeats =
    victorySnapshot && victorySnapshot.length > 0 ? victorySnapshot : seats;

  return (
    <ModalWrapper
      title="📜 对局复盘"
      onClose={onClose}
      className="max-w-6xl"
      footer={
        <button
          onClick={handleExport}
          disabled={exporting}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {exporting ? "⏳ 导出中..." : "📸 导出复盘长图"}
        </button>
      }
    >
      <div
        ref={contentRef}
        className={`bg-black/50 ${isPortrait ? "p-3" : "p-6"} rounded-xl ${isPortrait ? "flex-col" : "flex"} gap-6`}
      >
        <div className={`${isPortrait ? "w-full" : "w-1/3"}`}>
          <h4
            className={`text-purple-400 ${isPortrait ? "mb-2 text-sm" : "mb-4 text-xl"} font-bold border-b pb-2`}
          >
            📖 当前座位信息
          </h4>
          <div
            className={`space-y-2 ${isPortrait ? "max-h-64" : "max-h-[calc(100vh-16rem)]"} overflow-y-auto`}
          >
            {displaySeats.map((s) => (
              <div
                key={s.id}
                className={`py-2 border-b border-gray-700 flex justify-between items-center ${isPortrait ? "text-xs" : ""}`}
              >
                <span className="font-bold">{s.id + 1}号</span>
                <div className="flex flex-col items-end">
                  <span
                    className={
                      s.role?.type === "demon"
                        ? "text-red-500 font-bold"
                        : s.role?.type === "minion"
                          ? "text-orange-500"
                          : "text-blue-400"
                    }
                  >
                    {s.role?.name}
                    {s.role?.id === "drunk" && ` (伪:${s.charadeRole?.name})`}
                    {s.isRedHerring && " [天敌红罗剎]"}
                  </span>
                  {s.isDead && (
                    <span
                      className={`${isPortrait ? "text-[10px]" : "text-xs"} text-gray-500 mt-1`}
                    >
                      💀 已死亡
                    </span>
                  )}
                  {s.isPoisoned && (
                    <span
                      className={`${isPortrait ? "text-[10px]" : "text-xs"} text-green-500 mt-1`}
                    >
                      🧪 中毒
                    </span>
                  )}
                  {s.isProtected && (
                    <span
                      className={`${isPortrait ? "text-[10px]" : "text-xs"} text-blue-500 mt-1`}
                    >
                      🛡️ 受保护
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className={`${isPortrait ? "w-full" : "w-2/3"}`}>
          <h4
            className={`text-yellow-400 ${isPortrait ? "mb-2 text-sm" : "mb-4 text-xl"} font-bold border-b pb-2`}
          >
            📋 操作记录
          </h4>
          <div
            className={`space-y-4 ${isPortrait ? "max-h-96" : "max-h-[calc(100vh-16rem)]"} overflow-y-auto`}
          >
            {(() => {
              // 按时间线顺序组织日志：setup -> firstNight -> day -> dusk -> night
              // 注意：firstNight 的 day=0，第1天 day=0，第1天黄昏 day=0，第2夜 day=1，第2天 day=1，...
              const phaseOrder: Record<string, number> = {
                setup: 0,
                firstNight: 1,
                day: 2,
                dusk: 3,
                night: 4,
              };

              // 构建座位号到角色名称的映射
              const seatRoleMap = new Map<number, string>();
              displaySeats.forEach((s) => {
                const seatNum = s.id + 1;
                const charadeName = s.charadeRole?.name || "";
                if (s.role?.id === "drunk" && charadeName) {
                  seatRoleMap.set(seatNum, `${charadeName}(实:酒鬼)`);
                } else if (s.role?.name) {
                  seatRoleMap.set(seatNum, s.role.name);
                }
              });

              // 格式化日志消息：将角色/座位完整转为"【座位号-角色名】"格式，呈现完整“谁对谁”、“做了什么”和“结果”
              const formatMsg = (msg?: string | null): string => {
                if (!msg || typeof msg !== "string") return "";

                let formatted = msg.trim();

                // 0. 特殊处理开局落座日志：若为泛指模糊日志（如旧的“已为 15 名玩家随机分配角色并落座”），根据本场实际座位展开为真实落座名单
                if (
                  formatted.includes("随机分配角色并落座") ||
                  formatted.includes("随机分配角色") ||
                  (formatted.startsWith("⚡ 快速开始") &&
                    !formatted.includes("号"))
                ) {
                  const activeSeats = displaySeats.filter((s) => s.role);
                  const seatSummary = activeSeats
                    .map((s) => {
                      let roleName = s.role?.name || "未知";
                      if (s.role?.id === "drunk" && s.charadeRole?.name) {
                        roleName = `酒鬼(伪:${s.charadeRole.name})`;
                      } else if (
                        s.role?.id === "lunatic" &&
                        s.apparentDemonRole?.name
                      ) {
                        roleName = `疯子(伪:${s.apparentDemonRole.name})`;
                      }
                      return `${s.id + 1}号${roleName}`;
                    })
                    .join("、");

                  if (seatSummary) {
                    formatted = `⚡ 快速开始（${activeSeats.length}人落座）：${seatSummary}`;
                  }
                }

                // 若已是格式化完整的开局落座日志，直接返回，避免后续正则把 "1号士兵" 二次替换为 "【1号-士兵】士兵"
                if (
                  formatted.startsWith("⚡ 快速开始") ||
                  formatted.startsWith("⚡ 快速测试") ||
                  formatted.startsWith("⚡ 玩家落座")
                ) {
                  return formatted;
                }

                // 1. 去除内部调试前缀
                formatted = formatted.replace(/^\[能力\]\s*/, "");

                // 2. 将形如 "【玩家1(1号-镇长)】" 或 "玩家1(1号-镇长)" 转换为 "【1号-镇长】"
                formatted = formatted.replace(
                  /【?玩家(\d+)】?\s*[(（](\d+)\s*号(?:[ -]([^\s()（）]+))?[)）]/gi,
                  (_match, num1, num2, roleText) => {
                    const num = parseInt(num2 || num1, 10);
                    const roleName =
                      roleText ||
                      seatRoleMap.get(num) ||
                      roleNameMap.get(roleText) ||
                      "";
                    return roleName
                      ? `【${num}号-${roleName}】`
                      : `【${num}号】`;
                  }
                );

                // 3. 将形如 "1号(slayer)" / "1号(猎手)" / "1号玩家(slayer)" 转换为 "【1号-猎手】"
                formatted = formatted.replace(
                  /(\d+)\s*号(?:玩家|[位者])?\s*[(（]([a-zA-Z_\u4e00-\u9fa5]+)[)）]/gi,
                  (_match, numStr, roleIdOrName) => {
                    const num = parseInt(numStr, 10);
                    const cn =
                      roleNameMap.get(roleIdOrName) ||
                      roleIdOrName ||
                      seatRoleMap.get(num);
                    return cn ? `【${num}号-${cn}】` : `【${num}号】`;
                  }
                );

                // 4. 将未带角色名的裸露 "X号" 转换为 "【X号-角色名】"（若尚未被【】包裹）
                formatted = formatted.replace(
                  /(?<!【\s*|【\s*\d+号-)(\b\d+)\s*号(?:玩家|[位者])?(?![-a-zA-Z_\u4e00-\u9fa5]*】)/g,
                  (_match, numStr) => {
                    const num = parseInt(numStr, 10);
                    const roleName = seatRoleMap.get(num);
                    return roleName
                      ? `【${num}号-${roleName}】`
                      : `【${num}号】`;
                  }
                );

                // 5. 清理多重括号与空格
                formatted = formatted.replace(/【+([^【】]+)】+/g, "【$1】");
                formatted = formatted.replace(/\s*([，。！？、])\s*/g, "$1");
                formatted = formatted.replace(
                  /(【[^】]+】)\s*提名了?\s*(【[^】]+】)/g,
                  "$1 提名了 $2"
                );

                // 6. 丰富行动语义前缀与结果描述
                if (
                  formatted.includes("因为你提名了贞洁者") ||
                  formatted.includes("提名了贞洁者，")
                ) {
                  formatted = formatted.replace(
                    /.*?因为你?提名了贞洁者[，, ]*(【[^】]+】).*?被立即处决.*/,
                    "⚡️ 触发贞洁者能力：因 $1 是真实镇民，$1 被立即处决死亡！"
                  );
                } else if (
                  (formatted.includes("提名了") ||
                    formatted.includes("提名 ")) &&
                  !formatted.includes("📣")
                ) {
                  formatted = `📣 ${formatted}`;
                }

                return formatted;
              };

              // 过滤掉内部调试日志，只保留玩家可读的操作记录
              const filteredLogs = (gameLogs || []).filter(
                (log) =>
                  log &&
                  typeof log.message === "string" &&
                  !log.message.startsWith("[系统]") &&
                  !log.message.startsWith("[能力执行]") &&
                  !log.message.startsWith("[handleDrunkCharadeSelect]")
              );

              // 过滤掉 setup 阶段因多次“换一批/刷新/重新落座”产生的重复开局落座记录，仅保留最终实际对局的落座记录
              const isSeatingLog = (m: string) =>
                m.includes("落座") ||
                m.includes("分配角色") ||
                m.includes("快速开始") ||
                m.includes("快速测试");

              let lastSeatingIdx = -1;
              filteredLogs.forEach((log, idx) => {
                if (log.phase === "setup" && isSeatingLog(log.message)) {
                  lastSeatingIdx = idx;
                }
              });

              const dedupedLogs = filteredLogs.filter((log, idx) => {
                if (log.phase === "setup" && isSeatingLog(log.message)) {
                  return idx === lastSeatingIdx;
                }
                return true;
              });

              // 按天数和阶段分组
              const logsByDayAndPhase = dedupedLogs.reduce(
                (acc, log) => {
                  // 强制 setup 阶段归入 0_setup，避免旧日志中 setup 带有非 0 的 day
                  const normalizedDay = log.phase === "setup" ? 0 : log.day;
                  const key = `${normalizedDay}_${log.phase}`;
                  if (!acc[key]) acc[key] = [];
                  acc[key].push(log);
                  return acc;
                },
                {} as Record<string, LogEntry[]>
              );

              // 转换为数组并排序：严格按照真实时间线先后（开局 -> 首夜 -> 第1天 -> 第1天黄昏 -> 第2夜 -> 第2天 ...）
              const sortedLogs = Object.entries(logsByDayAndPhase).sort(
                (a, b) => {
                  const [dayA, phaseA] = a[0].split("_");
                  const [dayB, phaseB] = b[0].split("_");
                  const logsA = a[1];
                  const logsB = b[1];

                  const getTimelineWeight = (dayStr: string, phase: string) => {
                    if (phase === "setup") return 0;
                    if (phase === "firstNight") return 10;
                    const dayNum = Math.max(1, parseInt(dayStr, 10) || 1);
                    let phaseWeight = 20;
                    if (phase === "night")
                      phaseWeight = 0; // 第 N 夜先于第 N 天白天
                    else if (phase === "day") phaseWeight = 10;
                    else if (phase === "dusk") phaseWeight = 20;
                    return dayNum * 1000 + phaseWeight;
                  };

                  const weightA = getTimelineWeight(dayA, phaseA);
                  const weightB = getTimelineWeight(dayB, phaseB);

                  if (weightA !== weightB) {
                    return weightA - weightB;
                  }

                  // 相同阶段权重时，按该阶段最早一条日志的创建序号（seq）或时间戳（ts）排序
                  const minSeqA = Math.min(
                    ...logsA.map((l) => l.seq ?? l.ts ?? 0)
                  );
                  const minSeqB = Math.min(
                    ...logsB.map((l) => l.seq ?? l.ts ?? 0)
                  );
                  return minSeqA - minSeqB;
                }
              );

              return sortedLogs.map(([key, logs]) => {
                const [day, phase] = key.split("_");
                const dayNum = parseInt(day, 10);
                // 同一天/同一阶段内按写入顺序（seq）排序，保证复盘时间线真实。
                const sortedInnerLogs = [...logs].sort(
                  (x, y) => (x.seq ?? x.ts ?? 0) - (y.seq ?? y.ts ?? 0)
                );
                const phaseName =
                  phase === "setup"
                    ? "⚙️ 开局"
                    : phase === "firstNight"
                      ? "🌙 首夜"
                      : phase === "day"
                        ? `☀️ 第${dayNum || 1}天`
                        : phase === "dusk"
                          ? `🌆 第${dayNum || 1}天黄昏`
                          : phase === "night"
                            ? `🌙 第${dayNum || 2}夜`
                            : `第${day}轮`;

                return (
                  <div
                    key={key}
                    className={`mb-4 bg-gray-900/50 ${isPortrait ? "p-2" : "p-4"} rounded-lg`}
                  >
                    <div
                      className={`text-yellow-300 font-bold ${isPortrait ? "mb-2 text-sm" : "mb-3 text-lg"} border-b border-yellow-500/30 pb-2`}
                    >
                      {phaseName}
                    </div>
                    <div className="space-y-2">
                      {sortedInnerLogs.map((l, idx) => {
                        const msg = l?.message || "";
                        if (!msg) return null;
                        return (
                          <div
                            key={`${l.day}-${l.phase}-${l.seq ?? l.ts ?? idx}-${idx}`}
                            className={`py-2 border-b border-gray-700 text-gray-300 ${isPortrait ? "text-xs" : "text-sm"} pl-2`}
                          >
                            {formatMsg(msg)}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              });
            })()}
            {gameLogs.length === 0 && (
              <div className="text-gray-500 text-center py-8">暂无操作记录</div>
            )}
            {(gamePhase === "gameOver" || winResult) && winResult && (
              <div className="mt-6 pt-4 border-t-2 border-yellow-500/40 bg-slate-900/80 p-4 rounded-xl space-y-2.5">
                <div
                  className={`text-xl sm:text-2xl font-black ${
                    winResult.toLowerCase() === "good"
                      ? "text-blue-400"
                      : "text-red-400"
                  }`}
                >
                  {winResult.toLowerCase() === "good"
                    ? "🏆 善良阵营胜利"
                    : "👿 邪恶阵营获胜"}
                  {winReason && (
                    <span className="text-slate-200 text-base sm:text-lg font-bold ml-2">
                      （{winReason}）
                    </span>
                  )}
                </div>
                <div className="text-base sm:text-lg font-bold text-amber-300 tracking-wide">
                  {getWinningPlayersList(displaySeats, winResult)}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </ModalWrapper>
  );
}
