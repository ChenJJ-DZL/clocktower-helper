import { GameRecord, LogEntry } from '@/src/types/game';
import { ModalWrapper } from './ModalWrapper';

interface GameRecordsModalProps {
  isOpen: boolean;
  onClose: () => void;
  gameRecords: GameRecord[];
  isPortrait: boolean;
}

// 工具函数：格式化时间
const formatTimer = (s: number) => {
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  const sec = (s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
};

export function GameRecordsModal({ isOpen, onClose, gameRecords, isPortrait }: GameRecordsModalProps) {
  if (!isOpen) return null;

  return (
    <ModalWrapper
      title="📚 对局记录"
      onClose={onClose}
      className="max-w-6xl"
    >
      <div className="space-y-4">
        {gameRecords.length === 0 ? (
          <div className={`text-center text-gray-500 ${isPortrait ? 'py-10' : 'py-20'}`}>
            <p className={`${isPortrait ? 'text-xl' : 'text-2xl'} mb-4`}>暂无对局记录</p>
            <p className={`${isPortrait ? 'text-xs' : 'text-sm'}`}>完成游戏后，记录会自动保存到这里</p>
          </div>
        ) : (
          gameRecords.map((record) => {
            const startDate = new Date(record.startTime);
            const endDate = new Date(record.endTime);
            const startTimeStr = startDate.toLocaleString('zh-CN', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              hour12: false
            });
            const endTimeStr = endDate.toLocaleString('zh-CN', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              hour12: false
            });
            const durationStr = formatTimer(record.duration);
            
            // 按阶段顺序组织日志
            const phaseOrder: Record<string, number> = {
              'firstNight': 1,
              'night': 2,
              'day': 3,
              'dusk': 4
            };
            
            const logsByDayAndPhase = record.gameLogs.reduce((acc, log) => {
              const key = `${log.day}_${log.phase}`;
              if (!acc[key]) acc[key] = [];
              acc[key].push(log);
              return acc;
            }, {} as Record<string, LogEntry[]>);
            
            const sortedLogs = Object.entries(logsByDayAndPhase).sort((a, b) => {
              const [dayA, phaseA] = a[0].split('_');
              const [dayB, phaseB] = b[0].split('_');
              const dayNumA = parseInt(dayA);
              const dayNumB = parseInt(dayB);
              if (dayNumA !== dayNumB) return dayNumA - dayNumB;
              return (phaseOrder[phaseA] || 999) - (phaseOrder[phaseB] || 999);
            });
            
            return (
              <div key={record.id} className={`bg-gray-900/50 ${isPortrait ? 'p-3' : 'p-6'} rounded-xl border border-gray-700`}>
                <div className={`flex ${isPortrait ? 'flex-col' : 'justify-between'} items-start ${isPortrait ? 'gap-3' : 'mb-4'}`}>
                  <div>
                    <h3 className={`${isPortrait ? 'text-lg' : 'text-2xl'} font-bold text-white ${isPortrait ? 'mb-1' : 'mb-2'}`}>{record.scriptName}</h3>
                    <div className={`${isPortrait ? 'text-xs' : 'text-sm'} text-gray-400 space-y-1`}>
                      <p>开始时间：{startTimeStr}</p>
                      <p>结束时间：{endTimeStr}</p>
                      <p>游戏时长：{durationStr}</p>
                    </div>
                  </div>
                  <div className={`${isPortrait ? 'text-sm' : 'text-xl'} font-bold ${isPortrait ? 'px-3 py-1.5' : 'px-4 py-2'} rounded ${
                    record.winResult === 'good' 
                      ? 'bg-blue-900/50 text-blue-400 border border-blue-500' 
                      : record.winResult === 'evil'
                      ? 'bg-red-900/50 text-red-400 border border-red-500'
                      : 'bg-gray-700/50 text-gray-300 border border-gray-500'
                  }`}>
                    {record.winResult === 'good' 
                      ? '🏆 善良阵营胜利' 
                      : record.winResult === 'evil'
                      ? '👿 邪恶阵营获胜'
                      : '🔄 游戏未完成'}
                  </div>
                </div>
                {record.winReason && (
                  <p className={`${isPortrait ? 'text-xs' : 'text-sm'} text-gray-300 ${isPortrait ? 'mb-3' : 'mb-4'}`}>
                    {record.winResult ? '胜利依据' : '结束原因'}：{record.winReason}
                  </p>
                )}
                
                <div className={`grid ${isPortrait ? 'grid-cols-1' : 'grid-cols-2'} ${isPortrait ? 'gap-4' : 'gap-6'} ${isPortrait ? 'mt-4' : 'mt-6'}`}>
                  <div>
                    <h4 className={`text-purple-400 ${isPortrait ? 'mb-2 text-sm' : 'mb-3'} font-bold border-b pb-2`}>📖 座位信息</h4>
                    <div className={`space-y-2 ${isPortrait ? 'max-h-48' : 'max-h-64'} overflow-y-auto`}>
                      {record.seats.filter(s=>s.role).map(s => (
                        <div key={s.id} className="py-1 border-b border-gray-700 flex justify-between items-center text-sm">
                          <span className="font-bold">{s.id+1}号</span>
                          <div className="flex flex-col items-end gap-1">
                            <span className={s.role?.type==='demon'?'text-red-500 font-bold':s.role?.type==='minion'?'text-orange-500':'text-blue-400'}>
                              {s.role?.name}
                              {s.role?.id==='drunk'&&` (伪:${s.charadeRole?.name})`}
                              {s.isRedHerring && ' [红罗刹]'}
                            </span>
                            <div className="flex flex-wrap gap-1 justify-end text-[11px] leading-tight">
                              {s.isDead && <span className="px-2 py-0.5 rounded bg-gray-700 text-gray-300 border border-gray-600">💀 已死亡</span>}
                              {s.isPoisoned && <span className="px-2 py-0.5 rounded bg-green-900/60 text-green-200 border border-green-700">🧪 中毒</span>}
                              {s.isProtected && <span className="px-2 py-0.5 rounded bg-blue-900/60 text-blue-200 border border-blue-700">🛡️ 受保护</span>}
                              {s.statusDetails?.map(st => (
                                <span key={st} className={`px-2 py-0.5 rounded bg-gray-800/80 text-yellow-200 border border-gray-600 ${st.includes('投毒') ? 'whitespace-nowrap' : ''}`}>{st}</span>
                              ))}
                              {s.hasUsedSlayerAbility && <span className="px-2 py-0.5 rounded bg-red-900/70 text-red-100 border border-red-700">猎手已用</span>}
                              {s.hasUsedVirginAbility && <span className="px-2 py-0.5 rounded bg-purple-900/70 text-purple-100 border border-purple-700">处女失效</span>}
                              {s.hasAbilityEvenDead && <span className="px-2 py-0.5 rounded bg-green-900/70 text-green-100 border border-green-700">死而有能</span>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div>
                    <h4 className={`text-yellow-400 ${isPortrait ? 'mb-2 text-sm' : 'mb-3'} font-bold border-b pb-2`}>📋 操作记录</h4>
                    <div className={`space-y-3 ${isPortrait ? 'max-h-48' : 'max-h-64'} overflow-y-auto`}>
                      {sortedLogs.map(([key, logs]) => {
                        const [day, phase] = key.split('_');
                        const phaseName = 
                          phase === 'firstNight' ? '第1夜' : 
                          phase === 'night' ? `第${day}夜` :
                          phase === 'day' ? `第${day}天` :
                          phase === 'dusk' ? `第${day}天黄昏` : `第${day}轮`;
                        
                        return (
                          <div key={key} className={`bg-gray-800/50 ${isPortrait ? 'p-1.5' : 'p-2'} rounded ${isPortrait ? 'text-[10px]' : 'text-xs'}`}>
                            <div className={`text-yellow-300 font-bold ${isPortrait ? 'mb-0.5 text-[10px]' : 'mb-1'}`}>{phaseName}</div>
                            <div className="space-y-1">
                              {logs.map((l, i) => (
                                <div key={i} className={`text-gray-300 pl-2 ${isPortrait ? 'text-[10px]' : 'text-xs'}`}>
                                  {l.message}
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                      {record.gameLogs.length === 0 && (
                        <div className={`text-gray-500 text-center py-4 ${isPortrait ? 'text-xs' : 'text-sm'}`}>暂无操作记录</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </ModalWrapper>
  );
}

