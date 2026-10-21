/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Employee {
  empId?: string; // Unique primary key, format: EMP0000 (e.g., EMP0001)
  noReg: string;
  nama: string;
  grup: string;
  jabatan?: string;
}

export interface HrmsRecord {
  empId?: string; // Unique primary key reference
  noReg: string;
  nama: string;
  kualitas: number;
  kuantitas: number;
  kehadiran: number;
  kedisiplinan: number;
  skor: number;
  periode: string;
  extraColumns?: Record<string, string | number>;
}

export interface Evaluation {
  id: string;
  periode: string;
  noReg: string;
  nama: string;
  grup: string;
  nil1: number;
  nil2: number;
  average: number;
  submittedAt: string;
  jabatan?: string;
  empId?: string; // Unique primary key reference
  isDemo?: boolean; // True if this record was created under demo/trial mode
  isSupportive?: boolean; // True if this is a supportive/reference-only evaluation from shift group for MTC employee
  sheetName?: string; // The origin Google sheet name (A, B, C, etc.)
  pendingApproval?: boolean; // True if edited by non-admin and waiting for approval
  editedBy?: string; // Group that performed the edit, e.g., 'A', 'B', 'NS'
  editedCount?: number; // Tracks how many times a non-admin has edited this record
  originalValues?: {
    nil1: number;
    nil2: number;
    average: number;
  };
}

export type GroupType = 'A' | 'B' | 'C' | 'NS' | 'MTC' | 'LAB' | 'QC';

export interface PresensiRecord {
  empId?: string; // Unique primary key reference
  noReg: string;
  nama: string;
  jabatan: string;
  grup: string;
  tanggal: string;
  presensi: string; // Cuti, Sakit, Izin, LP, Hadir, dll.
  keterangan: string;
  periode: string; // e.g. "Juni 2026" (derived/parsed from Tanggal or specified)
}

export interface KssContact {
  group: GroupType;
  name: string;
  phone: string;
}

export interface AppConfig {
  webhookUrl: string;
  spreadsheetId: string;
  sheetName: string;
  activeGroup: GroupType | 'ALL' | 'NONE';
  clientId: string;
  isDemoMode: boolean; // Enables manual period settings for testing outside date 11-14
}
