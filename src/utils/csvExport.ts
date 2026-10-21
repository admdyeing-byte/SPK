/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Evaluation, Employee } from '../types';
import {
  parseAndNormalizePeriode,
  isShiftMtcEmployee,
  isSameEmployee,
  normalizeNoReg,
  compareEmpId,
  resolveEmpId,
} from '../utils';

export interface CsvEvaluationRow {
  nik: string;          // From No.Reg
  namaKaryawan: string; // From NAMA
  kualitas: number;     // From KUALITAS (nil1)
  kuantitas: number;    // From KUANTITAS (nil2)
  kehadiran: string;    // Empty string as requested
  kedisiplinan: string; // Empty string as requested
  grup: string;         // Origin group (A, B, C, NS, QC, MTC, LAB)
  empId?: string;       // Unique employee ID for natural ordering
}

export interface CsvExportSummary {
  targetPeriod: string;
  totalEvaluations: number;
  totalUniqueEmployees: number;
  groupCounts: Record<string, number>;
  mtcShiftFilteredOutCount: number; // Count of Shift A/B/C evals for MTC Shift employees ignored in favor of Sheet MTC
  rows: CsvEvaluationRow[];
}

/**
 * Filter and assemble evaluations for CSV export according to user business rules:
 * 1. Collects all evaluations for target period from sheets: A, B, C, NS, QC, MTC, LAB.
 * 2. CRITICAL RULE: For Opt. MTC Shift employees, the rating MUST ONLY be taken from sheet "MTC".
 *    Any evaluation for MTC Shift employees in Sheet A, B, or C is discarded in the CSV.
 * 3. Formats columns into:
 *    - NIK (from No.Reg)
 *    - Nama Karyawan (from NAMA)
 *    - KUALITAS (nil1)
 *    - KUANTITAS (nil2)
 *    - KEHADIRAN (empty)
 *    - KEDISIPLINAN (empty)
 * 4. Ordered by employee unique ID (empId).
 */
export function getEvaluationsForCsvExport(
  evaluations: Evaluation[],
  targetPeriod: string,
  employeeList: Employee[] = []
): CsvExportSummary {
  const normTarget = parseAndNormalizePeriode(targetPeriod).trim().toLowerCase();

  // Valid evaluation sheets to include
  const validGroups = ['A', 'B', 'C', 'NS', 'QC', 'MTC', 'LAB'];

  // Filter evaluations that match the target period and valid sheets
  const periodEvals = evaluations.filter((e) => {
    const p = parseAndNormalizePeriode(e.periode).trim().toLowerCase();
    if (p !== normTarget) return false;
    const grp = (e.grup || e.sheetName || '').trim().toUpperCase();
    return validGroups.includes(grp);
  });

  const groupCounts: Record<string, number> = {
    A: 0,
    B: 0,
    C: 0,
    NS: 0,
    QC: 0,
    MTC: 0,
    LAB: 0,
  };

  let mtcShiftFilteredOutCount = 0;

  // Map to hold definitive evaluation per employee (key: normalized noReg)
  const employeeEvalMap = new Map<string, Evaluation>();

  // PASS 1: Process official MTC evaluations first
  // Sesuai aturan: "Khusus untuk MTC Shift nilaia yang diambil dari sheet 'MTC' saja"
  const mtcEvals = periodEvals.filter((e) => {
    const grp = (e.grup || e.sheetName || '').trim().toUpperCase();
    return grp === 'MTC' && !e.isSupportive;
  });

  for (const ev of mtcEvals) {
    const key = normalizeNoReg(ev.noReg);
    if (key) {
      employeeEvalMap.set(key, ev);
      groupCounts.MTC = (groupCounts.MTC || 0) + 1;
    }
  }

  // PASS 2: Process non-MTC sheets: A, B, C, NS, QC, LAB
  const otherEvals = periodEvals.filter((e) => {
    const grp = (e.grup || e.sheetName || '').trim().toUpperCase();
    return grp !== 'MTC' && validGroups.includes(grp);
  });

  for (const ev of otherEvals) {
    const grp = (ev.grup || ev.sheetName || '').trim().toUpperCase();
    const key = normalizeNoReg(ev.noReg);
    if (!key) continue;

    // Check if employee is a Shift MTC operator
    const empObj = employeeList.find((emp) => isSameEmployee(emp, ev));
    const isShiftMtc = empObj ? isShiftMtcEmployee(empObj) : isShiftMtcEmployee(ev);

    // CRITICAL USER MANDATE:
    // "Khusus untuk MTC Shift nilaia yang diambil dari sheet 'MTC' saja"
    if (isShiftMtc) {
      // Evaluation from Shift sheet (A, B, C) for MTC shift employee is discarded for CSV!
      mtcShiftFilteredOutCount++;
      continue;
    }

    // Ignore supportive draft recommendations
    if (ev.isSupportive === true || (ev.isSupportive as any) === 'true') {
      continue;
    }

    if (!employeeEvalMap.has(key)) {
      employeeEvalMap.set(key, ev);
      if (groupCounts[grp] !== undefined) {
        groupCounts[grp]++;
      } else {
        groupCounts[grp] = (groupCounts[grp] || 0) + 1;
      }
    }
  }

  // Convert map to CsvEvaluationRow[]
  const rows: CsvEvaluationRow[] = [];
  employeeEvalMap.forEach((ev) => {
    const empObj = employeeList.find((emp) => isSameEmployee(emp, ev));
    const resolvedId =
      ev.empId ||
      (empObj ? empObj.empId : '') ||
      resolveEmpId(ev, employeeList);

    rows.push({
      nik: ev.noReg.trim().toUpperCase(),
      namaKaryawan: (ev.nama || empObj?.nama || '').trim().toUpperCase(),
      kualitas: Number(ev.nil1) || 0,
      kuantitas: Number(ev.nil2) || 0,
      kehadiran: '',
      kedisiplinan: '',
      grup: (ev.grup || ev.sheetName || '').trim().toUpperCase(),
      empId: resolvedId,
    });
  });

  // Sort rows by employee unique ID (empId)
  rows.sort((a, b) => compareEmpId(a.empId, b.empId, a.nik, b.nik, employeeList));

  return {
    targetPeriod,
    totalEvaluations: periodEvals.length,
    totalUniqueEmployees: rows.length,
    groupCounts,
    mtcShiftFilteredOutCount,
    rows,
  };
}

/**
 * Generate CSV string with strict column headers as requested and shown in user's sheet:
 * NIK,Nama Karyawan,KUALITAS,KUANTITAS,KEHADIRAN,KEDISIPLINAN
 */
export function generateCsvContent(
  rows: CsvEvaluationRow[],
  delimiter: ',' | ';' = ','
): string {
  // Headers matching row 1 of the 'CSV' sheet exactly
  const headers = ['NIK', 'Nama Karyawan', 'KUALITAS', 'KUANTITAS', 'KEHADIRAN', 'KEDISIPLINAN'];

  const escapeCell = (val: any): string => {
    if (val === null || val === undefined) return '';
    const str = String(val).trim();
    if (
      str.includes(delimiter) ||
      str.includes('"') ||
      str.includes('\n') ||
      str.includes('\r')
    ) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headerLine = headers.map(escapeCell).join(delimiter);
  const dataLines = rows.map((r) =>
    [
      escapeCell(r.nik),
      escapeCell(r.namaKaryawan),
      escapeCell(r.kualitas),
      escapeCell(r.kuantitas),
      '', // KEHADIRAN (empty string)
      '', // KEDISIPLINAN (empty string)
    ].join(delimiter)
  );

  return [headerLine, ...dataLines].join('\r\n');
}

/**
 * Trigger browser file download with UTF-8 BOM so Excel & Google Sheets display cleanly
 */
export function downloadCsvFile(content: string, filename: string): void {
  const blob = new Blob(['\uFEFF' + content], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
