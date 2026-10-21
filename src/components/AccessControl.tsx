/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { GroupType } from '../types';
import { GROUPS } from '../data';
import { 
  Shield, UserCheck, Lock, Unlock, LogOut, Eye, EyeOff, 
  LogIn, CheckCircle2, AlertCircle, Sparkles 
} from 'lucide-react';
import modulAksesLogo from '../assets/images/modul_akses_logo_1782461043995.jpg';

interface AccessControlProps {
  currentGroup: GroupType | 'ALL' | 'NONE';
  isAuthorized: boolean;
  onLogin: (group: GroupType | 'ALL', passcode: string) => { success: boolean; message?: string };
  onLogout: () => void;
  onChangeGroup?: (group: GroupType | 'ALL' | 'NONE') => void;
  onTriggerAuth?: () => void;
}

export default function AccessControl({ 
  currentGroup, 
  isAuthorized, 
  onLogin, 
  onLogout 
}: AccessControlProps) {
  // Local state for the login form
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Group label helper
  const getGroupLabel = (id: GroupType | 'ALL' | 'NONE') => {
    if (id === 'NONE') return 'Belum Memilih';
    if (id === 'ALL') return 'Administrator (Semua Grup)';
    const found = GROUPS.find(g => g.id === id);
    return found ? found.name : id;
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!selectedGroup) {
      setErrorMessage('Silakan pilih shift atau bagian terlebih dahulu.');
      return;
    }

    if (!password.trim()) {
      setErrorMessage('Silakan masukkan sandi otorisasi.');
      return;
    }

    setIsLoading(true);

    setTimeout(() => {
      const result = onLogin(selectedGroup as GroupType | 'ALL', password);
      setIsLoading(false);

      if (!result.success) {
        setErrorMessage(result.message || 'Sandi yang Anda masukkan salah. Silakan coba lagi.');
      } else {
        // Clear local inputs on success
        setPassword('');
        setErrorMessage(null);
      }
    }, 200);
  };

  // =========================================================================
  // VIEW 1: ACTIVE SESSION BANNER (WHEN LOGGED IN)
  // =========================================================================
  if (isAuthorized && currentGroup !== 'NONE') {
    return (
      <div 
        id="active-session-panel" 
        className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-xs transition-all duration-200"
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 shadow-xs border border-blue-200 bg-slate-100">
              <img 
                src={modulAksesLogo} 
                alt="Logo Akses" 
                className="w-full h-full object-cover" 
                referrerPolicy="no-referrer" 
              />
            </div>
            
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase tracking-wider font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Sesi Login Aktif
                </span>
                <span className="text-[11px] text-slate-400 font-medium hidden md:inline">
                  PT. BEHAESTEX Divisi Yarn Dyeing
                </span>
              </div>

              <h2 id="active-user-title" className="text-base sm:text-lg font-black text-slate-850 mt-0.5 flex items-center gap-2">
                <span>{currentGroup === 'ALL' ? '🛡️ Administrator' : `👥 KSS ${getGroupLabel(currentGroup)}`}</span>
              </h2>

              <p className="text-xs text-slate-500 mt-0.5">
                {currentGroup === 'ALL'
                  ? 'Akses penuh pemantauan data, persetujuan draf, dan rekapitulasi seluruh grup.'
                  : `Formulir penilaian terbuka khusus operator ${getGroupLabel(currentGroup)}.`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
            <button
              type="button"
              onClick={onLogout}
              className="w-full sm:w-auto px-4 py-2.5 bg-rose-50 hover:bg-rose-100 active:scale-95 text-rose-700 text-xs font-bold rounded-xl shadow-3xs transition-all flex items-center justify-center gap-2 border border-rose-200 cursor-pointer duration-150"
              title="Keluar dari sesi ini dan kembali ke halaman login"
            >
              <LogOut className="w-4 h-4 text-rose-600 shrink-0" />
              <span>Keluar / Ganti Shift</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW 2: DEDICATED LOGIN PAGE / CARD (WHEN NOT LOGGED IN)
  // =========================================================================
  return (
    <div id="login-page-container" className="max-w-xl mx-auto py-4 sm:py-8 px-2 animate-fade-in">
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xl overflow-hidden">
        
        {/* Top Header Card */}
        <div className="bg-gradient-to-br from-blue-900 via-slate-900 to-slate-950 text-white p-6 sm:p-8 text-center relative overflow-hidden">
          <div className="absolute -top-12 -right-12 w-40 h-40 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-12 -left-12 w-40 h-40 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 space-y-3">
            <div className="w-20 h-20 rounded-2xl overflow-hidden mx-auto shadow-lg border-2 border-white/20 bg-slate-800 p-1">
              <img 
                src={modulAksesLogo} 
                alt="Modul Akses Logo" 
                className="w-full h-full object-cover rounded-xl" 
                referrerPolicy="no-referrer" 
              />
            </div>

            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-blue-500/20 text-blue-300 border border-blue-400/30 font-mono mb-2">
                <Lock className="w-3 h-3 text-blue-400" />
                Login Otorisasi Akses
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Sistem Penilaian Kinerja (SPK)
              </h1>
              <p className="text-xs text-blue-200/80 font-medium mt-1">
                PT. Behaestex • Divisi Yarn Dyeing
              </p>
            </div>
          </div>
        </div>

        {/* Login Form Body */}
        <form onSubmit={handleFormSubmit} className="p-6 sm:p-8 space-y-5 bg-white">
          
          {/* Error Notice */}
          {errorMessage && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-semibold flex items-start gap-2.5 animate-shake">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">
                {errorMessage}
              </div>
            </div>
          )}

          {/* Field 1: User / Shift / Bagian */}
          <div className="space-y-1.5">
            <label 
              htmlFor="login-group-select" 
              className="block text-xs font-bold text-slate-700 uppercase tracking-wider"
            >
              Grup / Bagian: <span className="text-rose-500">*</span>
            </label>
            
            <div className="relative">
              <select
                id="login-group-select"
                value={selectedGroup}
                onChange={(e) => {
                  setSelectedGroup(e.target.value);
                  setErrorMessage(null);
                }}
                className="w-full bg-slate-50 hover:bg-slate-100/70 text-slate-800 px-4 py-3 rounded-xl border border-slate-300 font-medium text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all cursor-pointer appearance-none"
              >
                <option value="" disabled>-- Silahkan pilih shift/bagian --</option>
                
                <optgroup label="Shift Produksi (KSS)">
                  <option value="A">👥 KSS Grup A</option>
                  <option value="B">👥 KSS Grup B</option>
                  <option value="C">👥 KSS Grup C</option>
                </optgroup>
                
                <optgroup label="Bagian Non-Shift & Pendukung">
                  <option value="NS">🛠️ Grup Non-Shift (NS)</option>
                  <option value="MTC">🔧 Maintenance (MTC)</option>
                  <option value="LAB">🧪 Laboratorium (LAB)</option>
                  <option value="QC">🔍 Quality Control (QC)</option>
                </optgroup>
                
                <optgroup label="Akses Manajemen & Pengawas">
                  <option value="ALL">🛡️ Administrator (Semua Grup & Rekap)</option>
                </optgroup>
              </select>
              
              <div className="absolute inset-y-0 right-0 flex items-center pr-3.5 pointer-events-none text-slate-400">
                <UserCheck className="w-4 h-4" />
              </div>
            </div>
          </div>

          {/* Field 2: Sandi / Password */}
          <div className="space-y-1.5">
            <label 
              htmlFor="login-password-input" 
              className="block text-xs font-bold text-slate-700 uppercase tracking-wider"
            >
              Password: <span className="text-rose-500">*</span>
            </label>

            <div className="relative">
              <input
                id="login-password-input"
                type={showPassword ? "text" : "password"}
                placeholder="Masukkan sandi..."
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setErrorMessage(null);
                }}
                className="w-full bg-slate-50 focus:bg-white text-slate-800 pl-4 pr-11 py-3 rounded-xl border border-slate-300 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all font-mono"
              />

              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400 hover:text-slate-600 cursor-pointer transition-colors"
                title={showPassword ? "Sembunyikan sandi" : "Tampilkan sandi"}
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <div className="pt-2">
            <button
              id="login-submit-button"
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 active:scale-[0.99] text-white text-sm font-bold uppercase tracking-wider rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Memverifikasi Sandi...</span>
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>Login</span>
                </>
              )}
            </button>
          </div>

          <p className="text-[11px] text-center text-slate-400 pt-1">
            Data tersimpan aman di server lokal dan sinkron otomatis dengan Google Sheets
          </p>
        </form>

      </div>
    </div>
  );
}
