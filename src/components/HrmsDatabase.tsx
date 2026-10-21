/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { HrmsRecord, Employee } from '../types';
import { Search, RefreshCw, FileSpreadsheet, ArrowUpDown, Database, AlertCircle, Sparkles, Filter, Calendar } from 'lucide-react';
import { fetchHrmsRecordsFromSheet } from '../services/dataSyncService';
import { MONTH_NAMES_ID, matchesMonthAndYear, extractAvailableYears } from '../utils';

interface HrmsDatabaseProps {
  records: HrmsRecord[];
  employees: Employee[];
  onSyncRecords: (newRecords: HrmsRecord[]) => void;
  onShowAlert: (title: string, message: string) => void;
  webhookUrl?: string;
}

export default function HrmsDatabase({
  records,
  employees = [],
  onSyncRecords,
  onShowAlert,
  webhookUrl,
}: HrmsDatabaseProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<string>('ALL');
  const [selectedYear, setSelectedYear] = useState<string>('ALL');
  const [selectedGroup, setSelectedGroup] = useState<string>('ALL');
  const [isSyncing, setIsSyncing] = useState(false);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Sorting
  const [sortField, setSortField] = useState<'noReg' | 'nama' | 'kualitas' | 'kuantitas' | 'kehadiran' | 'kedisiplinan' | 'skor' | 'periode'>('periode');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const handleSort = (field: 'noReg' | 'nama' | 'kualitas' | 'kuantitas' | 'kehadiran' | 'kedisiplinan' | 'skor' | 'periode') => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
    setCurrentPage(1);
  };

  // Sync function that pulls and parses HRMS sheet CSV
  const handleSyncFromSpreadsheet = async () => {
    setIsSyncing(true);
    try {
      const parsedRecords = await fetchHrmsRecordsFromSheet();

      if (parsedRecords.length === 0) {
        throw new Error('Tidak ada data karyawan valid yang berhasil diproses dari sheet HRMS.');
      }

      onSyncRecords(parsedRecords);
      onShowAlert(
        'Sinkronisasi Berhasil',
        `Berhasil memuat ${parsedRecords.length} rekaman HRMS dari Google Spreadsheet.`
      );
    } catch (err: any) {
      console.error(err);
      onShowAlert(
        'Sinkronisasi Gagal',
        `Gagal menyinkronkan data HRMS dari Spreadsheet.\n\nDetail: ${err.message || err}`
      );
    } finally {
      setIsSyncing(false);
    }
  };

  // Available years sorted descending (e.g. 2026, 2025, 2024)
  const availableYears = React.useMemo(() => {
    return extractAvailableYears(records.map(r => r.periode));
  }, [records]);

  // Helper to find employee's group
  const getEmployeeGroup = (noReg: string) => {
    const normNoReg = noReg.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    const emp = employees.find(e => e.noReg.trim().toLowerCase().replace(/[^a-z0-9]/g, '') === normNoReg);
    return emp ? emp.grup : 'NS'; // default or fallback if not found
  };

  // Filter & Search Records
  const filteredRecords = records.filter((r) => {
    const matchesSearch =
      r.nama.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.noReg.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesPeriod = matchesMonthAndYear(r.periode, selectedMonth, selectedYear);
    const empGroup = getEmployeeGroup(r.noReg);
    const matchesGroup = selectedGroup === 'ALL' || empGroup === selectedGroup;
    return matchesSearch && matchesPeriod && matchesGroup;
  });

  // Sort Records
  const sortedRecords = [...filteredRecords].sort((a, b) => {
    let valA: any = a[sortField];
    let valB: any = b[sortField];

    if (typeof valA === 'string') {
      valA = valA.toLowerCase();
      valB = valB.toLowerCase();
    }

    if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
    if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  // Get all unique extra column names present in current records
  const dynamicExtraHeaders = React.useMemo(() => {
    const keys = new Set<string>();
    records.forEach(r => {
      if (r.extraColumns) {
        Object.keys(r.extraColumns).forEach(k => keys.add(k));
      }
    });
    return Array.from(keys);
  }, [records]);

  // Pagination Logic
  const totalItems = sortedRecords.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = sortedRecords.slice(indexOfFirstItem, indexOfLastItem);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedMonth, selectedYear, selectedGroup, itemsPerPage]);

  // HRMS Metrics
  const avgKualitas = filteredRecords.length ? (filteredRecords.reduce((acc, curr) => acc + curr.kualitas, 0) / filteredRecords.length).toFixed(1) : '0';
  const avgKuantitas = filteredRecords.length ? (filteredRecords.reduce((acc, curr) => acc + curr.kuantitas, 0) / filteredRecords.length).toFixed(1) : '0';
  const avgKehadiran = filteredRecords.length ? (filteredRecords.reduce((acc, curr) => acc + curr.kehadiran, 0) / filteredRecords.length).toFixed(1) : '0';
  const avgKedisiplinan = filteredRecords.length ? (filteredRecords.reduce((acc, curr) => acc + curr.kedisiplinan, 0) / filteredRecords.length).toFixed(1) : '0';
  const avgSkor = filteredRecords.length ? (filteredRecords.reduce((acc, curr) => acc + curr.skor, 0) / filteredRecords.length).toFixed(1) : '0';

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden flex flex-col h-full animate-fade-in" id="hrms-database-panel">
      
      {/* Header section with brand color matching the system */}
      <div className="p-5 sm:p-6 border-b border-slate-150 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-50 border border-indigo-150 text-indigo-600 rounded-xl flex items-center justify-center shadow-3xs">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider">Modul Data HRMS</h3>
            <p className="text-[11px] text-slate-450 mt-0.5">Sinkronisasi & histori data penilaian HRMS operator</p>
          </div>
        </div>

        <button
          type="button"
          disabled={isSyncing}
          onClick={handleSyncFromSpreadsheet}
          className={`px-4 py-2 text-xs font-extrabold uppercase tracking-wider text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:opacity-50 transition-all duration-150 rounded-xl shadow-xs flex items-center justify-center gap-2 cursor-pointer ${
            isSyncing ? 'animate-pulse' : ''
          }`}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
          {isSyncing ? 'Menyinkronkan...' : 'Re-Sync HRMS'}
        </button>
      </div>

      {/* Info Warning Banner */}
      <div className="px-5 pt-5">
        <div className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl flex items-start gap-2.5 text-indigo-950 text-[11px] leading-relaxed">
          <AlertCircle className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
          <div>
            KSS dapat melihat log rekapitulasi performa HRMS di bawah ini. Jika Anda merubah, menambah, atau memindahkan data HRMS di spreadsheet utama (Sheet <strong className="text-indigo-700 font-bold">HRMS</strong>), silakan klik tombol <strong className="text-indigo-700 font-bold">Re-Sync HRMS</strong> di atas agar data diperbarui secara instan.
          </div>
        </div>
      </div>

      {/* Stats row with averages */}
      <div className="px-5 pt-4 grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-center">
          <span className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider">Kualitas</span>
          <span className="text-lg font-black text-slate-700">{avgKualitas}</span>
        </div>
        <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-center">
          <span className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider">Kuantitas</span>
          <span className="text-lg font-black text-slate-700">{avgKuantitas}</span>
        </div>
        <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-center">
          <span className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider">Kehadiran</span>
          <span className="text-lg font-black text-slate-700">{avgKehadiran}</span>
        </div>
        <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-center">
          <span className="block text-[10px] uppercase font-bold text-slate-400 tracking-wider">Disiplin</span>
          <span className="text-lg font-black text-slate-700">{avgKedisiplinan}</span>
        </div>
        <div className="p-3 bg-indigo-50/30 border border-indigo-100/55 col-span-2 sm:col-span-1 rounded-xl text-center">
          <span className="block text-[10px] uppercase font-bold text-indigo-400 tracking-wider">Skor</span>
          <span className="text-lg font-black text-indigo-700">{avgSkor}</span>
        </div>
      </div>

      {/* Filter and search bar controls */}
      <div className="p-5 sm:p-6 flex flex-col md:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Cari berdasarkan Nama atau No. Reg..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition outline-none text-slate-700 font-medium"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto shrink-0">
          {/* Filter Grup */}
          <div className="relative w-full md:w-36">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-xs border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition bg-white text-slate-700 font-extrabold cursor-pointer appearance-none"
            >
              <option value="ALL">Semua Grup</option>
              <option value="A">Grup A</option>
              <option value="B">Grup B</option>
              <option value="C">Grup C</option>
              <option value="NS">Non-Shift</option>
              <option value="MTC">Maintenance</option>
              <option value="LAB">Laborat</option>
              <option value="QC">QC</option>
            </select>
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-[9px] font-bold">▼</span>
          </div>

          {/* Filter Bulan */}
          <div className="relative w-full md:w-36">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-xs border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition bg-white text-slate-700 font-extrabold cursor-pointer appearance-none"
              title="Filter Bulan"
            >
              <option value="ALL">Semua Bulan</option>
              {MONTH_NAMES_ID.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-[9px] font-bold">▼</span>
          </div>

          {/* Filter Tahun */}
          <div className="relative w-full md:w-32">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-xs border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition bg-white text-slate-700 font-extrabold cursor-pointer appearance-none"
              title="Filter Tahun"
            >
              <option value="ALL">Semua Tahun</option>
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-[9px] font-bold">▼</span>
          </div>

          <div className="relative w-28 shrink-0">
            <select
              value={itemsPerPage}
              onChange={(e) => setItemsPerPage(Number(e.target.value))}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl outline-none bg-white text-slate-600 font-bold cursor-pointer appearance-none"
            >
              <option value={10}>10 Baris</option>
              <option value={25}>25 Baris</option>
              <option value={50}>50 Baris</option>
              <option value={100}>100 Baris</option>
            </select>
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-[9px] font-bold">▼</span>
          </div>
        </div>
      </div>

      {/* Main Table View */}
      <div className="flex-1 overflow-x-auto min-h-[300px] border-t border-slate-100">
        {currentItems.length > 0 ? (
          <table className="w-full text-left border-collapse" style={{ minWidth: `${700 + dynamicExtraHeaders.length * 100}px` }}>
            <thead>
              <tr className="bg-slate-50 text-[10px] font-black uppercase text-slate-500 tracking-wider border-b border-slate-150 sticky top-0 z-10">
                <th className="py-3 px-4 w-12 text-center">No</th>
                <th onClick={() => handleSort('noReg')} className="py-3 px-4 cursor-pointer hover:bg-slate-100/80 hover:text-slate-800 transition">
                  <div className="flex items-center gap-1">
                    No. Reg <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th onClick={() => handleSort('nama')} className="py-3 px-4 cursor-pointer hover:bg-slate-100/80 hover:text-slate-800 transition">
                  <div className="flex items-center gap-1">
                    Nama Karyawan <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th onClick={() => handleSort('kualitas')} className="py-3 px-3 text-center cursor-pointer hover:bg-slate-100/80 hover:text-slate-800 transition w-24">
                  <div className="flex items-center justify-center gap-1">
                    Kualitas <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th onClick={() => handleSort('kuantitas')} className="py-3 px-3 text-center cursor-pointer hover:bg-slate-100/80 hover:text-slate-800 transition w-24">
                  <div className="flex items-center justify-center gap-1">
                    Kuantitas <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th onClick={() => handleSort('kehadiran')} className="py-3 px-3 text-center cursor-pointer hover:bg-slate-100/80 hover:text-slate-800 transition w-24">
                  <div className="flex items-center justify-center gap-1">
                    Kehadiran <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th onClick={() => handleSort('kedisiplinan')} className="py-3 px-3 text-center cursor-pointer hover:bg-slate-100/80 hover:text-slate-800 transition w-24">
                  <div className="flex items-center justify-center gap-1">
                    Disiplin <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th onClick={() => handleSort('skor')} className="py-3 px-3 text-center cursor-pointer hover:bg-slate-100/80 hover:text-slate-800 transition w-20">
                  <div className="flex items-center justify-center gap-1">
                    Skor <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                {dynamicExtraHeaders.map(hName => (
                  <th key={hName} className="py-3 px-3 text-center text-[10px] font-black uppercase text-slate-500 tracking-wider min-w-[100px]">
                    {hName}
                  </th>
                ))}
                <th onClick={() => handleSort('periode')} className="py-3 px-4 cursor-pointer hover:bg-slate-100/80 hover:text-slate-800 transition w-32">
                  <div className="flex items-center gap-1">
                    Periode <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-600 font-sans">
              {currentItems.map((record, index) => {
                const globalIndex = indexOfFirstItem + index + 1;
                return (
                  <tr key={`${record.noReg}_${record.periode}_${index}`} className="hover:bg-slate-50/50 transition duration-150">
                    <td className="py-3 px-4 font-mono text-center text-slate-400 font-bold">{globalIndex}</td>
                    <td className="py-3 px-4 font-mono font-bold text-slate-800">{record.noReg}</td>
                    <td className="py-3 px-4 font-semibold text-slate-700">{record.nama}</td>
                    <td className="py-3 px-3 text-center font-mono font-bold">{record.kualitas}</td>
                    <td className="py-3 px-3 text-center font-mono font-bold">{record.kuantitas}</td>
                    <td className="py-3 px-3 text-center font-mono font-bold">{record.kehadiran}</td>
                    <td className="py-3 px-3 text-center font-mono font-bold">{record.kedisiplinan}</td>
                    <td className="py-3 px-3 text-center font-mono font-black text-indigo-650 bg-indigo-50/10">{record.skor}</td>
                    {dynamicExtraHeaders.map(hName => {
                      const val = record.extraColumns?.[hName];
                      return (
                        <td key={hName} className="py-3 px-3 text-center font-mono font-bold text-slate-700 bg-slate-50/20">
                          {val !== undefined && val !== null ? val : '-'}
                        </td>
                      );
                    })}
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border bg-slate-50 border-slate-200 text-slate-600">
                        <Calendar className="w-2.5 h-2.5" />
                        {record.periode}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="py-12 text-center text-slate-400 font-medium">
            <FileSpreadsheet className="w-10 h-10 mx-auto text-slate-250 mb-3" />
            <p>Tidak ada data HRMS yang sesuai dengan filter pencarian.</p>
          </div>
        )}
      </div>

      {/* Footer Pagination bar */}
      {totalPages > 1 && (
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs">
          <span className="text-slate-400 font-medium font-sans">
            Menampilkan <strong className="text-slate-700 font-bold">{indexOfFirstItem + 1}</strong> s.d{' '}
            <strong className="text-slate-700 font-bold">{Math.min(indexOfLastItem, totalItems)}</strong> dari{' '}
            <strong className="text-slate-700 font-bold">{totalItems}</strong> rekaman
          </span>

          <div className="flex items-center gap-1.5 font-bold font-sans">
            <button
              type="button"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(curr => Math.max(curr - 1, 1))}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 transition text-slate-600 font-bold cursor-pointer"
            >
              Prev
            </button>
            
            {Array.from({ length: totalPages }).map((_, idx) => {
              const pIdx = idx + 1;
              // Show a window of page numbers around current page
              if (totalPages > 5 && Math.abs(currentPage - pIdx) > 1 && pIdx !== 1 && pIdx !== totalPages) {
                if (pIdx === 2 || pIdx === totalPages - 1) {
                  return <span key={pIdx} className="px-1 text-slate-350 select-none">...</span>;
                }
                return null;
              }
              return (
                <button
                  key={pIdx}
                  type="button"
                  onClick={() => setCurrentPage(pIdx)}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center border transition font-bold cursor-pointer ${
                    currentPage === pIdx
                      ? 'bg-indigo-600 border-indigo-600 text-white shadow-3xs'
                      : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600'
                  }`}
                >
                  {pIdx}
                </button>
              );
            })}

            <button
              type="button"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(curr => Math.min(curr + 1, totalPages))}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 transition text-slate-600 font-bold cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
