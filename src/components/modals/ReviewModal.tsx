import type { GamePhase, LogEntry, Seat, WinResult } from "@/app/data";
import { ModalWrapper } from "./ModalWrapper";

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
  victorySnapshot,
  gameLogs,
  gamePhase,
  winResult,
  winReason,
  isPortrait,
}: ReviewModalProps) {
  if (!isOpen) return null;

  return (
    <ModalWrapper title="📜 对局复盘" onClose={onClose} className="max-w-6xl">
      <div
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
            {victorySnapshot.map((s) => (
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
              // 按阶段顺序组织日志：firstNight -> night -> day -> dusk
              const phaseOrder: Record<string, number> = {
                firstNight: 1,
                night: 2,
                day: 3,
                dusk: 4,
              };

              // 按天数和阶段分组
              const logsByDayAndPhase = gameLogs.reduce(
                (acc, log) => {
                  const key = `${log.day}_${log.phase}`;
                  if (!acc[key]) acc[key] = [];
                  acc[key].push(log);
                  return acc;
                },
                {} as Record<string, LogEntry[]>
              );

              // 转换为数组并排序
              const sortedLogs = Object.entries(logsByDayAndPhase).sort(
                (a, b) => {
                  const [dayA, phaseA] = a[0].split("_");
                  const [dayB, phaseB] = b[0].split("_");
                  const dayNumA = parseInt(dayA, 10);
                  const dayNumB = parseInt(dayB, 10);
                  if (dayNumA !== dayNumB) return dayNumA - dayNumB;
                  return (
                    (phaseOrder[phaseA] || 999) - (phaseOrder[phaseB] || 999)
                  );
                }
              );

              return sortedLogs.map(([key, logs]) => {
                const [day, phase] = key.split("_");
                const phaseName =
                  phase === "firstNight"
                    ? "第1夜"
                    : phase === "night"
                      ? `第${day}夜`
                      : phase === "day"
                        ? `第${day}天`
                        : phase === "dusk"
                          ? `第${day}天黄昏`
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
                      {logs.map((l) => (
                        <div
                          key={`${l.day}-${l.phase}-${l.message}`}
                          className={`py-2 border-b border-gray-700 text-gray-300 ${isPortrait ? "text-xs" : "text-sm"} pl-2`}
                        >
                          {l.message}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              });
            })()}
            {gameLogs.length === 0 && (
              <div className="text-gray-500 text-center py-8">暂无操作记录</div>
            )}
            {gamePhase === "gameOver" && winReason && (
              <div className="mt-6 pt-4 border-t-2 border-yellow-500">
                <div
                  className={`text-lg font-bold ${
                    winResult === "good" ? "text-blue-400" : "text-red-400"
                  }`}
                >
                  {winResult === "good" ? "🏆 善良阵营胜利" : "👿 邪恶阵营获胜"}
                  ：{winReason}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </ModalWrapper>
  );
}
