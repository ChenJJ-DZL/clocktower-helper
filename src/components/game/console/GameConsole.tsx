"use client";

import React, { useState, useEffect } from 'react';

import { TimelineStep } from '../../../types/game';

import { Seat } from '../../../../app/data';



interface GameConsoleProps {

  timeline: TimelineStep[];

  currentStepIndex: number;

  onNext: (selectedSeatIds: number[]) => void; // UPDATED SIGNATURE

  seats: Seat[];

  onPrev?: () => void; // Optional, keep for backward compatibility

}



export default function GameConsole({ timeline, currentStepIndex, onNext, seats, onPrev }: GameConsoleProps) {

  // 1. ALL HOOKS MUST BE AT THE TOP (Before any return)

  const [selectedSeatIds, setSelectedSeatIds] = useState<number[]>([]);



  // Calculate currentStep safely (don't return yet)

  const currentStep = (timeline && timeline.length > 0 && currentStepIndex < timeline.length) 

    ? timeline[currentStepIndex] 

    : null;



  // 2. Effect runs unconditionally (dependency handles safety)

  useEffect(() => {

    setSelectedSeatIds([]);

  }, [currentStep?.id]); // Safe even if currentStep is null



  // 3. NOW we can do Early Returns for empty states

  if (!timeline || !currentStep) {

    return (

      <div className="flex h-full w-full items-center justify-center bg-slate-900 text-gray-500">

        <p>等待阶段切换...</p>

      </div>

    );

  }



  // 4. Interaction Logic

  const interaction = currentStep.interaction;

  const isSelectionValid = !interaction?.required || (selectedSeatIds.length === interaction.amount);



  const handleSeatClick = (seatId: number) => {

    if (!interaction || interaction.type !== 'choosePlayer') return;

    

    setSelectedSeatIds(prev => {

      if (prev.includes(seatId)) {

        return prev.filter(id => id !== seatId);

      }

      if (prev.length >= interaction.amount) {

        // Simple replace for single target, or shift for multi

        if (interaction.amount === 1) return [seatId]; 

        return [...prev.slice(1), seatId];

      }

      return [...prev, seatId];

    });

  };



  return (

    <div className="flex h-full w-full bg-slate-900 text-white border-l border-white/10">

      

      {/* Zone 1: Timeline (Simplified for brevity) */}

      <div className="w-20 bg-slate-950/50 flex flex-col items-center py-4 gap-4 overflow-y-auto no-scrollbar">

        {timeline.map((step, idx) => (

          <div key={step.id || idx} className={`

            w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold transition-all

            ${idx === currentStepIndex ? 'bg-amber-500 text-black scale-110' : 'bg-slate-800 text-gray-500'}

          `}>

             {step.seatId !== undefined ? step.seatId + 1 : (step.roleId?.[0].toUpperCase() || '?')}

          </div>

        ))}

      </div>



      {/* Zone 2: Main Interaction Area */}

      <div className="flex-1 flex flex-col relative">

        {/* Header */}

        <div className="h-14 border-b border-white/10 flex items-center justify-between px-6 bg-slate-900/90">

           <span className="text-amber-500 font-bold">NIGHT PHASE</span>

        </div>



        {/* Content */}

        <div className="flex-1 flex flex-col items-center p-6 overflow-y-auto">

           {/* Script */}

           <div className="w-full max-w-2xl text-center mb-8">

             <h1 className="text-3xl font-black text-white mb-4">{currentStep.content.title}</h1>

             <p className="text-xl text-amber-400 font-medium bg-slate-800/50 p-4 rounded-xl border border-white/5">

               "{currentStep.content.script}"

             </p>

             <p className="text-gray-400 mt-2">{currentStep.content.instruction}</p>

           </div>



           {/* SELECTION GRID */}

           {interaction?.type === 'choosePlayer' && (

             <div className="grid grid-cols-5 gap-3 w-full max-w-2xl">

               {seats.map(seat => {

                 const isSelected = selectedSeatIds.includes(seat.id);

                 // Check if valid target (Optional: pass isTargetDisabled from controller later)

                 return (

                   <button

                     key={seat.id}

                     onClick={() => handleSeatClick(seat.id)}

                     className={`

                       aspect-square rounded-xl flex flex-col items-center justify-center border-2 transition-all

                       ${isSelected 

                         ? 'bg-amber-500/20 border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.3)]' 

                         : 'bg-slate-800 border-slate-700 hover:border-slate-500'}

                     `}

                   >

                     <span className={`text-2xl font-bold ${isSelected ? 'text-amber-400' : 'text-gray-300'}`}>

                       {seat.id + 1}

                     </span>

                     <span className="text-xs text-gray-500 truncate w-full px-1 text-center">

                       {seat.role?.name || '未知'}

                     </span>

                   </button>

                 );

               })}

             </div>

           )}

        </div>



        {/* Zone 3: Footer */}

        <div className="h-24 bg-slate-900 border-t border-white/10 flex items-center px-6 gap-4">

          <button 

            onClick={() => onNext(selectedSeatIds)}

            disabled={!isSelectionValid}

            className={`

              flex-1 h-16 rounded-xl font-black text-2xl transition-all

              ${isSelectionValid 

                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg active:scale-95' 

                : 'bg-slate-800 text-gray-500 cursor-not-allowed opacity-50'}

            `}

          >

            {isSelectionValid ? '确认 / 下一步 →' : `请选择 ${interaction?.amount} 名玩家`}

          </button>

        </div>

      </div>

    </div>

  );

}
