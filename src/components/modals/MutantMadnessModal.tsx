import { useGameActions } from "../../contexts/GameActionsContext";
import { AutoFitContent } from "../common/AutoFitContent";
import { ModalWrapper } from "./ModalWrapper";

/**
 * 🎭 畸形秀演员（Mutant）专属「白天疯狂仲裁」弹窗 —— **由说书人独立操作**
 *
 * ============================================================================
 * 官方（`src/roles/outsider/mutant.ts`）：
 *   「如果你"疯狂"地证明自己是外来者，你可能被处决。」
 *   「在游戏里的任何时间点（包括夜晚），如果你认为畸形秀演员"疯狂"地证明了
 *    他是一名外来者，那么你就可以决定处决畸形秀演员。……**如果这次处决发生在
 *    白天的常规处决之前，则直接进入到夜晚阶段。**（每个白天最多能进行一次处决。）」
 *
 * 【与洗脑师（`MadnessCheckModal`）的关系】
 *   同构但**语义相反**，这是用户明确要求的：
 *     · 洗脑师：判定"被洗脑的**玩家**"是否疯狂扮演了指定角色；
 *               合格 → 无事发生；不合格 → **该玩家**被处决。
 *     · 畸形秀演员：说书人判定"**他自己**"是否疯狂证明了自己是外来者；
 *               是 → **他本人**被处决（跳过黄昏）；否 → 无事发生，白天继续。
 *
 *   ⇒ 本页的措辞必须是「是否疯狂证明自己是外来者？」，
 *     两个按钮：
 *       · 「是，执行处决」（红色）—— 立即处决该畸形秀演员并跳过黄昏入夜；
 *       · 「否，无事发生」（绿色）—— 白天继续，可进入黄昏。
 *
 * ⚠️ 本页是**说书人操作页**（由说书人独立判定），但按钮文案按用户要求
 *    保持"是/否"的直白问句形态，与被洗脑玩家的判定页风格一致。
 */
export function MutantMadnessModal({ modal }: { modal: any }) {
  const props = useGameActions();
  if (!modal) return null;

  const targetId: number = modal.targetId;
  const targetSeat = (props.seats ?? []).find((s: any) => s.id === targetId);
  const seatNo = targetId + 1;
  const roleName = (targetSeat as any)?.role?.name || "畸形秀演员";

  /** 收口：把"今日已仲裁"落到座位上，供白天→黄昏门禁放行。 */
  const markChecked = () => {
    props.setSeats?.((prev: any[]) =>
      prev.map((s) =>
        s.id === targetId
          ? { ...s, mutantMadnessCheckedToday: true, hasUsedDayAbility: true }
          : s
      )
    );
  };

  /** 「否，无事发生」——白天继续，可进入黄昏。 */
  const handlePass = () => {
    props.addLog?.(
      `说书人判定 ${seatNo}号（${roleName}）未疯狂证明自己是外来者，无事发生，白天继续。`
    );
    markChecked();
    props.setCurrentModal(null);
  };

  /** 「是，执行处决」——立即处决该畸形秀演员，跳过黄昏直接入夜。 */
  const handleFail = () => {
    props.addLog?.(
      `⚖️ 说书人判定 ${seatNo}号（${roleName}）疯狂证明了自己是外来者，依据【畸形秀演员】能力立即处决！跳过今日剩余阶段，进入下一个夜晚。`
    );
    markChecked();
    // 处决该畸形秀演员本人
    props.executePlayer?.(targetId, { forceExecution: true });
    // 弹出标准处决结果弹窗：确认后直接跳入下一夜（与洗脑师判定失败同一条链路）
    props.setCurrentModal({
      type: "EXECUTION_RESULT",
      data: {
        message: `说书人判定${seatNo}号（${roleName}）疯狂证明了自己是外来者\n依据【畸形秀演员】能力被立即处决死亡!\n今日立即结束，确认后直接进入下一个夜晚。`,
        isInstantNight: true,
      },
    });
  };

  return (
    <ModalWrapper
      title="🎭 畸形秀演员疯狂仲裁"
      onClose={() => props.setCurrentModal(null)}
      size="fullscreen90"
      className="w-[90vw] h-[90vh]"
      footer={
        <div className="flex flex-row gap-3 sm:gap-4 w-full justify-center max-w-2xl mx-auto">
          <button
            type="button"
            onClick={() => {
              props.setCurrentModal(null);
            }}
            className="flex-1 py-2.5 sm:py-3.5 bg-slate-700 hover:bg-slate-600 rounded-xl font-bold text-white transition text-sm sm:text-base md:text-lg shadow-md cursor-pointer whitespace-nowrap"
          >
            取消
          </button>
          <button
            type="button"
            data-testid="mutant-pass-button"
            onClick={handlePass}
            className="flex-1 py-2.5 sm:py-3.5 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-black text-white transition text-sm sm:text-base md:text-lg shadow-md shadow-emerald-600/40 ring-2 ring-emerald-400 active:scale-[0.98] cursor-pointer whitespace-nowrap"
          >
            否，无事发生
          </button>
          <button
            type="button"
            data-testid="mutant-execute-button"
            onClick={handleFail}
            className="flex-1 py-2.5 sm:py-3.5 bg-red-600 hover:bg-red-500 rounded-xl font-black text-white transition text-sm sm:text-base md:text-lg shadow-md shadow-red-600/40 ring-2 ring-red-400 active:scale-[0.98] cursor-pointer whitespace-nowrap"
          >
            是，执行处决
          </button>
        </div>
      }
    >
      <AutoFitContent targetRatio={0.9} minScale={0.2} className="p-2 sm:p-4 text-white">
        <div className="flex flex-col items-center justify-center text-center space-y-6 sm:space-y-8 w-max max-w-none px-6 py-4 my-auto">
          <div className="text-5xl sm:text-6xl md:text-7xl drop-shadow-xl select-none">
            🎭
          </div>

          <div className="space-y-3 sm:space-y-4">
            <div className="text-3xl sm:text-4xl md:text-5xl font-black text-white leading-relaxed tracking-wide whitespace-nowrap drop-shadow-md">
              判定{" "}
              <span className="text-amber-400 font-black">
                【{seatNo}号】
              </span>{" "}
              玩家是否疯狂证明自己是外来者？
            </div>

            <div className="text-2xl sm:text-3xl md:text-4xl font-black text-amber-300 whitespace-nowrap">
              该玩家身份：
              <span className="text-rose-300 font-black">【{roleName}】</span>
            </div>
          </div>

          <div className="text-base sm:text-lg md:text-xl text-slate-200 bg-slate-800/90 px-8 sm:px-10 py-5 sm:py-6 rounded-2xl border border-white/15 space-y-3 text-left shadow-2xl w-max max-w-none backdrop-blur-sm">
            <div className="whitespace-nowrap flex items-center gap-2">
              <span className="text-rose-400 text-lg sm:text-xl font-black">•</span>
              <span>
                <strong className="text-rose-400 font-black">选择「是」</strong>
                ：他"疯狂"地证明了自己是外来者，
                <strong className="text-amber-300 font-black">
                  立即被处决并跳过黄昏
                </strong>
                ，直接进入下一个夜晚！
              </span>
            </div>
            <div className="whitespace-nowrap flex items-center gap-2">
              <span className="text-emerald-400 text-lg sm:text-xl font-black">•</span>
              <span>
                <strong className="text-emerald-400 font-black">选择「否」</strong>
                ：他没有暴露外来者身份，无事发生，白天继续。
              </span>
            </div>
          </div>
        </div>
      </AutoFitContent>
    </ModalWrapper>
  );
}
