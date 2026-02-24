
import React from 'react';
import { Role } from '../../../app/data';
import { ModalWrapper } from './ModalWrapper';

interface DreamerResultModalProps {
  roleA: Role;
  roleB: Role;
  onClose: () => void;
}

export function DreamerResultModal({ roleA, roleB, onClose }: DreamerResultModalProps) {
  return (
    <ModalWrapper title="筑梦师信息" onClose={onClose}>
      <div className="p-4 text-white">
        <p className="text-lg text-center">你看到两个角色：</p>
        <div className="flex justify-around mt-4">
          <div className="text-center">
            <div className="text-2xl font-bold">{roleA.name}</div>
            <div className="text-sm text-gray-400">({roleA.type})</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold">{roleB.name}</div>
            <div className="text-sm text-gray-400">({roleB.type})</div>
          </div>
        </div>
        <p className="mt-4 text-center text-gray-300">
          你选择的玩家是其中之一。
        </p>
        <div className="flex justify-center mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 font-bold text-white bg-blue-500 rounded hover:bg-blue-700"
          >
            确认并继续
          </button>
        </div>
      </div>
    </ModalWrapper>
  );
}
