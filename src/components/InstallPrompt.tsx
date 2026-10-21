/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Smartphone, X, Download, Share2, PlusSquare, Sparkles, Monitor } from 'lucide-react';
import spkLogo from '../assets/images/spk_logo_1782518538609.jpg';

export default function InstallPrompt() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    // 1. Check if the user is using a mobile browser
    const isMobileDevice = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
    
    // 2. Check if already installed (standalone mode)
    const standalone = window.matchMedia('(display-mode: standalone)').matches || 
                       (window.navigator as any).standalone === true;
    setIsStandalone(standalone);
    
    // Determine if iOS for device-specific share action
    const detectIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    setIsIOS(detectIOS);

    if (isMobileDevice && !standalone) {
      // Show the install floating guidelines after a short delay
      const timer = setTimeout(() => {
        setShowPrompt(true);
      }, 4000);
      
      return () => clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    // Capture the PWA native beforeinstallprompt event if supported by browser (such as Chrome on Android)
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowPrompt(true);
    };

    // Custom browser handler to show guide manually when triggered
    const handleShowManual = () => {
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('show-install-prompt-manual', handleShowManual);
    
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('show-install-prompt-manual', handleShowManual);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`User install choice outcome: ${outcome}`);
      setDeferredPrompt(null);
      setShowPrompt(false);
    } else {
      // If native PWA browser prompt is not active, we guide the user with specific instructions
      const message = isIOS 
        ? "Silakan ketuk tombol Bagikan (Share) di Safari lalu pilih 'Tambah ke Layar Utama' (Add to Home Screen)."
        : "Silakan buka menu titik tiga (⋮) di Chrome lalu pilih 'Tambahkan ke Layar Utama' atau 'Instal Aplikasi'.";
      
      if ((window as any).showCustomAlert) {
        (window as any).showCustomAlert("Cara Pasang Aplikasi", message);
      } else {
        alert(message);
      }
    }
  };

  // If already running inside installed standalone app, do not distract user with install overlays
  if (isStandalone) return null;

  return (
    <>
      {/* 1. Full detailed guidelines modal/card prompt */}
      {showPrompt ? (
        <div 
          id="mobile-install-pill" 
          className="fixed bottom-6 left-4 right-4 md:left-auto md:right-6 md:max-w-sm bg-white border-2 border-blue-500 rounded-2xl p-4.5 shadow-2xl z-50 animate-bounce duration-500 flex flex-col gap-3"
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 border border-blue-200 rounded-xl overflow-hidden shrink-0 shadow-3xs">
                <img src={spkLogo} alt="App Icon" className="w-full h-full object-cover animate-pulse" referrerPolicy="no-referrer" />
              </div>
              <div>
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  Pasang Aplikasi di HP 
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                </h4>
                <p className="text-[10px] text-slate-500 mt-0.5">Nikmati akses cepat & rekap otomatis tanpa browser!</p>
              </div>
            </div>
            
            <button
              type="button"
              onClick={() => setShowPrompt(false)}
              className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="bg-blue-50/50 rounded-xl p-3 border border-blue-100 text-[11px] text-slate-750 font-sans space-y-2 leading-relaxed">
            <p className="font-extrabold text-blue-900 border-b border-blue-100/60 pb-1 flex items-center gap-1">
              <Download className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              Petunjuk Pemasangan Cepat:
            </p>
            
            {isIOS ? (
              <ol className="list-decimal list-inside space-y-1 text-slate-650">
                <li>Ketuk tombol <strong className="font-bold text-blue-800 inline-flex items-center gap-0.5"><Share2 className="w-3 h-3 inline" /> Bagikan (Share)</strong> pada navigasi Safari di bagian bawah.</li>
                <li>Geser ke bawah lalu ketuk menu <strong className="font-bold text-blue-800 inline-flex items-center gap-0.5"><PlusSquare className="w-3 h-3 inline" /> Tambah ke Layar Utama</strong>.</li>
                <li>Tekan tombol <strong className="font-bold text-blue-800">Tambah (Add)</strong> di kanan atas halaman.</li>
              </ol>
            ) : (
              <ol className="list-decimal list-inside space-y-1 text-slate-650">
                <li>Ketuk tombol menu <strong className="font-bold text-blue-800">titik tiga (⋮)</strong> di sudut kanan atas Chrome.</li>
                <li>PILIH menu <strong className="font-bold text-blue-800 inline-flex items-center gap-0.5"><PlusSquare className="w-3 h-3 inline" /> Tambahkan ke Layar Utama</strong> atau <strong className="font-bold text-blue-800">Instal Aplikasi</strong>.</li>
                <li>Konfirmasikan pemasangan dengan menekan <strong className="font-bold text-blue-800">Instal / Tambah</strong>.</li>
              </ol>
            )}
          </div>

          {/* Primary installation action CTA when native browser installation is ready */}
          {deferredPrompt && (
            <button
              type="button"
              onClick={handleInstallClick}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-colors shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Download className="w-4 h-4 text-white" />
              Instal Langsung Sekarang
            </button>
          )}

          <div className="flex items-center justify-between text-[9px] text-slate-400 font-bold uppercase tracking-wider px-1">
            <span>Android & iOS Compatible</span>
            <span>•</span>
            <span>PWA Offline Optimization</span>
          </div>
        </div>
      ) : (
        /* 2. Small round floating action button when prompt is minimized */
        <div id="pwa-floating-fab" className="fixed bottom-6 right-6 z-[90] flex items-center gap-2 group">
          {/* Elegant Tooltip that shows on hover */}
          <span className="hidden sm:inline-block bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-xl shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none border border-slate-700 whitespace-nowrap">
            Pasang Aplikasi PWA
          </span>
          
          {/* Rounded Pulsing Button */}
          <button
            type="button"
            onClick={() => setShowPrompt(true)}
            className="w-13 h-13 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-full flex items-center justify-center shadow-xl hover:shadow-2xl transition-all duration-300 relative border-2 border-white cursor-pointer active:scale-90"
            title="Saran Instalasi Aplikasi"
          >
            {/* Pulsing ring animation */}
            <span className="absolute inset-x-0 -inset-y-0 w-full h-full rounded-full bg-blue-500 opacity-75 animate-ping duration-1000 scale-110"></span>
            
            {/* Main Icon */}
            <div className="relative z-10 flex flex-col items-center justify-center gap-0.5">
              <Download className="w-4 h-4 text-white animate-bounce" />
              <span className="text-[7.5px] font-black uppercase tracking-tighter leading-none">INSTAL</span>
            </div>
            
            {/* Mini amber sparkles notification badge */}
            <span className="absolute -top-1.5 -right-1.5 bg-amber-500 border border-white text-white text-[8px] font-black px-1.5 py-0.5 rounded-full shadow-md animate-pulse">
              HOT
            </span>
          </button>
        </div>
      )}
    </>
  );
}
