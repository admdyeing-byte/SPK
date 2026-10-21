/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PREPOPULATED_EMPLOYEES } from './data';
import { Employee } from './types';

export const MONTH_NAMES_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

/**
 * Mendapatkan teks Periode Penilaian otomatis berdasarkan tanggal saat ini.
 * Periode otomatis terbuka pada tanggal 15 s.d 25 tiap bulan.
 * 
 * @param date Tanggal yang ingin dicek (default hari ini)
 * @param forceOpen Cek apakah dipaksa buka untuk keperluan testing / demo
 */
export function getPeriodePenilaian(date: Date = new Date(), forceOpen: boolean = false): { readable: string; isOpen: boolean; isUpcoming: boolean } {
  const day = date.getDate();
  const month = date.getMonth();
  const year = date.getFullYear();
  
  const monthName = MONTH_NAMES_ID[month];
  const formattedPeriod = `${monthName} ${year}`;
  
  // Ketentuan: Penilaian hanya bisa diinput pada tanggal 15 s.d 25 tiap bulan
  const isOpen = forceOpen || (day >= 15 && day <= 25);
  // Jika hari ini berada di tanggal 1 s.d 14, maka status adalah Pre-Open (belum buka)
  const isUpcoming = !isOpen && (day >= 1 && day <= 14);
  
  return {
    readable: formattedPeriod,
    isOpen,
    isUpcoming
  };
}

/**
 * Format timestamp ISO ke Waktu Indonesia Barat (WIB) / lokal yang ramah dibaca
 */
export function formatLokalWaktu(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '-';
    
    const jam = String(d.getHours()).padStart(2, '0');
    const menit = String(d.getMinutes()).padStart(2, '0');
    const tanggal = d.getDate();
    const bulan = MONTH_NAMES_ID[d.getMonth()].substring(0, 3);
    const tahun = d.getFullYear();
    
    return `${tanggal} ${bulan} ${tahun}, ${jam}:${menit}`;
  } catch {
    return '-';
  }
}

/**
 * Mendapatkan nama periode bulan kemarin
 */
export function getPeriodeBulanKemarin(date: Date = new Date()): string {
  const d = new Date(date);
  // Set to 1st of the month first to avoid edge cases (e.g., 31st of month minus 1 month leading to skipping/overflowing)
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  const month = d.getMonth();
  const year = d.getFullYear();
  return `${MONTH_NAMES_ID[month]} ${year}`;
}

/**
 * Check if employee is a shift-based Maintenance (MTC) operator.
 * Robustly matches various titles (e.g., OPT. MTC, OPT MTC, OPERATOR MTC, TEKNISI MTC)
 * with shift designations (A, B, C, SHIFT A, DYE A, WINDING A, etc.)
 */
export function isShiftMtcEmployee(emp: { noReg?: string; jabatan?: string; grup?: string }): boolean {
  if (!emp) return false;
  const j = (emp.jabatan || "").toUpperCase().replace(/\./g, " ");
  const g = (emp.grup || "").toUpperCase().trim();
  
  // Must be maintenance (MTC)
  const isMtc = j.includes("MTC") || g === "MTC";
  if (!isMtc) return false;

  // Must have a shift designation (A, B, or C, or SHIFT)
  const hasShift = 
    j.includes("SHIFT A") || j.includes("SHIFT B") || j.includes("SHIFT C") ||
    j.includes("DYE A") || j.includes("DYE B") || j.includes("DYE C") ||
    j.includes("WINDING A") || j.includes("WINDING B") || j.includes("WINDING C") ||
    j.endsWith(" A") || j.endsWith(" B") || j.endsWith(" C") ||
    /\b(A|B|C)\b$/.test(j) ||
    ['A', 'B', 'C'].includes(g);

  return isMtc && hasShift;
}

/**
 * Get shift group (A, B, or C) from a shift MTC operator's job title or group
 */
export function getShiftMtcGroup(emp: { jabatan?: string; grup?: string }): string | null {
  if (!emp) return null;
  const j = (emp.jabatan || "").trim().toUpperCase().replace(/\./g, " ");
  const g = (emp.grup || "").trim().toUpperCase();

  // 1. Explicit SHIFT A / B / C in jabatan
  const shiftMatch = j.match(/SHIFT\s*([ABC])\b/);
  if (shiftMatch) return shiftMatch[1];

  // 2. Specific roles with shift letter like DYE A, WINDING A, MTC A, OPT A
  const wordMatch = j.match(/(?:DYE|WINDING|MTC|OPT|OPERATOR|TEKNISI)\s*([ABC])\b/);
  if (wordMatch) return wordMatch[1];

  // 3. Ending with space + letter or trailing letter
  if (j.endsWith(" A") || j.endsWith("A")) return "A";
  if (j.endsWith(" B") || j.endsWith("B")) return "B";
  if (j.endsWith(" C") || j.endsWith("C")) return "C";

  // 4. If employee's group is already A, B, or C
  if (['A', 'B', 'C'].includes(g)) return g;

  return null;
}

/**
 * Resolves the unique employee ID (empId) for any record
 */
export function resolveEmpId(
  item: { empId?: string; noReg?: string; nama?: string },
  pool?: Employee[]
): string {
  if (item?.empId && item.empId.trim()) {
    return item.empId.trim().toUpperCase();
  }
  let empList = pool && pool.length > 0 ? pool : PREPOPULATED_EMPLOYEES;
  if (!item) return '';
  const found = empList.find(e => isSameEmployee(e, item));
  if (found && found.empId) {
    return found.empId.trim().toUpperCase();
  }
  return '';
}

/**
 * Membandingkan ID unik karyawan (empId) secara natural/numerik.
 * Contoh: EMP0001 < EMP0002 < EMP0010 < EMP0100.
 * Sesuai instruksi pengguna: urutan penilaian harus menggunakan ID unik (empId), bukan No. Reg!
 */
export function compareEmpId(
  idA?: string,
  idB?: string,
  noRegA?: string,
  noRegB?: string,
  pool?: Employee[]
): number {
  const finalIdA = idA || (noRegA ? resolveEmpId({ noReg: noRegA }, pool) : '');
  const finalIdB = idB || (noRegB ? resolveEmpId({ noReg: noRegB }, pool) : '');

  if (finalIdA && finalIdB) {
    const numA = finalIdA.match(/\d+/);
    const numB = finalIdB.match(/\d+/);
    if (numA && numB) {
      const parsedA = parseInt(numA[0], 10);
      const parsedB = parseInt(numB[0], 10);
      if (parsedA !== parsedB) {
        return parsedA - parsedB;
      }
    }
    const strCompare = finalIdA.localeCompare(finalIdB, undefined, { numeric: true, sensitivity: 'base' });
    if (strCompare !== 0) return strCompare;
  } else if (finalIdA && !finalIdB) {
    return -1;
  } else if (!finalIdA && finalIdB) {
    return 1;
  }

  // Jika empId tidak ditemukan di kedua record, urutkan berdasarkan urutan indeks kemunculan di database DBKaryawan/pool
  // BUKAN diurutkan berdasarkan No. Reg secara alfabetis!
  if (noRegA && noRegB) {
    const empList = pool && pool.length > 0 ? pool : PREPOPULATED_EMPLOYEES;
    const idxA = empList.findIndex(e => normalizeNoReg(e.noReg) === normalizeNoReg(noRegA));
    const idxB = empList.findIndex(e => normalizeNoReg(e.noReg) === normalizeNoReg(noRegB));
    if (idxA !== -1 && idxB !== -1) {
      return idxA - idxB;
    }
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
  }

  return 0;
}

/**
 * Normalisasi No. Reg dengan menghapus semua karakter non-alfanumerik dan mengubah ke huruf besar
 */
export function normalizeNoReg(noReg: string): string {
  if (!noReg) return '';
  const cleaned = noReg.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  
  // Jika murni angka, hapus angka nol di depan (misal "00124" -> "124") karena Google Sheets sering menganggapnya sebagai angka biasa
  if (/^\d+$/.test(cleaned)) {
    return cleaned.replace(/^0+/, '') || '0';
  }
  
  // Jika alfanumerik (mengandung huruf seperti DK061, OS0123), pertahankan nol-nya karena Google Sheets membacanya sebagai teks
  return cleaned;
}

/**
 * Normalisasi Nama dengan membuang spasi berlebih, karakter non-huruf, dan mengubah ke huruf kecil
 */
export function normalizeName(name: string): string {
  if (!name) return '';
  return name.trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '') // remove symbols & punctuation, keep only letters and numbers
    .replace(/\s+/g, '');     // remove all whitespaces
}

/**
 * Membandingkan apakah dua karyawan memiliki kecocokan (No. Reg atau Nama)
 * Ini untuk memastikan jika No. Reg berubah di database karyawan tetapi nama tetap sama,
 * atau ada perbedaan formatting pada No. Reg, sistem masih dapat mendeteksinya sebagai orang yang sama.
 */
export function isSameEmployee(
  empA: { noReg?: string; nama?: string; empId?: string },
  empB: { noReg?: string; nama?: string; empId?: string }
): boolean {
  if (!empA || !empB) return false;
  
  // 1. Compare by empId if both have it (strongest and most reliable match)
  if (empA.empId && empB.empId && empA.empId.trim().toUpperCase() === empB.empId.trim().toUpperCase()) {
    return true;
  }
  
  // 2. Fallback to No. Reg
  const normNoRegA = normalizeNoReg(empA.noReg);
  const normNoRegB = normalizeNoReg(empB.noReg);
  
  if (normNoRegA && normNoRegB && normNoRegA === normNoRegB) {
    return true;
  }
  
  // 3. Fallback to Name
  if (empA.nama && empB.nama) {
    const normNameA = normalizeName(empA.nama);
    const normNameB = normalizeName(empB.nama);
    if (normNameA && normNameB && normNameA === normNameB) {
      return true;
    }
  }
  
  return false;
}

/**
 * Normalizes an evaluation record to resolve old/corrupted registrations and names.
 * This fixes the issue of K3431 -> DK3431 (FIRNANDA -> FIRNANDA PUJI P), 
 * D0807 -> D0807 (DIDIK S -> DIDIK SUSIYANTO), 
 * and K2820 -> DK2820 (ROMLI -> ROMLI RORENO).
 * 
 * It also automatically enriches the record with the stable unique ID (empId)
 * if it is missing by performing a lookup in the prepopulated database.
 */
export function normalizeEvaluationRecord(e: any): any {
  if (!e) return e;
  let updated = { ...e };
  const cleanNoReg = e.noReg ? e.noReg.trim().toUpperCase() : '';
  const cleanName = e.nama ? e.nama.trim().toUpperCase() : '';

  // 1. FIRNANDA PUJI P (DK3431)
  if (cleanNoReg === 'K3431' || cleanNoReg === 'DK3431' || cleanName === 'FIRNANDA' || cleanName === 'FIRNANDA PUJI P') {
    updated.noReg = 'DK3431';
    updated.nama = 'FIRNANDA PUJI P';
  }
  // 2. DIDIK SUSIYANTO (D0807)
  else if (cleanNoReg === 'D0807' || cleanNoReg === 'D0807' || cleanName === 'DIDIK S' || cleanName === 'DIDIK SUSIYANTO') {
    updated.noReg = 'D0807';
    updated.nama = 'DIDIK SUSIYANTO';
  }
  // 3. ROMLI RORENO (DK2820)
  else if (cleanNoReg === 'K2820' || cleanNoReg === 'DK2820' || cleanNoReg === 'DK2828' || cleanName === 'ROMLI' || cleanName === 'ROMLI RORENO') {
    updated.noReg = 'DK2820';
    updated.nama = 'ROMLI RORENO';
  }

  // 4. Auto-enrich empId if missing or empty
  if (!updated.empId) {
    let pool: Employee[] = PREPOPULATED_EMPLOYEES;
    try {
      const cached = localStorage.getItem('e_penilaian_karyawan_employees_v1');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          pool = parsed;
        }
      }
    } catch {}

    const foundEmp = pool.find(emp => {
      // Direct No. Reg match (normalized)
      if (normalizeNoReg(emp.noReg) === normalizeNoReg(updated.noReg)) {
        return true;
      }
      // Name match (normalized)
      if (updated.nama && emp.nama) {
        return normalizeName(emp.nama) === normalizeName(updated.nama);
      }
      return false;
    });
    if (foundEmp && foundEmp.empId) {
      updated.empId = foundEmp.empId;
    }
  }

  return updated;
}

/**
 * Deduplicates evaluations so that only the latest submission (highest submittedAt)
 * is kept for any (employee, period, grup, isSupportive) combination.
 */
export function deduplicateEvaluations(evals: any[]): any[] {
  if (!evals || evals.length === 0) return [];
  
  // Sort descending by submittedAt so the latest is always first
  const sorted = [...evals].map(normalizeEvaluationRecord).sort((a, b) => {
    const timeA = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
    const timeB = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
    return timeB - timeA;
  });

  const unique: any[] = [];
  const seenKeys = new Set<string>();

  for (const e of sorted) {
    const normNoReg = normalizeNoReg(e.noReg);
    const normPeriod = parseAndNormalizePeriode(e.periode).trim().toLowerCase();
    const isSupportive = !!e.isSupportive;
    const groupKey = e.grup ? e.grup.trim().toUpperCase() : '';

    // Use empId as the primary unique key reference; fallback to normNoReg if not found
    const idKey = e.empId ? e.empId.trim().toUpperCase() : normNoReg;

    // Create a composite key that uniquely identifies this specific evaluation slot
    const compositeKey = `${idKey}_${normPeriod}_${groupKey}_${isSupportive}`;

    if (!seenKeys.has(compositeKey)) {
      seenKeys.add(compositeKey);
      unique.push(e);
    }
  }

  return unique;
}

/**
 * Robustly parses and normalizes any period string (including raw dates or slashes)
 * into standard Indonesian "Bulan Tahun" (e.g., "Juni 2026").
 */
export function parseAndNormalizePeriode(periodeStr: any): string {
  if (!periodeStr) return "Juni 2026";
  const str = String(periodeStr).trim();
  if (!str) return "Juni 2026";

  // Check if already in standard Indonesian "Bulan Tahun" (e.g., "Juni 2026")
  const wordYearRegex = /^([a-zA-Z]+)\s+(\d{4})$/;
  const match = str.match(wordYearRegex);
  if (match) {
    const monthPart = match[1];
    const yearPart = match[2];
    const cleanMonth = monthPart.charAt(0).toUpperCase() + monthPart.slice(1).toLowerCase();
    // Validate if month exists in Indonesian month names
    const foundIdx = MONTH_NAMES_ID.findIndex(m => m.toLowerCase() === cleanMonth.toLowerCase());
    if (foundIdx !== -1) {
      return `${MONTH_NAMES_ID[foundIdx]} ${yearPart}`;
    }
  }

  // Handle formats like "06/2026" or "6/2026" or "2026-06" or "06-2026"
  const slashRegex = /^(\d{1,2})[/-](\d{4})$/;
  const slashMatch = str.match(slashRegex);
  if (slashMatch) {
    const m = parseInt(slashMatch[1], 10);
    const y = parseInt(slashMatch[2], 10);
    if (m >= 1 && m <= 12) {
      return `${MONTH_NAMES_ID[m - 1]} ${y}`;
    }
  }

  const reverseSlashRegex = /^(\d{4})[/-](\d{1,2})$/;
  const revMatch = str.match(reverseSlashRegex);
  if (revMatch) {
    const y = parseInt(revMatch[1], 10);
    const m = parseInt(revMatch[2], 10);
    if (m >= 1 && m <= 12) {
      return `${MONTH_NAMES_ID[m - 1]} ${y}`;
    }
  }

  // Try parsing using JS Date
  try {
    const parsedDate = new Date(str);
    if (!isNaN(parsedDate.getTime())) {
      const monthIdx = parsedDate.getMonth();
      const year = parsedDate.getFullYear();
      return `${MONTH_NAMES_ID[monthIdx]} ${year}`;
    }
  } catch (e) {
    // ignore
  }

  return str;
}

/**
 * Converts standard Indonesian period string ("Bulan Tahun", e.g., "Juni 2026")
 * into a comparable UNIX timestamp for chronological sorting.
 */
export function getPeriodTimestamp(periodStr: string): number {
  if (!periodStr) return 0;
  const parts = String(periodStr).trim().split(/\s+/);
  if (parts.length === 2) {
    const monthName = parts[0];
    const year = parseInt(parts[1], 10);
    const monthIdx = MONTH_NAMES_ID.findIndex(m => m.toLowerCase() === monthName.toLowerCase());
    if (monthIdx !== -1 && !isNaN(year)) {
      return new Date(year, monthIdx, 1).getTime();
    }
  }
  return 0;
}

/**
 * Extracts month name and 4-digit year from any period string (e.g. "Juni 2026", "2026-06", "06/2026").
 */
export function extractMonthAndYearFromPeriod(periodStr: any): { month: string; year: string } {
  if (!periodStr) return { month: '', year: '' };
  const norm = parseAndNormalizePeriode(periodStr);
  const parts = norm.trim().split(/\s+/);
  if (parts.length >= 2) {
    const month = parts[0];
    const year = parts[1];
    return { month, year };
  }
  return { month: '', year: '' };
}

/**
 * Checks if a period string matches the selected month filter and year filter.
 * monthFilter: 'ALL' or 'Januari', 'Februari', etc.
 * yearFilter: 'ALL' or '2026', '2025', etc.
 */
export function matchesMonthAndYear(periodStr: any, monthFilter: string, yearFilter: string): boolean {
  if (monthFilter === 'ALL' && yearFilter === 'ALL') return true;
  const { month, year } = extractMonthAndYearFromPeriod(periodStr);
  
  const matchesMonth = monthFilter === 'ALL' || month.toLowerCase() === monthFilter.toLowerCase();
  const matchesYear = yearFilter === 'ALL' || year === yearFilter;
  
  return matchesMonth && matchesYear;
}

/**
 * Extracts unique available years from a list of period strings, sorted descending (e.g. 2026, 2025, 2024).
 */
export function extractAvailableYears(periods: any[], fallbackYear: number = new Date().getFullYear()): string[] {
  const yearSet = new Set<string>();
  if (fallbackYear) {
    yearSet.add(String(fallbackYear));
  }
  
  (periods || []).forEach(p => {
    const { year } = extractMonthAndYearFromPeriod(p);
    if (year && /^\d{4}$/.test(year)) {
      yearSet.add(year);
    }
  });

  return Array.from(yearSet).sort((a, b) => parseInt(b, 10) - parseInt(a, 10));
}

/**
 * Robustly parses a date string and derives the Indonesian period (e.g. "JUNI 2026")
 * menggunakan cut-off tanggal 21 s.d 20 bulan berjalan.
 * Contoh:
 * - 21 Mei s.d 20 Juni dihitung sebagai periode penilaian JUNI
 * - 21 Juni s.d 20 Juli dihitung sebagai periode penilaian JULI
 */
export function getPeriodFromDate(dateStr: string): string {
  if (!dateStr) return "JUNI 2026";
  const str = dateStr.trim();
  if (!str) return "JUNI 2026";

  // Helper untuk memetakan objek tanggal ke nama periode berbasis cut-off 21-20
  const mapDateToEvaluationPeriod = (date: Date): string => {
    const day = date.getDate();
    let month = date.getMonth(); // 0-indexed
    let year = date.getFullYear();

    // Jika tanggal 21 ke atas, masuk ke periode bulan depan
    if (day >= 21) {
      month += 1;
      if (month > 11) {
        month = 0;
        year += 1;
      }
    }
    return `${MONTH_NAMES_ID[month]} ${year}`.toUpperCase();
  };

  // Check if it's a numeric serial number from Excel/Google Sheets
  if (/^\d{5}(\.\d+)?$/.test(str)) {
    const serial = parseFloat(str);
    const jsDate = new Date((serial - 25569) * 86400000);
    if (!isNaN(jsDate.getTime())) {
      // Map UTC date values to local timezone to prevent any timezone shifts
      const localDate = new Date(jsDate.getUTCFullYear(), jsDate.getUTCMonth(), jsDate.getUTCDate());
      return mapDateToEvaluationPeriod(localDate);
    }
  }

  // Check DD/MM/YYYY or DD-MM-YYYY
  const dmyRegex = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/;
  const dmyMatch = str.match(dmyRegex);
  if (dmyMatch) {
    const d = parseInt(dmyMatch[1], 10);
    const m = parseInt(dmyMatch[2], 10);
    const y = parseInt(dmyMatch[3], 10);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      const targetDate = new Date(y, m - 1, d);
      return mapDateToEvaluationPeriod(targetDate);
    }
  }

  // Check YYYY-MM-DD
  const ymdRegex = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/;
  const ymdMatch = str.match(ymdRegex);
  if (ymdMatch) {
    const y = parseInt(ymdMatch[1], 10);
    const m = parseInt(ymdMatch[2], 10);
    const d = parseInt(ymdMatch[3], 10);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      const targetDate = new Date(y, m - 1, d);
      return mapDateToEvaluationPeriod(targetDate);
    }
  }

  // Try parsing using JS Date
  try {
    const parsedDate = new Date(str);
    if (!isNaN(parsedDate.getTime())) {
      return mapDateToEvaluationPeriod(parsedDate);
    }
  } catch (e) {
    // ignore
  }

  // Fallback to parseAndNormalizePeriode
  return parseAndNormalizePeriode(str).toUpperCase();
}

/**
 * Check if an employee is temporarily seconded/loaned to Non-Shift (NS).
 * Employees:
 * 1. EMP0015 / D1526 / MOH SUPRIYANTO (Grup A)
 * 2. EMP0074 / OS1312 / M. NUR ZILJIANUDIN (Grup B)
 * 3. EMP0092 / DK3421 / ABDULLAH SAID (Grup C)
 */
export function isSecondedToNSEmployee(emp: { noReg: string }, period?: string): boolean {
  if (!emp || !emp.noReg) return false;

  // Untuk periode Juli 2026, ketiga karyawan ini sementara ikut shift masing-masing (bukan Non-Shift)
  if (period) {
    const normPeriod = parseAndNormalizePeriode(period).trim().toLowerCase();
    if (normPeriod === 'juli 2026') {
      return false;
    }
  }

  const cleanNoReg = normalizeNoReg(emp.noReg);
  const norm1526 = normalizeNoReg("D1526");
  const norm1312 = normalizeNoReg("OS1312");
  const norm3421 = normalizeNoReg("DK3421");
  return [norm1526, norm1312, norm3421].includes(cleanNoReg);
}

/**
 * Get the original group/shift of a seconded employee.
 */
export function getSecondedOriginalGroup(emp: { noReg: string }): string | null {
  if (!emp || !emp.noReg) return null;
  const cleanNoReg = normalizeNoReg(emp.noReg);
  if (cleanNoReg === normalizeNoReg("D1526")) return "A";
  if (cleanNoReg === normalizeNoReg("OS1312")) return "B";
  if (cleanNoReg === normalizeNoReg("DK3421")) return "C";
  return null;
}


