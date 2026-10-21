/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

interface RatingInputProps {
  id: string;
  label: string;
  value: number;
  onChange: (val: number) => void;
  disabled?: boolean;
  isFocused?: boolean;
  onFocus?: () => void;
}

export default function RatingInput({ id, label, value, onChange, disabled, isFocused, onFocus }: RatingInputProps) {
  const ratings = [1, 2, 3, 4, 5];

  // Helper styles based on score to give modern gamified feel
  const getColorClasses = (num: number, isSelected: boolean) => {
    if (disabled) {
      if (isSelected) {
        return "border-slate-300 bg-slate-100 text-slate-400 font-bold opacity-80 cursor-not-allowed";
      }
      return "border-slate-150 text-slate-300 bg-slate-50/50 opacity-40 cursor-not-allowed";
    }

    if (!isSelected) {
      return "border-slate-200 text-slate-800 bg-white hover:bg-slate-50 hover:border-slate-400";
    }
    
    switch (num) {
      case 1:
        return "border-red-500 bg-red-50 text-red-700 font-bold ring-2 ring-red-200";
      case 2:
        return "border-orange-500 bg-orange-50 text-orange-700 font-bold ring-2 ring-orange-200";
      case 3:
        return "border-amber-500 bg-amber-50 text-amber-700 font-bold ring-2 ring-amber-200";
      case 4:
        return "border-blue-500 bg-blue-50 text-blue-700 font-bold ring-2 ring-blue-200";
      case 5:
        return "border-emerald-500 bg-emerald-50 text-emerald-800 font-bold ring-2 ring-emerald-250";
      default:
        return "border-blue-500 bg-blue-50 text-blue-700";
    }
  };

  return (
    <div 
      id={`${id}-container`} 
      className={`space-y-2 p-3.5 rounded-xl border transition-all duration-200 ${
        disabled ? '' : 'cursor-pointer'
      } ${
        isFocused 
          ? 'border-blue-500 bg-blue-50/20 ring-1 ring-blue-500/40 shadow-xs' 
          : 'border-slate-150 bg-slate-50/30 hover:border-slate-200'
      }`}
      onClick={() => !disabled && onFocus?.()}
    >
      <div className="flex justify-between items-start">
        <div className="space-y-0.5">
          <label id={`${id}-label`} className="text-sm font-bold text-blue-900 flex items-center gap-1.5">
            {label} <span className="text-red-500">*</span>
            {isFocused && (
              <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
            )}
          </label>
          <p className="text-[10px] text-blue-700">Skala penilaian 1 (Kurang) sampai 5 (Istimewa)</p>
        </div>
        {value > 0 && (
          <span id={`${id}-value-badge`} className="text-xs px-2 py-0.5 rounded-md font-bold bg-blue-105 text-blue-700 border border-blue-200">
            Skor: {value}
          </span>
        )}
      </div>
      
      <div id={`${id}-button-group`} className="grid grid-cols-5 gap-2">
        {ratings.map((num) => {
          const isSelected = value === num;
          return (
            <button
              key={num}
              id={`${id}-btn-${num}`}
              type="button"
              disabled={disabled}
              onClick={() => !disabled && onChange(num)}
              className={`py-2 text-center rounded-lg border text-base font-bold transition-all duration-200 flex justify-center items-center ${
                disabled ? 'cursor-not-allowed' : 'cursor-pointer'
              } focus:outline-none ${getColorClasses(num, isSelected)}`}
            >
              {num}
            </button>
          );
        })}
      </div>
    </div>
  );
}
