import { useGameActions } from "../../contexts/GameActionsContext";
import { ModalWrapper } from "./ModalWrapper";

export function NightOrderPreviewModal({
  nightOrderModal,
}: {
  nightOrderModal: any;
}) {
  const props = useGameActions();
  if (!nightOrderModal) return null;

  return (
    <ModalWrapper
      title={
        nightOrderModal?.title ||
        props.nightQueuePreviewTitle ||
        "🌙 今晚要唤醒的顺序列表"
      }
      onClose={props.closeNightOrderPreview}
      className="max-w-4xl border-4 border-yellow-500"
      closeOnOverlayClick={true}
      footer={
        <>
          <button
            type="button"
            onClick={props.closeNightOrderPreview}
            className="px-6 py-3 rounded-xl bg-gray-700 text-gray-100 font-bold hover:bg-gray-600 transition"
          >
            返回调整
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              props.confirmNightOrderPreview();
            }}
            className="px-6 py-3 rounded-xl bg-green-600 text-white font-bold hover:bg-green-500 transition cursor-pointer"
            style={{ pointerEvents: "auto" }}
          >
            确认无误，入夜
          </button>
        </>
      }
    >
      <p className="text-sm text-gray-200 text-center mb-4">
        请核对今晚要叫醒的所有角色顺序。你可以点击"返回调整"继续修改座位/身份，或点击"确认"正式进入夜晚流程。
      </p>

      {/* 快捷设置红罗刹 */}
      <div className="mb-6 p-4 rounded-xl bg-red-950/20 border border-red-500/30">
        <h4 className="text-sm font-bold text-red-200 mb-3 flex items-center gap-2">
          🎭 设置占卜师天敌 (红罗刹)
        </h4>
        <div className="flex flex-wrap gap-2">
          {props.seats.map((seat) => {
            const isRH = !!(
              seat.isRedHerring || seat.isFortuneTellerRedHerring
            );
            return (
              <button
                key={`rh-select-${seat.id}`}
                onClick={() => props.toggleStatus("redherring", seat.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                  isRH
                    ? "bg-red-600 border-red-400 text-white shadow-[0_0_10px_rgba(239,68,68,0.5)]"
                    : "bg-gray-800 border-gray-700 text-gray-400 hover:border-red-500/50 hover:text-red-200"
                }`}
              >
                {seat.id + 1}号 {seat.role?.name || "未设定"}
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-gray-500 mt-2 italic">
          * 占卜师在查验时，若包含红罗刹，其结果将始终返回“是”。
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3">
        {(nightOrderModal?.preview || props.nightOrderPreview).map(
          (item: any, idx: number) => (
            <div
              key={`${item.roleName}-${item.seatNo}-${idx}`}
              className="p-3 rounded-xl border border-gray-700 bg-gray-800/80 flex items-center justify-between night-order-preview-item"
            >
              <div className="flex flex-col">
                <span className="text-sm text-gray-400">
                  顺位 {item.order || "—"}
                </span>
                <span className="text-base font-bold text-white">
                  [{item.seatNo}号] {item.roleName}
                </span>
              </div>
              <span className="text-xs text-gray-500">第{idx + 1} 唤醒</span>
            </div>
          )
        )}
      </div>
    </ModalWrapper>
  );
}
