"use client";

import React from "react";
import { LogEntry } from "../../../../app/data";

export interface LogViewerProps {
  logs: LogEntry[];
  className?: string;
}

export function LogViewer(props: LogViewerProps) {
  const { logs, className = "" } = props;

  // 按天数分开显示日志
  const logsByDay = logs.reduce((acc, log) => {
    const dayKey = log.day;
    if (!acc[dayKey]) acc[dayKey] = [];
    acc[dayKey].push(log);
    return acc;
  }, {} as Record<number, LogEntry[]>);

  const formatPhaseLabel = (phase: string, day: number): string => {
    if (phase === 'firstNight') return '首夜';
    if (phase === 'night') return `${day}夜`;
    if (phase === 'day') return `${day}天`;
    if (phase === 'dusk') return `${day}天黄昏`;
    return `${day}轮`;
  };

  return (
    <div className={`w-full ${className}`}>
      <h4 className="text-yellow-400 mb-2 font-bold border-b pb-1 text-sm">行动日志</h4>
      <div className="space-y-2 h-full max-h-full overflow-y-auto">
        {Object.entries(logsByDay).reverse().map(([day, dayLogs]) => (
          <div key={day} className="mb-2">
            <div className="text-yellow-300 font-bold mb-1 text-xs">
              {formatPhaseLabel(dayLogs[0].phase, parseInt(day))}
            </div>
            {dayLogs.reverse().map((log, i) => (
              <div key={i} className="py-1 border-b border-gray-700 text-gray-300 text-xs pl-2">
                {log.message}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

