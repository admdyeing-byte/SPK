/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  Download,
  Copy,
  Check,
  X,
  FileSpreadsheet,
  AlertCircle,
  Search,
  CheckCircle2,
  Calendar,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { Evaluation, Employee } from '../types';
import {
  getEvaluationsForCsvExport,
  generateCsvContent,
  downloadCsvFile,
  CsvEvaluationRow,
} from '../utils/csvExport';
import { updateGoogleSheetCsvTab } from '../services/googleSheetsService';
import { extractMonthAndYearFromPeriod, extractAvailableYears, MONTH_NAMES_ID } from '../utils';

interface CsvExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  evaluations: Evaluation[];
  employees: Employee[];
  initialPeriod?: string;
  availablePeriods: string[];
  accessToken?: string | null;
  spreadsheetId?: string;
}

export const CsvExportModal: React.FC<CsvExportModalProps> = ({
  isOpen,
  onClose,
  evaluations,
  employees,
  initialPeriod = 'Juli 2026',
  availablePeriods,
  accessToken,
  spreadsheetId,
}) => {
  const initParsed = useMemo(() => {
    return extractMonthAndYearFromPeriod(initialPeriod || availablePeriods[0] || 'Juli 2026');
  }, [initialPeriod, availablePeriods]);

  const [selectedMonth, setSelectedMonth] = useState<string>(initParsed.month || 'Juli');
  const [selectedYear, setSelectedYear] = useState<string>(initParsed.year || '2026');

  const selectedPeriod = `${selectedMonth} ${selectedYear}`;

  const availableYears = useMemo(() => {
    return extractAvailableYears(availablePeriods);
  }, [availablePeriods]);

  const [delimiter, setDelimiter] = useState<',' | ';'>(',');
  const [searchTerm, setSearchTerm] = useState('');
  const [copied, setCopied] = useState(false);
  const [isPushingToSheets, setIsPushingToSheets] = useState(false);
  const [pushStatus, setPushStatus] = useState<{
    type: 'success' | 'error' | null;
    message: string;
  }>({ type: null, message: '' });

  // Update selectedMonth and selectedYear if modal opens with a specific valid period
  React.useEffect(() => {
    if (initialPeriod && initialPeriod !== 'ALL') {
      const parsed = extractMonthAndYearFromPeriod(initialPeriod);
      if (parsed.month) setSelectedMonth(parsed.month);
      if (parsed.year) setSelectedYear(parsed.year);
    }
  }, [initialPeriod, isOpen]);

  // Compute export data according to user business rules
  const exportSummary = useMemo(() => {
    return getEvaluationsForCsvExport(evaluations, selectedPeriod, employees);
  }, [evaluations, selectedPeriod, employees]);

  // Filtered rows for UI preview table
  const previewRows = useMemo(() => {
    if (!searchTerm.trim()) return exportSummary.rows;
    const q = searchTerm.toLowerCase();
    return exportSummary.rows.filter(
      (r) =>
        r.nik.toLowerCase().includes(q) ||
        r.namaKaryawan.toLowerCase().includes(q) ||
        r.grup.toLowerCase().includes(q)
    );
  }, [exportSummary.rows, searchTerm]);

  if (!isOpen) return null;

  const filename = `Penilaian_Karyawan_${selectedPeriod.replace(/\s+/g, '_')}.csv`;

  const handleDownload = () => {
    const csvString = generateCsvContent(exportSummary.rows, delimiter);
    downloadCsvFile(csvString, filename);
  };

  const handleCopy = async () => {
    const csvString = generateCsvContent(exportSummary.rows, delimiter);
    try {
      await navigator.clipboard.writeText(csvString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = csvString;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handlePushToGoogleSheets = async () => {
    if (!accessToken || !spreadsheetId) return;
    setIsPushingToSheets(true);
    setPushStatus({ type: null, message: '' });

    try {
      const res = await updateGoogleSheetCsvTab(
        accessToken,
        spreadsheetId,
        exportSummary.rows
      );

      if (res.success) {
        setPushStatus({
          type: 'success',
          message: `Berhasil memperbarui sheet 'CSV' dengan ${res.updatedRows} data karyawan!`,
        });
      } else {
        setPushStatus({
          type: 'error',
          message: res.error || 'Gagal memperbarui tab CSV di Google Sheets.',
        });
      }
    } catch (err: any) {
      setPushStatus({
        type: 'error',
        message: err.message || 'Terjadi kesalahan sistem saat sinkronisasi.',
      });
    } finally {
      setIsPushingToSheets(false);
    }
  };

  return (
    <div
      id="csv-export-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-sm animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id="csv-export-modal-content"
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-scaleIn"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-150 flex items-center justify-between bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 text-white">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg flex items-center gap-2">
                Download Rekap CSV Penilaian
                <span className="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-700/60 font-mono px-2 py-0.5 rounded-full">
                  Format Header SPK
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Menghimpun seluruh penilaian sheet A, B, C, NS, QC, MTC, dan LAB (Khusus MTC Shift diambil dari sheet MTC saja)
              </p>
            </div>
          </div>
          <button
            id="csv-export-close-button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-slate-700 flex-1">
          {/* Controls: Period Selection & Delimiter */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-blue-600" />
                Pilih Bulan & Tahun Penilaian:
              </label>
              <div className="grid grid-cols-2 gap-2">
                <select
                  id="csv-month-select"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="w-full bg-white border border-slate-300 text-slate-800 text-xs font-semibold py-2 px-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-3xs"
                  title="Pilih Bulan"
                >
                  {MONTH_NAMES_ID.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <select
                  id="csv-year-select"
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="w-full bg-white border border-slate-300 text-slate-800 text-xs font-semibold py-2 px-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-3xs"
                  title="Pilih Tahun"
                >
                  {availableYears.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-emerald-600" />
                Format Karakter Pemisah (Delimiter):
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDelimiter(',')}
                  className={`flex-1 py-1.5 px-3 text-xs font-bold rounded-lg border transition ${
                    delimiter === ','
                      ? 'bg-blue-50 text-blue-800 border-blue-300 ring-1 ring-blue-400'
                      : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  Koma (,) <span className="text-[10px] font-normal text-slate-500">Google Sheets / Standard</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDelimiter(';')}
                  className={`flex-1 py-1.5 px-3 text-xs font-bold rounded-lg border transition ${
                    delimiter === ';'
                      ? 'bg-blue-50 text-blue-800 border-blue-300 ring-1 ring-blue-400'
                      : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  Titik Koma (;) <span className="text-[10px] font-normal text-slate-500">Excel Regional ID</span>
                </button>
              </div>
            </div>
          </div>

          {/* Rule Notification Banner */}
          <div className="p-3 bg-sky-50 border border-sky-200 rounded-xl text-xs space-y-1.5">
            <div className="flex items-center gap-2 text-sky-900 font-bold">
              <CheckCircle2 className="w-4 h-4 text-sky-600 shrink-0" />
              <span>Struktur Kolom Sesuai Format Google Sheets:</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-1 text-[11px] font-mono text-center pt-1">
              <div className="bg-white p-1 rounded border border-sky-200">
                <strong className="text-sky-800">NIK</strong>
                <span className="block text-[9px] text-slate-500">(dari No.Reg)</span>
              </div>
              <div className="bg-white p-1 rounded border border-sky-200">
                <strong className="text-sky-800">Nama Karyawan</strong>
                <span className="block text-[9px] text-slate-500">(dari NAMA)</span>
              </div>
              <div className="bg-white p-1 rounded border border-sky-200">
                <strong className="text-sky-800">KUALITAS</strong>
                <span className="block text-[9px] text-slate-500">(Kualitas)</span>
              </div>
              <div className="bg-white p-1 rounded border border-sky-200">
                <strong className="text-sky-800">KUANTITAS</strong>
                <span className="block text-[9px] text-slate-500">(Kuantitas)</span>
              </div>
              <div className="bg-white p-1 rounded border border-slate-200 text-slate-400">
                <strong>KEHADIRAN</strong>
                <span className="block text-[9px] text-slate-400">(Kosong)</span>
              </div>
              <div className="bg-white p-1 rounded border border-slate-200 text-slate-400">
                <strong>KEDISIPLINAN</strong>
                <span className="block text-[9px] text-slate-400">(Kosong)</span>
              </div>
            </div>

            <p className="text-[11px] text-sky-800 pt-1 leading-relaxed">
              💡 <strong>Aturan Khusus Opt. MTC Shift:</strong> Nilai diambil murni dari sheet <strong>MTC</strong>.
              {exportSummary.mtcShiftFilteredOutCount > 0 ? (
                <span className="ml-1 text-amber-700 font-semibold">
                  (Sebanyak {exportSummary.mtcShiftFilteredOutCount} input Shift untuk MTC dikesampingkan agar tidak bertabrakan/ganda).
                </span>
              ) : (
                ' Penilaian KSS Shift untuk MTC tidak diduplikasi.'
              )}
            </p>
          </div>

          {/* Statistics summary chips */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="bg-slate-800 text-white px-3 py-1.5 rounded-lg font-mono font-bold flex items-center gap-1.5 shadow-3xs">
              <span>Total Data:</span>
              <span className="text-emerald-400 text-sm">{exportSummary.totalUniqueEmployees} Karyawan</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {(['A', 'B', 'C', 'NS', 'MTC', 'LAB', 'QC'] as const).map((g) => (
                <span
                  key={g}
                  className="bg-slate-100 border border-slate-200 text-slate-700 px-2 py-1 rounded text-[11px] font-mono font-semibold"
                >
                  {g}: <strong className="text-slate-900">{exportSummary.groupCounts[g] || 0}</strong>
                </span>
              ))}
            </div>
          </div>

          {/* Push status alert if available */}
          {pushStatus.message && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
                pushStatus.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              <div className="flex items-center gap-2">
                {pushStatus.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>{pushStatus.message}</span>
              </div>
              <button
                onClick={() => setPushStatus({ type: null, message: '' })}
                className="text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>
            </div>
          )}

          {/* Table Preview Search & Info */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-bold text-slate-700">
                Pratinjau Data CSV ({previewRows.length} dari {exportSummary.rows.length}):
              </span>
              <div className="relative max-w-xs w-full">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Cari NIK / Nama..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full text-xs py-1 pl-8 pr-3 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Table Container */}
            <div className="border border-slate-200 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse font-sans">
                <thead className="bg-slate-100 text-slate-700 font-extrabold sticky top-0 border-b border-slate-200 z-10">
                  <tr>
                    <th className="py-2 px-2.5 text-center text-slate-400 font-mono w-10">No</th>
                    <th className="py-2 px-2.5 font-mono">NIK</th>
                    <th className="py-2 px-2.5">Nama Karyawan</th>
                    <th className="py-2 px-2 text-center text-blue-700">KUALITAS</th>
                    <th className="py-2 px-2 text-center text-indigo-700">KUANTITAS</th>
                    <th className="py-2 px-2 text-center text-slate-400">KEHADIRAN</th>
                    <th className="py-2 px-2 text-center text-slate-400">KEDISIPLINAN</th>
                    <th className="py-2 px-2 text-center text-slate-500 font-mono">Sheet</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150 bg-white font-medium">
                  {previewRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400 italic">
                        {exportSummary.rows.length === 0
                          ? `Tidak ada data penilaian yang tersimpan untuk periode "${selectedPeriod}".`
                          : 'Tidak ada data yang cocok dengan kata kunci pencarian.'}
                      </td>
                    </tr>
                  ) : (
                    previewRows.map((r, idx) => (
                      <tr key={`${r.nik}-${idx}`} className="hover:bg-slate-50 transition">
                        <td className="py-1.5 px-2.5 text-center text-slate-400 font-mono text-[11px]">
                          {idx + 1}
                        </td>
                        <td className="py-1.5 px-2.5 font-mono font-bold text-slate-800">
                          {r.nik}
                        </td>
                        <td className="py-1.5 px-2.5 text-slate-800 uppercase font-semibold truncate max-w-[200px]" title={r.namaKaryawan}>
                          {r.namaKaryawan}
                        </td>
                        <td className="py-1.5 px-2 text-center font-bold text-blue-700 font-mono">
                          {r.kualitas}
                        </td>
                        <td className="py-1.5 px-2 text-center font-bold text-indigo-700 font-mono">
                          {r.kuantitas}
                        </td>
                        <td className="py-1.5 px-2 text-center text-slate-300 font-mono text-[10px]">
                          -
                        </td>
                        <td className="py-1.5 px-2 text-center text-slate-300 font-mono text-[10px]">
                          -
                        </td>
                        <td className="py-1.5 px-2 text-center">
                          <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                            {r.grup}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 border-t border-slate-150 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {/* Copy button */}
            <button
              id="csv-copy-btn"
              type="button"
              onClick={handleCopy}
              disabled={exportSummary.rows.length === 0}
              className="px-3.5 py-2 text-xs font-bold rounded-xl border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 transition shadow-3xs cursor-pointer"
              title="Salin konten CSV ke Clipboard"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700">Tersalin!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-500" />
                  <span>Salin CSV</span>
                </>
              )}
            </button>

            {/* Sync to Google Sheets 'CSV' tab if connected */}
            {accessToken && spreadsheetId && (
              <button
                id="csv-push-sheet-btn"
                type="button"
                onClick={handlePushToGoogleSheets}
                disabled={isPushingToSheets || exportSummary.rows.length === 0}
                className="px-3.5 py-2 text-xs font-bold rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 transition shadow-3xs cursor-pointer"
                title="Perbarui sheet 'CSV' langsung di Google Spreadsheet"
              >
                <FileSpreadsheet className={`w-3.5 h-3.5 text-emerald-600 ${isPushingToSheets ? 'animate-spin' : ''}`} />
                <span>{isPushingToSheets ? 'Menyimpan...' : "Simpan ke Sheet 'CSV'"}</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition cursor-pointer"
            >
              Tutup
            </button>

            {/* Main Download Button */}
            <button
              id="csv-download-main-btn"
              type="button"
              onClick={handleDownload}
              disabled={exportSummary.rows.length === 0}
              className="px-5 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition shadow-md cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Unduh CSV ({exportSummary.rows.length} Data)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
