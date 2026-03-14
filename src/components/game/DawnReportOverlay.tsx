import { useGameActions } from "../../contexts/GameActionsContext";

export function DawnReportOverlay() {
  const props = useGameActions();
  if (props.gamePhase !== "dawnReport") return null;

  return (
    <div className="fixed inset-0 z-[3000] bg-black/95 flex items-center justify-center">
      <div className="bg-gray-800 p-12 rounded-3xl text-center border-4 border-yellow-500 min-w-[500px]">
        <h2 className="text-6xl mb-8">🌅 天亮了！</h2>
        <p className="text-3xl text-gray-300 mb-10">
          昨晚死亡：
          <span className="text-red-500 font-bold">
            {props.deadThisNight.length > 0
              ? props.deadThisNight.map((id) => `${id + 1}号`).join("、")
              : "平安夜"}
          </span>
        </p>
        <button
          onClick={() => props.setGamePhase("day")}
          className="px-12 py-5 bg-yellow-500 text-black font-bold rounded-full text-3xl"
        >
          开始白天
        </button>
      </div>
    </div>
  );
}
