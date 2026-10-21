/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Employee, GroupType } from '../types';
import { GROUPS, PREPOPULATED_EMPLOYEES } from '../data';
import { isSameEmployee, compareEmpId } from '../utils';
import { Search, RefreshCw, FileSpreadsheet, User, Trash2, ShieldAlert, ArrowUpDown, Database, AlertCircle, Sparkles, Pencil, Plus, X, Save, Copy, Check } from 'lucide-react';
import { isFirebaseActive, saveCloudEmployee, deleteCloudEmployee, deleteCloudMasterEmployee } from '../firebase';

interface EmployeeDatabaseProps {
  employees: Employee[];
  onSyncEmployees: (newEmployees: Employee[], isFromSpreadsheet?: boolean, oldNoReg?: string, newNoReg?: string) => void;
  onResetEmployees: () => void;
  onShowAlert: (title: string, message: string) => void;
  webhookUrl?: string;
  spreadsheetId?: string;
}

export default function EmployeeDatabase({
  employees,
  onSyncEmployees,
  onResetEmployees,
  onShowAlert,
  webhookUrl,
  spreadsheetId,
}: EmployeeDatabaseProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string>('ALL');
  const [isSyncing, setIsSyncing] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  
  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [showExporter, setShowExporter] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  
  const handleCopyHardcode = () => {
    const codeString = `export const PREPOPULATED_EMPLOYEES: Employee[] = ${JSON.stringify(
      employees.map(e => ({
        noReg: e.noReg,
        nama: e.nama,
        grup: e.grup,
        jabatan: e.jabatan
      })),
      null,
      2
    )};`;
    
    navigator.clipboard.writeText(codeString).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }).catch(err => {
      console.error('Failed to copy text:', err);
    });
  };
  
  // Form states
  const [formNoReg, setFormNoReg] = useState('');
  const [formNama, setFormNama] = useState('');
  const [formGrup, setFormGrup] = useState<GroupType>('A');
  const [formJabatan, setFormJabatan] = useState('');
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Keyboard confirmation listeners for Reset Dialog
  useEffect(() => {
    if (!showResetConfirm) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onResetEmployees();
        onShowAlert('Database Disetel Ulang', 'Database karyawan telah dikembalikan ke pengaturan bawaan aplikasi.');
        setShowResetConfirm(false);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setShowResetConfirm(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showResetConfirm, onResetEmployees, onShowAlert]);
  
  // Open Add Modal
  const handleOpenAddModal = () => {
    setFormNoReg('');
    setFormNama('');
    setFormGrup('A');
    setFormJabatan('');
    setFormError('');
    setIsAddModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (emp: Employee) => {
    setEditingEmployee(emp);
    setFormNoReg(emp.noReg);
    setFormNama(emp.nama);
    setFormGrup(emp.grup as GroupType);
    setFormJabatan(emp.jabatan || '');
    setFormError('');
  };

  // Sync to webhook
  const syncToSheetsWebhook = async (actionType: 'add' | 'edit' | 'delete', employee: Employee) => {
    if (!webhookUrl) return;
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'text/plain',
        },
        body: JSON.stringify({
          action: 'sync_employee_db',
          type: actionType,
          ...employee
        })
      });
    } catch (e) {
      console.warn('Sync to webhook failed, but saved locally:', e);
    }
  };

  // Handle Save (Add)
  const handleSaveAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const cleanNoReg = formNoReg.trim().toUpperCase();
    const cleanNama = formNama.trim().toUpperCase();
    const cleanJabatan = formJabatan.trim();

    if (!cleanNoReg || !cleanNama) {
      setFormError('No. Registrasi dan Nama wajib diisi.');
      return;
    }

    // Check duplicate No. Reg
    if (employees.some(emp => emp.noReg === cleanNoReg)) {
      setFormError(`Karyawan dengan No. Registrasi ${cleanNoReg} sudah terdaftar.`);
      return;
    }

    setIsSaving(true);

    // Auto-generate next sequential unique ID (EMP0000 format)
    let maxNumericId = 0;
    const existingPool = [...employees, ...PREPOPULATED_EMPLOYEES];
    existingPool.forEach(emp => {
      if (emp.empId) {
        const m = emp.empId.match(/EMP(\d+)/i);
        if (m) {
          const num = parseInt(m[1], 10);
          if (num > maxNumericId) maxNumericId = num;
        }
      }
    });
    if (maxNumericId === 0) maxNumericId = 1000;
    const generatedId = `EMP${String(maxNumericId + 1).padStart(4, '0')}`;

    const newEmp: Employee = {
      empId: generatedId,
      noReg: cleanNoReg,
      nama: cleanNama,
      grup: formGrup,
      jabatan: cleanJabatan || undefined
    };

    const updated = [newEmp, ...employees];
    onSyncEmployees(updated);
    
    if (isFirebaseActive) {
      await saveCloudEmployee(newEmp);
    }
    
    // Attempt webhook sync
    await syncToSheetsWebhook('add', newEmp);

    setIsSaving(false);
    setIsAddModalOpen(false);
    onShowAlert(
      'Karyawan Berhasil Ditambahkan',
      `Karyawan ${cleanNama} (No. Reg: ${cleanNoReg}) telah berhasil ditambahkan dan disimpan di database.`
    );
  };

  // Handle Save (Edit)
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployee) return;
    setFormError('');

    const cleanNoReg = formNoReg.trim().toUpperCase();
    const cleanNama = formNama.trim().toUpperCase();
    const cleanJabatan = formJabatan.trim();

    if (!cleanNoReg || !cleanNama) {
      setFormError('No. Registrasi dan Nama wajib diisi.');
      return;
    }

    // Check duplicate No. Reg (must not be used by other employees who have different empId)
    if (employees.some(emp => emp.noReg === cleanNoReg && emp.empId !== editingEmployee.empId)) {
      setFormError(`Karyawan dengan No. Registrasi ${cleanNoReg} sudah terdaftar.`);
      return;
    }

    setIsSaving(true);
    const updatedEmp: Employee = {
      empId: editingEmployee.empId,
      noReg: cleanNoReg,
      nama: cleanNama,
      grup: formGrup,
      jabatan: cleanJabatan || undefined
    };

    const updated = employees.map(emp => 
      emp.empId === editingEmployee.empId ? updatedEmp : emp
    );

    // Call sync on App level which will propagate changes to evaluations, hrms, and presensi records
    onSyncEmployees(updated, false, editingEmployee.noReg, cleanNoReg);

    if (isFirebaseActive) {
      // If No. Reg changed, delete the old records first to avoid stale entries
      if (cleanNoReg !== editingEmployee.noReg) {
        await deleteCloudEmployee(editingEmployee.noReg);
        await deleteCloudMasterEmployee(editingEmployee.noReg);
      }
      await saveCloudEmployee(updatedEmp);
    }

    // Attempt webhook sync
    await syncToSheetsWebhook('edit', updatedEmp);

    setIsSaving(false);
    setEditingEmployee(null);
    onShowAlert(
      'Karyawan Berhasil Diperbarui',
      `Data karyawan ${cleanNama} (No. Reg: ${cleanNoReg}) telah berhasil diperbarui dan disimpan di database.`
    );
  };

  // Handle Delete Employee
  const handleDeleteEmployee = async (emp: Employee) => {
    const confirmed = window.confirm(`Apakah Anda yakin ingin menghapus ${emp.nama} (No. Reg: ${emp.noReg}) dari database?`);
    if (!confirmed) return;

    const updated = employees.filter(item => item.noReg !== emp.noReg);
    onSyncEmployees(updated);

    if (isFirebaseActive) {
      await deleteCloudEmployee(emp.noReg);
    }

    // Attempt webhook sync
    await syncToSheetsWebhook('delete', emp);

    onShowAlert(
      'Karyawan Dihapus',
      `Karyawan ${emp.nama} telah berhasil dihapus dari database lokal.`
    );
  };

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Sorting
  const [sortField, setSortField] = useState<'empId' | 'noReg' | 'nama' | 'grup' | 'jabatan'>('empId');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleSort = (field: 'empId' | 'noReg' | 'nama' | 'grup' | 'jabatan') => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
    setCurrentPage(1);
  };

  // Sync function that pulls and parses DBKaryawan sheet CSV
  const handleSyncFromSpreadsheet = async () => {
    setIsSyncing(true);
    try {
      const activeSpreadsheetId = spreadsheetId || '12LeSP25CHhUqO5FxC2Ca407ArtTFSJbNPoR38D6J23I';
      const sheetUrl = `https://docs.google.com/spreadsheets/d/${activeSpreadsheetId}/gviz/tq?tqx=out:csv&sheet=DBKaryawan`;
      const res = await fetch(sheetUrl);
      if (!res.ok) {
        throw new Error('Gagal mengunduh file dari Google Sheets. Pastikan spreadsheet dapat diakses publik (Anyone with link can view).');
      }

      const csvText = await res.text();
      
      // Robust CSV Parser
      const parseCSVLine = (line: string): string[] => {
        const result: string[] = [];
        let curVal = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            result.push(curVal.trim().replace(/^"|"$/g, ''));
            curVal = '';
          } else {
            curVal += char;
          }
        }
        result.push(curVal.trim().replace(/^"|"$/g, ''));
        return result;
      };

      const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
      if (lines.length < 2) {
        throw new Error('Spreadsheet kosong atau format tidak sesuai.');
      }

      // Headers normalized
      const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().replace(/[\s\.\-_]/g, ''));
      
      // Find columns indices
      let noRegIdx = headers.indexOf('noreg');
      if (noRegIdx === -1) noRegIdx = headers.indexOf('no_reg');
      if (noRegIdx === -1) noRegIdx = headers.findIndex(h => h.includes('noreg') || h.includes('no_reg') || h.includes('register'));
      if (noRegIdx === -1) noRegIdx = headers.findIndex(h => h === 'no' && !headers.includes('noreg'));

      let empIdIdx = headers.indexOf('idunik');
      if (empIdIdx === -1) empIdIdx = headers.indexOf('empid');
      if (empIdIdx === -1) empIdIdx = headers.findIndex(h => h.includes('idunik') || h.includes('kodeunik') || h.includes('kode_unik') || h.includes('empid') || h === 'kode' || h === 'id_unik');

      let namaIdx = headers.indexOf('nama');
      if (namaIdx === -1) namaIdx = headers.findIndex(h => h.includes('nama') || h.includes('name'));

      let grupIdx = headers.indexOf('grup');
      if (grupIdx === -1) grupIdx = headers.findIndex(h => h.includes('grup') || h.includes('group') || h === 'g');

      let jabatanIdx = headers.indexOf('jab');
      if (jabatanIdx === -1) jabatanIdx = headers.indexOf('jabatan');
      if (jabatanIdx === -1) jabatanIdx = headers.findIndex(h => h.includes('jabatan') || h.includes('position') || h.includes('role') || h.includes('pekerjaan') || h.includes('jab'));

      const finalNoRegIdx = noRegIdx !== -1 ? noRegIdx : 3;
      const finalNamaIdx = namaIdx !== -1 ? namaIdx : 4;
      const finalGrupIdx = grupIdx !== -1 ? grupIdx : 2;
      const finalJabatanIdx = jabatanIdx !== -1 ? jabatanIdx : 5;

      const tempParsedEmployees: any[] = [];
      const seenNoReg = new Set<string>();

      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i]);
        if (cols.length < 2) continue;

        const rawNoReg = cols[finalNoRegIdx]?.trim();
        const rawNama = cols[finalNamaIdx]?.trim();
        const rawGrup = cols[finalGrupIdx]?.trim() || '';
        const rawJabatan = cols[finalJabatanIdx]?.trim() || '';
        
        let parsedEmpId = '';
        if (empIdIdx !== -1) {
          const rawId = cols[empIdIdx]?.trim() || '';
          const digitMatch = rawId.match(/\d+/);
          if (digitMatch) {
            parsedEmpId = `EMP${digitMatch[0].padStart(4, '0')}`;
          } else if (rawId) {
            parsedEmpId = rawId.toUpperCase();
          }
        }

        if (!rawNoReg || !rawNama) continue;

        const cleanNoReg = rawNoReg.toUpperCase();
        
        // Prevent duplicates
        if (seenNoReg.has(cleanNoReg)) continue;
        seenNoReg.add(cleanNoReg);

        tempParsedEmployees.push({
          noReg: cleanNoReg,
          nama: rawNama.toUpperCase(),
          grup: rawGrup.toUpperCase(),
          jabatan: rawJabatan,
          empId: parsedEmpId || undefined,
        });
      }

      if (tempParsedEmployees.length === 0) {
        throw new Error('Tidak ada data karyawan valid yang berhasil diekstrak dari CSV.');
      }

      // Resolve and assign stable sequential empIds
      const parsedEmployees: Employee[] = [];
      let maxNumericId = 0;

      // Find the highest existing numeric ID in either current employees or prepopulated pool
      const existingPool = [...employees, ...PREPOPULATED_EMPLOYEES];
      existingPool.forEach(emp => {
        if (emp.empId) {
          const m = emp.empId.match(/EMP(\d+)/i);
          if (m) {
            const num = parseInt(m[1], 10);
            if (num > maxNumericId) maxNumericId = num;
          }
        }
      });
      if (maxNumericId === 0) maxNumericId = 1000; // Safe starter base

      for (const rawEmp of tempParsedEmployees) {
        let finalEmpId = rawEmp.empId;
        if (!finalEmpId) {
          // Look up if they already exist in the system to preserve their code
          const matched = existingPool.find(existing => 
            isSameEmployee(rawEmp, existing)
          );
          if (matched && matched.empId) {
            finalEmpId = matched.empId;
          } else {
            // New employee! Generate next unique sequential ID
            maxNumericId++;
            finalEmpId = `EMP${String(maxNumericId).padStart(4, '0')}`;
          }
        }

        parsedEmployees.push({
          empId: finalEmpId,
          noReg: rawEmp.noReg,
          nama: rawEmp.nama,
          grup: rawEmp.grup,
          jabatan: rawEmp.jabatan,
        });
      }

      onSyncEmployees(parsedEmployees, true);
      onShowAlert(
        'Sinkronisasi Karyawan Sukses',
        `Berhasil memuat ulang database karyawan dari spreadsheet!\n\n• ${parsedEmployees.length} karyawan terdaftar di sistem.\n• Data disimpan secara lokal di perangkat Anda.`
      );
    } catch (err: any) {
      console.error(err);
      onShowAlert(
        'Sinkronisasi Karyawan Gagal',
        `Gagal menyinkronkan database karyawan dari Spreadsheet.\n\nDetail: ${err.message || err}`
      );
    } finally {
      setIsSyncing(false);
    }
  };

  // Filter & Search Logic
  const filtered = employees.filter(emp => {
    const matchesSearch = 
      emp.nama.toLowerCase().includes(searchTerm.toLowerCase()) || 
      emp.noReg.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (emp.jabatan && emp.jabatan.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesGroup = selectedGroup === 'ALL' || emp.grup === selectedGroup;

    return matchesSearch && matchesGroup;
  });

  // Sorting logic
  const sorted = [...filtered].sort((a, b) => {
    if (sortField === 'empId') {
      const cmp = compareEmpId(a.empId, b.empId, a.noReg, b.noReg);
      return sortDirection === 'asc' ? cmp : -cmp;
    }

    let valA = a[sortField] || '';
    let valB = b[sortField] || '';

    if (sortField === 'grup') {
      valA = a.grup;
      valB = b.grup;
    }

    if (sortDirection === 'asc') {
      return valA.localeCompare(valB);
    } else {
      return valB.localeCompare(valA);
    }
  });

  // Pagination calculations
  const totalItems = sorted.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedItems = sorted.slice(startIndex, startIndex + itemsPerPage);

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col overflow-hidden animate-fade-in">
      {/* Header Panel */}
      <div className="p-6 border-b border-slate-150 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
              <Database className="w-5 h-5" />
            </div>
            <h3 className="font-extrabold text-slate-800 text-sm uppercase tracking-wider">Database Karyawan (Admin Only)</h3>
          </div>
          <p className="text-xs text-slate-450 mt-1">Total database terdaftar: <strong className="font-bold text-slate-700">{employees.length} karyawan</strong></p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Add Employee Button */}
          <button
            type="button"
            onClick={handleOpenAddModal}
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold uppercase tracking-wider rounded-lg flex items-center gap-1.5 transition cursor-pointer active:scale-95 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Tambah Karyawan
          </button>

          <button
            type="button"
            onClick={handleSyncFromSpreadsheet}
            disabled={isSyncing}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-xs font-bold uppercase tracking-wider rounded-lg flex items-center gap-2 transition cursor-pointer active:scale-95 shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <FileSpreadsheet className="w-3.5 h-3.5" />
            {isSyncing ? 'Menyelaraskan...' : 'Sync Database'}
          </button>

          {showResetConfirm ? (
            <div className="flex items-center gap-1.5 bg-slate-100 border border-slate-200 p-1.5 rounded-lg">
              <span className="text-[10px] font-black text-slate-700 px-1">Sutera ulang ke bawaan?</span>
              <button
                type="button"
                onClick={() => {
                  onResetEmployees();
                  onShowAlert('Database Disetel Ulang', 'Database karyawan telah dikembalikan ke pengaturan bawaan aplikasi.');
                  setShowResetConfirm(false);
                }}
                className="bg-rose-600 hover:bg-rose-700 text-white px-2.5 py-1 rounded-md text-[10px] font-bold transition cursor-pointer"
              >
                Ya, Reset
              </button>
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-2.5 py-1 rounded-md text-[10px] font-bold transition cursor-pointer"
              >
                Batal
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowResetConfirm(true)}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-600 text-xs font-semibold rounded-lg transition cursor-pointer"
            >
              Reset Bawaan
            </button>
          )}
        </div>
      </div>

      {/* Info Tips */}
      <div className="mx-6 mt-4 p-3.5 bg-blue-50/55 border border-blue-100 rounded-xl text-xs text-blue-850 leading-relaxed flex items-start gap-2.5">
        <Sparkles className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
        <div>
          <p className="font-bold">Informasi Database Karyawan</p>
          <p className="mt-0.5 text-blue-800">
            KSS hanya dapat menilai karyawan yang terdaftar di database ini. Jika Anda mengubah, menambah, atau memindahkan grup karyawan di Spreadsheet utama (Sheet <strong>DBKaryawan</strong>), silakan klik tombol <strong className="text-emerald-700 font-bold">Re-Sync</strong> di atas agar perubahan sinkron seketika ke aplikasi.
          </p>
        </div>
      </div>

      {/* Filter and search bar */}
      <div className="p-6 border-b border-slate-150 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cari Nama, No. Reg, atau Jabatan..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full text-xs py-2 bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all duration-150"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 shrink-0">Filter Grup:</span>
          <select
            value={selectedGroup}
            onChange={(e) => {
              setSelectedGroup(e.target.value);
              setCurrentPage(1);
            }}
            className="text-xs py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer text-slate-700 font-semibold"
          >
            <option value="ALL">Semua Grup</option>
            {GROUPS.map(g => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>

          <select
            value={itemsPerPage}
            onChange={(e) => {
              setItemsPerPage(Number(e.target.value));
              setCurrentPage(1);
            }}
            className="text-xs py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer text-slate-700 font-semibold"
          >
            <option value={10}>10 Baris</option>
            <option value={25}>25 Baris</option>
            <option value={50}>50 Baris</option>
            <option value={100}>100 Baris</option>
          </select>
        </div>
      </div>

      {/* Main Table Content with Frozen Headers */}
      <div className="overflow-x-auto max-h-[500px] overflow-y-auto relative rounded-xl border border-slate-200 shadow-xs bg-white">
        <table className="w-full text-left border-collapse min-w-[850px]">
          <thead className="sticky top-0 bg-slate-50 z-10 shadow-[0_1px_0_0_rgba(226,232,240,1)]">
            <tr className="bg-slate-50 text-[10.5px] font-black uppercase text-slate-500 tracking-wider whitespace-nowrap">
              {/* Kolom Nomor */}
              <th className="py-3.5 px-4 whitespace-nowrap text-center w-12 font-black">NO</th>
              <th className="py-3.5 px-6 select-none cursor-pointer hover:bg-slate-100 whitespace-nowrap" onClick={() => handleSort('empId')}>
                <div className="flex items-center gap-1.5">
                  ID UNIK
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th className="py-3.5 px-6 select-none cursor-pointer hover:bg-slate-100 whitespace-nowrap" onClick={() => handleSort('grup')}>
                <div className="flex items-center gap-1.5">
                  GRUP
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th className="py-3.5 px-6 select-none cursor-pointer hover:bg-slate-100 whitespace-nowrap" onClick={() => handleSort('noReg')}>
                <div className="flex items-center gap-1.5">
                  NO.REG
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th className="py-3.5 px-6 select-none cursor-pointer hover:bg-slate-100 whitespace-nowrap" onClick={() => handleSort('nama')}>
                <div className="flex items-center gap-1.5">
                  NAMA
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th className="py-3.5 px-6 select-none cursor-pointer hover:bg-slate-100 whitespace-nowrap" onClick={() => handleSort('jabatan')}>
                <div className="flex items-center gap-1.5">
                  JAB
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              {/* Column Aksi */}
              <th className="py-3.5 px-6 whitespace-nowrap text-center w-28">AKSI</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs">
            {paginatedItems.length > 0 ? (
              paginatedItems.map((emp, index) => (
                <tr key={emp.noReg} className="hover:bg-slate-50/50 transition-colors bg-white whitespace-nowrap">
                  {/* Render Number */}
                  <td className="py-2.5 px-4 text-center text-slate-400 font-mono font-bold whitespace-nowrap border-r border-slate-100">
                    {startIndex + index + 1}
                  </td>
                  <td className="py-2.5 px-6 font-mono font-bold text-emerald-700 bg-emerald-50/40 whitespace-nowrap rounded-md">{emp.empId || '-'}</td>
                  <td className="py-2.5 px-6 whitespace-nowrap">
                    <span className={`inline-block px-2.5 py-0.5 rounded-md text-[10px] font-extrabold uppercase ${
                      emp.grup === 'A' ? 'bg-blue-50 text-blue-700 border border-blue-100' :
                      emp.grup === 'B' ? 'bg-purple-50 text-purple-700 border border-purple-100' :
                      emp.grup === 'C' ? 'bg-orange-50 text-orange-700 border border-orange-100' :
                      emp.grup === 'NS' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                      emp.grup === 'MTC' ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' :
                      emp.grup === 'LAB' ? 'bg-cyan-50 text-cyan-700 border border-cyan-100' :
                      'bg-pink-50 text-pink-700 border border-pink-100'
                    }`}>
                      Grup {emp.grup}
                    </span>
                  </td>
                  <td className="py-2.5 px-6 font-mono font-bold text-slate-700 whitespace-nowrap">{emp.noReg}</td>
                  <td className="py-2.5 px-6 font-extrabold text-slate-800 uppercase whitespace-nowrap">{emp.nama}</td>
                  <td className="py-2.5 px-6 text-slate-500 font-medium whitespace-nowrap">{emp.jabatan || '-'}</td>
                  
                  {/* Render Actions (Edit & Delete) */}
                  <td className="py-2.5 px-6 text-center whitespace-nowrap">
                    <div className="inline-flex items-center gap-1.5 justify-center">
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(emp)}
                        className="p-1.5 hover:bg-blue-50 hover:text-blue-600 rounded text-slate-400 transition cursor-pointer"
                        title="Edit Data Karyawan"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteEmployee(emp)}
                        className="p-1.5 hover:bg-rose-50 hover:text-rose-600 rounded text-slate-400 transition cursor-pointer"
                        title="Hapus Karyawan"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="py-12 text-center text-slate-400">
                  <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  Tidak ada data karyawan yang cocok dengan kriteria pencarian.
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
              // Sliding window for page buttons
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

      {/* Hardcoded Exporter Block (Request #1) */}
      <div className="mx-6 mt-6 border border-slate-200 rounded-2xl bg-slate-50/50 p-4.5 shadow-3xs overflow-hidden">
        <button
          type="button"
          onClick={() => setShowExporter(!showExporter)}
          className="flex items-center justify-between w-full font-extrabold text-xs uppercase tracking-wider text-slate-700 cursor-pointer hover:text-slate-900 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
              <Database className="w-4 h-4" />
            </span>
            <span>💡 Ekspor Data Karyawan untuk Hardcode (src/data.ts)</span>
          </div>
          <span className="text-slate-400 font-black text-sm">{showExporter ? '▲ Tutup' : '▼ Klik untuk Membuka'}</span>
        </button>

        {showExporter && (
          <div className="mt-4 space-y-3 animate-fade-in">
            <p className="text-xs text-slate-600 leading-relaxed">
              Secara teknis, data di dalam peramban (browser) tidak dapat menulis ulang source code static <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-blue-600">src/data.ts</code> secara langsung. Namun, Anda dapat menyalin kode yang digenerate otomatis di bawah ini dan menempelkannya (paste) ke dalam file <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-blue-600">src/data.ts</code> untuk memperbarui data hardcode Anda secara permanen!
            </p>

            <div className="relative mt-2">
              <pre className="p-4 bg-slate-900 text-slate-100 text-[10.5px] font-mono rounded-xl overflow-x-auto max-h-56 leading-relaxed border border-slate-850">
                {`export const PREPOPULATED_EMPLOYEES: Employee[] = ${JSON.stringify(
                  employees.map(e => ({
                    noReg: e.noReg,
                    nama: e.nama,
                    grup: e.grup,
                    jabatan: e.jabatan
                  })),
                  null,
                  2
                )};`}
              </pre>

              <button
                type="button"
                onClick={handleCopyHardcode}
                className={`absolute right-3 top-3 py-1.5 px-3 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-sm cursor-pointer ${
                  isCopied 
                    ? 'bg-emerald-600 text-white' 
                    : 'bg-white/90 hover:bg-white text-slate-800 hover:text-slate-900 border border-slate-300'
                }`}
              >
                {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {isCopied ? 'Tersalin!' : 'Salin Kode'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add Employee Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full overflow-hidden shadow-2xl border border-slate-100 animate-scale-up">
            <div className="p-5 border-b border-slate-150 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center">
                  <User className="w-4 h-4" />
                </div>
                <h4 className="font-extrabold text-slate-800 text-sm uppercase tracking-wide">Tambah Karyawan Baru</h4>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="p-1.5 hover:bg-slate-100 rounded text-slate-400 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveAdd} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold rounded-lg flex items-start gap-2 animate-shake">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-[10.5px] font-black uppercase tracking-wider text-slate-450 block">No. Registrasi (No. Reg)</label>
                <input
                  type="text"
                  placeholder="Contoh: A004"
                  value={formNoReg}
                  onChange={(e) => setFormNoReg(e.target.value)}
                  className="w-full text-xs py-2 px-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition duration-150 uppercase"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10.5px] font-black uppercase tracking-wider text-slate-450 block">Nama Karyawan</label>
                <input
                  type="text"
                  placeholder="Contoh: BUDI UTOMO"
                  value={formNama}
                  onChange={(e) => setFormNama(e.target.value)}
                  className="w-full text-xs py-2 px-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition duration-150 uppercase"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10.5px] font-black uppercase tracking-wider text-slate-450 block">Grup Kerja</label>
                <select
                  value={formGrup}
                  onChange={(e) => setFormGrup(e.target.value as GroupType)}
                  className="w-full text-xs py-2 px-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer text-slate-700 font-semibold"
                >
                  <option value="A">Grup A</option>
                  <option value="B">Grup B</option>
                  <option value="C">Grup C</option>
                  <option value="NS">Non-Shift (NS)</option>
                  <option value="MTC">MTC</option>
                  <option value="LAB">LAB</option>
                  <option value="QC">QC</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10.5px] font-black uppercase tracking-wider text-slate-450 block">Jabatan / Fungsi Operasional</label>
                <input
                  type="text"
                  placeholder="Contoh: Board Operator"
                  value={formJabatan}
                  onChange={(e) => setFormJabatan(e.target.value)}
                  className="w-full text-xs py-2 px-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition duration-150"
                />
              </div>

              <div className="pt-4 border-t border-slate-100 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="flex-1 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold text-xs uppercase tracking-wider rounded-xl transition cursor-pointer text-center"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-350 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 shadow-sm active:scale-95"
                >
                  <Save className="w-3.5 h-3.5" />
                  {isSaving ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Employee Modal */}
      {editingEmployee && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full overflow-hidden shadow-2xl border border-slate-100 animate-scale-up">
            <div className="p-5 border-b border-slate-150 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center">
                  <Pencil className="w-4 h-4" />
                </div>
                <h4 className="font-extrabold text-slate-800 text-sm uppercase tracking-wide">Edit Data Karyawan</h4>
              </div>
              <button
                type="button"
                onClick={() => setEditingEmployee(null)}
                className="p-1.5 hover:bg-slate-100 rounded text-slate-400 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold rounded-lg flex items-start gap-2 animate-shake">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-[10.5px] font-black uppercase tracking-wider text-slate-450 block">ID Unik Karyawan (ID UNIK)</label>
                <input
                  type="text"
                  value={editingEmployee.empId || '-'}
                  disabled
                  className="w-full text-xs py-2 px-3 bg-emerald-50/50 border border-emerald-200 rounded-lg text-emerald-800 uppercase font-black cursor-not-allowed font-mono"
                />
                <span className="text-[10px] text-slate-400 block mt-1">ID Unik di-generate otomatis oleh sistem dan tidak dapat diubah.</span>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10.5px] font-black uppercase tracking-wider text-slate-450 block">No. Registrasi (No. Reg)</label>
                <input
                  type="text"
                  placeholder="Contoh: A004"
                  value={formNoReg}
                  onChange={(e) => setFormNoReg(e.target.value)}
                  className="w-full text-xs py-2 px-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition duration-150 uppercase font-bold"
                  required
                />
                <span className="text-[10px] text-slate-400 block mt-1">Anda dapat mengubah nomor registrasi ini jika diperlukan.</span>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10.5px] font-black uppercase tracking-wider text-slate-450 block">Nama Karyawan</label>
                <input
                  type="text"
                  placeholder="Contoh: BUDI UTOMO"
                  value={formNama}
                  onChange={(e) => setFormNama(e.target.value)}
                  className="w-full text-xs py-2 px-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition duration-150 uppercase"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10.5px] font-black uppercase tracking-wider text-slate-450 block">Grup Kerja</label>
                <select
                  value={formGrup}
                  onChange={(e) => setFormGrup(e.target.value as GroupType)}
                  className="w-full text-xs py-2 px-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer text-slate-700 font-semibold"
                >
                  <option value="A">Grup A</option>
                  <option value="B">Grup B</option>
                  <option value="C">Grup C</option>
                  <option value="NS">Non-Shift (NS)</option>
                  <option value="MTC">MTC</option>
                  <option value="LAB">LAB</option>
                  <option value="QC">QC</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10.5px] font-black uppercase tracking-wider text-slate-450 block">Jabatan / Fungsi Operasional</label>
                <input
                  type="text"
                  placeholder="Contoh: Board Operator"
                  value={formJabatan}
                  onChange={(e) => setFormJabatan(e.target.value)}
                  className="w-full text-xs py-2 px-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition duration-150"
                />
              </div>

              <div className="pt-4 border-t border-slate-100 flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditingEmployee(null)}
                  className="flex-1 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold text-xs uppercase tracking-wider rounded-xl transition cursor-pointer text-center"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-355 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 shadow-sm active:scale-95"
                >
                  <Save className="w-3.5 h-3.5" />
                  {isSaving ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
