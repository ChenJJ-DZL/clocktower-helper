import { AutoFitContent } from "../common/AutoFitContent";
import { ModalWrapper } from "./ModalWrapper";
import type { StorytellerCorrection } from "../../utils/storytellerCorrection";

/**
 * 🎙️ 说书人「技能修正页」
 * ============================================================================
 *
 * 【用户实测（2026-09-14）】
 *   恶魔的**技能结果页**显示：「小恶魔试图杀死【1号】，但未能造成伤亡」。
 *   问题：结果页是**给玩家看的**，这句话直接告诉恶魔"你的击杀失败了"，
 *   等于暴露了"有人被僧侣保护 / 目标是士兵"。
 *   官方（`src/roles/townsfolk/monk.ts`）明确：
 *     「**恶魔不知道哪一名玩家受到了保护。**」
 *
 * 【用户要求】
 *   「此类信息应该在技能结果页后增加一个技能修正页 —— 专门显示
 *     必要显示、但是不能告诉玩家的信息，例如"因为僧侣保护，未能造成伤亡"，
 *     避免说书人瞬间搞不清楚状况。」
 *
 * 【本页的定位】
 *   ① 出现在**玩家已点「确认结果」之后**（此时玩家的步骤已结束，
 *      他看到的只有中性文案「你选择了【1号】」）；
 *   ② **只说书人可见**：页头明确标注，正文写清真实原因；
 *   ③ 说书人点「知道了，继续」后才推进夜间流程。
 *
 * 【安全默认】
 *   本页渲染的数据来自 `displayInfo.storytellerCorrection`，
 *   该字段**只**由引擎在说书人链路上给出；玩家页面（NightActionPage 的内联结果区）
 *   从不读取该字段 —— 它只会作为独立的 `STORYTELLER_CORRECTION` 模态出现，
 *   且带醒目的"请勿展示给玩家"标注。
 */
export function StorytellerCorrectionModal({
  correction,
  roleName,
  onNext,
}: {
  correction: StorytellerCorrection;
  roleName?: string;
  onNext: () => void;
}) {
  if (!correction) return null;

  return (
    <ModalWrapper
      title={`${roleName ? `${roleName} - ` : ""}技能修正（说书人）`}
      onClose={onNext}
      size="fullscreen90"
      className="w-[90vw] h-[90vh]"
      footer={
        <div className="flex gap-4 w-full justify-center">
          <button
            type="button"
            data-testid="storyteller-correction-confirm"
            onClick={onNext}
            className="flex-1 max-w-sm py-3 sm:py-4 font-black text-white bg-amber-600 rounded-xl hover:bg-amber-500 transition shadow-lg text-base sm:text-lg shadow-amber-600/40 ring-2 ring-amber-400 active:scale-[0.98]"
          >
            🎙️ 知道了，继续
          </button>
        </div>
      }
    >
      <AutoFitContent
        targetRatio={0.9}
        minScale={0.35}
        className="p-2 sm:p-4 text-white"
      >
        <div className="flex flex-col items-center justify-center text-center space-y-5 sm:space-y-7 w-max max-w-none px-6 py-4 my-auto">
          {/* 页头：明确标注本页性质 */}
          <div className="rounded-2xl border-2 border-amber-500/70 bg-amber-950/50 px-6 sm:px-8 py-3 text-amber-200 font-black text-base sm:text-lg md:text-xl whitespace-nowrap">
            🎙️ 说书人专用 · 本页含玩家不可见信息，请勿展示给玩家
          </div>

          <div className="text-5xl sm:text-6xl md:text-7xl drop-shadow-xl select-none">
            🛠️
          </div>

          <div className="text-3xl sm:text-4xl md:text-5xl font-black text-amber-400 tracking-wide leading-relaxed drop-shadow-md">
            {correction.title}
          </div>

          <div className="text-left text-lg sm:text-xl md:text-2xl text-slate-100 bg-slate-800/90 px-7 sm:px-9 py-5 sm:py-6 rounded-2xl border border-white/15 whitespace-pre-line leading-relaxed max-w-[80vw] shadow-2xl backdrop-blur-sm">
            {correction.detail}
          </div>

          <div className="text-sm sm:text-base text-slate-400">
            以上仅为说书人侧说明 —— 玩家看到的结果页只含「你选择了【X】」。
          </div>
        </div>
      </AutoFitContent>
    </ModalWrapper>
  );
}
