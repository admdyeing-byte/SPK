/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { AppConfig, Evaluation, Employee } from '../types';
import { PREPOPULATED_EMPLOYEES } from '../data';
import { getPeriodePenilaian, normalizeNoReg } from '../utils';
import { isFirebaseActive, saveCloudEvaluationsBatch } from '../firebase';
import { 
  Database, 
  Copy, 
  Check, 
  Info, 
  FileSpreadsheet, 
  Download, 
  Send, 
  Globe, 
  Key, 
  RefreshCw, 
  Sparkles, 
  Trash2, 
  HelpCircle, 
  AlertTriangle,
  ExternalLink,
  FolderOpen,
  PlusCircle,
  CheckCircle2,
  ShieldCheck,
  Zap
} from 'lucide-react';
import GoogleSignInButton from './GoogleSignInButton';
import { getCurrentGoogleUser, getAccessToken, addAuthListener } from '../googleAuth';
import { 
  extractSpreadsheetId, 
  getSpreadsheetDetails, 
  listDriveSpreadsheets, 
  createEvaluationSpreadsheet, 
  DriveSpreadsheetFile 
} from '../services/googleSheetsService';
import { User } from 'firebase/auth';

interface GoogleSheetsConfigProps {
  config: AppConfig;
  onUpdateConfig: (newConfig: Partial<AppConfig>) => void;
  onTestConnection: () => Promise<{ success: boolean; message: string }>;
  evaluations: Evaluation[];
  onClearAllEvaluations: (isDemoOnly: boolean) => Promise<void>;
  onShowAlert?: (title: string, message: string) => void;
  employees?: Employee[];
  onResetAndSyncFromSpreadsheet?: () => Promise<void>;
  onSyncFromGoogleSheetsAPI?: () => Promise<{ success: boolean; count: number; message: string }>;
  onPushToGoogleSheetsAPI?: () => Promise<{ success: boolean; count: number; message: string }>;
}

export default function GoogleSheetsConfig({ 
  config, 
  onUpdateConfig, 
  onTestConnection, 
  evaluations, 
  onClearAllEvaluations, 
  onShowAlert, 
  employees,
  onResetAndSyncFromSpreadsheet,
  onSyncFromGoogleSheetsAPI,
  onPushToGoogleSheetsAPI
}: GoogleSheetsConfigProps) {
  const [activeTab, setActiveTab] = useState<'google_api' | 'webhook' | 'oauth_backup'>('google_api');
  const [copiedScript, setCopiedScript] = useState(false);
  const [copiedCSV, setCopiedCSV] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [clearStatus, setClearStatus] = useState<string | null>(null);
  const [activeConfirmType, setActiveConfirmType] = useState<'demo' | 'reset_all' | 'reset_sync' | 'google_push' | null>(null);

  // Google Workspace API state
  const [googleUser, setGoogleUser] = useState<User | null>(getCurrentGoogleUser());
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [isDriveLoading, setIsDriveLoading] = useState(false);
  const [driveSpreadsheets, setDriveSpreadsheets] = useState<DriveSpreadsheetFile[]>([]);
  const [isCreatingSheet, setIsCreatingSheet] = useState(false);
  const [isTestingGoogleApi, setIsTestingGoogleApi] = useState(false);
  const [googleApiResult, setGoogleApiResult] = useState<{ success: boolean; message: string; title?: string; tabs?: string[] } | null>(null);
  const [isSyncingFromGoogleApi, setIsSyncingFromGoogleApi] = useState(false);
  const [isPushingToGoogleApi, setIsPushingToGoogleApi] = useState(false);
  const [googleSyncFeedback, setGoogleSyncFeedback] = useState<string | null>(null);

  useEffect(() => {
    getAccessToken().then(setGoogleToken);
    const unsub = addAuthListener((user, token) => {
      setGoogleUser(user);
      setGoogleToken(token);
    });
    return () => unsub();
  }, []);

  // Audit and recovery state variables
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditResult, setAuditResult] = useState<{
    totalChecked: number;
    missingCount: number;
    missingItems: Evaluation[];
  } | null>(null);
  const [isRecovering, setIsRecovering] = useState(false);
  const [recoveryStatus, setRecoveryStatus] = useState<string | null>(null);

  // Keyboard confirmation listeners for Enter, Space, and Escape
  useEffect(() => {
    if (!activeConfirmType) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const type = activeConfirmType;
        setActiveConfirmType(null);
        if (type === 'demo') {
          triggerClearData(true);
        } else if (type === 'reset_all') {
          triggerClearData(false);
        } else if (type === 'reset_sync') {
          handleResetAndSyncClick();
        } else if (type === 'google_push') {
          executePushToGoogleSheets();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setActiveConfirmType(null);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeConfirmType]);

  // Google Sheets API handlers
  const handleTestGoogleApi = async () => {
    const token = googleToken || await getAccessToken();
    if (!token) {
      setGoogleApiResult({
        success: false,
        message: 'Silakan klik Masuk dengan Google terlebih dahulu.',
      });
      return;
    }
    const cleanId = extractSpreadsheetId(config.spreadsheetId);
    if (!cleanId) {
      setGoogleApiResult({
        success: false,
        message: 'Masukkan ID Spreadsheet atau tautan URL Google Spreadsheet Anda.',
      });
      return;
    }

    setIsTestingGoogleApi(true);
    setGoogleApiResult(null);
    try {
      const details = await getSpreadsheetDetails(token, cleanId);
      setGoogleApiResult({
        success: true,
        message: `Terhubung dengan spreadsheet: "${details.title}"`,
        title: details.title,
        tabs: details.sheetNames,
      });
    } catch (err: any) {
      setGoogleApiResult({
        success: false,
        message: `Gagal mengakses spreadsheet: ${err.message || 'Pastikan akun Google Anda memiliki akses atau izin edit ke file ini.'}`,
      });
    } finally {
      setIsTestingGoogleApi(false);
    }
  };

  const handleLoadDriveSpreadsheets = async () => {
    const token = googleToken || await getAccessToken();
    if (!token) {
      onShowAlert?.('Masuk dengan Google', 'Silakan klik Masuk dengan Google terlebih dahulu.');
      return;
    }
    setIsDriveLoading(true);
    try {
      const list = await listDriveSpreadsheets(token);
      setDriveSpreadsheets(list);
      if (list.length === 0) {
        onShowAlert?.('Google Drive', 'Tidak ditemukan file Google Spreadsheet di Drive akun Google Anda.');
      }
    } catch (err: any) {
      onShowAlert?.('Gagal Mengakses Drive', err.message || 'Terjadi kesalahan saat memuat file dari Google Drive.');
    } finally {
      setIsDriveLoading(false);
    }
  };

  const handleCreateNewSpreadsheet = async () => {
    const token = googleToken || await getAccessToken();
    if (!token) {
      onShowAlert?.('Masuk dengan Google', 'Silakan klik Masuk dengan Google terlebih dahulu.');
      return;
    }
    setIsCreatingSheet(true);
    try {
      const title = `SPK Penilaian Karyawan - Yarn Dyeing (${new Date().toLocaleDateString('id-ID', { month: 'short', year: 'numeric' })})`;
      const created = await createEvaluationSpreadsheet(token, title);
      onUpdateConfig({ spreadsheetId: created.id });
      setGoogleApiResult({
        success: true,
        message: `Spreadsheet baru "${created.name}" berhasil dibuat di Drive Anda dengan tab A, B, C, NS, MTC, LAB, QC, dan HASIL INPUT!`,
        title: created.name,
        tabs: ['A', 'B', 'C', 'NS', 'MTC', 'LAB', 'QC', 'HASIL INPUT'],
      });
      onShowAlert?.('Spreadsheet Berhasil Dibuat', `File "${created.name}" berhasil dibuat di Google Drive dan telah disetel sebagai spreadsheet aktif.`);
    } catch (err: any) {
      onShowAlert?.('Gagal Membuat Spreadsheet', err.message || 'Terjadi kesalahan saat membuat spreadsheet baru.');
    } finally {
      setIsCreatingSheet(false);
    }
  };

  const handleSyncFromGoogleApiClick = async () => {
    if (!onSyncFromGoogleSheetsAPI) return;
    setIsSyncingFromGoogleApi(true);
    setGoogleSyncFeedback(null);
    try {
      const res = await onSyncFromGoogleSheetsAPI();
      setGoogleSyncFeedback(res.message);
      if (onShowAlert) {
        onShowAlert(res.success ? 'Sinkronisasi Berhasil' : 'Sinkronisasi Gagal', res.message);
      }
    } catch (err: any) {
      setGoogleSyncFeedback(err.message || 'Gagal sinkronisasi data.');
    } finally {
      setIsSyncingFromGoogleApi(false);
    }
  };

  const executePushToGoogleSheets = async () => {
    if (!onPushToGoogleSheetsAPI) return;
    setIsPushingToGoogleApi(true);
    setGoogleSyncFeedback(null);
    try {
      const res = await onPushToGoogleSheetsAPI();
      setGoogleSyncFeedback(res.message);
      if (onShowAlert) {
        onShowAlert(res.success ? 'Pengiriman Berhasil' : 'Pengiriman Gagal', res.message);
      }
    } catch (err: any) {
      setGoogleSyncFeedback(err.message || 'Gagal mengirim data ke spreadsheet.');
    } finally {
      setIsPushingToGoogleApi(false);
    }
  };

  // App Script code to append values automatically and fetch values
  const gasCode = `function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var targetSheets = ["A", "B", "C", "NS", "MTC", "LAB", "QC", "HASIL INPUT"];
    var dataList = [];
    
    for (var s = 0; s < targetSheets.length; s++) {
      var sheet = ss.getSheetByName(targetSheets[s]);
      if (!sheet) continue;
      
      var lastRow = sheet.getLastRow();
      if (lastRow <= 1) continue;
      
      var range = sheet.getRange(1, 1, lastRow, sheet.getLastColumn());
      var values = range.getValues();
      var headers = values[0];
      
      // Normalize header indices
      var colIdx = {};
      for (var i = 0; i < headers.length; i++) {
        var headerName = headers[i].toString().toUpperCase().trim();
        colIdx[headerName] = i;
      }
      
      for (var r = 1; r < values.length; r++) {
        var row = values[r];
        
        var ts = colIdx["TIMESTAMPS"] !== undefined ? row[colIdx["TIMESTAMPS"]] : "";
        var grup = colIdx["GRUP"] !== undefined ? row[colIdx["GRUP"]] : "";
        var noReg = colIdx["NO.REG"] !== undefined ? row[colIdx["NO.REG"]] : "";
        var nama = colIdx["NAMA"] !== undefined ? row[colIdx["NAMA"]] : "";
        var jab = colIdx["JAB"] !== undefined ? row[colIdx["JAB"]] : "";
        var nil1 = colIdx["KUALITAS"] !== undefined ? Number(row[colIdx["KUALITAS"]]) : 0;
        var nil2 = colIdx["KUANTITAS"] !== undefined ? Number(row[colIdx["KUANTITAS"]]) : 0;
        var average = (nil1 + nil2) / 2;
        var periode = colIdx["PERIODE"] !== undefined ? row[colIdx["PERIODE"]] : "";
        
        var submittedAtStr = "";
        if (ts instanceof Date) {
          submittedAtStr = ts.toISOString();
        } else if (ts) {
          submittedAtStr = new Date(ts).toISOString();
        } else {
          submittedAtStr = new Date().toISOString();
        }
        
        if (noReg && nama) {
          dataList.push({
            periode: (periode || "Juni 2026").toString().trim(),
            noReg: noReg.toString().trim(),
            nama: nama.toString().trim(),
            jabatan: jab.toString().trim(),
            grup: grup.toString().trim(),
            sheetName: targetSheets[s],
            nil1: isNaN(nil1) ? 0 : nil1,
            nil2: isNaN(nil2) ? 0 : nil2,
            average: isNaN(average) ? 0 : average,
            submittedAt: submittedAtStr
          });
        }
      }
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      "status": "success",
      "data": dataList
    })).setMimeType(ContentService.MimeType.JSON);
       
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      "status": "error",
      "message": error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    var contents = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    
    if (contents.action === 'sync_employee_db') {
      var sheetName = "DBKaryawan";
      var sheets = ss.getSheets();
      var sheet = null;
      for (var i = 0; i < sheets.length; i++) {
        if (sheets[i].getName().toUpperCase() === "DBKARYAWAN") {
          sheet = sheets[i];
          break;
        }
      }
      if (!sheet) {
        sheet = ss.insertSheet(sheetName);
      }
      
      if (sheet.getLastRow() === 0) {
        sheet.appendRow(["NO", "ID UNIK", "GRUP", "NO.REG", "NAMA", "JAB"]);
      }
      
      var lastRow = sheet.getLastRow();
      var range = sheet.getRange(1, 1, Math.max(lastRow, 1), sheet.getLastColumn());
      var values = range.getValues();
      var headers = values[0];
      
      var colIdx = {};
      for (var i = 0; i < headers.length; i++) {
        var hName = headers[i].toString().toUpperCase().trim().replace(/[\\s\\.\\-_]/g, '');
        colIdx[hName] = i;
      }
      
      var idColIdx = colIdx["IDUNIK"] !== undefined ? colIdx["IDUNIK"] : 1;
      var grupColIdx = colIdx["GRUP"] !== undefined ? colIdx["GRUP"] : 2;
      var noregColIdx = colIdx["NOREG"] !== undefined ? colIdx["NOREG"] : 3;
      var namaColIdx = colIdx["NAMA"] !== undefined ? colIdx["NAMA"] : 4;
      var jabColIdx = colIdx["JAB"] !== undefined ? colIdx["JAB"] : 5;
      
      var targetNoReg = (contents.noReg || "").toString().trim().toUpperCase();
      var targetIdUnik = (contents.empId || "").toString().trim().toUpperCase();
      
      var foundRowIdx = -1;
      for (var r = 1; r < values.length; r++) {
        var rowNoReg = (values[r][noregColIdx] || "").toString().trim().toUpperCase();
        var rowIdUnik = (values[r][idColIdx] || "").toString().trim().toUpperCase();
        if ((targetNoReg && rowNoReg === targetNoReg) || (targetIdUnik && rowIdUnik === targetIdUnik)) {
          foundRowIdx = r + 1;
          break;
        }
      }
      
      if (contents.type === 'add') {
        if (foundRowIdx === -1) {
          var nextNo = sheet.getLastRow();
          sheet.appendRow([
            nextNo,
            contents.empId || "",
            contents.grup || "",
            contents.noReg || "",
            contents.nama || "",
            contents.jabatan || ""
          ]);
        } else {
          sheet.getRange(foundRowIdx, idColIdx + 1).setValue(contents.empId || "");
          sheet.getRange(foundRowIdx, grupColIdx + 1).setValue(contents.grup || "");
          sheet.getRange(foundRowIdx, noregColIdx + 1).setValue(contents.noReg || "");
          sheet.getRange(foundRowIdx, namaColIdx + 1).setValue(contents.nama || "");
          sheet.getRange(foundRowIdx, jabColIdx + 1).setValue(contents.jabatan || "");
        }
      } else if (contents.type === 'edit') {
        if (foundRowIdx !== -1) {
          sheet.getRange(foundRowIdx, idColIdx + 1).setValue(contents.empId || "");
          sheet.getRange(foundRowIdx, grupColIdx + 1).setValue(contents.grup || "");
          sheet.getRange(foundRowIdx, noregColIdx + 1).setValue(contents.noReg || "");
          sheet.getRange(foundRowIdx, namaColIdx + 1).setValue(contents.nama || "");
          sheet.getRange(foundRowIdx, jabColIdx + 1).setValue(contents.jabatan || "");
        } else {
          var nextNo = sheet.getLastRow();
          sheet.appendRow([
            nextNo,
            contents.empId || "",
            contents.grup || "",
            contents.noReg || "",
            contents.nama || "",
            contents.jabatan || ""
          ]);
        }
      } else if (contents.type === 'delete') {
        if (foundRowIdx !== -1) {
          sheet.deleteRow(foundRowIdx);
          var newLastRow = sheet.getLastRow();
          if (newLastRow > 1) {
            for (var r = 2; r <= newLastRow; r++) {
              sheet.getRange(r, 1).setValue(r - 1);
            }
          }
        }
      }
      
      return ContentService.createTextOutput(JSON.stringify({
        "status": "success",
        "message": "Sync employee database success (" + contents.type + ")"
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // Dukung input single object maupun array kumpulan batch data
    var records = [];
    if (Array.isArray(contents)) {
      records = contents;
    } else {
      records.push(contents);
    }
    
    var responseDetails = [];
    
    for (var i = 0; i < records.length; i++) {
      var item = records[i];
      
      // Determine sheet name based on the item's group
      var rawGrup = (item.grup || "").toString().trim().toUpperCase();
      var targetSheetName = "HASIL INPUT"; // fallback default
      
      if (rawGrup === "A" || rawGrup === "GRUP A" || rawGrup === "KSS GRUP A" || rawGrup.indexOf("GRUP A") !== -1) {
        targetSheetName = "A";
      } else if (rawGrup === "B" || rawGrup === "GRUP B" || rawGrup === "KSS GRUP B" || rawGrup.indexOf("GRUP B") !== -1) {
        targetSheetName = "B";
      } else if (rawGrup === "C" || rawGrup === "GRUP C" || rawGrup === "KSS GRUP C" || rawGrup.indexOf("GRUP C") !== -1) {
        targetSheetName = "C";
      } else if (rawGrup === "NS" || rawGrup === "NON-SHIFT" || rawGrup === "NON SHIFT" || rawGrup.indexOf("NON-SHIFT") !== -1) {
        targetSheetName = "NS";
      } else if (rawGrup === "MTC" || rawGrup === "MAINTENANCE" || rawGrup.indexOf("MTC") !== -1 || rawGrup.indexOf("MAINTENANCE") !== -1) {
        targetSheetName = "MTC";
      } else if (rawGrup === "LAB" || rawGrup === "LABORATORIUM" || rawGrup.indexOf("LAB") !== -1 || rawGrup.indexOf("LABORATORIUM") !== -1) {
        targetSheetName = "LAB";
      } else if (rawGrup === "QC" || rawGrup === "QUALITY CONTROL" || rawGrup.indexOf("QC") !== -1 || rawGrup.indexOf("QUALITY CONTROL") !== -1) {
        targetSheetName = "QC";
      }
      
      // Fetch or insert the sheet
      var sheet = ss.getSheetByName(targetSheetName);
      if (!sheet) {
        sheet = ss.insertSheet(targetSheetName);
      }
      
      // Jika sheet baru/kosong, buat header
      if (sheet.getLastRow() === 0) {
        sheet.appendRow([
          "TIMESTAMPS", 
          "GRUP", 
          "NO.REG", 
          "NAMA", 
          "JAB", 
          "KUALITAS", 
          "KUANTITAS", 
          "SKOR",
          "PERIODE"
        ]);
      }
      
      var n1 = Number(item.nil1 || item.nil_1 || item.kualitas || 0);
      var n2 = Number(item.nil2 || item.nil_2 || item.kuantitas || 0);
      var skorVal = Number(item.skor || (n1 + n2));
      
      sheet.appendRow([
        new Date(), // TIMESTAMPS otomatis
        item.grup || "",
        item.noRegStr || item.noReg || item.no_reg || "",
        item.nama || item.name || "",
        item.jabatan || item.jab || "",
        n1,
        n2,
        skorVal,
        item.periode || ""
      ]);
      
      responseDetails.push(targetSheetName);
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      "status": "success",
      "message": "Berhasil menyimpan " + records.length + " baris data ke sheet(s): " + responseDetails.join(", ")
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      "status": "error",
      "message": error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}`;

  const copyScriptToClipboard = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(gasCode);
        setCopiedScript(true);
        setTimeout(() => setCopiedScript(false), 3000);
      } else {
        // Fallback for sandboxed context
        const textArea = document.createElement("textarea");
        textArea.value = gasCode;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
        setCopiedScript(true);
        setTimeout(() => setCopiedScript(false), 3000);
      }
    } catch (err) {
      console.error('Failed to copy code: ', err);
    }
  };

  const handleTest = async () => {
    if (!config.webhookUrl) {
      setTestResult({ success: false, message: 'Masukkan URL Webhook terlebih dahulu.' });
      return;
    }
    
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await onTestConnection();
      setTestResult(res);
    } catch {
      setTestResult({ success: false, message: 'Gagal terhubung ke URL Webhook. Periksa setelan deploy Anda.' });
    } finally {
      setIsTesting(false);
    }
  };

  // Convert local state to CSV (Matching Google Sheets header and column structure perfectly)
  const generateCSVData = (useSemicolon = false) => {
    if (evaluations.length === 0) return '';
    const delimiter = useSemicolon ? ';' : ',';
    const headers = [
      'TIMESTAMPS',
      'GRUP',
      'NO.REG',
      'NAMA',
      'JAB',
      'KUALITAS',
      'KUANTITAS',
      'SKOR',
      'PERIODE'
    ].join(delimiter) + '\n';

    const rows = evaluations.map(e => {
      // Look up Jabatan from prepopulated list if missing
      let jab = e.jabatan || '';
      if (!jab) {
        const emp = (employees || PREPOPULATED_EMPLOYEES).find(x => x.noReg === e.noReg);
        if (emp && emp.jabatan) {
          jab = emp.jabatan;
        }
      }
      const totalSkor = e.nil1 + e.nil2;
      return [
        `"${e.submittedAt}"`,
        `"${e.grup}"`,
        `"${e.noReg}"`,
        `"${e.nama.replace(/"/g, '""')}"`,
        `"${jab.replace(/"/g, '""')}"`,
        e.nil1,
        e.nil2,
        totalSkor,
        `"${e.periode}"`
      ].join(delimiter);
    }).join('\n');

    return headers + rows;
  };

  const copyCSVToClipboard = async () => {
    const csv = generateCSVData(false);
    if (!csv) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(csv);
        setCopiedCSV(true);
        setTimeout(() => setCopiedCSV(false), 3000);
      } else {
        // Fallback for sandboxed context
        const textArea = document.createElement("textarea");
        textArea.value = csv;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
        setCopiedCSV(true);
        setTimeout(() => setCopiedCSV(false), 3000);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const downloadCSVFile = (useSemicolon = false) => {
    const csv = generateCSVData(useSemicolon);
    if (!csv) return;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const suffix = useSemicolon ? 'excel_semikolon' : 'standar_koma';
    link.setAttribute('download', `format_upload_performance_${suffix}_${new Date().toISOString().substring(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const triggerClearData = async (isDemoOnly: boolean) => {
    try {
      setClearStatus(isDemoOnly ? 'Merapikan data demo...' : 'Mereset total data...');
      await onClearAllEvaluations(isDemoOnly);
      setClearStatus(isDemoOnly ? '✓ Data Uji Coba Demo berhasil diringkas!' : '✓ Seluruh data evaluasi berhasil dikosongkan!');
      setTimeout(() => setClearStatus(null), 4000);
    } catch (err) {
      setClearStatus('❌ Gagal mengosongkan data.');
      setTimeout(() => setClearStatus(null), 3000);
    }
  };

  const handleResetAndSyncClick = async () => {
    if (!onResetAndSyncFromSpreadsheet) return;
    try {
      setClearStatus('Sedang mereset & menyelaraskan ulang...');
      await onResetAndSyncFromSpreadsheet();
      setClearStatus('✓ Reset & sinkronisasi ulang berhasil dilakukan!');
      setTimeout(() => setClearStatus(null), 4000);
    } catch (err) {
      setClearStatus('❌ Gagal mereset & menyelaraskan.');
      setTimeout(() => setClearStatus(null), 3000);
    }
  };

  const handleAuditSpreadsheetData = async () => {
    if (!config.webhookUrl) {
      if (onShowAlert) {
        onShowAlert("Audit Gagal", "URL Webhook belum diatur. Harap simpan URL Webhook Anda terlebih dahulu.");
      } else {
        alert("URL Webhook belum diatur.");
      }
      return;
    }

    setIsAuditing(true);
    setAuditResult(null);
    setRecoveryStatus(null);

    try {
      const res = await fetch(config.webhookUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        }
      });
      
      if (!res.ok) {
        throw new Error(`HTTP Error: ${res.status}`);
      }

      const json = await res.json();
      if (json.status !== "success" || !Array.isArray(json.data)) {
        throw new Error("Format respons Spreadsheet Apps Script tidak valid.");
      }

      const sheetEvals: any[] = json.data;
      
      // Get current active period
      const activePeriod = getPeriodePenilaian(new Date(), config.activeGroup === 'ALL' ? config.isDemoMode : false).readable;
      const normalizedActivePeriod = activePeriod.trim().toLowerCase();

      const todayDateStr = new Date().toDateString();
      const todayFormatted = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

      // Filter evaluations that are official (not isSupportive), NOT demo (isDemo is false/undefined), and submitted TODAY ONLY
      const officialLocalEvals = evaluations.filter(e => {
        const isOfficial = !e.isSupportive;
        const isNotDemo = !e.isDemo;
        const isCurrentPeriod = e.periode && e.periode.trim().toLowerCase() === normalizedActivePeriod;
        
        let isToday = false;
        if (e.submittedAt) {
          const subDate = new Date(e.submittedAt);
          if (!isNaN(subDate.getTime())) {
            isToday = subDate.toDateString() === todayDateStr;
          }
        }
        
        return isOfficial && isNotDemo && isCurrentPeriod && isToday;
      });

      const missing = officialLocalEvals.filter(e => {
        const normNoReg = normalizeNoReg(e.noReg);
        const normPeriod = e.periode.trim().toLowerCase();
        const normGrup = e.grup ? e.grup.trim().toUpperCase() : '';

        const foundInSheet = sheetEvals.some(s => {
          const sNoReg = normalizeNoReg(s.noReg ? s.noReg.toString() : '');
          const sPeriod = s.periode ? s.periode.toString().trim().toLowerCase() : '';
          const sGrup = s.grup ? s.grup.toString().trim().toUpperCase() : '';
          return sNoReg === normNoReg && sPeriod === normPeriod && sGrup === normGrup;
        });

        return !foundInSheet;
      });

      setAuditResult({
        totalChecked: officialLocalEvals.length,
        missingCount: missing.length,
        missingItems: missing
      });

    } catch (err: any) {
      console.error(err);
      if (onShowAlert) {
        onShowAlert("Gagal Audit", `Tidak dapat mencocokkan data dengan Spreadsheet. Pastikan URL Webhook Anda aktif.\n\nDetail: ${err.message || err}`);
      }
    } finally {
      setIsAuditing(false);
    }
  };

  const handleRecoverMissingData = async () => {
    if (!auditResult || auditResult.missingCount === 0 || !config.webhookUrl) return;

    setIsRecovering(true);
    setRecoveryStatus("Sedang mengirim ulang data terperangkap ke Spreadsheet...");

    try {
      const itemsToSend = auditResult.missingItems.map(item => ({
        periode: item.periode,
        grup: item.grup,
        noReg: item.noReg,
        nama: item.nama,
        jabatan: item.jabatan || '',
        nil1: item.nil1,
        nil2: item.nil2,
        skor: item.nil1 + item.nil2,
        average: item.average,
        isSupportive: false
      }));

      // Send row-by-row sequentially for maximum compatibility with both legacy and new Apps Script deployments
      for (let i = 0; i < itemsToSend.length; i++) {
        await fetch(config.webhookUrl, {
          method: 'POST',
          mode: 'no-cors',
          headers: {
            'Content-Type': 'text/plain',
          },
          body: JSON.stringify(itemsToSend[i]),
        });
        if (i < itemsToSend.length - 1) {
          await new Promise(r => setTimeout(r, 90));
        }
      }

      setRecoveryStatus(`✓ Berhasil mengirimkan ${auditResult.missingCount} data penilaian ke Spreadsheet!`);
      
      setAuditResult({
        totalChecked: auditResult.totalChecked,
        missingCount: 0,
        missingItems: []
      });

      if (onResetAndSyncFromSpreadsheet) {
        await onResetAndSyncFromSpreadsheet();
      }

    } catch (err: any) {
      console.error(err);
      setRecoveryStatus(`❌ Gagal mengirimkan data: ${err.message || err}`);
    } finally {
      setIsRecovering(false);
      setTimeout(() => setRecoveryStatus(null), 5000);
    }
  };

  return (
    <div id="sheets-config-card" className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-6">
      
      {/* SECTION 1: ADMINISTRASI UTAMA & CONTROL MODE DEMO */}
      <div className="bg-slate-50 rounded-xl p-5 border border-slate-200 space-y-4">
        <div className="flex items-center gap-2.5 border-b pb-3 border-slate-200">
          <div className="p-2 bg-amber-100 border border-amber-200 text-amber-650 rounded-lg">
            <Sparkles className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-wide">Pengontrol Admin & Mode Demo</h3>
            <p className="text-[11px] text-slate-400">Atur status pengiriman data dan lakukan pembersihan basis data</p>
          </div>
        </div>

        {/* ON / OFF Switch for Demo Mode */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white border border-slate-150 p-4.5 rounded-xl">
          <div>
            <span className="text-xs font-bold text-slate-800 block">Status Fitur: {config.isDemoMode ? '🟢 DEMO AKTIF' : '🟢 LIVE AKTIF'}</span>
            <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">
              {config.isDemoMode 
                ? 'Data hanya disimpan sebagai uji coba dan di-bypass dari Spreadsheet Anda.' 
                : 'Data adalah asli dan akan dikirim permanen ke Google Spreadsheet.'
              }
            </p>
          </div>
          
          <button
            type="button"
            onClick={() => {
              onUpdateConfig({ isDemoMode: !config.isDemoMode });
            }}
            className={`w-full sm:w-auto px-5 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all duration-300 shadow-3xs hover:shadow text-center cursor-pointer ${
              config.isDemoMode 
                ? 'bg-amber-500 hover:bg-amber-600 text-white' 
                : 'bg-slate-250 hover:bg-slate-300 text-slate-700'
            }`}
          >
            {config.isDemoMode ? 'LIVE' : 'DEMO'}
          </button>
        </div>

        {/* Database Cleaners buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-1">
          {/* Wipe only demo */}
          <button
            type="button"
            disabled={!!clearStatus}
            onClick={() => setActiveConfirmType('demo')}
            className="p-3 bg-white hover:bg-amber-50 disabled:bg-slate-100 disabled:opacity-50 border border-amber-200 rounded-lg font-bold text-xs text-amber-700 transition flex items-center justify-center gap-2 cursor-pointer shadow-3xs"
          >
            <Trash2 className="w-4 h-4 text-amber-600 shrink-0" />
            Clear Data Demo
          </button>

          {/* Wipe all data */}
          <button
            type="button"
            disabled={!!clearStatus}
            onClick={() => setActiveConfirmType('reset_all')}
            className="p-3 bg-rose-50 hover:bg-rose-100 disabled:bg-slate-100 disabled:opacity-50 text-rose-700 border border-rose-100 rounded-lg font-bold text-xs transition flex items-center justify-center gap-2 cursor-pointer animate-pulse"
          >
            <Trash2 className="w-4 h-4 text-rose-600 shrink-0" />
            Reset Data
          </button>

          {/* Reset and Sync from Spreadsheet directly */}
          <button
            type="button"
            disabled={!!clearStatus || !config.webhookUrl}
            onClick={() => setActiveConfirmType('reset_sync')}
            className="p-3 bg-emerald-50 hover:bg-emerald-100 disabled:bg-slate-100 disabled:opacity-50 text-emerald-700 border border-emerald-200 rounded-lg font-bold text-xs transition flex items-center justify-center gap-2 cursor-pointer shadow-3xs"
          >
            <RefreshCw className="w-4 h-4 text-emerald-600 shrink-0" />
            Reset & Sync Sheet
          </button>
        </div>

        {/* Custom Confirmation Dialog (Replaces native window.confirm for iframe compatibility) */}
        {activeConfirmType && (
          <div className={`p-4 rounded-xl border ${
            activeConfirmType === 'reset_all' 
              ? 'bg-rose-50 border-rose-200 text-rose-950' 
              : activeConfirmType === 'reset_sync'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                : activeConfirmType === 'google_push'
                  ? 'bg-blue-50 border-blue-200 text-blue-950'
                  : 'bg-amber-50 border-amber-200 text-amber-950'
          } space-y-3 mt-2`}>
            <div className="flex items-start gap-2.5">
              <AlertTriangle className={`w-5 h-5 shrink-0 ${
                activeConfirmType === 'reset_all' 
                  ? 'text-rose-600' 
                  : activeConfirmType === 'reset_sync'
                    ? 'text-emerald-600'
                    : activeConfirmType === 'google_push'
                      ? 'text-blue-600'
                      : 'text-amber-600'
              } mt-0.5`} />
              <div>
                <strong className="text-xs font-black uppercase tracking-wide">
                  {activeConfirmType === 'reset_all' && '⚠️ Konfirmasi Reset Total'}
                  {activeConfirmType === 'reset_sync' && '⚡ Konfirmasi Kosongkan & Sync Ulang'}
                  {activeConfirmType === 'demo' && '🔍 Clear Data Demo'}
                  {activeConfirmType === 'google_push' && '📤 Konfirmasi Kirim Data ke Google Spreadsheet'}
                </strong>
                <p className="text-[11px] mt-1 leading-relaxed opacity-90">
                  {activeConfirmType === 'reset_all' && 'Apakah Anda yakin ingin menghapus seluruh data karyawan (lokal dan cloud) secara permanen? Tindakan ini tidak dapat dibatalkan.'}
                  {activeConfirmType === 'reset_sync' && 'Tindakan ini akan menghapus seluruh data penilaian di aplikasi (lokal & cloud), membersihkan sisa draf KSS, kemudian langsung mengambil data segar terbaru dari Google Spreadsheet Anda. Apakah Anda ingin melanjutkan?'}
                  {activeConfirmType === 'demo' && 'Apakah Anda yakin ingin membersihkan seluruh sisa draf dan data di mode uji coba/demo?'}
                  {activeConfirmType === 'google_push' && `Apakah Anda yakin ingin mengekspor & mengirim ${evaluations.length} data penilaian ke Google Spreadsheet (${config.spreadsheetId || 'ID Spreadsheet'})? Data baris baru akan ditambahkan ke lembar kerja sheet terkait sesuai grup masing-masing.`}
                </p>
              </div>
            </div>
            
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setActiveConfirmType(null)}
                className="px-3.5 py-1.5 bg-white border border-slate-250 hover:bg-slate-50 text-slate-700 font-bold text-[10px] uppercase rounded-md tracking-wider transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={async () => {
                  const type = activeConfirmType;
                  setActiveConfirmType(null);
                  if (type === 'demo') {
                    await triggerClearData(true);
                  } else if (type === 'reset_all') {
                    await triggerClearData(false);
                  } else if (type === 'reset_sync') {
                    await handleResetAndSyncClick();
                  } else if (type === 'google_push') {
                    await executePushToGoogleSheets();
                  }
                }}
                className={`px-3.5 py-1.5 font-bold text-[10px] uppercase rounded-md tracking-wider text-white transition cursor-pointer shadow-3xs ${
                  activeConfirmType === 'reset_all' 
                    ? 'bg-rose-600 hover:bg-rose-700' 
                    : activeConfirmType === 'reset_sync'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : activeConfirmType === 'google_push'
                        ? 'bg-blue-600 hover:bg-blue-700'
                        : 'bg-amber-600 hover:bg-amber-700'
                }`}
              >
                Ya, Lanjutkan
              </button>
            </div>
          </div>
        )}

        {/* Clear status feedback toast */}
        {clearStatus && (
          <div className="p-2.5 bg-amber-50 border border-amber-100 rounded text-[11px] text-amber-850 font-bold text-center">
            {clearStatus}
          </div>
        )}



        {/* Google spreadsheet instructions banner */}
        <div className="bg-blue-50/50 rounded-lg p-3 text-[10.5px] leading-relaxed text-blue-900 border border-blue-100/60 flex gap-2">
          <Info className="w-4 h-4 shrink-0 text-blue-500 mt-0.5" />
          <div>
            <strong className="font-bold block">Cara Merapikan Google Spreadsheet:</strong>
            <p className="text-slate-650 mt-0.5">
              Sistem kini mengarsipkan data input berdasarkan grup karyawan ke dalam masing-masing sheet khusus: <strong>"A"</strong>, <strong>"B"</strong>, <strong>"C"</strong>, <strong>"NS"</strong>, <strong>"MTC"</strong>, <strong>"LAB"</strong>, dan <strong>"QC"</strong>. Anda dapat merapikan data dengan menghapus baris 2 s.d terakhir langsung di lembar sheet masing-masing grup tersebut di Google Spreadsheet Anda.
            </p>
          </div>
        </div>
      </div>

      <hr className="border-slate-200" />

      {/* SECTION 2: SINKRONISASI GOOGLE SPREADSHEET */}
      <div className="flex items-center gap-2.5">
        <div className="p-2 bg-blue-50 border border-blue-100 text-blue-600 rounded-lg">
          <FileSpreadsheet className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-base font-bold text-slate-800">Sinkronisasi Google Spreadsheet</h3>
          <p className="text-xs text-slate-400 mt-0.5">Integrasikan form ini secara real-time ke tabel kerja Anda</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
        <button
          type="button"
          onClick={() => setActiveTab('google_api')}
          className={`flex-1 text-center py-2.5 text-xs font-bold rounded-lg transition cursor-pointer flex items-center justify-center gap-2 ${
            activeTab === 'google_api' ? 'bg-white text-blue-700 shadow-sm border border-blue-100' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
          <span>Google Sheets API (Resmi)</span>
          <span className="bg-emerald-100 text-emerald-700 text-[9px] font-black px-1.5 py-0.5 rounded uppercase">Rekomendasi</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('webhook')}
          className={`flex-1 text-center py-2.5 text-xs font-bold rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 ${
            activeTab === 'webhook' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Globe className="w-4 h-4" />
          <span>Apps Script Webhook</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('oauth_backup')}
          className={`flex-1 text-center py-2.5 text-xs font-bold rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 ${
            activeTab === 'oauth_backup' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Key className="w-4 h-4" />
          <span>Ekspor CSV Lokal</span>
        </button>
      </div>

      {activeTab === 'google_api' && (
        <div className="space-y-4">
          {/* Account Authentication Banner */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50/60 p-4 rounded-xl border border-blue-150 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-white rounded-xl shadow-xs border border-blue-100 text-blue-600">
                <ShieldCheck className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                  <span>Google Workspace Otorisasi Akun</span>
                  {googleUser && (
                    <span className="bg-emerald-100 text-emerald-700 text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                      Terhubung
                    </span>
                  )}
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                  {googleUser 
                    ? `Masuk sebagai ${googleUser.displayName || 'Pengguna'} (${googleUser.email}). Akses Google Sheets dan Drive telah diotorisasi.`
                    : 'Masuk dengan akun Google Anda untuk membaca, menyinkronkan, dan mengirim evaluasi langsung ke Google Sheets tanpa perantara.'}
                </p>
              </div>
            </div>
            <div className="shrink-0">
              <GoogleSignInButton compact={false} />
            </div>
          </div>

          {/* Spreadsheet Target Setting */}
          <div className="bg-white p-4.5 rounded-xl border border-slate-200 space-y-3 shadow-xs">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                ID atau Link Google Spreadsheet Target
              </label>
              {config.spreadsheetId && (
                <a
                  href={`https://docs.google.com/spreadsheets/d/${config.spreadsheetId}/edit`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 hover:underline"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Buka di Google Sheets
                </a>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                placeholder="Tempel ID atau tautan lengkap Google Spreadsheet..."
                value={config.spreadsheetId}
                onChange={(e) => {
                  const val = e.target.value.trim();
                  const extracted = extractSpreadsheetId(val);
                  onUpdateConfig({ spreadsheetId: extracted || val });
                }}
                className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
              />
              <button
                type="button"
                onClick={handleTestGoogleApi}
                disabled={isTestingGoogleApi || !config.spreadsheetId}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-100 disabled:text-slate-400 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 cursor-pointer transition shadow-xs shrink-0"
              >
                {isTestingGoogleApi ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Memeriksa...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-3.5 h-3.5" />
                    <span>Uji & Periksa Tab</span>
                  </>
                )}
              </button>
            </div>

            {/* Test / Inspection Result Banner */}
            {googleApiResult && (
              <div className={`p-3 rounded-lg border text-xs leading-relaxed space-y-2 ${
                googleApiResult.success 
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900' 
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}>
                <div className="flex items-center gap-1.5 font-bold">
                  {googleApiResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  )}
                  <span>{googleApiResult.message}</span>
                </div>
                {googleApiResult.tabs && googleApiResult.tabs.length > 0 && (
                  <div className="pt-1 border-t border-emerald-200/60">
                    <span className="text-[11px] font-bold text-emerald-800 block mb-1">
                      Lembar Sheet yang Terdeteksi ({googleApiResult.tabs.length}):
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {googleApiResult.tabs.map((tab) => (
                        <span 
                          key={tab} 
                          className="bg-white px-2 py-0.5 rounded text-[10px] font-bold border border-emerald-200 text-emerald-800 shadow-3xs"
                        >
                          {tab}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Quick Drive Utilities (Browse or Create New) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {/* Pick from Drive */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <FolderOpen className="w-4 h-4 text-amber-600" />
                  <span className="text-xs font-bold text-slate-700 uppercase">Pilih dari Google Drive</span>
                </div>
                <button
                  type="button"
                  onClick={handleLoadDriveSpreadsheets}
                  disabled={isDriveLoading || !googleUser}
                  className="text-[11px] font-bold text-blue-600 hover:text-blue-800 disabled:text-slate-400 flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${isDriveLoading ? 'animate-spin' : ''}`} />
                  <span>{isDriveLoading ? 'Memuat...' : 'Cari di Drive'}</span>
                </button>
              </div>
              <p className="text-[11px] text-slate-500">
                Ambil spreadsheet yang sudah ada di akun Google Drive Anda untuk dihubungkan.
              </p>
              {driveSpreadsheets.length > 0 && (
                <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1 pt-1">
                  {driveSpreadsheets.map((file) => (
                    <div
                      key={file.id}
                      className={`p-2 rounded-lg border text-xs flex items-center justify-between gap-2 transition ${
                        config.spreadsheetId === file.id
                          ? 'bg-blue-50 border-blue-300 text-blue-900 font-bold'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="truncate flex-1">
                        <span className="truncate block font-medium">{file.name}</span>
                        <span className="text-[10px] text-slate-400 block">
                          Diperbarui: {new Date(file.modifiedTime).toLocaleDateString('id-ID')}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          onUpdateConfig({ spreadsheetId: file.id });
                          onShowAlert?.('Spreadsheet Terpilih', `"${file.name}" telah disetel sebagai spreadsheet aktif.`);
                        }}
                        className={`px-2.5 py-1 text-[10px] font-bold rounded cursor-pointer shrink-0 ${
                          config.spreadsheetId === file.id
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                        }`}
                      >
                        {config.spreadsheetId === file.id ? 'Aktif' : 'Gunakan'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Create New Template */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2.5 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-1.5">
                  <PlusCircle className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs font-bold text-slate-700 uppercase">Buat Spreadsheet Otomatis</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Buat file Google Spreadsheet baru di Google Drive Anda dengan lembar grup <strong>"A"</strong>, <strong>"B"</strong>, <strong>"C"</strong>, <strong>"NS"</strong>, <strong>"MTC"</strong>, <strong>"LAB"</strong>, <strong>"QC"</strong>, dan <strong>"HASIL INPUT"</strong> serta judul kolom yang sudah rapi.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCreateNewSpreadsheet}
                disabled={isCreatingSheet || !googleUser}
                className="w-full mt-2 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-100 disabled:text-slate-400 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 cursor-pointer transition shadow-xs"
              >
                {isCreatingSheet ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Membuat File di Drive...</span>
                  </>
                ) : (
                  <>
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>Buat Spreadsheet Baru di Drive</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Direct Two-Way Sync Actions */}
          <div className="bg-slate-900 text-white p-4.5 rounded-xl border border-slate-800 space-y-3.5 shadow-md">
            <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-blue-400" />
                <span className="font-bold text-xs uppercase tracking-wider text-slate-200">
                  Sinkronisasi Data Dua Arah (Google Sheets REST API)
                </span>
              </div>
              <span className="text-[11px] text-slate-400">
                Total Evaluasi Tersimpan: <strong className="text-white">{evaluations.length}</strong>
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Pull from Google Sheets */}
              <button
                type="button"
                onClick={handleSyncFromGoogleApiClick}
                disabled={isSyncingFromGoogleApi || !googleUser || !config.spreadsheetId}
                className="p-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-800 disabled:text-slate-500 text-white rounded-lg font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition shadow-sm"
              >
                <RefreshCw className={`w-4 h-4 ${isSyncingFromGoogleApi ? 'animate-spin' : ''}`} />
                <span>{isSyncingFromGoogleApi ? 'Menyinkronkan...' : 'Tarik Data dari Spreadsheet (Sync)'}</span>
              </button>

              {/* Push to Google Sheets with Confirmation */}
              <button
                type="button"
                onClick={() => setActiveConfirmType('google_push')}
                disabled={isPushingToGoogleApi || !googleUser || !config.spreadsheetId || evaluations.length === 0}
                className="p-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-800 disabled:text-slate-500 text-white rounded-lg font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition shadow-sm"
              >
                <Send className="w-4 h-4" />
                <span>{isPushingToGoogleApi ? 'Mengirim Data...' : 'Kirim Semua Data ke Spreadsheet'}</span>
              </button>
            </div>

            {googleSyncFeedback && (
              <div className="p-2.5 bg-slate-800/90 border border-slate-700 rounded-lg text-xs text-blue-300 font-medium">
                {googleSyncFeedback}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'webhook' ? (
        <div className="space-y-4">
          
          {/* Quick instructions */}
          <div className="bg-blue-50/50 p-4 rounded-lg border border-blue-100 text-xs text-slate-700 space-y-2.5">
            <span className="font-bold text-blue-900 flex items-center gap-1">
              <Info className="w-4 h-4 text-blue-600 shrink-0" />
              Cara Menghubungkan Google Spreadsheet (Hanya 1 Menit!):
            </span>
            <ol className="list-decimal list-inside space-y-1.5 pl-1.5 text-slate-600 leading-relaxed font-sans">
              <li>Buka file <b>Google Spreadsheet</b> Anda yang dituju.</li>
              <li>Pilih menu <b>Ekstensi</b> &rarr; <b>Apps Script</b>.</li>
              <li>Hapus kode bawaan, kemudian paste kode script di bawah ini.</li>
              <li>Klik tombol <b>Terapkan (Deploy)</b> &rarr; <b>Penerapan Baru (New Deployment)</b> di bagian kanan atas.</li>
              <li>Pilih jenis deployment: <b>Aplikasi Web (Web App)</b>.</li>
              <li>Ubah setelan akses <b className="text-blue-600">"Siapa saja yang memiliki akses"</b> menjadi <b className="text-emerald-700">"Siapa saja (Anyone)"</b>, lalu verifikasi otorisasi akun Google Anda.</li>
              <li>Salin <b>URL Aplikasi Web (Web App)</b> hasil deploy tersebut, lalu tempel di kotak input di bawah.</li>
            </ol>
          </div>

          {/* Copy Script Snippet */}
          <div className="bg-slate-900 text-slate-100 rounded-lg p-4 space-y-3 relative overflow-hidden">
            <div className="flex justify-between items-center text-xs">
              <span className="font-mono font-semibold text-blue-400">Google Apps Script Code</span>
              <button
                type="button"
                onClick={copyScriptToClipboard}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 transition rounded-md hover:text-white font-bold cursor-pointer border border-slate-700 text-[10px]"
              >
                {copiedScript ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" /> Tersalin!
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-slate-400" /> Salin Kode Script
                  </>
                )}
              </button>
            </div>
            <pre className="text-[10px] font-mono select-all overflow-x-auto max-h-44 text-slate-300 leading-relaxed font-sans bg-slate-950 p-3 rounded-md border border-slate-800">
              {gasCode}
            </pre>
          </div>

          {/* Input Webhook / App Script URL */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">URL Webhook Aplikasi Web Anda (Web App URL)</label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="https://script.google.com/macros/s/.../exec"
                value={config.webhookUrl}
                onChange={(e) => onUpdateConfig({ webhookUrl: e.target.value })}
                className="flex-1 px-4 py-2 border border-slate-200 rounded-md text-xs font-medium focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={handleTest}
                disabled={isTesting || !config.webhookUrl}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-100 text-white disabled:text-slate-400 font-bold rounded-md text-xs flex items-center gap-1 cursor-pointer shrink-0 transition-colors"
              >
                {isTesting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Menguji...
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" /> Uji & Sambungkan
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Test results indicator */}
          {testResult && (
            <div className={`p-3 rounded-lg border text-xs leading-relaxed flex items-start gap-2 ${
              testResult.success 
                ? 'bg-emerald-50 border-emerald-150 text-emerald-700' 
                : 'bg-rose-50 border-rose-150 text-rose-700'
            }`}>
              <span className="font-bold mt-0.5">{testResult.success ? '✓ Sukses' : '✕ Gagal'}:</span>
              <span>{testResult.message}</span>
            </div>
          )}

          {/* Audit & Force Resync Section */}
          <div className="bg-slate-900 text-white rounded-xl p-4.5 border border-slate-800 space-y-3.5 shadow-md mt-4">
            <div className="flex items-center justify-between border-b pb-2.5 border-slate-800 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-emerald-400" />
                <span className="font-bold text-xs uppercase tracking-wider text-slate-200">
                  Audit Data Inputan Hari Ini Saja
                </span>
              </div>
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800 px-2 py-0.5 rounded">
                Tanggal: {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
              </span>
            </div>

            <p className="text-[11px] text-slate-300 leading-relaxed">
              Tombol ini <strong>hanya memeriksa penilaian yang diinput pada HARI INI saja ({new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })})</strong>. Data inputan tanggal sebelumnya (misal 19/8) tidak akan disentuh atau dikirim ulang, sehingga <strong>dijamin 100% bebas dari risiko data ganda</strong>:
            </p>

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={handleAuditSpreadsheetData}
                disabled={isAuditing || !config.webhookUrl}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-extrabold rounded-lg text-xs flex items-center gap-1.5 cursor-pointer shadow-sm transition"
              >
                {isAuditing ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Memeriksa Data Hari Ini di Spreadsheet...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Audit Data Inputan Hari Ini ({new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })})</span>
                  </>
                )}
              </button>
            </div>

            {auditResult && (
              <div className="bg-slate-800/90 border border-slate-700 rounded-lg p-3 space-y-2 text-xs">
                <div className="flex justify-between items-center font-bold flex-wrap gap-1">
                  <span className="text-slate-300">Total data input hari ini di aplikasi: {auditResult.totalChecked}</span>
                  <span className={auditResult.missingCount > 0 ? "text-amber-400" : "text-emerald-400"}>
                    {auditResult.missingCount > 0 
                      ? `⚠️ ${auditResult.missingCount} data input hari ini belum ada di Spreadsheet!` 
                      : '✓ Semua data input hari ini sudah lengkap di Spreadsheet'}
                  </span>
                </div>

                {auditResult.missingCount > 0 && (
                  <div className="pt-2 border-t border-slate-700/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <p className="text-[11px] text-slate-300">
                      Kirim {auditResult.missingCount} data inputan hari ini yang belum tercatat:
                    </p>
                    <button
                      type="button"
                      onClick={handleRecoverMissingData}
                      disabled={isRecovering}
                      className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-md text-xs flex items-center gap-1.5 cursor-pointer shrink-0 transition"
                    >
                      {isRecovering ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Mengirim...
                        </>
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5" /> Kirim {auditResult.missingCount} Data Hari Ini
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}

            {recoveryStatus && (
              <div className="p-2.5 bg-emerald-950 border border-emerald-800 text-emerald-300 rounded-lg text-xs font-semibold text-center">
                {recoveryStatus}
              </div>
            )}
          </div>

        </div>
      ) : (
        <div className="space-y-4">
          
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 text-xs text-slate-700 space-y-2.5">
            <span className="font-bold text-slate-800 flex items-center gap-1.5">
              <Key className="w-4 h-4 text-blue-600" />
              Metode Token & Ekspor Cadangan Lokal:
            </span>
            <p className="text-slate-600 leading-relaxed font-sans">
              Anda juga bisa memasukkan <b>Google OAuth Client ID</b> jika ingin menghubungkan sinkronisasi Google REST API client-side secara penuh. Namun untuk penggunaan instan, Anda dapat mengunduh atau menyalin semua data rekap yang tersimpan di browser ini ke dalam file spreadsheet Anda di bawah:
            </p>
          </div>

          {/* Optional Client ID config */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Google Client ID (Opsional untuk Google OAuth)</label>
            <input
              type="text"
              placeholder="Google OAuth Client ID Anda"
              value={config.clientId}
              onChange={(e) => onUpdateConfig({ clientId: e.target.value })}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Exports Buttons Column */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            
            {/* Copy CSV to clipboard */}
            <button
              type="button"
              onClick={copyCSVToClipboard}
              disabled={evaluations.length === 0}
              className="p-3 bg-white hover:bg-slate-50 disabled:opacity-50 text-slate-700 border border-slate-200 rounded-lg font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition shadow-xs"
            >
              {copiedCSV ? (
                <>
                  <Check className="w-4 h-4 text-emerald-500" /> Tersalin!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-slate-400" /> Salin CSV
                </>
              )}
            </button>

            {/* Download CSV File Comma */}
            <button
              type="button"
              onClick={() => downloadCSVFile(false)}
              disabled={evaluations.length === 0}
              className="p-3 bg-blue-50 hover:bg-blue-100 disabled:opacity-50 text-blue-700 border border-blue-100 rounded-lg font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition"
              title="Unduh format CSV dengan pemisah koma (Standar Google Sheets / Internasional)"
            >
              <Download className="w-4 h-4" /> Unduh Koma (`,`)
            </button>

            {/* Download CSV File Semicolon */}
            <button
              type="button"
              onClick={() => downloadCSVFile(true)}
              disabled={evaluations.length === 0}
              className="p-3 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50 text-emerald-700 border border-emerald-100 rounded-lg font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition"
              title="Unduh format CSV dengan pemisah titik koma (Standar Excel Indonesia / Regional)"
            >
              <Download className="w-4 h-4" /> Unduh Semikolon (`;`)
            </button>
            
          </div>
          
          <div className="text-center text-[10px] text-slate-400 font-medium">
            *Format CSV dapat langsung diimpor ke Spreadsheet (File &rarr; Impor &rarr; Upload) secara sempurna.
          </div>

        </div>
      )}

    </div>
  );
}
