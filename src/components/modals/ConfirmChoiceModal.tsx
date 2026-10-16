import { ModalWrapper } from "./ModalWrapper";

/**
 * ConfirmChoiceModal —— 通用「说书人裁决」选择弹窗
 *
 * 供旅行者等**说书人主观裁决**类能力复用（替罪羊代刑 / 枪手射击等）。
 * 刻意做成通用件：本仓库的说书人裁决弹窗历史上每个角色各写一个组件
 * （SaintExecutionConfirmModal / EvilTwinExecutionConfirmModal / …），
 * 旅行者一批就要 N 个裁决点 ⇒ 用通用件一次接完，避免组件爆炸。
 */
export function ConfirmChoiceModal(props: {
  isOpen: boolean;
  title: string;
  message: string;
  options: { label: string; value: string }[];
  onSelect: (value: string) => void;
  onCancel: () => void;
}) {
  if (!props.isOpen) return null;
  return (
    <ModalWrapper
      title={props.title}
      onClose={props.onCancel}
      closeOnOverlayClick={false}
      widthRatio={0.72}
      autoHeight
    >
      <div className="flex flex-col p-5 sm:p-6 gap-5 text-white text-center">
        <div className="text-2xl leading-relaxed">{props.message}</div>
        <div className="flex flex-wrap gap-3 justify-center">
          {props.options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => props.onSelect(o.value)}
              className="px-7 py-3 text-xl bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl font-black transition shadow-md"
            >
              {o.label}
            </button>
          ))}
          <button
            type="button"
            onClick={props.onCancel}
            className="px-7 py-3 text-xl bg-gray-600 hover:bg-gray-500 text-white rounded-xl font-bold transition shadow-md"
          >
            取消
          </button>
        </div>
      </div>
    </ModalWrapper>
  );
}
