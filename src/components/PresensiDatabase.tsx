/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { PresensiRecord, Employee } from '../types';
import { Search, RefreshCw, Calendar, Filter, UserCheck, Clock, ShieldAlert, ArrowUpDown } from 'lucide-react';
import { getPeriodFromDate, isShiftMtcEmployee, getShiftMtcGroup, MONTH_NAMES_ID, matchesMonthAndYear, extractAvailableYears } from '../utils';
import { fetchPresensiRecordsFromSheet } from '../services/dataSyncService';

interface PresensiDatabaseProps {
  records: PresensiRecord[];
  employees: Employee[];
  onSyncRecords: (newRecords: PresensiRecord[]) => void;
  onShowAlert: (title: string, message: string) => void;
  currentGroup?: string;
}

// Map various raw status patterns from sheets to a standardized type
export function mapPresensiType(raw: string): 'C' | 'I' | 'S' | 'D' | 'LP' | 'Lainnya' {
  const status = (raw || '').trim().toLowerCase();
  if (status === 'c' || status === 'cuti' || status.includes('cuti')) {
    return 'C';
  }
  if (status === 'i' || status === 'izin' || status === 'ijin' || status.includes('izin') || status.includes('ijin')) {
    return 'I';
  }
  if (status === 's' || status === 'sd' || status === 'sakit' || status.includes('sakit')) {
    return 'S';
  }
  if (status === 'd' || status === 'dispensasi' || status === 'dispen' || status.includes('dispensasi') || status.includes('dispen')) {
    return 'D';
  }
  if (status === 'lp' || status.includes('lp')) {
    return 'LP';
  }
  return 'Lainnya';
}

// Convert DD/MM/YYYY or DD-MM-YYYY or serials to milliseconds for chronological sorting
export function parseDateToMillis(dateStr: string): number {
  if (!dateStr) return 0;
  const str = dateStr.trim();
  if (/^\d{5}(\.\d+)?$/.test(str)) {
    const serial = parseFloat(str);
    const jsDate = new Date((serial - 25569) * 86400000);
    return isNaN(jsDate.getTime()) ? 0 : jsDate.getTime();
  }
  const dmyMatch = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmyMatch) {
    const d = parseInt(dmyMatch[1], 10);
    const m = parseInt(dmyMatch[2], 10) - 1;
    const y = parseInt(dmyMatch[3], 10);
    const jsDate = new Date(y, m, d);
    return isNaN(jsDate.getTime()) ? 0 : jsDate.getTime();
  }
  const parsed = Date.parse(str);
  return isNaN(parsed) ? 0 : parsed;
}

export default function PresensiDatabase({
  records,
  employees = [],
  onSyncRecords,
  onShowAlert,
  currentGroup = 'ALL',
}: PresensiDatabaseProps) {
  const isUserAdmin = currentGroup === 'ALL';

  const [activeSubTab, setActiveSubTab] = useState<'rekap' | 'riwayat'>('rekap');

  // Hitung contoh periode absensi dinamis berbasis tanggal hari ini (cut-off 21 s.d 20)
  const dynamicGuideMonths = React.useMemo(() => {
    const now = new Date();
    const currentDay = now.getDate();
    const currentMonthIdx = now.getMonth();
    const currentYear = now.getFullYear();

    const getPeriodDetails = (offsetMonths: number) => {
      const target = new Date(currentYear, currentMonthIdx + offsetMonths, 15);
      const mIdx = target.getMonth();
      const y = target.getFullYear();
      
      const prevTarget = new Date(y, mIdx - 1, 15);
      const prevMIdx = prevTarget.getMonth();
      const prevY = prevTarget.getFullYear();
      
      return {
        periodName: MONTH_NAMES_ID[mIdx].toUpperCase(),
        startDay: 21,
        startMonthName: MONTH_NAMES_ID[prevMIdx],
        endDay: 20,
        endMonthName: MONTH_NAMES_ID[mIdx],
      };
    };

    const activePeriodOffset = currentDay >= 21 ? 1 : 0;
    const ex1 = getPeriodDetails(activePeriodOffset - 1);
    const ex2 = getPeriodDetails(activePeriodOffset);

    return { ex1, ex2 };
  }, []);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<string>('ALL');
  const [selectedYear, setSelectedYear] = useState<string>('ALL');

  // Hitung detail tanggal cut-off secara dinamis menyesuaikan filter selectedMonth & selectedYear yang dipilih
  const guideInfo = React.useMemo(() => {
    let targetPeriod = dynamicGuideMonths.ex2.periodName;
    if (selectedMonth !== 'ALL' && selectedYear !== 'ALL') {
      targetPeriod = `${selectedMonth} ${selectedYear}`;
    } else if (selectedMonth !== 'ALL') {
      targetPeriod = `${selectedMonth} ${new Date().getFullYear()}`;
    }

    const parts = targetPeriod.trim().split(' ');
    const monthNameUpper = parts[0]?.toUpperCase();
    const yearStr = parts[1] || String(new Date().getFullYear());

    const monthIdx = MONTH_NAMES_ID.findIndex(m => m.toUpperCase() === monthNameUpper);
    if (monthIdx === -1) {
      return {
        periodName: targetPeriod,
        startDay: 21,
        startMonthName: 'Juni',
        endDay: 20,
        endMonthName: 'Juli',
      };
    }

    let prevMonthIdx = monthIdx - 1;
    let prevYear = parseInt(yearStr, 10);
    if (prevMonthIdx < 0) {
      prevMonthIdx = 11;
      prevYear -= 1;
    }

    return {
      periodName: targetPeriod,
      startDay: 21,
      startMonthName: MONTH_NAMES_ID[prevMonthIdx],
      endDay: 20,
      endMonthName: MONTH_NAMES_ID[monthIdx],
    };
  }, [selectedMonth, selectedYear, dynamicGuideMonths]);

  const [selectedGroup, setSelectedGroup] = useState<string>(isUserAdmin ? 'ALL' : currentGroup);
  const [selectedPresensiType, setSelectedPresensiType] = useState<string>('ALL'); // ALL, C, I, S, LP
  const [isSyncing, setIsSyncing] = useState(false);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Separate sorting states for Rekap and Riwayat to fulfill direct requirements:
  // - Rekap per karyawan: default to 'nama' ascending
  // - Riwayat log harian: default to 'tanggal' descending (so newest logs are at the top)
  const [rekapSortField, setRekapSortField] = useState<string>('nama');
  const [rekapSortDirection, setRekapSortDirection] = useState<'asc' | 'desc'>('asc');

  const [riwayatSortField, setRiwayatSortField] = useState<string>('tanggal');
  const [riwayatSortDirection, setRiwayatSortDirection] = useState<'asc' | 'desc'>('desc');

  // Fetch / Sync Presensi from Google Sheets
  const handleSyncFromSpreadsheet = async () => {
    if (!isUserAdmin) return; // Non-admins cannot trigger global sync
    setIsSyncing(true);
    try {
      const parsedPresensi = await fetchPresensiRecordsFromSheet();

      if (parsedPresensi.length > 0) {
        onSyncRecords(parsedPresensi);
        onShowAlert("Sinkronisasi Sukses", `Berhasil memuat ${parsedPresensi.length} log presensi dari Google Sheets.`);
        setCurrentPage(1);
      } else {
        onShowAlert("Perhatian", "Tidak ditemukan data presensi yang valid di sheet.");
      }
    } catch (err: any) {
      console.error(err);
      onShowAlert("Sinkronisasi Gagal", err?.message || "Kesalahan tidak dikenal saat mengunduh data.");
    } finally {
      setIsSyncing(false);
    }
  };

  const checkEmployeeBelongsToGroup = (e: { noReg: string; grup: string; jabatan?: string }, grp: string) => {
    if (grp === 'ALL') return true;
    if (grp === 'MTC') {
      return e.grup === 'MTC' || isShiftMtcEmployee(e);
    }
    if (grp === 'A' || grp === 'B' || grp === 'C') {
      if (isShiftMtcEmployee(e)) {
        return getShiftMtcGroup(e) === grp;
      }
      return e.grup === grp;
    }
    return e.grup === grp;
  };

  // Helper to parse/group/aggregate presensi records by operator (noReg) + periode
  const getAggregatedData = () => {
    const map = new Map<string, {
      noReg: string;
      nama: string;
      grup: string;
      cuti: number;
      sakit: number;
      izin: number;
      dispensasi: number;
      lp: number;
      periode: string;
    }>();

    records.forEach(rec => {
      // Find employee to get correct group and job title (especially for Shift MTC)
      const emp = employees.find(e => e.noReg.trim().toUpperCase() === rec.noReg.trim().toUpperCase());
      const empObj = emp || { noReg: rec.noReg, grup: rec.grup || 'N/A', jabatan: rec.jabatan || '' };
      
      const belongs = checkEmployeeBelongsToGroup(empObj, isUserAdmin ? 'ALL' : currentGroup);
      if (!belongs) {
        return;
      }

      const key = `${rec.noReg}_${rec.periode.toUpperCase()}`;
      const type = mapPresensiType(rec.presensi);
      
      const isCuti = type === 'C';
      const isSakit = type === 'S';
      const isIzin = type === 'I';
      const isDispensasi = type === 'D';
      const isLp = type === 'LP';

      const existing = map.get(key);
      if (existing) {
        if (isCuti) existing.cuti += 1;
        if (isSakit) existing.sakit += 1;
        if (isIzin) existing.izin += 1;
        if (isDispensasi) existing.dispensasi += 1;
        if (isLp) existing.lp += 1;
      } else {
        map.set(key, {
          noReg: rec.noReg,
          nama: rec.nama,
          grup: empObj.grup,
          cuti: isCuti ? 1 : 0,
          sakit: isSakit ? 1 : 0,
          izin: isIzin ? 1 : 0,
          dispensasi: isDispensasi ? 1 : 0,
          lp: isLp ? 1 : 0,
          periode: rec.periode.toUpperCase()
        });
      }
    });

    return Array.from(map.values());
  };

  // Available years sorted descending (e.g. 2026, 2025, 2024)
  const availableYears = React.useMemo(() => {
    return extractAvailableYears(records.map(r => r.periode));
  }, [records]);
  const uniqueGroups = Array.from(new Set(employees.map(e => e.grup).filter(Boolean))).sort();

  // Handle Filtering for both Rekap and Riwayat
  const aggregatedList = getAggregatedData();

  // Sorting handlers
  const handleSortRekapData = (a: any, b: any) => {
    let valA = a[rekapSortField];
    let valB = b[rekapSortField];

    if (typeof valA === 'string') {
      valA = valA.toLowerCase();
      valB = valB.toLowerCase();
    }

    if (valA < valB) return rekapSortDirection === 'asc' ? -1 : 1;
    if (valA > valB) return rekapSortDirection === 'asc' ? 1 : -1;
    return 0;
  };

  const handleSortRiwayatData = (a: any, b: any) => {
    let valA = a[riwayatSortField];
    let valB = b[riwayatSortField];

    if (riwayatSortField === 'tanggal') {
      const tA = parseDateToMillis(a.tanggal);
      const tB = parseDateToMillis(b.tanggal);
      return riwayatSortDirection === 'asc' ? tA - tB : tB - tA;
    }

    if (typeof valA === 'string') {
      valA = valA.toLowerCase();
      valB = valB.toLowerCase();
    }

    if (valA < valB) return riwayatSortDirection === 'asc' ? -1 : 1;
    if (valA > valB) return riwayatSortDirection === 'asc' ? 1 : -1;
    return 0;
  };

  // Filter aggregated rekap list
  const filteredAggregated = aggregatedList
    .filter(item => {
      const matchesSearch = item.nama.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            item.noReg.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesPeriod = matchesMonthAndYear(item.periode, selectedMonth, selectedYear);
      
      // Find employee to check group membership
      const emp = employees.find(e => e.noReg.trim().toUpperCase() === item.noReg.trim().toUpperCase());
      const empObj = emp || { noReg: item.noReg, grup: item.grup || 'N/A', jabatan: '' };
      
      // Force lock group for non-admin, otherwise follow selector
      const matchesGroup = !isUserAdmin ? true : checkEmployeeBelongsToGroup(empObj, selectedGroup);
      
      // Presensi Type Filter: only show if the filtered count is > 0
      let matchesPresensiType = true;
      if (selectedPresensiType !== 'ALL') {
        if (selectedPresensiType === 'C') matchesPresensiType = item.cuti > 0;
        else if (selectedPresensiType === 'I') matchesPresensiType = item.izin > 0;
        else if (selectedPresensiType === 'S') matchesPresensiType = item.sakit > 0;
        else if (selectedPresensiType === 'D') matchesPresensiType = item.dispensasi > 0;
        else if (selectedPresensiType === 'LP') matchesPresensiType = item.lp > 0;
      }

      return matchesSearch && matchesPeriod && matchesGroup && matchesPresensiType;
    })
    .sort(handleSortRekapData);

  // Filter raw daily logs list
  const filteredRawLogs = records
    .filter(item => {
      const emp = employees.find(e => e.noReg.trim().toUpperCase() === item.noReg.trim().toUpperCase());
      const empObj = emp || { noReg: item.noReg, grup: item.grup || 'N/A', jabatan: item.jabatan || '' };

      // Force group filter on raw logs early for non-admins, and follow selectedGroup filter for admin
      const belongs = checkEmployeeBelongsToGroup(empObj, isUserAdmin ? selectedGroup : currentGroup);
      if (!belongs) {
        return false;
      }

      const matchesSearch = item.nama.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            item.noReg.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesPeriod = matchesMonthAndYear(item.periode, selectedMonth, selectedYear);
      
      // Presensi Type Filter
      let matchesPresensiType = true;
      if (selectedPresensiType !== 'ALL') {
        matchesPresensiType = mapPresensiType(item.presensi) === selectedPresensiType;
      }

      return matchesSearch && matchesPeriod && matchesPresensiType;
    })
    .sort(handleSortRiwayatData);

  const activeList = activeSubTab === 'rekap' ? filteredAggregated : filteredRawLogs;

  // Pagination Logic
  const totalItems = activeList.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedList = activeList.slice(startIndex, startIndex + itemsPerPage);

  // Sort togglers
  const handleSortRekap = (field: string) => {
    if (rekapSortField === field) {
      setRekapSortDirection(rekapSortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setRekapSortField(field);
      setRekapSortDirection('asc');
    }
    setCurrentPage(1);
  };

  const handleSortRiwayat = (field: string) => {
    if (riwayatSortField === field) {
      setRiwayatSortDirection(riwayatSortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setRiwayatSortField(field);
      setRiwayatSortDirection('asc');
    }
    setCurrentPage(1);
  };

  return (
    <div id="presensi-database-container" className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 md:p-6 space-y-6">
      
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                Database Absensi & Presensi {isUserAdmin ? '(Administrator)' : `(Grup ${currentGroup})`}
              </h2>
              <p className="text-xs text-slate-500">
                {isUserAdmin 
                  ? 'Kumpulan riwayat ketidakhadiran (Cuti, Sakit, Izin) dan LP karyawan seluruh grup.'
                  : `Kumpulan riwayat ketidakhadiran (Cuti, Sakit, Izin) dan LP karyawan khusus kelompok Anda.`
                }
              </p>
            </div>
          </div>
        </div>

        {isUserAdmin && (
          <button
            type="button"
            disabled={isSyncing}
            onClick={handleSyncFromSpreadsheet}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold transition-all duration-150 active:scale-95 shadow-md hover:shadow-lg disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Menyingkronkan...' : 'Sinkron Sheet Presensi'}</span>
          </button>
        )}
      </div>

      {/* Sub Tabs Toggle */}
      <div className="flex bg-slate-100 p-1 rounded-xl w-fit gap-1 border border-slate-200/50">
        <button
          type="button"
          onClick={() => { setActiveSubTab('rekap'); setCurrentPage(1); setSearchTerm(''); }}
          className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
            activeSubTab === 'rekap'
              ? 'bg-white text-blue-700 shadow-sm border border-slate-200/30'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <UserCheck className="w-3.5 h-3.5" />
          <span>Rekap Per Karyawan & Periode</span>
        </button>
        <button
          type="button"
          onClick={() => { setActiveSubTab('riwayat'); setCurrentPage(1); setSearchTerm(''); }}
          className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
            activeSubTab === 'riwayat'
              ? 'bg-white text-blue-700 shadow-sm border border-slate-200/30'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Riwayat Log Harian</span>
        </button>
      </div>

      {/* Attendance Period Guidelines */}
      <div className="p-3 bg-blue-50/40 border border-blue-100/70 rounded-xl text-[11.5px] text-blue-800 flex items-start gap-2 leading-relaxed">
        <span className="text-sm mt-0.5">💡</span>
        <div>
          <span className="font-extrabold text-blue-900 uppercase tracking-wide text-[10px] block mb-0.5">Sistem Pemetaan Periode Absensi Otomatis</span>
          Sistem menggunakan aturan cut-off tanggal <strong>21 {guideInfo.startMonthName} s.d 20 {guideInfo.endMonthName}</strong> otomatis dipetakan ke periode <strong>{guideInfo.periodName}</strong>.
        </div>
      </div>

      {/* Filters Area */}
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Cari Nama / No. Reg..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-slate-50/50 outline-none transition-all placeholder:text-slate-400 text-slate-800"
          />
        </div>

        {/* Month Filter */}
        <div className="relative">
          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <select
            value={selectedMonth}
            onChange={(e) => { setSelectedMonth(e.target.value); setCurrentPage(1); }}
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50/50 text-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none cursor-pointer appearance-none font-medium"
            title="Filter Bulan"
          >
            <option value="ALL">Semua Bulan</option>
            {MONTH_NAMES_ID.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        {/* Year Filter */}
        <div className="relative">
          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <select
            value={selectedYear}
            onChange={(e) => { setSelectedYear(e.target.value); setCurrentPage(1); }}
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50/50 text-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none cursor-pointer appearance-none font-medium"
            title="Filter Tahun"
          >
            <option value="ALL">Semua Tahun</option>
            {availableYears.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        {/* Group Filter (Only visible and changeable by Admin) */}
        {isUserAdmin ? (
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedGroup}
              onChange={(e) => { setSelectedGroup(e.target.value); setCurrentPage(1); }}
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50/50 text-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none cursor-pointer appearance-none font-medium"
            >
              <option value="ALL">Grup</option>
              {uniqueGroups.map(g => (
                <option key={g} value={g}>Grup {g}</option>
              ))}
            </select>
          </div>
        ) : (
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <select
              disabled
              value={currentGroup}
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-xs bg-slate-100 text-slate-500 font-medium cursor-not-allowed appearance-none"
            >
              <option value={currentGroup}>Grup {currentGroup} (Terkunci)</option>
            </select>
          </div>
        )}

        {/* Jenis Presensi Filter */}
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <select
            value={selectedPresensiType}
            onChange={(e) => { setSelectedPresensiType(e.target.value); setCurrentPage(1); }}
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50/50 text-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none cursor-pointer appearance-none font-medium"
          >
            <option value="ALL">Type</option>
            <option value="C">C = Cuti</option>
            <option value="I">I = Izin</option>
            <option value="S">S/SD = Sakit</option>
            <option value="D">D = Dispensasi</option>
            <option value="LP">LP = LP</option>
          </select>
        </div>

        {/* Row Limit Selector */}
        <div className="relative">
          <select
            value={itemsPerPage}
            onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
            className="w-full pl-3 pr-8 py-2 border border-slate-200 rounded-xl text-xs bg-slate-50/50 text-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none cursor-pointer appearance-none font-semibold"
          >
            <option value={10}>10 Baris</option>
            <option value={25}>25 Baris</option>
            <option value={50}>50 Baris</option>
            <option value={100}>100 Baris</option>
          </select>
          <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-[8px] font-bold">▼</span>
        </div>
      </div>

      {/* Main Table View */}
      {paginatedList.length === 0 ? (
        <div className="border border-dashed border-slate-200 rounded-2xl p-10 text-center bg-slate-50/50">
          <ShieldAlert className="w-10 h-10 text-slate-400 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-700">Data Tidak Ditemukan</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Tidak ada data presensi untuk kata kunci pencarian atau kombinasi filter yang dipilih.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden border border-slate-100 rounded-2xl shadow-3xs bg-white">
          <div className="overflow-x-auto overflow-y-auto max-h-[550px] scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
            {activeSubTab === 'rekap' ? (
              // AGGREGATED VIEW TABLE
              <table className="w-full text-left border-collapse min-w-[800px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-black uppercase tracking-wider text-slate-600">
                    <th className="py-3 px-1 w-[32px] min-w-[32px] max-w-[32px] text-center sticky left-0 top-0 bg-slate-50 z-40 border-b border-slate-100">No</th>
                    <th 
                      className="py-3 px-1.5 w-[70px] min-w-[70px] max-w-[70px] cursor-pointer hover:bg-slate-100 transition-colors sticky left-[32px] top-0 bg-slate-50 z-40 border-b border-slate-100" 
                      onClick={() => handleSortRekap('noReg')}
                    >
                      <div className="flex items-center gap-1">
                        <span>No. Reg</span>
                        <ArrowUpDown className="w-2.5 h-2.5 text-slate-400" />
                      </div>
                    </th>
                    <th 
                      className="py-3 px-2 w-[110px] sm:w-[150px] min-w-[110px] sm:min-w-[150px] max-w-[110px] sm:max-w-[150px] cursor-pointer hover:bg-slate-100 transition-colors sticky left-[102px] top-0 bg-slate-50 z-40 border-b border-slate-100 border-r border-slate-200/80 shadow-[2px_0_4px_-1px_rgba(0,0,0,0.08)]" 
                      onClick={() => handleSortRekap('nama')}
                    >
                      <div className="flex items-center gap-1 flex-nowrap text-blue-700">
                        <span className="truncate">Nama Lengkap</span>
                        <ArrowUpDown className="w-2.5 h-2.5 text-blue-500 flex-shrink-0" />
                      </div>
                    </th>
                    <th className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors sticky top-0 bg-slate-50 z-30 border-b border-slate-100" onClick={() => handleSortRekap('grup')}>
                      <div className="flex items-center gap-1.5">
                        <span>Grup</span>
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      </div>
                    </th>
                    <th className="py-3 px-4 text-center cursor-pointer hover:bg-slate-100 transition-colors sticky top-0 bg-slate-50 z-30 border-b border-slate-100" onClick={() => handleSortRekap('cuti')}>
                      <div className="flex items-center justify-center gap-1.5">
                        <span>Cuti</span>
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      </div>
                    </th>
                    <th className="py-3 px-4 text-center cursor-pointer hover:bg-slate-100 transition-colors sticky top-0 bg-slate-50 z-30 border-b border-slate-100" onClick={() => handleSortRekap('sakit')}>
                      <div className="flex items-center justify-center gap-1.5">
                        <span>Sakit</span>
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      </div>
                    </th>
                    <th className="py-3 px-4 text-center cursor-pointer hover:bg-slate-100 transition-colors sticky top-0 bg-slate-50 z-30 border-b border-slate-100" onClick={() => handleSortRekap('izin')}>
                      <div className="flex items-center justify-center gap-1.5">
                        <span>Izin</span>
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      </div>
                    </th>
                    <th className="py-3 px-4 text-center cursor-pointer hover:bg-slate-100 transition-colors sticky top-0 bg-slate-50 z-30 border-b border-slate-100" onClick={() => handleSortRekap('dispensasi')}>
                      <div className="flex items-center justify-center gap-1.5">
                        <span>Dispensasi</span>
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      </div>
                    </th>
                    <th className="py-3 px-4 text-center cursor-pointer hover:bg-slate-100 transition-colors sticky top-0 bg-slate-50 z-30 border-b border-slate-100" onClick={() => handleSortRekap('lp')}>
                      <div className="flex items-center justify-center gap-1.5">
                        <span>LP</span>
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      </div>
                    </th>
                    <th className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors sticky top-0 bg-slate-50 z-30 border-b border-slate-100" onClick={() => handleSortRekap('periode')}>
                      <div className="flex items-center gap-1.5">
                        <span>Periode</span>
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-xs text-slate-700">
                  {paginatedList.map((item: any, idx) => {
                    const emp = employees.find(e => e.noReg.trim().toUpperCase() === item.noReg.trim().toUpperCase());
                    const isShiftMtc = emp ? isShiftMtcEmployee(emp) : false;
                    const shiftMtcGrp = isShiftMtc && emp ? getShiftMtcGroup(emp) : null;

                    return (
                      <tr key={`${item.noReg}_${item.periode}`} className="group hover:bg-slate-50/50 transition-colors">
                        <td className="py-3 px-1 w-[32px] min-w-[32px] max-w-[32px] text-center font-bold text-slate-400 sticky left-0 bg-white group-hover:bg-slate-50/80 transition-colors z-20">{startIndex + idx + 1}</td>
                        <td className="py-3 px-1.5 w-[70px] min-w-[70px] max-w-[70px] font-mono font-bold text-slate-900 truncate sticky left-[32px] bg-white group-hover:bg-slate-50/80 transition-colors z-20">{item.noReg}</td>
                        <td className="py-3 px-2 w-[110px] sm:w-[150px] min-w-[110px] sm:min-w-[150px] max-w-[110px] sm:max-w-[150px] font-semibold text-slate-900 truncate sticky left-[102px] bg-white group-hover:bg-slate-50/80 transition-colors z-20 border-r border-slate-200/80 shadow-[2px_0_4px_-1px_rgba(0,0,0,0.08)]" title={item.nama}>{item.nama}</td>
                        <td className="py-3 px-4">
                          <div className="flex flex-col gap-0.5">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-blue-50 text-blue-700 uppercase tracking-wide border border-blue-200/50 w-fit">
                              {item.grup}
                            </span>
                            {shiftMtcGrp && (
                              <span className="text-[9px] font-extrabold text-amber-600 uppercase tracking-wider">
                                Shift {shiftMtcGrp}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className={`inline-block px-2 py-1 rounded-lg text-[11px] font-black ${item.cuti > 0 ? 'bg-indigo-50 text-indigo-700 border border-indigo-200/40' : 'text-slate-300'}`}>
                            {item.cuti}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className={`inline-block px-2 py-1 rounded-lg text-[11px] font-black ${item.sakit > 0 ? 'bg-red-50 text-red-700 border border-red-200/40' : 'text-slate-300'}`}>
                            {item.sakit}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className={`inline-block px-2 py-1 rounded-lg text-[11px] font-black ${item.izin > 0 ? 'bg-amber-50 text-amber-700 border border-amber-200/40' : 'text-slate-300'}`}>
                            {item.izin}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className={`inline-block px-2 py-1 rounded-lg text-[11px] font-black ${item.dispensasi > 0 ? 'bg-purple-50 text-purple-700 border border-purple-200/40' : 'text-slate-300'}`}>
                            {item.dispensasi}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className={`inline-block px-2 py-1 rounded-lg text-[11px] font-black ${item.lp > 0 ? 'bg-rose-50 text-rose-700 border border-rose-200/40' : 'text-slate-300'}`}>
                            {item.lp}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-black text-slate-600 uppercase tracking-wider">{item.periode}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              // RAW HISTORY LOG VIEW TABLE
              <table className="w-full text-left border-collapse min-w-[900px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-black uppercase tracking-wider text-slate-600">
                    <th className="py-3 px-1 w-[32px] min-w-[32px] max-w-[32px] text-center sticky left-0 top-0 bg-slate-50 z-40 border-b border-slate-100">No</th>
                    <th 
                      className="py-3 px-1.5 w-[70px] min-w-[70px] max-w-[70px] cursor-pointer hover:bg-slate-100 transition-colors sticky left-[32px] top-0 bg-slate-50 z-40 border-b border-slate-100" 
                      onClick={() => handleSortRiwayat('noReg')}
                    >
                      <div className="flex items-center gap-1">
                        <span>No. Reg</span>
                        <ArrowUpDown className="w-2.5 h-2.5 text-slate-400" />
                      </div>
                    </th>
                    <th 
                      className="py-3 px-2 w-[110px] sm:w-[150px] min-w-[110px] sm:min-w-[150px] max-w-[110px] sm:max-w-[150px] cursor-pointer hover:bg-slate-100 transition-colors sticky left-[102px] top-0 bg-slate-50 z-40 border-b border-slate-100 border-r border-slate-200/80 shadow-[2px_0_4px_-1px_rgba(0,0,0,0.08)]" 
                      onClick={() => handleSortRiwayat('nama')}
                    >
                      <div className="flex items-center gap-1 flex-nowrap text-blue-700">
                        <span className="truncate">Nama Lengkap</span>
                        <ArrowUpDown className="w-2.5 h-2.5 text-blue-500 flex-shrink-0" />
                      </div>
                    </th>
                    <th className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors sticky top-0 bg-slate-50 z-30 border-b border-slate-100" onClick={() => handleSortRiwayat('jabatan')}>
                      <div className="flex items-center gap-1.5">
                        <span>Jabatan</span>
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      </div>
                    </th>
                    <th className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors sticky top-0 bg-slate-50 z-30 border-b border-slate-100" onClick={() => handleSortRiwayat('grup')}>
                      <div className="flex items-center gap-1.5">
                        <span>Grup</span>
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      </div>
                    </th>
                    <th className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors sticky top-0 bg-slate-50 z-30 border-b border-slate-100" onClick={() => handleSortRiwayat('tanggal')}>
                      <div className="flex items-center gap-1.5 flex-nowrap text-blue-700">
                        <span>Tanggal</span>
                        <ArrowUpDown className="w-3 h-3 text-blue-500" />
                      </div>
                    </th>
                    <th className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors sticky top-0 bg-slate-50 z-30 border-b border-slate-100" onClick={() => handleSortRiwayat('presensi')}>
                      <div className="flex items-center gap-1.5">
                        <span>Presensi</span>
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      </div>
                    </th>
                    <th className="py-3 px-4 sticky top-0 bg-slate-50 z-30 border-b border-slate-100">Keterangan</th>
                    <th className="py-3 px-4 cursor-pointer hover:bg-slate-100 transition-colors sticky top-0 bg-slate-50 z-30 border-b border-slate-100" onClick={() => handleSortRiwayat('periode')}>
                      <div className="flex items-center gap-1.5">
                        <span>Periode</span>
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-xs text-slate-700">
                  {paginatedList.map((item: any, idx) => {
                    const type = mapPresensiType(item.presensi);
                    const statusClass = 
                      type === 'C' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' :
                      type === 'S' ? 'bg-red-50 text-red-700 border-red-200' :
                      type === 'I' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                      type === 'D' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                      type === 'LP' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                      'bg-slate-50 text-slate-600 border-slate-200';

                    const emp = employees.find(e => e.noReg.trim().toUpperCase() === item.noReg.trim().toUpperCase());
                    const isShiftMtc = emp ? isShiftMtcEmployee(emp) : false;
                    const shiftMtcGrp = isShiftMtc && emp ? getShiftMtcGroup(emp) : null;

                    return (
                      <tr key={`${item.noReg}_${item.tanggal}_${idx}`} className="group hover:bg-slate-50/50 transition-colors">
                        <td className="py-3 px-1 w-[32px] min-w-[32px] max-w-[32px] text-center font-bold text-slate-400 sticky left-0 bg-white group-hover:bg-slate-50/80 transition-colors z-20">{startIndex + idx + 1}</td>
                        <td className="py-3 px-1.5 w-[70px] min-w-[70px] max-w-[70px] font-mono font-bold text-slate-900 truncate sticky left-[32px] bg-white group-hover:bg-slate-50/80 transition-colors z-20">{item.noReg}</td>
                        <td className="py-3 px-2 w-[110px] sm:w-[150px] min-w-[110px] sm:min-w-[150px] max-w-[110px] sm:max-w-[150px] font-semibold text-slate-900 truncate sticky left-[102px] bg-white group-hover:bg-slate-50/80 transition-colors z-20 border-r border-slate-200/80 shadow-[2px_0_4px_-1px_rgba(0,0,0,0.08)]" title={item.nama}>{item.nama}</td>
                        <td className="py-3 px-4 text-slate-500 font-medium">{item.jabatan || '-'}</td>
                        <td className="py-3 px-4">
                          <div className="flex flex-col gap-0.5">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-slate-50 border border-slate-200 uppercase tracking-wide w-fit">
                              {item.grup}
                            </span>
                            {shiftMtcGrp && (
                              <span className="text-[9px] font-extrabold text-amber-600 uppercase tracking-wider">
                                Shift {shiftMtcGrp}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-slate-600">{item.tanggal}</td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider border ${statusClass}`}>
                            {item.presensi}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-500 max-w-xs truncate" title={item.keterangan}>{item.keterangan || '-'}</td>
                        <td className="py-3 px-4 font-black text-slate-600 uppercase tracking-wider">{item.periode}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagination Footer */}
          <div className="bg-slate-50 border-t border-slate-100 px-4 py-3 flex items-center justify-between text-xs font-bold text-slate-500">
            <div>
              Menampilkan {Math.min(startIndex + 1, totalItems)} - {Math.min(startIndex + itemsPerPage, totalItems)} dari {totalItems} entri
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                className="px-3 py-1 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-slate-700 shadow-3xs disabled:opacity-50 transition cursor-pointer active:scale-95"
              >
                Sebelumnya
              </button>
              <span className="text-slate-800">Halaman {currentPage} dari {totalPages || 1}</span>
              <button
                type="button"
                disabled={currentPage === totalPages || totalPages === 0}
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                className="px-3 py-1 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-slate-700 shadow-3xs disabled:opacity-50 transition cursor-pointer active:scale-95"
              >
                Selanjutnya
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
