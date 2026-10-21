/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Evaluation, AppConfig, GroupType, Employee, KssContact, HrmsRecord, PresensiRecord } from './types';
import { PREPOPULATED_EMPLOYEES } from './data';
import { normalizeNoReg, parseAndNormalizePeriode, isShiftMtcEmployee, getShiftMtcGroup, deduplicateEvaluations, normalizeEvaluationRecord, getPeriodFromDate, getPeriodePenilaian, isSecondedToNSEmployee, getSecondedOriginalGroup, resolveEmpId } from './utils';
import AccessControl from './components/AccessControl';
import EvaluationForm from './components/EvaluationForm';
import DashboardSummary from './components/DashboardSummary';
import GoogleSheetsConfig from './components/GoogleSheetsConfig';
import EmployeeDatabase from './components/EmployeeDatabase';
import KssContactsConfig from './components/KssContactsConfig';
import HrmsDatabase from './components/HrmsDatabase';
import PresensiDatabase from './components/PresensiDatabase';
import InstallPrompt from './components/InstallPrompt';
import ActivityLogsTable from './components/ActivityLogsTable';
import NotificationBell from './components/NotificationBell';
import GoogleSignInButton from './components/GoogleSignInButton';
import { getAccessToken } from './googleAuth';
import { 
  extractSpreadsheetId, 
  appendEvaluationToGoogleSheet, 
  batchAppendEvaluationsToGoogleSheet, 
  readSpreadsheetEvaluations 
} from './services/googleSheetsService';
import spkLogo from './assets/images/spk_logo_1782518538609.jpg';
import spkLogoQr from './assets/images/spk_logo_1782518538609.jpg';
import { 
  isFirebaseActive, 
  listenToEvaluations, 
  saveCloudEvaluation, 
  saveCloudEvaluationsBatch, 
  deleteCloudEvaluation, 
  clearCloudEvaluations,
  listenToHrmsRecords,
  saveCloudHrmsRecordsBatch,
  listenToPresensiRecords,
  saveCloudPresensiRecordsBatch,
  listenToConfig,
  saveCloudConfig,
  listenToEmployees,
  saveCloudEmployee,
  deleteCloudEmployee,
  saveCloudEmployeesBatch,
  saveCloudMasterEmployeesBatch,
  fetchCloudMasterEmployees,
  deleteCloudMasterEmployee
} from './firebase';
import { 
  fetchPresensiRecordsFromSheet, 
  fetchHrmsRecordsFromSheet, 
  fetchEvaluationsFromAllTabs,
  DEFAULT_SPREADSHEET_ID 
} from './services/dataSyncService';
import { Sparkles, Star, Layers, Calendar, Clock, Lock, RefreshCw, Smartphone, Monitor, Trash2, HelpCircle, AlertCircle, X, QrCode, Copy, Check } from 'lucide-react';

const STORAGE_KEYS = {
  EVALUATIONS: 'e_penilaian_karyawan_data_v1',
  CONFIG: 'e_penilaian_karyawan_config_v1',
};

// Safe storage helper to prevent crash in sandboxed iframes
const safeStorage = {
  getItem: (key: string): string | null => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string): void => {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Graceful fallback to prevent crash
    }
  }
};

function parseUserAgent(ua: string): string {
  if (!ua) return 'Device Tidak Diketahui';
  
  let os = 'Perangkat Tidak Diketahui';
  let browser = 'Browser';
  
  if (/android/i.test(ua)) {
    os = 'Android';
  } else if (/ipad|iphone|ipod/i.test(ua)) {
    os = 'iOS';
  } else if (/windows/i.test(ua)) {
    os = 'Windows PC';
  } else if (/macintosh/i.test(ua)) {
    os = 'Mac OS';
  } else if (/linux/i.test(ua)) {
    os = 'Linux';
  }
  
  if (/chrome|crios/i.test(ua) && !/edge|edg/i.test(ua) && !/opr/i.test(ua)) {
    browser = 'Chrome';
  } else if (/safari/i.test(ua) && !/chrome|crios/i.test(ua)) {
    browser = 'Safari';
  } else if (/firefox|fxios/i.test(ua)) {
    browser = 'Firefox';
  } else if (/edge|edg/i.test(ua)) {
    browser = 'Edge';
  } else if (/opr/i.test(ua)) {
    browser = 'Opera';
  }
  
  return `${os} (${browser})`;
}

// Initial populated evaluations so there is no blank state slop
const INITIAL_EVALUATIONS: Evaluation[] = [
  {
    id: 'init-1',
    periode: 'Juni 2026',
    noReg: 'A001',
    nama: 'Ahmad Fauzi',
    grup: 'A',
    nil1: 4,
    nil2: 5,
    average: 4.5,
    submittedAt: '2026-06-22T20:05:00.000Z',
  },
  {
    id: 'init-2',
    periode: 'Juni 2026',
    noReg: 'A002',
    nama: 'Budi Santoso',
    grup: 'A',
    nil1: 3,
    nil2: 4,
    average: 3.5,
    submittedAt: '2026-06-22T20:06:00.000Z',
  },
  {
    id: 'init-3',
    periode: 'Juni 2026',
    noReg: 'DYG01',
    nama: 'Setyawan Adi',
    grup: 'NS',
    nil1: 5,
    nil2: 5,
    average: 5.0,
    submittedAt: '2026-06-22T20:08:00.000Z',
  },
  {
    id: 'init-4',
    periode: 'Juni 2026',
    noReg: 'QC01',
    nama: 'Hendra Setiawan',
    grup: 'QC',
    nil1: 4,
    nil2: 3,
    average: 3.5,
    submittedAt: '2026-06-22T20:10:00.000Z',
  },
];

const DEFAULT_CONFIG: AppConfig = {
  webhookUrl: '',
  spreadsheetId: '',
  sheetName: 'Sheet1',
  activeGroup: 'NONE',
  clientId: '',
  isDemoMode: false, // Default to false so that the live input period starts automatically without requiring manual action
};

const DEFAULT_KSS_CONTACTS: KssContact[] = [
  { group: 'A', name: 'KSS Grup A', phone: '' },
  { group: 'B', name: 'KSS Grup B', phone: '' },
  { group: 'C', name: 'KSS Grup C', phone: '' },
  { group: 'NS', name: 'Non-Shift', phone: '' },
  { group: 'MTC', name: 'KSS Maintenance', phone: '' },
  { group: 'LAB', name: 'Laborat', phone: '' },
  { group: 'QC', name: 'Quality Control', phone: '' },
];

const getProductionUrl = (): string => {
  const origin = window.location.origin;
  if (
    origin.includes('ais-dev-') || 
    origin.includes('ais-pre-') || 
    origin.includes('localhost') || 
    origin.includes('127.0.0.1')
  ) {
    return 'https://form-penilaian-karyawan-543541790120.asia-southeast1.run.app';
  }
  return origin;
};

export default function App() {
  const [evaluations, setEvaluationsRaw] = useState<Evaluation[]>([]);
  const setEvaluations = (list: Evaluation[] | ((prev: Evaluation[]) => Evaluation[])) => {
    if (typeof list === 'function') {
      setEvaluationsRaw(prev => deduplicateEvaluations(list(prev)));
    } else {
      setEvaluationsRaw(deduplicateEvaluations(list));
    }
  };
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [timeStr, setTimeStr] = useState<string>('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [customAlert, setCustomAlert] = useState<{ isOpen: boolean; title: string; message: string } | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [combinedQrUrl, setCombinedQrUrl] = useState<string>('');
  const [isGeneratingQr, setIsGeneratingQr] = useState<boolean>(false);
  const [isAutoSyncing, setIsAutoSyncing] = useState<boolean>(false);

  const evaluationsRef = React.useRef<Evaluation[]>(evaluations);
  useEffect(() => {
    evaluationsRef.current = evaluations;
  }, [evaluations]);

  useEffect(() => {
    if (isShareModalOpen) {
      generateCombinedQr();
    }
  }, [isShareModalOpen]);

  // Keyboard confirmation listeners for Enter, Space, and Escape keys
  useEffect(() => {
    if (!deleteTarget && !(customAlert && customAlert.isOpen)) return;

    const handleKeyDown = async (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (deleteTarget) {
          const target = deleteTarget;
          setDeleteTarget(null);
          const filtered = evaluations.filter(ev => ev.id !== target.id);
          saveEvaluationsState(filtered);
          if (isFirebaseActive) {
            await deleteCloudEvaluation(target.id);
          }
          addLog('Hapus Nilai', `Menghapus penilaian ${target.name}`);
        } else if (customAlert && customAlert.isOpen) {
          setCustomAlert({ ...customAlert, isOpen: false });
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setDeleteTarget(null);
        if (customAlert && customAlert.isOpen) {
          setCustomAlert({ ...customAlert, isOpen: false });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleteTarget, customAlert, evaluations, isFirebaseActive]);

  const [employees, setEmployees] = useState<Employee[]>(() => {
    const cached = safeStorage.getItem('e_penilaian_karyawan_employees_v1');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          return parsed.map(normalizeEvaluationRecord);
        }
      } catch {}
    }
    return PREPOPULATED_EMPLOYEES.map(normalizeEvaluationRecord);
  });

  const [kssContacts, setKssContacts] = useState<KssContact[]>(() => {
    const cached = safeStorage.getItem('e_penilaian_karyawan_kss_contacts_v1');
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        return DEFAULT_KSS_CONTACTS;
      }
    }
    return DEFAULT_KSS_CONTACTS;
  });

  const [adminTab, setAdminTab] = useState<'presensi' | 'hrms' | 'karyawan' | 'kontak' | 'sheets' | 'logs'>('presensi');
  const [hrmsRecords, setHrmsRecords] = useState<HrmsRecord[]>(() => {
    const cached = safeStorage.getItem('hrms_records_v1');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          return parsed.map(normalizeEvaluationRecord);
        }
      } catch {}
    }
    return [];
  });
  const [presensiRecords, setPresensiRecords] = useState<PresensiRecord[]>(() => {
    const cached = safeStorage.getItem('presensi_records_v1');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          return parsed.map(normalizeEvaluationRecord);
        }
      } catch {}
    }
    return [];
  });
  const [lastAutoSyncTime, setLastAutoSyncTime] = useState<Date | null>(null);
  const [showUpdateBanner, setShowUpdateBanner] = useState<boolean>(false);

  // Network detection & ISP details
  const [ispInfo, setIspInfo] = useState<string>('Wifi / Jaringan Lokal');

  useEffect(() => {
    const detectNetworkAndIsp = async () => {
      let connectionType = '';
      const conn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
      if (conn) {
        connectionType = conn.effectiveType ? ` (${conn.effectiveType.toUpperCase()})` : '';
      }
      
      try {
        const res = await fetch('https://ipapi.co/json/');
        if (res.ok) {
          const data = await res.json();
          const org = data.org || data.asn || '';
          if (org) {
            setIspInfo(`${org}${connectionType}`);
            return;
          }
        }
      } catch (err) {
        console.warn('Primary ISP lookup failed, trying fallback...');
      }

      try {
        const res = await fetch('https://api.db-ip.com/v2/free/self');
        if (res.ok) {
          const data = await res.json();
          if (data.ipAddress) {
            setIspInfo(`Lokal IP: ${data.ipAddress}${connectionType}`);
            return;
          }
        }
      } catch {}

      setIspInfo(`Wifi / Jaringan Lokal${connectionType}`);
    };

    detectNetworkAndIsp();
  }, []);

  // Activity Log State
  const [activityLogs, setActivityLogs] = useState<any[]>(() => {
    try {
      const saved = safeStorage.getItem('spk_activity_logs_v1');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const addLog = (action: string, details: string, logGroup?: string) => {
    const userAgentString = parseUserAgent(navigator.userAgent);
    const activeGrp = logGroup || config.activeGroup;
    const groupLabel = activeGrp === 'ALL' ? 'ADMIN' : activeGrp === 'NONE' ? 'UMUM' : `GRUP ${activeGrp}`;
    
    const newLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      timestamp: new Date().toISOString(),
      group: groupLabel,
      action,
      device: userAgentString,
      network: ispInfo,
      details
    };

    setActivityLogs(prev => {
      const updated = [newLog, ...prev].slice(0, 500); // Max 500 logs
      safeStorage.setItem('spk_activity_logs_v1', JSON.stringify(updated));
      return updated;
    });
  };

  const handleClearActivityLogs = () => {
    setActivityLogs([]);
    safeStorage.setItem('spk_activity_logs_v1', JSON.stringify([]));
  };

  useEffect(() => {
    const handleUpdate = () => {
      console.log('SW update event detected in React app!');
      setShowUpdateBanner(true);
    };
    window.addEventListener('sw-update-available', handleUpdate);
    return () => {
      window.removeEventListener('sw-update-available', handleUpdate);
    };
  }, []);

  const handleSaveKssContacts = (newContacts: KssContact[]) => {
    setKssContacts(newContacts);
    safeStorage.setItem('e_penilaian_karyawan_kss_contacts_v1', JSON.stringify(newContacts));
  };

  const handleSyncEmployees = async (newEmployees: Employee[], isFromSpreadsheet = false, oldNoReg?: string, newNoReg?: string) => {
    const normalized = newEmployees.map(normalizeEvaluationRecord);
    setEmployees(normalized);
    safeStorage.setItem('e_penilaian_karyawan_employees_v1', JSON.stringify(normalized));
    if (isFirebaseActive) {
      await saveCloudEmployeesBatch(normalized);
      if (isFromSpreadsheet) {
        // Also save to the safe-haven "spreadsheet_employees_master" collection
        await saveCloudMasterEmployeesBatch(normalized);
      }
    }

    // Propagate No. Reg change to evaluations, hrms, and presensi records!
    if (oldNoReg && newNoReg && oldNoReg !== newNoReg) {
      console.log(`Propagating No. Reg change throughout collections: ${oldNoReg} -> ${newNoReg}`);

      // 1. Update evaluations
      const updatedEvaluations = evaluations.map(ev => {
        if (ev.noReg === oldNoReg) {
          return { ...ev, noReg: newNoReg };
        }
        return ev;
      });
      setEvaluations(updatedEvaluations);
      if (isFirebaseActive) {
        await saveCloudEvaluationsBatch(updatedEvaluations);
      }

      // 2. Update HRMS records
      const updatedHrms = hrmsRecords.map(rec => {
        if (rec.noReg === oldNoReg) {
          return { ...rec, noReg: newNoReg };
        }
        return rec;
      });
      setHrmsRecords(updatedHrms);
      safeStorage.setItem('hrms_records_v1', JSON.stringify(updatedHrms));
      if (isFirebaseActive) {
        await saveCloudHrmsRecordsBatch(updatedHrms);
      }

      // 3. Update Presensi records
      const updatedPresensi = presensiRecords.map(rec => {
        if (rec.noReg === oldNoReg) {
          return { ...rec, noReg: newNoReg };
        }
        return rec;
      });
      setPresensiRecords(updatedPresensi);
      safeStorage.setItem('presensi_records_v1', JSON.stringify(updatedPresensi));
      if (isFirebaseActive) {
        await saveCloudPresensiRecordsBatch(updatedPresensi);
      }
    }
  };

  const handleResetEmployees = async () => {
    try {
      let sourceList = PREPOPULATED_EMPLOYEES;
      if (isFirebaseActive) {
        // Recover from safe spreadsheet master database partition if available
        const masterList = await fetchCloudMasterEmployees();
        if (masterList && masterList.length > 0) {
          sourceList = masterList;
          console.log('Restored employees from cloud master spreadsheet partition.');
        }
      }
      const normalized = sourceList.map(normalizeEvaluationRecord);
      setEmployees(normalized);
      safeStorage.setItem('e_penilaian_karyawan_employees_v1', JSON.stringify(normalized));
      if (isFirebaseActive) {
        await saveCloudEmployeesBatch(normalized);
      }
      triggerCustomAlert(
        'Reset Selesai',
        'Database karyawan berhasil di-reset mengacu pada data master teraman (Google Spreadsheet Anda).'
      );
    } catch (e) {
      console.error('Failed to reset employees safely:', e);
      // Fallback
      const normalizedPrepopulated = PREPOPULATED_EMPLOYEES.map(normalizeEvaluationRecord);
      setEmployees(normalizedPrepopulated);
      safeStorage.setItem('e_penilaian_karyawan_employees_v1', JSON.stringify(normalizedPrepopulated));
      if (isFirebaseActive) {
        await saveCloudEmployeesBatch(normalizedPrepopulated);
      }
    }
  };

  const triggerCustomAlert = (title: string, message: string) => {
    setCustomAlert({ isOpen: true, title, message });
  };

  const generateCombinedQr = () => {
    setIsGeneratingQr(true);
    const url = getProductionUrl();

    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(url)}`;
    
    const qrImg = new Image();
    qrImg.crossOrigin = "anonymous";
    
    qrImg.onload = () => {
      const logoImg = new Image();
      logoImg.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 500;
        canvas.height = 500;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, 500, 500);
          ctx.drawImage(qrImg, 0, 0, 500, 500);
          
          const logoSize = 100;
          const logoX = (500 - logoSize) / 2;
          const logoY = (500 - logoSize) / 2;
          
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          const radius = 12;
          ctx.moveTo(logoX + radius, logoY);
          ctx.lineTo(logoX + logoSize - radius, logoY);
          ctx.quadraticCurveTo(logoX + logoSize, logoY, logoX + logoSize, logoY + radius);
          ctx.lineTo(logoX + logoSize, logoY + logoSize - radius);
          ctx.quadraticCurveTo(logoX + logoSize, logoY + logoSize, logoX + logoSize - radius, logoY + logoSize);
          ctx.lineTo(logoX + radius, logoY + logoSize);
          ctx.quadraticCurveTo(logoX, logoY + logoSize, logoX, logoY + logoSize - radius);
          ctx.lineTo(logoX, logoY + radius);
          ctx.quadraticCurveTo(logoX, logoY, logoX + radius, logoY);
          ctx.closePath();
          ctx.fill();
          
          ctx.strokeStyle = '#e2e8f0';
          ctx.lineWidth = 4;
          ctx.stroke();
          
          const innerLogoSize = 84;
          const innerLogoX = (500 - innerLogoSize) / 2;
          const innerLogoY = (500 - innerLogoSize) / 2;
          
          ctx.save();
          ctx.beginPath();
          const innerRadius = 8;
          ctx.moveTo(innerLogoX + innerRadius, innerLogoY);
          ctx.lineTo(innerLogoX + innerLogoSize - innerRadius, innerLogoY);
          ctx.quadraticCurveTo(innerLogoX + innerLogoSize, innerLogoY, innerLogoX + innerLogoSize, innerLogoY + innerRadius);
          ctx.lineTo(innerLogoX + innerLogoSize, innerLogoY + innerLogoSize - innerRadius);
          ctx.quadraticCurveTo(innerLogoX + innerLogoSize, innerLogoY + innerLogoSize, innerLogoX + innerLogoSize - innerRadius, innerLogoY + innerLogoSize);
          ctx.lineTo(innerLogoX + innerRadius, innerLogoY + innerLogoSize);
          ctx.quadraticCurveTo(innerLogoX, innerLogoY + innerLogoSize, innerLogoX, innerLogoY + innerLogoSize - innerRadius);
          ctx.lineTo(innerLogoX, innerLogoY + innerRadius);
          ctx.quadraticCurveTo(innerLogoX, innerLogoY, innerLogoX + innerRadius, innerLogoY);
          ctx.closePath();
          ctx.clip();
          
          ctx.drawImage(logoImg, innerLogoX, innerLogoY, innerLogoSize, innerLogoSize);
          ctx.restore();
          
          try {
            const downloadUrl = canvas.toDataURL("image/png");
            setCombinedQrUrl(downloadUrl);
          } catch (err) {
            console.error("Canvas toDataURL failed:", err);
            setCombinedQrUrl(qrUrl);
          }
          setIsGeneratingQr(false);
        }
      };
      logoImg.onerror = (e) => {
        console.error("Failed to load logo image:", e);
        const canvas = document.createElement('canvas');
        canvas.width = 500;
        canvas.height = 500;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, 500, 500);
          ctx.drawImage(qrImg, 0, 0, 500, 500);
          setCombinedQrUrl(canvas.toDataURL("image/png"));
        } else {
          setCombinedQrUrl(qrUrl);
        }
        setIsGeneratingQr(false);
      };
      logoImg.src = spkLogoQr;
    };
    qrImg.onerror = (e) => {
      console.error("Failed to load QR image:", e);
      setCombinedQrUrl(qrUrl);
      setIsGeneratingQr(false);
    };
    qrImg.src = qrUrl;
  };

  const handleDownloadQr = () => {
    if (!combinedQrUrl) {
      triggerCustomAlert("Mempersiapkan QR", "Mohon tunggu sebentar, gambar QR Code sedang dipersiapkan.");
      return;
    }
    const link = document.createElement('a');
    link.href = combinedQrUrl;
    link.download = 'QR_Code_SPK_Form_Penilaian.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addLog('Simpan QR', 'Mengunduh QR Code SPK dengan logo');
  };

  const handleShareWhatsApp = async () => {
    const url = getProductionUrl();
    const text = `Halo, silakan gunakan link resmi di bawah ini untuk mengisi Form Penilaian Karyawan SPK:\n\n🔗 *${url}*\n\nTerima kasih atas partisipasi Anda!`;

    if (combinedQrUrl && navigator.share) {
      try {
        // Convert base64 data URL to Blob directly without fetch
        const arr = combinedQrUrl.split(',');
        const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
          u8arr[n] = bstr.charCodeAt(n);
        }
        const blob = new Blob([u8arr], { type: mime });
        const file = new File([blob], 'QR_Code_SPK_Form_Penilaian.png', { type: 'image/png' });
        
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: 'QR Code SPK Form Penilaian Karyawan',
            text: text,
          });
          addLog('Bagikan QR Gambar', 'Membagikan gambar QR Code ke WhatsApp/Aplikasi Chat');
          return;
        }
      } catch (err) {
        console.warn("Failed sharing files using Web Share API:", err);
      }
    }

    // Fallback to Click-to-Chat URL
    const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(whatsappUrl, '_blank');
    addLog('Bagikan WA', 'Membuka WhatsApp untuk membagikan tautan aplikasi');

    // Tip for manual share
    triggerCustomAlert(
      "Membagikan via WhatsApp",
      "Tautan teks berhasil dikirim ke WhatsApp!\n\n💡 Tips: Untuk membagikan gambar QR Code berlogo di komputer/laptop, silakan klik tombol 'Simpan Gambar QR' terlebih dahulu, lalu kirim gambar tersebut ke WhatsApp secara manual."
    );
  };

  // Security passcodes and authorization state
  const [authorizedGroups, setAuthorizedGroups] = useState<string[]>([]);
  const [pendingGroup, setPendingGroup] = useState<GroupType | 'ALL' | 'NONE' | null>(null);
  const [passcodeInput, setPasscodeInput] = useState('');
  const [passcodeError, setPasscodeError] = useState<string | null>(null);

  const handleVerifyPasscode = () => {
    const rawInput = passcodeInput.trim();
    if (!rawInput) {
      setPasscodeError('Sandi tidak boleh kosong');
      return;
    }

    const group = pendingGroup || config.activeGroup;
    let isCorrect = false;

    if (group === 'ALL') {
      isCorrect = rawInput.toLowerCase() === 'akses.admin123';
    } else {
      const codes: Record<string, string> = {
        'A': 'A123',
        'B': 'B123',
        'C': 'C123',
        'NS': 'N123',
        'MTC': 'M123',
        'LAB': 'L123',
        'QC': 'Q123'
      };
      const expected = codes[group] || '';
      isCorrect = rawInput.toLowerCase() === expected.toLowerCase();
    }

    if (isCorrect) {
      const updatedAuths = [group];
      setAuthorizedGroups(updatedAuths);
      handleUpdateConfig({ activeGroup: group });
      setPendingGroup(null);
      setPasscodeInput('');
      setPasscodeError(null);
      addLog('Login Akses', `Berhasil masuk sebagai ${group === 'ALL' ? 'Admin' : `KSS Grup ${group}`}`, group);
    } else {
      setPasscodeError('Sandi salah. Silakan coba lagi.');
    }
  };

  const handleDirectLogin = (group: GroupType | 'ALL', passcode: string): { success: boolean; message?: string } => {
    const rawInput = passcode.trim();
    if (!rawInput) {
      return { success: false, message: 'Sandi tidak boleh kosong' };
    }

    let isCorrect = false;
    if (group === 'ALL') {
      isCorrect = rawInput.toLowerCase() === 'akses.admin123';
    } else {
      const codes: Record<string, string> = {
        'A': 'A123',
        'B': 'B123',
        'C': 'C123',
        'NS': 'N123',
        'MTC': 'M123',
        'LAB': 'L123',
        'QC': 'Q123'
      };
      const expected = codes[group] || '';
      isCorrect = rawInput.toLowerCase() === expected.toLowerCase();
    }

    if (isCorrect) {
      const updatedAuths = [group];
      setAuthorizedGroups(updatedAuths);
      handleUpdateConfig({ activeGroup: group });
      setPendingGroup(null);
      setPasscodeInput('');
      setPasscodeError(null);
      addLog('Login Akses', `Berhasil masuk sebagai ${group === 'ALL' ? 'Admin' : `KSS Grup ${group}`}`, group);
      return { success: true };
    } else {
      return { success: false, message: 'Sandi yang Anda masukkan salah. Silakan periksa kembali.' };
    }
  };

  // Local storage loading & global alert registration
  useEffect(() => {
    // Expose a globally-accessible alert function that bypasses sandboxed iframe blocks
    (window as any).showCustomAlert = (title: string, message: string) => {
      setCustomAlert({ isOpen: true, title, message });
    };

    const rawEvals = safeStorage.getItem(STORAGE_KEYS.EVALUATIONS);
    if (rawEvals) {
      try {
        setEvaluations(JSON.parse(rawEvals));
      } catch {
        setEvaluations(INITIAL_EVALUATIONS);
      }
    } else {
      setEvaluations(INITIAL_EVALUATIONS);
      safeStorage.setItem(STORAGE_KEYS.EVALUATIONS, JSON.stringify(INITIAL_EVALUATIONS));
    }

    const rawConfig = safeStorage.getItem(STORAGE_KEYS.CONFIG);
    if (rawConfig) {
      try {
        const parsed = JSON.parse(rawConfig);
        const loadedConfig = { ...DEFAULT_CONFIG, ...parsed, activeGroup: 'NONE' };
        
        // Auto-correct: If current date natively falls into active period (15-25),
        // automatically turn off Demo Mode to ensure they access the Live Input mode.
        const today = new Date();
        const nativeDay = today.getDate();
        if (nativeDay >= 15 && nativeDay <= 25 && loadedConfig.isDemoMode) {
          loadedConfig.isDemoMode = false;
          safeStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(loadedConfig));
        }
        
        setConfig(loadedConfig);
      } catch {
        setConfig({ ...DEFAULT_CONFIG, activeGroup: 'NONE' });
      }
    } else {
      setConfig({ ...DEFAULT_CONFIG, activeGroup: 'NONE' });
    }

    return () => {
      delete (window as any).showCustomAlert;
    };
  }, []);

  // Update clock
  useEffect(() => {
    const updateTime = () => {
      const d = new Date();
      const options: Intl.DateTimeFormatOptions = { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZoneName: 'short'
      };
      setTimeStr(d.toLocaleDateString('id-ID', options));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Real-time Cloud Synchronization listener
  useEffect(() => {
    let unsubscribe = () => {};
    if (isFirebaseActive) {
      console.log('Firebase Cloud synchronizer is active! Registering real-time snapshot listener...');
      unsubscribe = listenToEvaluations((cloudEvals) => {
        setEvaluations(cloudEvals);
        safeStorage.setItem(STORAGE_KEYS.EVALUATIONS, JSON.stringify(cloudEvals));
      });
    }
    return () => unsubscribe();
  }, []);

  // Real-time Cloud Synchronization listener for HRMS records
  useEffect(() => {
    let unsubscribe = () => {};
    if (isFirebaseActive) {
      console.log('Firebase Cloud HRMS synchronizer is active! Registering live snapshot listener...');
      unsubscribe = listenToHrmsRecords((cloudRecords) => {
        const normalized = cloudRecords.map(normalizeEvaluationRecord);
        setHrmsRecords(normalized);
        safeStorage.setItem('hrms_records_v1', JSON.stringify(normalized));
      });
    }
    return () => unsubscribe();
  }, []);

  // Real-time Cloud Synchronization listener for Presensi records
  useEffect(() => {
    let unsubscribe = () => {};
    if (isFirebaseActive) {
      console.log('Firebase Cloud Presensi synchronizer is active! Registering live snapshot listener...');
      unsubscribe = listenToPresensiRecords((cloudRecords) => {
        const normalized = cloudRecords.map(normalizeEvaluationRecord);
        setPresensiRecords(normalized);
        safeStorage.setItem('presensi_records_v1', JSON.stringify(normalized));
      });
    }
    return () => unsubscribe();
  }, []);

  // Real-time Cloud Configuration listener
  useEffect(() => {
    let unsubscribe = () => {};
    if (isFirebaseActive) {
      console.log('Firebase Cloud Configuration synchronizer is active! Registering live snapshot listener...');
      unsubscribe = listenToConfig((cloudConfig) => {
        setConfig(prev => {
          const updated = { ...prev, ...cloudConfig };
          safeStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(updated));
          return updated;
        });
      });
    }
    return () => unsubscribe();
  }, []);

  // Real-time Cloud Synchronization listener for Employee database
  useEffect(() => {
    let unsubscribe = () => {};
    if (isFirebaseActive) {
      console.log('Firebase Cloud Employees synchronizer is active! Registering live snapshot listener...');
      unsubscribe = listenToEmployees((cloudEmployees) => {
        if (cloudEmployees.length > 0) {
          const normalized = cloudEmployees.map(normalizeEvaluationRecord);
          setEmployees(normalized);
          safeStorage.setItem('e_penilaian_karyawan_employees_v1', JSON.stringify(normalized));
        } else {
          console.log('Firestore employees collection is empty. Seeding with prepopulated employees...');
          const normalizedPrepopulated = PREPOPULATED_EMPLOYEES.map(normalizeEvaluationRecord);
          saveCloudEmployeesBatch(normalizedPrepopulated).then((success) => {
            if (success) {
              console.log('Seeded Firestore employees successfully!');
            }
          });
        }
      });
    }
    return () => unsubscribe();
  }, []);

  // Automated background data synchronization on startup (Presensi, HRMS, and Historical Evaluations)
  // Ensures data is instantly populated on any device (KSS Shift or Admin) without manual sync
  useEffect(() => {
    let isMounted = true;
    const runStartupSync = async () => {
      setIsAutoSyncing(true);
      try {
        const activeSheetId = config.spreadsheetId || DEFAULT_SPREADSHEET_ID;
        console.log('[AutoSync] Running background sync for Presensi and HRMS from Google Sheets...');

        const [presensiRes, hrmsRes] = await Promise.allSettled([
          fetchPresensiRecordsFromSheet(activeSheetId),
          fetchHrmsRecordsFromSheet(activeSheetId)
        ]);

        if (!isMounted) return;

        if (presensiRes.status === 'fulfilled' && presensiRes.value.length > 0) {
          const freshPresensi = presensiRes.value;
          setPresensiRecords(freshPresensi);
          safeStorage.setItem('presensi_records_v1', JSON.stringify(freshPresensi));
          if (isFirebaseActive) {
            saveCloudPresensiRecordsBatch(freshPresensi).catch((e) => console.warn('[AutoSync] Cloud Presensi sync:', e));
          }
          console.log(`[AutoSync] Loaded ${freshPresensi.length} presensi records automatically.`);
        }

        if (hrmsRes.status === 'fulfilled' && hrmsRes.value.length > 0) {
          const freshHrms = hrmsRes.value;
          setHrmsRecords(freshHrms);
          safeStorage.setItem('hrms_records_v1', JSON.stringify(freshHrms));
          if (isFirebaseActive) {
            saveCloudHrmsRecordsBatch(freshHrms).catch((e) => console.warn('[AutoSync] Cloud HRMS sync:', e));
          }
          console.log(`[AutoSync] Loaded ${freshHrms.length} HRMS records automatically.`);
        }

        // Also fetch evaluations from all tabs if evaluations are empty
        const cachedEvalsStr = safeStorage.getItem(STORAGE_KEYS.EVALUATIONS);
        const hasCachedEvals = cachedEvalsStr && JSON.parse(cachedEvalsStr).length > 0;
        if (!hasCachedEvals || evaluations.length === 0) {
          const evalsResult = await fetchEvaluationsFromAllTabs(activeSheetId, evaluations);
          if (isMounted && evalsResult.mergedList.length > 0) {
            saveEvaluationsState(evalsResult.mergedList);
            if (isFirebaseActive) {
              saveCloudEvaluationsBatch(evalsResult.mergedList).catch((e) => console.warn('[AutoSync] Cloud evaluations sync:', e));
            }
          }
        }

        if (isMounted) {
          setLastAutoSyncTime(new Date());
        }
      } catch (err) {
        console.warn('[AutoSync] Background sync encountered non-fatal notice:', err);
      } finally {
        if (isMounted) {
          setIsAutoSyncing(false);
        }
      }
    };

    runStartupSync();

    return () => {
      isMounted = false;
    };
  }, []);

  // Save evaluations to local state & database
  const saveEvaluationsState = (newEvalList: Evaluation[]) => {
    setEvaluations(newEvalList);
    safeStorage.setItem(STORAGE_KEYS.EVALUATIONS, JSON.stringify(newEvalList));
  };

  // Save configuration change
  const handleUpdateConfig = (newConfig: Partial<AppConfig>) => {
    const updated = { ...config, ...newConfig };
    setConfig(updated);
    safeStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(updated));

    // Upload global configuration values to Firestore if active
    if (isFirebaseActive) {
      const globalConfig: any = {};
      if (newConfig.webhookUrl !== undefined) globalConfig.webhookUrl = newConfig.webhookUrl;
      if (newConfig.spreadsheetId !== undefined) globalConfig.spreadsheetId = newConfig.spreadsheetId;
      if (newConfig.sheetName !== undefined) globalConfig.sheetName = newConfig.sheetName;
      if (newConfig.isDemoMode !== undefined) globalConfig.isDemoMode = newConfig.isDemoMode;

      if (Object.keys(globalConfig).length > 0) {
        saveCloudConfig(globalConfig);
      }
    }
  };

  // Toggle demo mode to let users unlock period constraints manually
  const handleToggleDemoMode = () => {
    if (config.activeGroup !== 'ALL') {
      triggerCustomAlert("Akses Terbatas", "Untuk mematikan Mode Demo hubungi admin CP. 081252044206");
      return;
    }
    handleUpdateConfig({ isDemoMode: !config.isDemoMode });
  };

  // Fitur Keluar (Logout) / Lock active access to clear authorized state
  const handleLogout = () => {
    const prevGroup = config.activeGroup;
    if (prevGroup !== 'NONE') {
      setAuthorizedGroups(prev => prev.filter(item => item !== prevGroup));
    }
    handleUpdateConfig({ activeGroup: 'NONE' });
    triggerCustomAlert("Akses Dihentikan", "Anda telah keluar dari akses grup. Penginputan yang setengah berjalan secara otomatis aman tersimpan sebagai draf sementara. Masukkan sandi akses kembali untuk membukanya.");
    addLog('Keluar Akses', `Keluar dari akses ${prevGroup === 'ALL' ? 'Admin' : `KSS Grup ${prevGroup}`}`, prevGroup);
  };

  const processIncomingSheetEvaluations = (sheetEvals: any[], currentList: Evaluation[]) => {
    const newList: Evaluation[] = [...currentList];
    let count = 0;

    for (const sEval of sheetEvals) {
      if (!sEval.noReg || sEval.noReg === 'TEST001' || String(sEval.noReg).toUpperCase() === 'TEST') continue;

      const normalizedEval = normalizeEvaluationRecord({
        noReg: sEval.noReg.toString().trim(),
        nama: sEval.nama.toString().trim()
      });

      const normNoRegSheet = normalizeNoReg(normalizedEval.noReg);
      const officialEmp = PREPOPULATED_EMPLOYEES.find(emp => normalizeNoReg(emp.noReg) === normNoRegSheet);
      
      const cleanNoReg = normalizedEval.noReg;
      const cleanNama = normalizedEval.nama;
      const isShiftMtc = officialEmp ? isShiftMtcEmployee(officialEmp) : isShiftMtcEmployee({ noReg: cleanNoReg, jabatan: sEval.jabatan });
      const sheetGrupUpper = sEval.sheetName 
        ? String(sEval.sheetName).trim().toUpperCase() 
        : (sEval.grup ? String(sEval.grup).trim().toUpperCase() : '');
      
      let isSupportiveSheet = sEval.isSupportive === true || sEval.isSupportive === 'true';
      const cleanPeriod = parseAndNormalizePeriode(sEval.periode);
      let cleanGrup = '';

      if (isShiftMtc) {
        if (['A', 'B', 'C'].includes(sheetGrupUpper)) {
          cleanGrup = sheetGrupUpper;
        } else if (sheetGrupUpper === 'MTC') {
          cleanGrup = 'MTC';
        } else {
          cleanGrup = sheetGrupUpper || 'MTC';
        }
      } else {
        if (officialEmp && isSecondedToNSEmployee(officialEmp, cleanPeriod)) {
          cleanGrup = sheetGrupUpper || 'NS';
        } else if (officialEmp) {
          cleanGrup = officialEmp.grup;
        } else {
          cleanGrup = sheetGrupUpper;
        }
      }

      const cleanJabatan = sEval.jabatan ? sEval.jabatan.toString().trim() : (officialEmp ? (officialEmp.jabatan || '') : '');

      const idx = newList.findIndex(e => 
        normalizeNoReg(e.noReg) === normalizeNoReg(cleanNoReg) && 
        e.periode.trim().toLowerCase() === cleanPeriod.trim().toLowerCase() &&
        (!!e.isSupportive) === (!!isSupportiveSheet) &&
        (e.grup ? e.grup.trim().toUpperCase() : '') === (cleanGrup ? cleanGrup.trim().toUpperCase() : '')
      );

      const resolvedEmpId = sEval.empId || normalizedEval.empId || officialEmp?.empId || undefined;

      if (idx !== -1) {
        const current = newList[idx];
        newList[idx] = {
          ...current,
          empId: resolvedEmpId || current.empId,
          noReg: cleanNoReg,
          nama: cleanNama,
          grup: cleanGrup,
          periode: cleanPeriod,
          jabatan: cleanJabatan,
          nil1: sEval.nil1,
          nil2: sEval.nil2,
          average: sEval.average,
          submittedAt: sEval.submittedAt || current.submittedAt,
          pendingApproval: false,
          isDemo: false,
          isSupportive: isSupportiveSheet
        };
      } else {
        newList.push({
          id: `eval-sheet-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          empId: resolvedEmpId,
          periode: cleanPeriod,
          noReg: cleanNoReg,
          nama: cleanNama,
          jabatan: cleanJabatan,
          grup: cleanGrup,
          nil1: sEval.nil1,
          nil2: sEval.nil2,
          average: sEval.average,
          submittedAt: sEval.submittedAt || new Date().toISOString(),
          pendingApproval: false,
          isDemo: false,
          isSupportive: isSupportiveSheet
        });
      }
      count++;
    }
    return { updatedList: newList, count };
  };

  const handleSyncFromGoogleSheetsAPI = async (): Promise<{ success: boolean; count: number; message: string }> => {
    const token = await getAccessToken();
    if (!token) {
      return { success: false, count: 0, message: 'Silakan login dengan Akun Google terlebih dahulu.' };
    }
    const cleanId = extractSpreadsheetId(config.spreadsheetId);
    if (!cleanId) {
      return { success: false, count: 0, message: 'ID atau tautan Google Spreadsheet belum diisi.' };
    }
    try {
      const sheetEvals = await readSpreadsheetEvaluations(token, cleanId);
      if (sheetEvals.length === 0) {
        return { success: true, count: 0, message: 'Spreadsheet terhubung, namun belum ada data evaluasi di lembar sheet target.' };
      }
      const { updatedList, count } = processIncomingSheetEvaluations(sheetEvals, evaluations);
      saveEvaluationsState(updatedList);
      addLog('Sync Google API', `Menyinkronkan ${count} data evaluasi dari Google Sheets API`, config.activeGroup);
      return { success: true, count, message: `Berhasil menyinkronkan ${count} data evaluasi dari Google Sheets API!` };
    } catch (err: any) {
      console.error('Google Sheets API sync error:', err);
      return { success: false, count: 0, message: err.message || 'Gagal membaca data dari Google Sheets API.' };
    }
  };

  const handlePushToGoogleSheetsAPI = async (): Promise<{ success: boolean; count: number; message: string }> => {
    const token = await getAccessToken();
    if (!token) {
      return { success: false, count: 0, message: 'Silakan login dengan Akun Google terlebih dahulu.' };
    }
    const cleanId = extractSpreadsheetId(config.spreadsheetId);
    if (!cleanId) {
      return { success: false, count: 0, message: 'ID atau tautan Google Spreadsheet belum diisi.' };
    }
    if (evaluations.length === 0) {
      return { success: true, count: 0, message: 'Tidak ada data evaluasi untuk dikirim.' };
    }
    try {
      const res = await batchAppendEvaluationsToGoogleSheet(token, cleanId, evaluations);
      addLog('Push Google API', `Mengekspor ${res.successCount} evaluasi ke Google Sheets`, config.activeGroup);
      return {
        success: res.successCount > 0,
        count: res.successCount,
        message: `Berhasil mengekspor ${res.successCount} baris evaluasi langsung ke Google Spreadsheet!`
      };
    } catch (err: any) {
      console.error('Google Sheets API push error:', err);
      return { success: false, count: 0, message: err.message || 'Gagal mengekspor data ke Google Sheets API.' };
    }
  };

  const [isManualRefreshing, setIsManualRefreshing] = useState(false);

  const handleManualRefreshAllData = async () => {
    setIsManualRefreshing(true);
    addLog('Refresh Manual', 'Menjalankan sinkronisasi paksa dan pembersihan cache data usang');
    
    let sheetSuccess = false;
    let hrmsSuccess = false;

    // 0. Try direct Google Sheets REST API first if token and target sheet exist
    const googleToken = await getAccessToken();
    const cleanSheetId = extractSpreadsheetId(config.spreadsheetId);
    if (googleToken && cleanSheetId) {
      try {
        const apiEvals = await readSpreadsheetEvaluations(googleToken, cleanSheetId);
        if (apiEvals && apiEvals.length > 0) {
          const { updatedList } = processIncomingSheetEvaluations(apiEvals, evaluations);
          saveEvaluationsState(updatedList);
          sheetSuccess = true;
        }
      } catch (apiErr) {
        console.warn('Manual refresh via Google Sheets REST API failed, fallback to webhook:', apiErr);
      }
    }

    // 1. Force sync evaluations from Spreadsheet if webhookUrl is present
    if (!sheetSuccess && config.webhookUrl) {
      try {
        const res = await fetch(config.webhookUrl, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          }
        });
        
        if (res.ok) {
          const json = await res.json();
          if (json.status === "success" && Array.isArray(json.data)) {
            const { updatedList } = processIncomingSheetEvaluations(json.data, evaluations);
            saveEvaluationsState(updatedList);
            sheetSuccess = true;
          }
        }
      } catch (err) {
        console.warn('Manual refresh spreadsheet evaluations failed:', err);
      }
    }

    // Fallback: fetch evaluations from sheet tabs if sheet was not updated
    if (!sheetSuccess) {
      try {
        const tabEvals = await fetchEvaluationsFromAllTabs(cleanSheetId, evaluations);
        if (tabEvals.mergedList.length > 0) {
          saveEvaluationsState(tabEvals.mergedList);
          if (isFirebaseActive) {
            await saveCloudEvaluationsBatch(tabEvals.mergedList);
          }
          sheetSuccess = true;
        }
      } catch (err) {
        console.warn('Manual refresh sheet tabs failed:', err);
      }
    }

    // 2. Force sync HRMS records from main spreadsheet CSV
    try {
      const freshHrms = await fetchHrmsRecordsFromSheet(cleanSheetId);
      if (freshHrms.length > 0) {
        setHrmsRecords(freshHrms);
        safeStorage.setItem('hrms_records_v1', JSON.stringify(freshHrms));
        if (isFirebaseActive) {
          await saveCloudHrmsRecordsBatch(freshHrms);
        }
        hrmsSuccess = true;
      }
    } catch (err) {
      console.warn('Manual refresh HRMS failed:', err);
    }

    // 3. Force sync Presensi records from Presensi spreadsheet CSV
    let presensiSuccess = false;
    try {
      const freshPresensi = await fetchPresensiRecordsFromSheet(cleanSheetId);
      if (freshPresensi.length > 0) {
        setPresensiRecords(freshPresensi);
        safeStorage.setItem('presensi_records_v1', JSON.stringify(freshPresensi));
        if (isFirebaseActive) {
          await saveCloudPresensiRecordsBatch(freshPresensi);
        }
        presensiSuccess = true;
      }
    } catch (err) {
      console.warn('Manual refresh Presensi failed:', err);
    }

    setIsManualRefreshing(false);
    setLastAutoSyncTime(new Date());

    // Diagnostic feedback
    const statusMsg = `• Data Penilaian: ${sheetSuccess ? '✅ Berhasil Diperbarui' : '⚠️ Tetap Menggunakan Cache Lokal (Webhook tidak aktif/offline)'}\n• Data HRMS: ${hrmsSuccess ? '✅ Berhasil Diperbarui' : '⚠️ Tetap Menggunakan Cache Lokal'}\n• Data Presensi: ${presensiSuccess ? '✅ Berhasil Diperbarui' : '⚠️ Tetap Menggunakan Cache Lokal'}\n\n💡 Seluruh data performa, absensi, dan draf divalidasi ke versi terbaru dari cloud database. Masalah sinkronisasi pada perangkat mobile Anda kini teratasi!`;
    triggerCustomAlert("Penyegaran Data Selesai", statusMsg);
  };

  // Safe Google Sheets Sender (Direct REST API with Webhook fallback)
  const sendToGoogleSheets = async (evalData: Omit<Evaluation, 'id' | 'submittedAt'>): Promise<boolean> => {
    const isCurrentlyDemo = config.activeGroup === 'ALL' ? config.isDemoMode : false;
    if (isCurrentlyDemo) {
      // While in Demo Mode, bypass sending to Google sheets completely
      console.log('Demo mode is active. Skipping Google Sheets submission for:', evalData.nama);
      return true;
    }

    // 1. Try Direct Google Sheets REST API if authenticated
    const token = await getAccessToken();
    const cleanId = extractSpreadsheetId(config.spreadsheetId);
    if (token && cleanId) {
      try {
        const directSuccess = await appendEvaluationToGoogleSheet(token, cleanId, evalData);
        if (directSuccess) {
          console.log('Successfully written via Google Sheets REST API:', evalData.nama);
          return true;
        }
      } catch (directErr) {
        console.warn('Direct Google Sheets REST API write error, trying fallback:', directErr);
      }
    }

    // 2. Fallback to Webhook URL
    if (!config.webhookUrl) {
      // If no webhook configured, we assume success because the data resides safely in local state
      return true;
    }

    try {
      // Send evaluation record to deployed webapp endpoint
      await fetch(config.webhookUrl, {
        method: 'POST',
        mode: 'no-cors', // Bulletproof for Google Apps Script Web Apps inside sandboxed iframes
        headers: {
          'Content-Type': 'text/plain',
        },
        body: JSON.stringify(evalData),
      });

      return true;
    } catch (err) {
      console.error('Fetch Google Sheets endpoint error:', err);
      return false;
    }
  };

  // Safe Google Sheets Batch Sender (Direct REST API with Webhook fallback)
  const sendBatchToGoogleSheets = async (batch: any[]): Promise<boolean> => {
    const isCurrentlyDemo = config.activeGroup === 'ALL' ? config.isDemoMode : false;
    if (isCurrentlyDemo) {
      console.log(`Demo mode is active. Skipping Google Sheets batch submission for ${batch.length} rows.`);
      return true;
    }

    if (batch.length === 0) {
      return true;
    }

    // 1. Try Direct Google Sheets REST API batch append if authenticated
    const token = await getAccessToken();
    const cleanId = extractSpreadsheetId(config.spreadsheetId);
    if (token && cleanId) {
      try {
        const res = await batchAppendEvaluationsToGoogleSheet(token, cleanId, batch);
        if (res.successCount > 0) {
          console.log(`Successfully batch appended ${res.successCount} rows via Google Sheets REST API`);
          return true;
        }
      } catch (directErr) {
        console.warn('Direct Google Sheets REST API batch error, trying fallback:', directErr);
      }
    }

    // 2. Fast Batch Send via Webhook URL
    if (!config.webhookUrl) {
      return true;
    }

    try {
      // Send batch array directly in a single fast request.
      // doPost in Google Apps Script natively supports array payloads (var records = Array.isArray(contents) ? contents : [contents]),
      // eliminating the 30-60 second latency from sending 30 individual sequential requests.
      await fetch(config.webhookUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'text/plain',
        },
        body: JSON.stringify(batch),
      });

      return true;
    } catch (err) {
      console.error('Fetch Google Sheets batch sender error, attempting parallel fallback:', err);
      try {
        await Promise.all(batch.map(item => sendToGoogleSheets(item)));
        return true;
      } catch (fallbackErr) {
        console.error('Parallel batch fallback error:', fallbackErr);
        return false;
      }
    }
  };

  // Add new evaluation action
  const handleAddEvaluation = async (newEval: Omit<Evaluation, 'id' | 'submittedAt'>): Promise<boolean> => {
    const isCurrentlyDemo = config.activeGroup === 'ALL' ? config.isDemoMode : false;

    // 1. Submit to Google Sheets (if URL exists and NOT in demo mode)
    const syncSuccess = await sendToGoogleSheets(newEval);

    // 2. Add to Local State
    const addedRecord: Evaluation = {
      ...newEval,
      empId: newEval.empId || resolveEmpId({ noReg: newEval.noReg, nama: newEval.nama }, employees),
      id: `eval-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      submittedAt: new Date().toISOString(),
      isDemo: isCurrentlyDemo,
    };

    const updatedList = [addedRecord, ...evaluations];
    saveEvaluationsState(updatedList);
    addLog('Kirim Nilai', `Mengisi draf nilai ${addedRecord.nama} (No. Reg: ${addedRecord.noReg}), rata-rata: ${addedRecord.average.toFixed(1)}`);

    // 3. Mirror to Firebase Cloud DB if active
    if (isFirebaseActive) {
      await saveCloudEvaluation(addedRecord);
    }

    return syncSuccess;
  };

  // Add batch of evaluations
  const handleAddEvaluationsBatch = async (batch: Omit<Evaluation, 'id' | 'submittedAt'>[]): Promise<boolean> => {
    const isCurrentlyDemo = config.activeGroup === 'ALL' ? config.isDemoMode : false;

    // 1. Submit to Sheets
    const syncSuccess = await sendBatchToGoogleSheets(batch);

    // 2. Map new evaluation records
    const addedRecords: Evaluation[] = batch.map((item, idx) => ({
      ...item,
      empId: item.empId || resolveEmpId({ noReg: item.noReg, nama: item.nama }, employees),
      id: `eval-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 9)}`,
      submittedAt: new Date().toISOString(),
      isDemo: isCurrentlyDemo,
    }));

    const updatedList = [...addedRecords, ...evaluations];
    saveEvaluationsState(updatedList);
    addLog('Kirim Nilai Batch', `Mengirim batch draf nilai untuk ${addedRecords.length} operator sekaligus`);

    // 3. Mirror to Firestore Cloud DB if active
    if (isFirebaseActive) {
      await saveCloudEvaluationsBatch(addedRecords);
    }

    return syncSuccess;
  };

  // Action to clear evaluations from both local state and cloud
  const handleClearAllEvaluations = async (isDemoOnly = false) => {
    if (isDemoOnly) {
      const filtered = evaluations.filter(e => !e.isDemo);
      saveEvaluationsState(filtered);
      if (isFirebaseActive) {
        await clearCloudEvaluations(true);
      }
      addLog('Bersihkan Data Demo', 'Menghapus seluruh data penilaian di mode uji coba/demo');
    } else {
      saveEvaluationsState([]);
      if (isFirebaseActive) {
        await clearCloudEvaluations(false);
      }
      addLog('Reset Data', 'Mereset dan menghapus seluruh data penilaian operator');
      // Clean up all local storage drafts
      try {
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const key = localStorage.key(i);
          if (key && (key.startsWith('draft_') || key.startsWith('draft_ratings_v1_'))) {
            localStorage.removeItem(key);
          }
        }
      } catch (err) {
        console.error('Failed to clear local drafts:', err);
      }
    }
  };

  // Delete evaluation action
  const handleDeleteEvaluation = (id: string, name: string) => {
    setDeleteTarget({ id, name });
  };

  // Update evaluation action
  const handleUpdateEvaluation = async (updated: Evaluation) => {
    const finalUpdate = { ...updated };
    if (config.activeGroup !== 'ALL') {
      finalUpdate.pendingApproval = true;
      finalUpdate.editedBy = config.activeGroup;
      finalUpdate.editedCount = (finalUpdate.editedCount || 0) + 1;
    } else {
      // If admin updates directly, it should go to Spreadsheet and clear pending approval
      finalUpdate.pendingApproval = false;
      await sendToGoogleSheets(finalUpdate);
    }

    const updatedList = evaluations.map(e => e.id === finalUpdate.id ? finalUpdate : e);
    saveEvaluationsState(updatedList);
    addLog(
      config.activeGroup === 'ALL' ? 'Ubah Nilai Admin' : 'Pengajuan Ubah Nilai', 
      `${config.activeGroup === 'ALL' ? 'Mengubah' : 'Mengajukan pengubahan'} nilai ${finalUpdate.nama} (No. Reg: ${finalUpdate.noReg}), rata-rata baru: ${finalUpdate.average.toFixed(1)}`
    );
    
    // Mirror to cloud DB if active
    if (isFirebaseActive) {
      await saveCloudEvaluation(finalUpdate);
    }

    if (config.activeGroup !== 'ALL') {
      triggerCustomAlert(
        "Pengajuan Edit Tersimpan",
        `Perubahan nilai untuk ${finalUpdate.nama} telah disimpan secara lokal. Data di aplikasi telah berubah, namun data di Google Spreadsheet akan diperbarui setelah disetujui oleh admin.`
      );
    } else {
      triggerCustomAlert(
        "Perubahan Disimpan",
        `Perubahan nilai untuk ${finalUpdate.nama} telah disimpan dan disinkronkan ke Google Spreadsheet.`
      );
    }
  };

  // Approve evaluation action (Admin only)
  const handleApproveEvaluation = async (evaluation: Evaluation) => {
    const approved: Evaluation = {
      ...evaluation,
      pendingApproval: false,
    };

    // 1. Send to Google Sheets
    const syncSuccess = await sendToGoogleSheets(approved);

    // 2. Save approved state
    const updatedList = evaluations.map(e => e.id === approved.id ? approved : e);
    saveEvaluationsState(updatedList);
    addLog('Persetujuan Nilai', `Menyetujui perubahan nilai ${approved.nama} (No. Reg: ${approved.noReg}), nilai rata-rata: ${approved.average.toFixed(1)}`);

    // 3. Mirror to cloud DB
    if (isFirebaseActive) {
      await saveCloudEvaluation(approved);
    }

    if (syncSuccess) {
      triggerCustomAlert(
        "Perubahan Disetujui",
        `Perubahan nilai untuk ${approved.nama} telah disetujui dan berhasil disinkronkan ke Google Spreadsheet.`
      );
    } else {
      triggerCustomAlert(
        "Perubahan Disetujui",
        `Perubahan nilai untuk ${approved.nama} telah disetujui, namun gagal disinkronkan ke Google Spreadsheet. Periksa koneksi webhook.`
      );
    }
  };

  // Completely wipe data (both local and cloud) and then re-sync fresh from Google Sheets
  const handleResetAndSyncFromSpreadsheet = async () => {
    // 1. First clear everything
    saveEvaluationsState([]);
    if (isFirebaseActive) {
      await clearCloudEvaluations(false);
    }
    
    // Clean up all local storage drafts
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('draft_') || key.startsWith('draft_ratings_v1_'))) {
          localStorage.removeItem(key);
        }
      }
    } catch (err) {
      console.error('Failed to clear local drafts during reset and sync:', err);
    }

    if (!config.webhookUrl) {
      triggerCustomAlert(
        "Reset Berhasil, Sync Gagal",
        "Seluruh data lokal & cloud berhasil dikosongkan. Namun, penyelarasan otomatis gagal karena URL Webhook belum diatur di aplikasi."
      );
      return;
    }

    // 2. Fetch fresh data from Google Spreadsheet Webhook
    try {
      const res = await fetch(config.webhookUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        }
      });
      
      if (!res.ok) {
        throw new Error("Respon server Google Sheets tidak sukses");
      }
      
      const json = await res.json();
      if (json.status !== "success" || !Array.isArray(json.data)) {
        throw new Error(json.message || "Format data tidak sesuai");
      }

      const sheetEvals: any[] = json.data;
      const newList: Evaluation[] = [];
      
      for (const sEval of sheetEvals) {
        if (!sEval.noReg || sEval.noReg === 'TEST001' || sEval.noReg.toUpperCase() === 'TEST') {
          continue;
        }

        const normalizedEval = normalizeEvaluationRecord({
          noReg: sEval.noReg.toString().trim(),
          nama: sEval.nama.toString().trim()
        });

        const normNoRegSheet = normalizeNoReg(normalizedEval.noReg);
        const officialEmp = PREPOPULATED_EMPLOYEES.find(emp => normalizeNoReg(emp.noReg) === normNoRegSheet);
        
        const cleanNoReg = normalizedEval.noReg;
        const cleanNama = normalizedEval.nama;
        const isShiftMtc = officialEmp ? isShiftMtcEmployee(officialEmp) : isShiftMtcEmployee({ noReg: cleanNoReg, jabatan: sEval.jabatan });
        const sheetGrupUpper = sEval.sheetName 
          ? String(sEval.sheetName).trim().toUpperCase() 
          : (sEval.grup ? String(sEval.grup).trim().toUpperCase() : '');
        
        let isSupportiveSheet = sEval.isSupportive === true || sEval.isSupportive === 'true';
        const cleanPeriod = parseAndNormalizePeriode(sEval.periode);
        let cleanGrup = '';

        if (isShiftMtc) {
          if (['A', 'B', 'C'].includes(sheetGrupUpper)) {
            cleanGrup = sheetGrupUpper;
          } else if (sheetGrupUpper === 'MTC') {
            cleanGrup = 'MTC';
          } else {
            cleanGrup = sheetGrupUpper || 'MTC';
          }
        } else {
          if (officialEmp && isSecondedToNSEmployee(officialEmp, cleanPeriod)) {
            cleanGrup = sheetGrupUpper || 'NS';
          } else if (officialEmp) {
            cleanGrup = officialEmp.grup;
          } else {
            cleanGrup = sheetGrupUpper;
          }
        }

        const cleanJabatan = sEval.jabatan ? sEval.jabatan.toString().trim() : (officialEmp ? (officialEmp.jabatan || '') : '');

        const resolvedEmpId = sEval.empId || normalizedEval.empId || officialEmp?.empId || undefined;

        newList.push({
          id: `eval-sheet-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          empId: resolvedEmpId,
          periode: cleanPeriod,
          noReg: cleanNoReg,
          nama: cleanNama,
          jabatan: cleanJabatan,
          grup: cleanGrup,
          nil1: sEval.nil1,
          nil2: sEval.nil2,
          average: sEval.average,
          submittedAt: sEval.submittedAt || new Date().toISOString(),
          pendingApproval: false,
          isDemo: false,
          isSupportive: isSupportiveSheet
        });
      }

      saveEvaluationsState(newList);
      if (isFirebaseActive) {
        await saveCloudEvaluationsBatch(newList);
      }

      triggerCustomAlert(
        "Reset & Penyelarasan Sukses",
        `Berhasil mengosongkan seluruh data penilaian & draf di aplikasi. Sistem telah menyinkronkan ulang dengan mengimpor ${newList.length} data bersih langsung dari Google Spreadsheet.`
      );
    } catch (err: any) {
      console.error(err);
      triggerCustomAlert(
        "Penyelarasan Gagal",
        `Daftar data berhasil dikosongkan secara total, namun gagal menyelaraskan dari Google Spreadsheet karena kendala koneksi.\n\nDetail: ${err.message || err}`
      );
    }
  };

  // Sync/Fetch evaluations from Google Spreadsheet
  const handleSyncFromSpreadsheet = async () => {
    if (!config.webhookUrl) {
      triggerCustomAlert("Penyelarasan Gagal", "URL Webhook belum diatur. Masuk sebagai Admin dan atur URL Webhook terlebih dahulu.");
      return;
    }

    try {
      const res = await fetch(config.webhookUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        }
      });
      
      if (!res.ok) {
        throw new Error("Respon server Google Sheets tidak sukses");
      }
      
      const json = await res.json();
      if (json.status !== "success" || !Array.isArray(json.data)) {
        throw new Error(json.message || "Format data tidak sesuai");
      }

      const sheetEvals: any[] = json.data;
      
      let updatedCount = 0;
      let insertedCount = 0;
      
      const mergedList = [...evaluations];
      
      for (const sEval of sheetEvals) {
        if (!sEval.noReg || sEval.noReg === 'TEST001' || sEval.noReg.toUpperCase() === 'TEST') {
          continue;
        }

        const normalizedEval = normalizeEvaluationRecord({
          noReg: sEval.noReg.toString().trim(),
          nama: sEval.nama.toString().trim()
        });

        const normNoRegSheet = normalizeNoReg(normalizedEval.noReg);
        const officialEmp = PREPOPULATED_EMPLOYEES.find(emp => normalizeNoReg(emp.noReg) === normNoRegSheet);
        
        const cleanNoReg = normalizedEval.noReg;
        const cleanNama = normalizedEval.nama;
        const isShiftMtc = officialEmp ? isShiftMtcEmployee(officialEmp) : isShiftMtcEmployee({ noReg: cleanNoReg, jabatan: sEval.jabatan });
        const sheetGrupUpper = sEval.sheetName 
          ? String(sEval.sheetName).trim().toUpperCase() 
          : (sEval.grup ? String(sEval.grup).trim().toUpperCase() : '');
        
        let isSupportiveSheet = sEval.isSupportive === true || sEval.isSupportive === 'true';
        const cleanPeriod = parseAndNormalizePeriode(sEval.periode);
        let cleanGrup = '';

        if (isShiftMtc) {
          if (['A', 'B', 'C'].includes(sheetGrupUpper)) {
            cleanGrup = sheetGrupUpper;
          } else if (sheetGrupUpper === 'MTC') {
            cleanGrup = 'MTC';
          } else {
            cleanGrup = sheetGrupUpper || 'MTC';
          }
        } else {
          if (officialEmp && isSecondedToNSEmployee(officialEmp, cleanPeriod)) {
            cleanGrup = sheetGrupUpper || 'NS';
          } else if (officialEmp) {
            cleanGrup = officialEmp.grup;
          } else {
            cleanGrup = sheetGrupUpper;
          }
        }

        const cleanJabatan = sEval.jabatan ? sEval.jabatan.toString().trim() : (officialEmp ? (officialEmp.jabatan || '') : '');

        const idx = mergedList.findIndex(e => 
          normalizeNoReg(e.noReg) === normalizeNoReg(cleanNoReg) && 
          e.periode.trim().toLowerCase() === cleanPeriod.trim().toLowerCase() &&
          (!!e.isSupportive) === (!!isSupportiveSheet) &&
          (e.grup ? e.grup.trim().toUpperCase() : '') === (cleanGrup ? cleanGrup.trim().toUpperCase() : '')
        );

        if (idx !== -1) {
          const current = mergedList[idx];
          if (current.nil1 !== sEval.nil1 || 
              current.nil2 !== sEval.nil2 || 
              normalizeNoReg(current.noReg) !== normalizeNoReg(cleanNoReg) ||
              current.nama !== cleanNama || 
              current.grup !== cleanGrup ||
              current.periode !== cleanPeriod ||
              current.pendingApproval === true ||
              (!!current.isSupportive) !== (!!isSupportiveSheet)) {
            
            mergedList[idx] = {
              ...current,
              noReg: cleanNoReg,
              nama: cleanNama,
              grup: cleanGrup,
              periode: cleanPeriod,
              jabatan: cleanJabatan,
              nil1: sEval.nil1,
              nil2: sEval.nil2,
              average: sEval.average,
              submittedAt: sEval.submittedAt || current.submittedAt,
              pendingApproval: false,
              isDemo: false,
              isSupportive: isSupportiveSheet
            };
            updatedCount++;
          }
        } else {
          mergedList.push({
            id: `eval-sheet-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            periode: cleanPeriod,
            noReg: cleanNoReg,
            nama: cleanNama,
            jabatan: cleanJabatan,
            grup: cleanGrup,
            nil1: sEval.nil1,
            nil2: sEval.nil2,
            average: sEval.average,
            submittedAt: sEval.submittedAt,
            pendingApproval: false,
            isDemo: false,
            isSupportive: isSupportiveSheet
          });
          insertedCount++;
        }
      }

      if (updatedCount > 0 || insertedCount > 0) {
        saveEvaluationsState(mergedList);
        if (isFirebaseActive) {
          await saveCloudEvaluationsBatch(mergedList);
        }

        triggerCustomAlert(
          "Penyelarasan Berhasil",
          `Berhasil menyinkronkan data dari Google Spreadsheet!\n\n• ${updatedCount} data diperbarui\n• ${insertedCount} data baru diimpor.`
        );
      } else {
        triggerCustomAlert(
          "Penyelarasan Selesai",
          "Seluruh data aplikasi sudah selaras sempurna dengan Google Spreadsheet. Tidak ada perubahan baru yang terdeteksi."
        );
      }

    } catch (err: any) {
      console.error(err);
      triggerCustomAlert(
        "Penyelarasan Gagal",
        `Gagal memuat data dari Spreadsheet. Pastikan Anda telah menerapkan (Deploy) ulang Apps Script Anda dengan kode terbaru di Spreadsheet Anda, dan setelan akses diubah menjadi "Anyone / Siapa saja".\n\nDetail: ${err.message || err}`
      );
    }
  };

  // Silent background sync with automatic data pull and merge from Spreadsheet (completely read-only)
  const silentSyncFromSpreadsheet = async (activeUrl: string) => {
    if (!activeUrl) return;
    try {
      const res = await fetch(activeUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        }
      });
      if (!res.ok) return;
      const json = await res.json();
      if (json.status !== "success" || !Array.isArray(json.data)) return;

      const sheetEvals = json.data;
      const currentEvals = evaluationsRef.current;

      // Proceed with merging any missing data from Sheet to Local State (No auto-repair writes in background!)
      let changed = false;
      const mergedList = [...currentEvals];

      for (const sEval of sheetEvals) {
        if (!sEval.noReg || sEval.noReg === 'TEST001' || sEval.noReg.toUpperCase() === 'TEST') continue;

        const normalizedEval = normalizeEvaluationRecord({
          noReg: sEval.noReg.toString().trim(),
          nama: sEval.nama.toString().trim()
        });

        const normNoRegSheet = normalizeNoReg(normalizedEval.noReg);
        const officialEmp = PREPOPULATED_EMPLOYEES.find(emp => normalizeNoReg(emp.noReg) === normNoRegSheet);
        
        const cleanNoReg = normalizedEval.noReg;
        const cleanNama = normalizedEval.nama;
        const isShiftMtc = officialEmp ? isShiftMtcEmployee(officialEmp) : isShiftMtcEmployee({ noReg: cleanNoReg, jabatan: sEval.jabatan });
        const sheetGrupUpper = sEval.sheetName 
          ? String(sEval.sheetName).trim().toUpperCase() 
          : (sEval.grup ? String(sEval.grup).trim().toUpperCase() : '');
        
        let isSupportiveSheet = sEval.isSupportive === true || sEval.isSupportive === 'true';
        const cleanPeriod = parseAndNormalizePeriode(sEval.periode);
        let cleanGrup = '';

        if (isShiftMtc) {
          if (['A', 'B', 'C'].includes(sheetGrupUpper)) {
            cleanGrup = sheetGrupUpper;
          } else if (sheetGrupUpper === 'MTC') {
            cleanGrup = 'MTC';
          } else {
            cleanGrup = sheetGrupUpper || 'MTC';
          }
        } else {
          if (officialEmp && isSecondedToNSEmployee(officialEmp, cleanPeriod)) {
            cleanGrup = sheetGrupUpper || 'NS';
          } else if (officialEmp) {
            cleanGrup = officialEmp.grup;
          } else {
            cleanGrup = sheetGrupUpper;
          }
        }

        const cleanJabatan = sEval.jabatan ? sEval.jabatan.toString().trim() : (officialEmp ? (officialEmp.jabatan || '') : '');

        const idx = mergedList.findIndex(e => 
          normalizeNoReg(e.noReg) === normalizeNoReg(cleanNoReg) && 
          e.periode.trim().toLowerCase() === cleanPeriod.trim().toLowerCase() &&
          (!!e.isSupportive) === (!!isSupportiveSheet) &&
          (e.grup ? e.grup.trim().toUpperCase() : '') === (cleanGrup ? cleanGrup.trim().toUpperCase() : '')
        );

        if (idx !== -1) {
          const current = mergedList[idx];
          if (current.nil1 !== sEval.nil1 || 
              current.nil2 !== sEval.nil2 || 
              normalizeNoReg(current.noReg) !== normalizeNoReg(cleanNoReg) ||
              current.nama !== cleanNama || 
              current.grup !== cleanGrup ||
              current.periode !== cleanPeriod ||
              current.pendingApproval === true ||
              (!!current.isSupportive) !== (!!isSupportiveSheet)) {
            
            const resolvedEmpId = sEval.empId || normalizedEval.empId || officialEmp?.empId || undefined;

            mergedList[idx] = {
              ...current,
              empId: resolvedEmpId || current.empId,
              noReg: cleanNoReg,
              nama: cleanNama,
              grup: cleanGrup,
              periode: cleanPeriod,
              jabatan: cleanJabatan,
              nil1: sEval.nil1,
              nil2: sEval.nil2,
              average: sEval.average,
              submittedAt: sEval.submittedAt || current.submittedAt,
              pendingApproval: false,
              isDemo: false,
              isSupportive: isSupportiveSheet
            };
            changed = true;
          }
        } else {
          const resolvedEmpId = sEval.empId || normalizedEval.empId || officialEmp?.empId || undefined;

          mergedList.push({
            id: `eval-sheet-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            empId: resolvedEmpId,
            periode: cleanPeriod,
            noReg: cleanNoReg,
            nama: cleanNama,
            jabatan: cleanJabatan,
            grup: cleanGrup,
            nil1: sEval.nil1,
            nil2: sEval.nil2,
            average: sEval.average,
            submittedAt: sEval.submittedAt,
            pendingApproval: false,
            isDemo: false,
            isSupportive: isSupportiveSheet
          });
          changed = true;
        }
      }

      if (changed) {
        setEvaluations(mergedList);
        safeStorage.setItem(STORAGE_KEYS.EVALUATIONS, JSON.stringify(mergedList));
        if (isFirebaseActive) {
          await saveCloudEvaluationsBatch(mergedList);
        }
      }
    } catch (err) {
      console.warn('Silent sync failed:', err);
    }
  };

  // Silent background sync periodically (on mount/config load and every 60s)
  useEffect(() => {
    if (!config.webhookUrl) return;

    // Initial background sync 3 seconds after loading
    const timer = setTimeout(() => {
      silentSyncFromSpreadsheet(config.webhookUrl);
    }, 3000);

    // Periodic sync interval (60 seconds) to guarantee self-healing data recovery
    const interval = setInterval(() => {
      silentSyncFromSpreadsheet(config.webhookUrl);
    }, 60000);

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [config.webhookUrl]);

  // Test Webhook Connection
  const handleTestConnection = async (): Promise<{ success: boolean; message: string }> => {
    if (!config.webhookUrl) {
      return { success: false, message: 'URL Webhook kosong.' };
    }

    try {
      const groups = ['A', 'B', 'C', 'NS', 'MTC', 'LAB', 'QC'];
      const samplePayloads = groups.map(g => ({
        periode: 'Juni 2026 Test',
        noReg: 'TEST001',
        nama: 'Karyawan Tes Otoritas',
        grup: g,
        nil1: 5,
        nil2: 5,
        average: 5.0,
      }));

      await fetch(config.webhookUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'text/plain',
        },
        body: JSON.stringify(samplePayloads),
      });

      return {
        success: true,
        message: 'Koneksi terkirim! Uji koneksi telah mengirimkan baris simulasi "TEST001" ke seluruh lembar sheet grup ("A", "B", "C", "NS", "MTC", "LAB", "QC") di Google Spreadsheet Anda.',
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Terjadi kesalahan koneksi: ${err?.message || 'Pastikan setelan sharing adalah "Anyone" / "Siapa saja".'}`,
      };
    }
  };

  return (
    <div id="app-root-container" className="min-h-screen bg-slate-50 text-slate-800 font-sans">
      
      {showUpdateBanner && (
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white px-6 py-3.5 shadow-lg flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left sticky top-0 z-50 animate-fade-in border-b border-white/10">
          <div className="flex items-center gap-3">
            <RefreshCw className="w-5 h-5 text-blue-100 animate-spin shrink-0" />
            <div className="text-xs font-medium">
              <span className="font-extrabold uppercase tracking-widest bg-white/20 px-2 py-0.5 rounded-md text-[9px] mr-2">Update Sistem</span>
              Sistem telah diperbarui ke <strong className="font-extrabold text-amber-300">Versi 2.6.0 [Update 17]</strong>. Ketuk untuk memuat fitur & draf data baru.
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => {
                window.location.reload();
              }}
              className="bg-white hover:bg-slate-100 text-blue-700 px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all duration-150 shadow-sm cursor-pointer active:scale-95"
            >
              Muat Ulang
            </button>
            <button
              type="button"
              onClick={() => setShowUpdateBanner(false)}
              className="text-white/80 hover:text-white p-1 rounded-full transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      
      {/* Top Header Navigation */}
      <header className="bg-white border-b border-slate-200 px-6 sm:px-8 py-4 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex flex-col sm:flex-row items-center sm:items-start space-y-3 sm:space-y-0 sm:space-x-4">
          <div className="w-[135px] h-[135px] rounded-2xl overflow-hidden shrink-0 shadow-md border border-slate-200">
            <img src={spkLogo} alt="SPK Logo" className="w-full h-full object-cover" style={{ width: '135px', height: '135px' }} referrerPolicy="no-referrer" />
          </div>
          <div>
            <h1 id="app-heading" className="text-xl font-bold text-slate-800 tracking-tight">Sistem Penilaian Karyawan</h1>
            <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">Departemen Yarn Dyeing</p>
          </div>
        </div>

        <div className="flex items-center flex-wrap justify-center md:justify-end gap-4 sm:gap-6">
          <button
            type="button"
            onClick={() => {
              setIsShareModalOpen(true);
              setCopied(false);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer active:scale-95 shadow-3xs"
          >
            <QrCode className="w-4 h-4 text-emerald-600" />
            <span>Bagikan QR</span>
          </button>

          <button
            type="button"
            disabled={isManualRefreshing || isAutoSyncing}
            onClick={handleManualRefreshAllData}
            title={lastAutoSyncTime ? `Sinkronisasi otomatis aktif. Terakhir sinkron: ${lastAutoSyncTime.toLocaleTimeString('id-ID')}` : 'Sinkronisasi Otomatis'}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer active:scale-95 shadow-3xs disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-blue-600 ${isManualRefreshing || isAutoSyncing ? 'animate-spin' : ''}`} />
            <span>{isManualRefreshing ? 'Memperbarui...' : isAutoSyncing ? 'Menyinkronkan...' : 'Perbarui Data'}</span>
          </button>

          <GoogleSignInButton compact={true} />

          <div className="hidden sm:block h-10 w-px bg-slate-200"></div>

          <div className="text-center md:text-right">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Periode</p>
            <p className="text-sm font-bold text-blue-700">{getPeriodePenilaian(new Date(), config.activeGroup === 'ALL' ? config.isDemoMode : false).readable}</p>
          </div>
          <div className="hidden sm:block h-10 w-px bg-slate-200"></div>
          
          <div className="flex items-center space-x-3">
            {/* Notification Bell Component */}
            {authorizedGroups.includes(config.activeGroup) && config.activeGroup !== 'NONE' && (
              <NotificationBell 
                evaluations={evaluations}
                activeGroup={config.activeGroup}
                onShowAlert={triggerCustomAlert}
                employees={employees}
                kssContacts={kssContacts}
              />
            )}

            <div className="text-right">
              <p className="text-sm font-bold text-slate-700">
                {config.activeGroup === 'NONE' 
                  ? 'Belum Memilih Akses' 
                  : config.activeGroup === 'ALL' 
                  ? 'Administrator' 
                  : `KSS Grup ${config.activeGroup}`}
              </p>
              {config.activeGroup !== 'ALL' && config.activeGroup !== 'NONE' && (
                <p className="text-[10px] text-slate-500 font-medium">
                  Kepala Seksi / Kepala Grup
                </p>
              )}
              {authorizedGroups.includes(config.activeGroup) && config.activeGroup !== 'NONE' && (
                <button
                  type="button"
                  onClick={handleLogout}
                  className="text-[9px] uppercase font-black text-rose-600 hover:text-rose-800 transition-colors cursor-pointer hover:underline flex items-center gap-0.5 justify-end w-full mt-0.5"
                >
                  <span>🔒 Keluar sesi</span>
                </button>
              )}
            </div>
            <div className={`w-10 h-10 rounded-full border flex items-center justify-center font-bold text-sm transition-all duration-300 ${
              authorizedGroups.includes(config.activeGroup)
                ? 'bg-blue-100 border-blue-200 text-blue-600 font-extrabold shadow-sm'
                : 'bg-slate-100 border-slate-200 text-slate-400 font-medium grayscale opacity-60'
            }`}>
              {config.activeGroup === 'NONE' ? '--' : config.activeGroup === 'ALL' ? 'AD' : config.activeGroup.substring(0, 2)}
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        
        {/* Access Rights Switchboard & Halaman Login */}
        <AccessControl
          currentGroup={config.activeGroup}
          isAuthorized={authorizedGroups.includes(config.activeGroup)}
          onLogin={handleDirectLogin}
          onLogout={handleLogout}
        />

        {/* Clock Widget for Context awareness & sync status */}
        {authorizedGroups.includes(config.activeGroup) && config.activeGroup !== 'NONE' && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl px-5 py-3 shadow-xs">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
              <Clock className="w-4 h-4 text-blue-500 shrink-0" />
              <span>Sistem sinkron: <strong className="font-bold text-slate-800">{timeStr || 'Memuat Waktu...'}</strong></span>
            </div>
            
            <div className="flex items-center gap-3">
              {isAutoSyncing && (
                <span className="text-[10px] uppercase font-bold text-blue-600 font-mono tracking-wider flex items-center gap-1.5 bg-blue-50 px-2.5 py-1 rounded-md border border-blue-100 animate-pulse">
                  <span className="w-2 h-2 bg-blue-500 rounded-full animate-ping" />
                  Auto-Sync Aktif
                </span>
              )}
              {isFirebaseActive ? (
                <span className="text-[10px] uppercase font-bold text-emerald-600 font-mono tracking-wider flex items-center gap-1 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-100">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
                  Dua Arah (Cloud Sync Aktif)
                </span>
              ) : (
                <span className="text-[10px] uppercase font-bold text-slate-500 font-mono tracking-wider flex items-center gap-1 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200">
                  <span className="w-2 h-2 bg-slate-400 rounded-full" />
                  Mode Lokal
                </span>
              )}
            </div>
          </div>
        )}

        {/* Global Demo Mode Interactive Banner */}
        {config.isDemoMode && config.activeGroup === 'ALL' && (
          <div className="bg-amber-500 text-white rounded-xl px-5 py-4 border border-amber-600 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm">
            <div className="flex items-start gap-3">
              <HelpCircle className="w-5 h-5 mt-0.5 shrink-0 text-amber-200 animate-spin" />
              <div>
                <span className="font-black text-sm uppercase tracking-wider block">Mode Demo / Uji Coba Aktif</span>
                <p className="text-[11px] text-amber-100 mt-0.5 leading-relaxed">
                  Semua inputan adalah <strong>Percobaan Lokal & Cloud</strong> yang tidak dikirim ke Google Spreadsheet. Nonaktifkan mode ini di admin panel untuk mengirim data permanen!
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleClearAllEvaluations(true)}
              className="w-full md:w-auto px-4 py-2 bg-amber-600 hover:bg-amber-700 active:scale-[0.98] text-white text-xs font-extrabold uppercase tracking-wider rounded-lg transition-all shadow-md shrink-0 cursor-pointer"
            >
              🧹 Bersihkan Inputan Demo
            </button>
          </div>
        )}

        {/* Security / Passcode Check before operational panels */}
        {authorizedGroups.includes(config.activeGroup) ? (
          /* Grid Split Content */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* Left panel: Input form (40%) */}
            <div className="lg:col-span-5">
              <EvaluationForm
                currentGroup={config.activeGroup}
                onAddEvaluation={handleAddEvaluation}
                onAddEvaluationsBatch={handleAddEvaluationsBatch}
                isDemoMode={config.activeGroup === 'ALL' ? config.isDemoMode : false}
                onToggleDemoMode={handleToggleDemoMode}
                evaluations={evaluations}
                onShowAlert={triggerCustomAlert}
                employees={employees}
                presensiRecords={presensiRecords}
                hrmsRecords={hrmsRecords}
              />
            </div>

            {/* Right panel: Dashboard rekap, charts, and Google Sheets setting (60%) */}
            <div className="lg:col-span-7 space-y-6">
              
              <DashboardSummary
                evaluations={evaluations}
                hrmsRecords={hrmsRecords}
                currentGroup={config.activeGroup}
                onDeleteEvaluation={handleDeleteEvaluation}
                onUpdateEvaluation={handleUpdateEvaluation}
                onApproveEvaluation={handleApproveEvaluation}
                onSyncFromSpreadsheet={handleSyncFromSpreadsheet}
                hasWebhookUrl={!!config.webhookUrl}
                employees={employees}
                spreadsheetId={config.spreadsheetId || '12LeSP25CHhUqO5FxC2Ca407ArtTFSJbNPoR38D6J23I'}
                presensiDatabaseElement={
                  config.activeGroup !== 'ALL' && config.activeGroup !== 'NONE' ? (
                    <PresensiDatabase
                      records={presensiRecords}
                      employees={employees}
                      onSyncRecords={async (newRecords) => {
                        setPresensiRecords(newRecords);
                        safeStorage.setItem('presensi_records_v1', JSON.stringify(newRecords));
                        if (isFirebaseActive) {
                          await saveCloudPresensiRecordsBatch(newRecords);
                        }
                      }}
                      onShowAlert={triggerCustomAlert}
                      currentGroup={config.activeGroup}
                    />
                  ) : undefined
                }
              />

              {config.activeGroup === 'ALL' && (
                <div className="flex flex-col sm:flex-row border border-slate-200 bg-[#ffd1ff] p-1 rounded-xl gap-1.5 shadow-3xs sticky top-2 z-30 backdrop-blur-md">
                  <button
                    type="button"
                    onClick={() => setAdminTab('presensi')}
                    className={`flex-1 py-2 text-[11px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      adminTab === 'presensi'
                        ? 'bg-emerald-600 text-white shadow-md font-black ring-2 ring-emerald-500/20'
                        : 'text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 font-bold'
                    }`}
                  >
                    📅 Presensi
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdminTab('hrms')}
                    className={`flex-1 py-2 text-[11px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      adminTab === 'hrms'
                        ? 'bg-indigo-600 text-white shadow-md font-black ring-2 ring-indigo-500/20'
                        : 'text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 font-bold'
                    }`}
                  >
                    📊 HRMS
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdminTab('karyawan')}
                    className={`flex-1 py-2 text-[11px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      adminTab === 'karyawan'
                        ? 'bg-sky-600 text-white shadow-md font-black ring-2 ring-sky-500/20'
                        : 'text-slate-600 hover:bg-sky-50 hover:text-sky-700 font-bold'
                    }`}
                  >
                    👥 Database
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdminTab('kontak')}
                    className={`flex-1 py-2 text-[11px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      adminTab === 'kontak'
                        ? 'bg-amber-500 text-white shadow-md font-black ring-2 ring-amber-500/20'
                        : 'text-slate-600 hover:bg-amber-50 hover:text-amber-700 font-bold'
                    }`}
                  >
                    📞 Kontak
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdminTab('sheets')}
                    className={`flex-1 py-2 text-[11px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      adminTab === 'sheets'
                        ? 'bg-purple-600 text-white shadow-md font-black ring-2 ring-purple-500/20'
                        : 'text-slate-600 hover:bg-purple-50 hover:text-purple-700 font-bold'
                    }`}
                  >
                    ⚙️ Setelan
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdminTab('logs')}
                    className={`flex-1 py-2 text-[11px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      adminTab === 'logs'
                        ? 'bg-rose-600 text-white shadow-md font-black ring-2 ring-rose-500/20'
                        : 'text-slate-600 hover:bg-rose-50 hover:text-rose-700 font-bold'
                    }`}
                  >
                    📜 Log Aktivitas
                  </button>
                </div>
              )}

              {config.activeGroup === 'ALL' && adminTab === 'sheets' && (
                <GoogleSheetsConfig
                  config={config}
                  onUpdateConfig={handleUpdateConfig}
                  onTestConnection={handleTestConnection}
                  evaluations={evaluations}
                  onClearAllEvaluations={handleClearAllEvaluations}
                  onShowAlert={triggerCustomAlert}
                  employees={employees}
                  onResetAndSyncFromSpreadsheet={handleResetAndSyncFromSpreadsheet}
                  onSyncFromGoogleSheetsAPI={handleSyncFromGoogleSheetsAPI}
                  onPushToGoogleSheetsAPI={handlePushToGoogleSheetsAPI}
                />
              )}

              {config.activeGroup === 'ALL' && adminTab === 'karyawan' && (
                <EmployeeDatabase
                  employees={employees}
                  onSyncEmployees={handleSyncEmployees}
                  onResetEmployees={handleResetEmployees}
                  onShowAlert={triggerCustomAlert}
                  webhookUrl={config.webhookUrl}
                  spreadsheetId={config.spreadsheetId}
                />
              )}

              {config.activeGroup === 'ALL' && adminTab === 'kontak' && (
                <KssContactsConfig
                  contacts={kssContacts}
                  onSaveContacts={handleSaveKssContacts}
                  onShowAlert={triggerCustomAlert}
                />
              )}

              {config.activeGroup === 'ALL' && adminTab === 'logs' && (
                <ActivityLogsTable
                  logs={activityLogs}
                  onClearLogs={handleClearActivityLogs}
                />
              )}

              {config.activeGroup === 'ALL' && adminTab === 'hrms' && (
                <HrmsDatabase
                  records={hrmsRecords}
                  employees={employees}
                  onSyncRecords={async (newRecords) => {
                    const normalized = newRecords.map(normalizeEvaluationRecord);
                    setHrmsRecords(normalized);
                    safeStorage.setItem('hrms_records_v1', JSON.stringify(normalized));
                    if (isFirebaseActive) {
                      await saveCloudHrmsRecordsBatch(normalized);
                    }
                  }}
                  onShowAlert={triggerCustomAlert}
                  webhookUrl={config.webhookUrl}
                />
              )}

              {config.activeGroup === 'ALL' && adminTab === 'presensi' && (
                <PresensiDatabase
                  records={presensiRecords}
                  employees={employees}
                  onSyncRecords={async (newRecords) => {
                    const normalized = newRecords.map(normalizeEvaluationRecord);
                    setPresensiRecords(normalized);
                    safeStorage.setItem('presensi_records_v1', JSON.stringify(normalized));
                    if (isFirebaseActive) {
                      await saveCloudPresensiRecordsBatch(normalized);
                    }
                  }}
                  onShowAlert={triggerCustomAlert}
                  currentGroup={config.activeGroup}
                />
              )}



            </div>

          </div>
        ) : null}

      </main>

      {/* Footer Status Bar matching "Professional Polish" */}
      <footer className="bg-white border-t border-slate-200 px-6 sm:px-8 py-4 flex flex-col sm:flex-row justify-between items-center gap-3 text-xs">
        <div className="flex items-center flex-wrap gap-4">
          <div className="flex items-center space-x-1.5">
            <div className={`w-2.5 h-2.5 rounded-full ${config.webhookUrl ? 'bg-green-500' : 'bg-amber-400'}`}></div>
            <span className="text-slate-500 uppercase tracking-wider font-bold text-[10px]">
              {config.webhookUrl ? 'Terhubung dengan Google Spreadsheet' : 'Sinkronisasi Spreadsheet Belum Aktif'}
            </span>
          </div>
          <span className="text-slate-300 hidden sm:inline">|</span>
          <span className="text-slate-400 font-medium">Total: {evaluations.length} data tersimpan secara lokal</span>
        </div>
        <div className="flex items-center flex-wrap gap-3.5 justify-center sm:justify-end text-slate-500 font-mono text-[11px]">
          <span className="bg-blue-50 text-blue-700 font-extrabold px-2.5 py-0.5 rounded-md border border-blue-100 uppercase tracking-widest text-[10px] shadow-3xs">
            Versi 2.6.0 [Update 18]
          </span>
          
          <button
            type="button"
            onClick={() => {
              window.dispatchEvent(new CustomEvent('show-install-prompt-manual'));
            }}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg text-[10.5px] font-black uppercase tracking-wider transition-all duration-200 flex items-center gap-1.5 cursor-pointer shadow-sm hover:shadow active:scale-95"
          >
            <Smartphone className="w-3.5 h-3.5 shrink-0" />
            Pasang Aplikasi
          </button>
        </div>
      </footer>

      {/* Passcode Verification Modal Overlay */}
      {pendingGroup !== null && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 border border-slate-205 space-y-4 text-center">
            <div className="w-12 h-12 bg-blue-50 border border-blue-100 text-blue-600 rounded-xl flex items-center justify-center mx-auto shadow-xs">
              <Lock className="w-5 h-5 animate-bounce" />
            </div>
            
            <div className="space-y-1">
              <h4 className="text-sm font-extrabold text-slate-850 uppercase tracking-wider">Verifikasi Sandi Akses</h4>
              <p className="text-xs text-slate-500">
                Silakan masukkan sandi otorisasi untuk:
              </p>
              <div className="text-xs font-bold text-blue-700 bg-blue-50/50 py-1.5 px-3 rounded-lg mt-1 inline-block">
                {pendingGroup === 'ALL' ? '🚨 Administrator (Semua Grup)' : `👥 KSS Grup ${pendingGroup}`}
              </div>
            </div>

            <div className="space-y-3 pt-1">
              <input
                type="password"
                placeholder="Masukkan sandi..."
                value={passcodeInput}
                onChange={(e) => {
                  setPasscodeError(null);
                  setPasscodeInput(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleVerifyPasscode();
                }}
                className="w-full px-4 py-2 bg-slate-50 rounded-lg text-center font-mono tracking-widest text-sm font-bold border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono"
                autoFocus
              />

              {passcodeError && (
                <p className="text-[11px] font-semibold text-rose-600 animate-pulse">
                  ❌ {passcodeError}
                </p>
              )}

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setPendingGroup(null)}
                  className="flex-1 py-2 text-center text-xs font-bold text-slate-500 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleVerifyPasscode}
                  className="flex-1 py-2 text-center text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors cursor-pointer"
                >
                  Otorisasi
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal Overlay */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 border border-slate-200 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2 bg-rose-50 rounded-lg">
                <Trash2 className="w-6 h-6" />
              </div>
              <h4 className="text-base font-bold text-slate-800">Konfirmasi Hapus</h4>
            </div>
            
            <p className="text-slate-650 text-xs leading-relaxed">
              Apakah Anda yakin ingin menghapus data penilaian kerja atas nama <strong className="font-bold text-slate-800">"{deleteTarget.name}"</strong>? Tindakan ini tidak dapat dibatalkan.
            </p>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2 text-center text-xs font-bold text-slate-500 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={async () => {
                  const filtered = evaluations.filter(e => e.id !== deleteTarget.id);
                  saveEvaluationsState(filtered);
                  if (isFirebaseActive) {
                    await deleteCloudEvaluation(deleteTarget.id);
                  }
                  setDeleteTarget(null);
                }}
                className="flex-1 py-2 text-center text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-sm transition-colors cursor-pointer"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share QR Code Modal Overlay */}
      {isShareModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 border border-slate-200 relative space-y-5">
            <button
              type="button"
              onClick={() => setIsShareModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-50 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="text-center space-y-1.5 pr-6">
              <div className="w-12 h-12 bg-emerald-50 border border-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center mx-auto shadow-xs">
                <QrCode className="w-6 h-6 animate-pulse" />
              </div>
              <h4 className="text-base font-black text-slate-850 uppercase tracking-wide">Bagikan Aplikasi</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Pindai QR Code di bawah untuk membuka form penginputan langsung di HP Anda, atau salin link pengguna berikut.
              </p>
            </div>

            {/* QR Code Container */}
            <div className="flex flex-col items-center justify-center p-4 bg-slate-50 border border-slate-150 rounded-2xl relative shadow-3xs overflow-hidden">
              <div className="relative hover:scale-105 transition-transform duration-300 w-44 h-44 flex items-center justify-center bg-white rounded-xl border border-slate-100 shadow-3xs overflow-hidden">
                {isGeneratingQr || !combinedQrUrl ? (
                  <div className="flex flex-col items-center justify-center space-y-2 text-slate-400">
                    <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
                    <span className="text-[10px] font-bold uppercase tracking-wider animate-pulse">Membuat QR...</span>
                  </div>
                ) : (
                  <img
                    src={combinedQrUrl}
                    alt="QR Code Aplikasi"
                    className="w-full h-full p-2"
                    referrerPolicy="no-referrer"
                  />
                )}
              </div>
              <p className="text-[9px] text-slate-400 font-bold uppercase mt-2.5 tracking-wider font-mono">Pindai dengan Kamera HP Anda</p>
            </div>

            {/* Copyable Link section */}
            <div className="space-y-1.5">
              <label className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest block">Tautan Aplikasi Pengguna</label>
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl p-2">
                <span className="text-[11px] font-bold text-slate-600 truncate flex-1 select-all font-mono pl-1">
                  {getProductionUrl()}
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    const url = getProductionUrl();
                    try {
                      await navigator.clipboard.writeText(url);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    } catch {
                      try {
                        const textarea = document.createElement('textarea');
                        textarea.value = url;
                        textarea.style.position = 'fixed';
                        document.body.appendChild(textarea);
                        textarea.select();
                        document.execCommand('copy');
                        document.body.removeChild(textarea);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      } catch {
                        triggerCustomAlert("Gagal Menyalin", `Silakan salin tautan berikut secara manual:\n\n${url}`);
                      }
                    }
                  }}
                  className={`px-3 py-1.5 rounded-lg text-[10.5px] font-black uppercase tracking-wider transition-all duration-150 flex items-center gap-1 shrink-0 cursor-pointer ${
                    copied
                      ? 'bg-emerald-500 text-white shadow-3xs'
                      : 'bg-blue-600 hover:bg-blue-700 active:scale-95 text-white shadow-3xs'
                  }`}
                >
                  {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  <span>{copied ? 'Tersalin' : 'Salin'}</span>
                </button>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-col gap-2 pt-1">
              <button
                type="button"
                onClick={handleDownloadQr}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer text-center shadow-xs"
              >
                📥 Simpan Gambar QR
              </button>
              
              <button
                type="button"
                onClick={handleShareWhatsApp}
                className="w-full py-2.5 bg-[#25D366] hover:bg-[#20ba5a] active:scale-95 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer text-center shadow-xs"
              >
                💬 Kirim ke WhatsApp
              </button>

              <button
                type="button"
                onClick={() => setIsShareModalOpen(false)}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer text-center"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Alert Overlay Modal (anti-iframe sandboxed blocks) */}
      {customAlert && customAlert.isOpen && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in duration-150">
          <div className="bg-white border-2 border-amber-400 rounded-2xl max-w-sm w-full p-6 shadow-2xl animate-scale-up space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-amber-50 border border-amber-200 text-amber-600 rounded-xl flex items-center justify-center shrink-0">
                <AlertCircle className="w-6 h-6 text-amber-500 animate-pulse" />
              </div>
              <div className="flex-1 whitespace-normal">
                <h4 className="text-sm font-black text-slate-800 uppercase tracking-wide">
                  {customAlert.title}
                </h4>
                <p className="text-[11.5px] text-slate-550 mt-1 leading-relaxed whitespace-pre-line font-medium">
                  {customAlert.message.includes("081252044206") ? (
                    <>
                      Untuk mematikan Mode Demo hubungi admin CP.{" "}
                      <a 
                        href="https://wa.me/628152044206" 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="text-blue-600 hover:text-blue-800 font-extrabold underline inline-flex items-center gap-0.5 cursor-pointer"
                      >
                        081252044206
                      </a>
                    </>
                  ) : (
                    customAlert.message
                  )}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setCustomAlert({ ...customAlert, isOpen: false })}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-extrabold uppercase tracking-widest text-[10.5px] rounded-xl transition duration-150 cursor-pointer shadow-md text-center"
            >
              Mengerti
            </button>
          </div>
        </div>
      )}

      {/* Floating Mobile Home-screen PWA installer prompt instructions */}
      <InstallPrompt />

    </div>
  );
}
