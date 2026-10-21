/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Google Sheets and Drive REST API Service.
 * Allows direct reading, writing, synchronization, and automatic template creation
 * using official Google Workspace REST APIs.
 */

import { Evaluation } from '../types';

export const TARGET_SHEET_TABS = ['A', 'B', 'C', 'NS', 'MTC', 'LAB', 'QC', 'HASIL INPUT'] as const;

export const STANDARD_HEADERS = [
  'TIMESTAMPS',
  'GRUP',
  'NO.REG',
  'NAMA',
  'JAB',
  'KUALITAS',
  'KUANTITAS',
  'RATA-RATA',
  'PERIODE',
  'STATUS'
];

export interface DriveSpreadsheetFile {
  id: string;
  name: string;
  modifiedTime: string;
  webViewLink?: string;
}

/**
 * Extracts Spreadsheet ID from raw ID or full Google Sheets URL
 */
export function extractSpreadsheetId(input: string): string {
  if (!input) return '';
  const trimmed = input.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    return match[1];
  }
  return trimmed;
}

/**
 * Lists user's Google Sheets from Google Drive
 */
export async function listDriveSpreadsheets(accessToken: string): Promise<DriveSpreadsheetFile[]> {
  try {
    const queryParam = encodeURIComponent("mimeType='application/vnd.google-apps.spreadsheet' and trashed=false");
    const fields = encodeURIComponent('files(id,name,modifiedTime,webViewLink)');
    const url = `https://www.googleapis.com/drive/v3/files?q=${queryParam}&orderBy=modifiedTime+desc&fields=${fields}&pageSize=25`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error?.message || `Gagal mengambil daftar spreadsheet (${res.status})`);
    }

    const json = await res.json();
    return json.files || [];
  } catch (error: any) {
    console.error('listDriveSpreadsheets error:', error);
    throw error;
  }
}

/**
 * Get spreadsheet details and sheets metadata
 */
export async function getSpreadsheetDetails(
  accessToken: string,
  spreadsheetId: string
): Promise<{ title: string; sheetNames: string[] }> {
  const cleanId = extractSpreadsheetId(spreadsheetId);
  if (!cleanId) throw new Error('ID Spreadsheet tidak valid.');

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}?fields=properties.title,sheets.properties.title`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    throw new Error(errJson.error?.message || `Gagal mengakses spreadsheet (${res.status})`);
  }

  const data = await res.json();
  const sheetNames = (data.sheets || []).map((s: any) => s.properties?.title || '').filter(Boolean);

  return {
    title: data.properties?.title || 'Spreadsheet Tanpa Judul',
    sheetNames,
  };
}

/**
 * Creates a brand new evaluation spreadsheet in the user's Google Drive with all sheets and headers pre-formatted
 */
export async function createEvaluationSpreadsheet(
  accessToken: string,
  title: string = 'SPK - Penilaian Karyawan Yarn Dyeing'
): Promise<{ id: string; name: string; url: string }> {
  const createPayload = {
    properties: {
      title,
    },
    sheets: TARGET_SHEET_TABS.map((tab) => ({
      properties: {
        title: tab,
        gridProperties: {
          rowCount: 200,
          columnCount: 12,
          frozenRowCount: 1,
        },
      },
    })),
  };

  const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(createPayload),
  });

  if (!createRes.ok) {
    const errJson = await createRes.json().catch(() => ({}));
    throw new Error(errJson.error?.message || `Gagal membuat spreadsheet baru (${createRes.status})`);
  }

  const created = await createRes.json();
  const spreadsheetId = created.spreadsheetId;

  // Now populate header rows across all sheets
  const headerData = TARGET_SHEET_TABS.map((tab) => ({
    range: `'${tab}'!A1:J1`,
    values: [STANDARD_HEADERS],
  }));

  const updateHeadersRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: headerData,
      }),
    }
  );

  if (!updateHeadersRes.ok) {
    console.warn('Could not set header formatting in created spreadsheet, but spreadsheet was created successfully.');
  }

  return {
    id: spreadsheetId,
    name: title,
    url: created.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
  };
}

/**
 * Fetch evaluations from Google Sheets tabs
 */
export async function readSpreadsheetEvaluations(
  accessToken: string,
  spreadsheetId: string
): Promise<Evaluation[]> {
  const cleanId = extractSpreadsheetId(spreadsheetId);
  if (!cleanId) throw new Error('ID Spreadsheet tidak valid.');

  // First fetch sheets to check which ones exist
  const details = await getSpreadsheetDetails(accessToken, cleanId);
  const existingTabs = details.sheetNames;
  
  // Find which target tabs actually exist in this spreadsheet
  const availableTabs = TARGET_SHEET_TABS.filter((tab) => existingTabs.includes(tab));
  
  // If no standard tabs exist, read the first available sheet
  const tabsToRead = availableTabs.length > 0 ? availableTabs : existingTabs.slice(0, 5);
  if (tabsToRead.length === 0) {
    return [];
  }

  const rangesQuery = tabsToRead.map((tab) => `ranges=${encodeURIComponent(`'${tab}'!A1:Z`)}`).join('&');
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values:batchGet?${rangesQuery}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const errJson = await res.json().catch(() => ({}));
    throw new Error(errJson.error?.message || `Gagal membaca data spreadsheet (${res.status})`);
  }

  const json = await res.json();
  const valueRanges: Array<{ range: string; values?: any[][] }> = json.valueRanges || [];
  const results: Evaluation[] = [];

  for (let t = 0; t < valueRanges.length; t++) {
    const vr = valueRanges[t];
    const sheetName = tabsToRead[t];
    const values = vr.values;
    if (!values || values.length <= 1) continue;

    const headers = values[0].map((h: any) => String(h || '').trim().toUpperCase());
    const colIdx: Record<string, number> = {};
    headers.forEach((h: string, idx: number) => {
      colIdx[h] = idx;
    });

    for (let r = 1; r < values.length; r++) {
      const row = values[r];
      if (!row || row.length === 0) continue;

      const getCol = (key: string, altKeys: string[] = []): string => {
        if (colIdx[key] !== undefined && row[colIdx[key]] !== undefined) {
          return String(row[colIdx[key]]).trim();
        }
        for (const alt of altKeys) {
          if (colIdx[alt] !== undefined && row[colIdx[alt]] !== undefined) {
            return String(row[colIdx[alt]]).trim();
          }
        }
        return '';
      };

      const noReg = getCol('NO.REG', ['NO REG', 'NO_REG', 'REG', 'NO']);
      const nama = getCol('NAMA', ['NAMA KARYAWAN', 'EMPLOYEE']);
      if (!noReg && !nama) continue;

      const empIdRaw = getCol('ID UNIK', ['IDUNIK', 'ID_UNIK', 'EMPID', 'ID', 'KODE']);
      let parsedEmpId = '';
      if (empIdRaw) {
        const m = empIdRaw.match(/\d+/);
        parsedEmpId = m ? `EMP${m[0].padStart(4, '0')}` : empIdRaw.toUpperCase();
      }

      const timestamps = getCol('TIMESTAMPS', ['TIMESTAMP', 'WAKTU', 'TANGGAL']);
      const grup = getCol('GRUP', ['GROUP', 'SHIFT']) || sheetName;
      const jab = getCol('JAB', ['JABATAN', 'POSITION']);
      const periode = getCol('PERIODE', ['PERIOD']) || 'Juni 2026';
      
      const rawNil1 = parseFloat(getCol('KUALITAS', ['NILAI 1', 'NIL1', 'QUALITY'])) || 0;
      const rawNil2 = parseFloat(getCol('KUANTITAS', ['NILAI 2', 'NIL2', 'QUANTITY'])) || 0;
      const average = parseFloat(((rawNil1 + rawNil2) / 2).toFixed(2));

      let submittedAt = new Date().toISOString();
      if (timestamps) {
        const parsedDate = new Date(timestamps);
        if (!isNaN(parsedDate.getTime())) {
          submittedAt = parsedDate.toISOString();
        }
      }

      results.push({
        id: `sheets-${cleanId.slice(0, 6)}-${sheetName}-${r}-${Date.now()}`,
        periode,
        noReg: noReg.toUpperCase(),
        nama,
        jabatan: jab,
        grup,
        nil1: rawNil1,
        nil2: rawNil2,
        average,
        submittedAt,
        empId: parsedEmpId || undefined,
        sheetName,
      });
    }
  }

  return results;
}

/**
 * Appends single evaluation to Google Sheets tab
 */
export async function appendEvaluationToGoogleSheet(
  accessToken: string,
  spreadsheetId: string,
  evalData: Omit<Evaluation, 'id' | 'submittedAt'> | Evaluation
): Promise<boolean> {
  const cleanId = extractSpreadsheetId(spreadsheetId);
  if (!cleanId) return false;

  // Determine target sheet tab
  const rawGrup = String(evalData.grup || '').toUpperCase().trim();
  const targetTab = TARGET_SHEET_TABS.find((t) => t === rawGrup) || 'HASIL INPUT';

  const rowValues = [
    new Date().toISOString(),
    evalData.grup,
    evalData.noReg,
    evalData.nama,
    evalData.jabatan || '',
    evalData.nil1,
    evalData.nil2,
    evalData.average,
    evalData.periode,
    'SUBMITTED'
  ];

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/'${encodeURIComponent(targetTab)}'!A:J:append?valueInputOption=USER_ENTERED`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      values: [rowValues],
    }),
  });

  return res.ok;
}

/**
 * Bulk append multiple evaluations to their respective tabs
 */
export async function batchAppendEvaluationsToGoogleSheet(
  accessToken: string,
  spreadsheetId: string,
  evaluations: Evaluation[]
): Promise<{ successCount: number; failedCount: number }> {
  const cleanId = extractSpreadsheetId(spreadsheetId);
  if (!cleanId || evaluations.length === 0) {
    return { successCount: 0, failedCount: 0 };
  }

  // Group by target sheet tab
  const grouped: Record<string, any[][]> = {};
  TARGET_SHEET_TABS.forEach((t) => {
    grouped[t] = [];
  });

  evaluations.forEach((item) => {
    const rawGrup = String(item.grup || '').toUpperCase().trim();
    const tab = TARGET_SHEET_TABS.find((t) => t === rawGrup) || 'HASIL INPUT';
    grouped[tab].push([
      item.submittedAt || new Date().toISOString(),
      item.grup,
      item.noReg,
      item.nama,
      item.jabatan || '',
      item.nil1,
      item.nil2,
      item.average,
      item.periode,
      'SUBMITTED'
    ]);
  });

  let successCount = 0;
  let failedCount = 0;

  for (const [tab, rows] of Object.entries(grouped)) {
    if (rows.length === 0) continue;

    try {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/'${encodeURIComponent(tab)}'!A:J:append?valueInputOption=USER_ENTERED`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          values: rows,
        }),
      });

      if (res.ok) {
        successCount += rows.length;
      } else {
        failedCount += rows.length;
      }
    } catch (e) {
      console.error(`Error appending to sheet tab ${tab}:`, e);
      failedCount += rows.length;
    }
  }

  return { successCount, failedCount };
}

/**
 * Updates the 'CSV' sheet tab directly in the Google Spreadsheet
 * matching the user's header structure:
 * NIK | Nama Karyawan | KUALITAS | KUANTITAS | KEHADIRAN | KEDISIPLINAN
 */
export async function updateGoogleSheetCsvTab(
  accessToken: string,
  spreadsheetId: string,
  rows: { nik: string; namaKaryawan: string; kualitas: number; kuantitas: number }[]
): Promise<{ success: boolean; updatedRows: number; error?: string }> {
  const cleanId = extractSpreadsheetId(spreadsheetId);
  if (!cleanId) {
    return { success: false, updatedRows: 0, error: 'ID Spreadsheet tidak valid' };
  }

  try {
    // 1. Prepare values: Header in Row 1, data in Row 2 onwards
    const header = ['NIK', 'Nama Karyawan', 'KUALITAS', 'KUANTITAS', 'KEHADIRAN', 'KEDISIPLINAN'];
    const dataRows = rows.map((r) => [r.nik, r.namaKaryawan, r.kualitas, r.kuantitas, '', '']);
    const allValues = [header, ...dataRows];

    // 2. Clear existing values in CSV sheet first to prevent orphaned rows
    const clearUrl = `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/'CSV'!A:F:clear`;
    await fetch(clearUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    // 3. Write new values into 'CSV'!A1:F
    const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${cleanId}/values/'CSV'!A1:F?valueInputOption=USER_ENTERED`;
    const res = await fetch(updateUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        range: "'CSV'!A1:F",
        majorDimension: 'ROWS',
        values: allValues,
      }),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      return {
        success: false,
        updatedRows: 0,
        error: errJson.error?.message || `HTTP ${res.status}: Gagal memperbarui sheet CSV`,
      };
    }

    return { success: true, updatedRows: rows.length };
  } catch (err: any) {
    console.error('Error updating Google Sheet CSV tab:', err);
    return { success: false, updatedRows: 0, error: err.message || 'Terjadi kesalahan jaringan' };
  }
}
