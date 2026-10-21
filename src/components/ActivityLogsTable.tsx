/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { formatLokalWaktu } from '../utils';
import { Search, Trash2, Download, AlertCircle, Info, Calendar, Monitor, Wifi, HelpCircle } from 'lucide-react';

interface ActivityLog {
  id: string;
  timestamp: string;
  group: string;
  action: string;
  device: string;
  network: string;
  details: string;
}

interface ActivityLogsTableProps {
  logs: ActivityLog[];
  onClearLogs: () => void;
}

export default function ActivityLogsTable({ logs, onClearLogs }: ActivityLogsTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(15);

  // Filter logs
  const filteredLogs = logs.filter(log => {
    const term = searchTerm.toLowerCase();
    return (
      log.action.toLowerCase().includes(term) ||
      log.details.toLowerCase().includes(term) ||
      log.group.toLowerCase().includes(term) ||
      log.device.toLowerCase().includes(term) ||
      log.network.toLowerCase().includes(term)
    );
  });

  // Pagination calculations
  const totalItems = filteredLogs.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedLogs = filteredLogs.slice(startIndex, startIndex + itemsPerPage);

  // Export to CSV
  const handleExportCSV = () => {
    if (logs.length === 0) return;
    
    // CSV headers
    const headers = ['Waktu', 'Pengguna / Grup', 'Aksi / Kegiatan', 'Perangkat / Device', 'Jaringan / ISP', 'Detail Aktivitas'];
    
    // CSV rows
    const rows = logs.map(log => [
      formatLokalWaktu(log.timestamp),
      log.group,
      log.action,
      log.device,
      log.network,
      log.details
    ]);

    // Format fields with quotes to prevent parsing errors on commas
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
      + [headers, ...rows].map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(",")).join("\n");
      
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `SPK_LOG_AKTIVITAS_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleClearConfirm = () => {
    const confirmed = window.confirm('Apakah Anda yakin ingin menghapus seluruh log aktivitas sistem? Tindakan ini tidak dapat dibatalkan.');
    if (confirmed) {
      onClearLogs();
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col overflow-hidden animate-fade-in">
      {/* Header Panel */}
      <div className="p-6 border-b border-slate-150 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
              <Calendar className="w-5 h-5" />
            </div>
            <h3 className="font-extrabold text-slate-800 text-sm uppercase tracking-wider">Log Aktivitas Sistem</h3>
          </div>
          <p className="text-xs text-slate-450 mt-1">
            Merekam akses masuk, pengiriman nilai, dan perubahan database oleh admin secara real-time.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {logs.length > 0 && (
            <>
              <button
                type="button"
                onClick={handleExportCSV}
                className="px-3.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold uppercase tracking-wider rounded-lg flex items-center gap-1.5 transition cursor-pointer active:scale-95"
              >
                <Download className="w-3.5 h-3.5" />
                Unduh CSV
              </button>
              <button
                type="button"
                onClick={handleClearConfirm}
                className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold uppercase tracking-wider rounded-lg flex items-center gap-1.5 transition cursor-pointer active:scale-95"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Bersihkan Log
              </button>
            </>
          )}
        </div>
      </div>

      {/* Info Tips */}
      <div className="mx-6 mt-4 p-3.5 bg-amber-50/50 border border-amber-100 rounded-xl text-xs text-amber-850 leading-relaxed flex items-start gap-2.5">
        <Info className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
        <div>
          <p className="font-bold">Keamanan & Informasi Jaringan</p>
          <p className="mt-0.5 text-amber-800">
            Sesuai regulasi sandbox browser, nama Wifi (SSID) tidak dapat diakses secara langsung oleh JavaScript. Sebagai gantinya, sistem mendeteksi <strong>Provider Internet / ISP (seperti Biznet, Telkomsel, Indihome)</strong> dan <strong>jenis sinyal (4G/Wifi/RTT)</strong> secara spesifik untuk memonitor jaringan akses KSS.
          </p>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="p-6 border-b border-slate-150 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cari aktivitas, grup, perangkat, ISP..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full text-xs py-2 bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all duration-150"
          />
        </div>

        <select
          value={itemsPerPage}
          onChange={(e) => {
            setItemsPerPage(Number(e.target.value));
            setCurrentPage(1);
          }}
          className="text-xs py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer text-slate-700 font-semibold"
        >
          <option value={15}>15 Baris</option>
          <option value={30}>30 Baris</option>
          <option value={50}>50 Baris</option>
          <option value={100}>100 Baris</option>
        </select>
      </div>

      {/* Logs Table with frozen header */}
      <div className="overflow-x-auto max-h-[500px] overflow-y-auto relative rounded-xl border border-slate-200 shadow-xs bg-white">
        <table className="w-full text-left border-collapse min-w-[950px]">
          <thead className="sticky top-0 bg-slate-50 z-10 shadow-[0_1px_0_0_rgba(226,232,240,1)]">
            <tr className="bg-slate-50 text-[10.5px] font-black uppercase text-slate-500 tracking-wider whitespace-nowrap">
              <th className="py-3 px-4 w-40">Waktu</th>
              <th className="py-3 px-4 w-32">Pengguna</th>
              <th className="py-3 px-4 w-52">Aksi / Kegiatan</th>
              <th className="py-3 px-4 w-56">Perangkat / Device</th>
              <th className="py-3 px-4 w-56">Jaringan / ISP</th>
              <th className="py-3 px-4">Detail Aktivitas</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs">
            {paginatedLogs.length > 0 ? (
              paginatedLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/40 transition-colors whitespace-nowrap bg-white text-slate-700">
                  <td className="py-2.5 px-4 font-mono font-medium text-slate-500 whitespace-nowrap">
                    {formatLokalWaktu(log.timestamp)}
                  </td>
                  <td className="py-2.5 px-4 font-bold text-slate-800 whitespace-nowrap">
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                      log.group === 'ADMIN' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                      log.group === 'UMUM' ? 'bg-slate-100 text-slate-800 border border-slate-200' :
                      'bg-blue-100 text-blue-800 border border-blue-200'
                    }`}>
                      {log.group}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 font-extrabold text-slate-800 whitespace-nowrap">
                    {log.action}
                  </td>
                  <td className="py-2.5 px-4 text-slate-500 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <Monitor className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="font-medium truncate max-w-[200px]" title={log.device}>{log.device}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-4 text-slate-500 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <Wifi className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      <span className="font-extrabold text-slate-700 truncate max-w-[200px]" title={log.network}>{log.network}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-4 text-slate-600 font-medium whitespace-normal leading-relaxed">
                    {log.details}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="py-16 text-center text-slate-400 bg-white">
                  <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="font-bold text-slate-700 uppercase tracking-wider">Belum Ada Log Terdaftar</p>
                  <p className="text-[11px] text-slate-450 mt-1">Aktivitas sistem akan muncul di sini secara real-time.</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="p-4 bg-slate-50/50 border-t border-slate-150 flex items-center justify-between gap-4 text-xs">
          <span className="font-semibold text-slate-500">
            Menampilkan <strong className="text-slate-700">{startIndex + 1}</strong> - <strong className="text-slate-700">{Math.min(startIndex + itemsPerPage, totalItems)}</strong> dari <strong className="text-slate-700">{totalItems}</strong> hasil
          </span>

          <div className="flex gap-1.5">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-md text-slate-600 font-bold hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white transition cursor-pointer"
            >
              Prev
            </button>
            
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let targetPage = i + 1;
              if (currentPage > 3 && totalPages > 5) {
                if (currentPage + 2 <= totalPages) {
                  targetPage = currentPage - 3 + i + 1;
                } else {
                  targetPage = totalPages - 5 + i + 1;
                }
              }
              return (
                <button
                  key={targetPage}
                  onClick={() => setCurrentPage(targetPage)}
                  className={`w-8 h-8 rounded-md font-bold transition cursor-pointer ${
                    currentPage === targetPage
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {targetPage}
                </button>
              );
            })}

            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-md text-slate-600 font-bold hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white transition cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
