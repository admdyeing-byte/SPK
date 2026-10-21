import { Evaluation, HrmsRecord, PresensiRecord } from '../types';
import { 
  normalizeEvaluationRecord, 
  normalizeNoReg, 
  getPeriodFromDate, 
  parseAndNormalizePeriode,
  isShiftMtcEmployee,
  isSecondedToNSEmployee 
} from '../utils';
import { PREPOPULATED_EMPLOYEES } from '../data';

export const DEFAULT_SPREADSHEET_ID = '12LeSP25CHhUqO5FxC2Ca407ArtTFSJbNPoR38D6J23I';

/**
 * Standard robust CSV line parser supporting quoted fields and embedded commas
 */
export function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let curVal = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(curVal.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
      curVal = '';
    } else {
      curVal += char;
    }
  }
  result.push(curVal.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
  return result;
}

/**
 * Fetch and parse Presensi records directly from Google Sheets
 */
export async function fetchPresensiRecordsFromSheet(spreadsheetId: string = DEFAULT_SPREADSHEET_ID): Promise<PresensiRecord[]> {
  const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=Presensi`;
  const res = await fetch(sheetUrl, { cache: 'no-cache' });
  if (!res.ok) {
    throw new Error(`Failed to fetch Presensi CSV (HTTP ${res.status})`);
  }

  const csvText = await res.text();
  const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length < 2) return [];

  const rawHeaders = parseCSVLine(lines[0]);
  const headers = rawHeaders.map(h => h.toLowerCase().replace(/[\s\.\-_]/g, ''));

  const noRegIdx = headers.findIndex(h => h.includes('noreg') || h.includes('no_reg') || h.includes('register') || h.includes('id') || h === 'no. reg');
  const namaIdx = headers.findIndex(h => h.includes('nama') || h.includes('name'));
  const jabatanIdx = headers.findIndex(h => h.includes('jabatan') || h.includes('position') || h.includes('jab'));
  const grupIdx = headers.findIndex(h => h.includes('grup') || h.includes('group'));
  const tanggalIdx = headers.findIndex(h => h.includes('tanggal') || h.includes('date') || h.includes('tgl'));
  const presensiIdx = headers.findIndex(h => h.includes('presensi') || h.includes('attendance') || h.includes('status') || h.includes('absen'));
  const keteranganIdx = headers.findIndex(h => h.includes('keterangan') || h.includes('note') || h.includes('ket'));

  const finalNoRegIdx = noRegIdx !== -1 ? noRegIdx : 1;
  const finalNamaIdx = namaIdx !== -1 ? namaIdx : 2;
  const finalJabatanIdx = jabatanIdx !== -1 ? jabatanIdx : 3;
  const finalGrupIdx = grupIdx !== -1 ? grupIdx : 4;
  const finalTanggalIdx = tanggalIdx !== -1 ? tanggalIdx : 5;
  const finalPresensiIdx = presensiIdx !== -1 ? presensiIdx : 6;
  const finalKeteranganIdx = keteranganIdx !== -1 ? keteranganIdx : 7;

  const parsedPresensi: PresensiRecord[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (cols.length < 3) continue;

    const reg = cols[finalNoRegIdx]?.trim();
    const nama = cols[finalNamaIdx]?.trim();
    const tanggalRaw = cols[finalTanggalIdx]?.trim() || '';
    const statusRaw = cols[finalPresensiIdx]?.trim() || '';

    if (!reg || !nama) continue;

    const periode = getPeriodFromDate(tanggalRaw);

    parsedPresensi.push({
      noReg: reg,
      nama: nama,
      jabatan: cols[finalJabatanIdx]?.trim() || '',
      grup: cols[finalGrupIdx]?.trim() || '',
      tanggal: tanggalRaw,
      presensi: statusRaw,
      keterangan: cols[finalKeteranganIdx]?.trim() || '',
      periode: periode
    });
  }

  return parsedPresensi.map(normalizeEvaluationRecord);
}

/**
 * Fetch and parse HRMS records directly from Google Sheets
 */
export async function fetchHrmsRecordsFromSheet(spreadsheetId: string = DEFAULT_SPREADSHEET_ID): Promise<HrmsRecord[]> {
  const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=HRMS`;
  const res = await fetch(sheetUrl, { cache: 'no-cache' });
  if (!res.ok) {
    throw new Error(`Failed to fetch HRMS CSV (HTTP ${res.status})`);
  }

  const csvText = await res.text();
  const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length < 2) return [];

  const rawHeaders = parseCSVLine(lines[0]);
  const headers = rawHeaders.map(h => h.toLowerCase().replace(/[\s\.\-_]/g, ''));

  const noRegIdx = headers.findIndex(h => h.includes('noreg') || h.includes('no_reg') || h.includes('register') || h.includes('id') || h === 'no');
  const namaIdx = headers.findIndex(h => h.includes('nama') || h.includes('name'));
  const kualitasIdx = headers.findIndex(h => h.includes('kualitas') || h.includes('quality') || h.includes('nilai1') || h.includes('nil1'));
  const kuantitasIdx = headers.findIndex(h => h.includes('kuantitas') || h.includes('quantity') || h.includes('nilai2') || h.includes('nil2'));
  const kehadiranIdx = headers.findIndex(h => h.includes('kehadiran') || h.includes('attendance') || h.includes('absensi') || h.includes('absen'));
  const kedisiplinanIdx = headers.findIndex(h => h.includes('kedisiplinan') || h.includes('discipline') || h.includes('disiplin'));
  const skorIdx = headers.findIndex(h => h.includes('skor') || h.includes('score') || h.includes('total') || h === 'nilai');
  const periodeIdx = headers.findIndex(h => h.includes('periode') || h.includes('month') || h.includes('period') || h.includes('bulan'));

  const finalNoRegIdx = noRegIdx !== -1 ? noRegIdx : 0;
  const finalNamaIdx = namaIdx !== -1 ? namaIdx : 1;

  const coreIndices = new Set([noRegIdx, namaIdx, kualitasIdx, kuantitasIdx, kehadiranIdx, kedisiplinanIdx, skorIdx, periodeIdx].filter(x => x !== -1));
  const extraHeaders: { name: string; index: number }[] = [];
  rawHeaders.forEach((origHeader, idx) => {
    if (!coreIndices.has(idx) && origHeader.trim() !== '') {
      extraHeaders.push({ name: origHeader.trim(), index: idx });
    }
  });

  const parsedRecords: HrmsRecord[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (cols.length < 2) continue;

    const reg = cols[finalNoRegIdx]?.trim();
    const nama = cols[finalNamaIdx]?.trim();
    if (!reg || !nama) continue;

    const kualitas = kualitasIdx !== -1 && cols[kualitasIdx] !== undefined ? Number(cols[kualitasIdx]) || 0 : 0;
    const kuantitas = kuantitasIdx !== -1 && cols[kuantitasIdx] !== undefined ? Number(cols[kuantitasIdx]) || 0 : 0;
    const kehadiran = kehadiranIdx !== -1 && cols[kehadiranIdx] !== undefined ? Number(cols[kehadiranIdx]) || 0 : 0;
    const kedisiplinan = kedisiplinanIdx !== -1 && cols[kedisiplinanIdx] !== undefined ? Number(cols[kedisiplinanIdx]) || 0 : 0;
    const skor = skorIdx !== -1 && cols[skorIdx] !== undefined ? Number(cols[skorIdx]) || 0 : 0;
    const periode = periodeIdx !== -1 && cols[periodeIdx] ? parseAndNormalizePeriode(cols[periodeIdx].trim()) : 'Juni 2026';

    const extraColumns: Record<string, string | number> = {};
    extraHeaders.forEach(eh => {
      const val = cols[eh.index]?.trim() || '';
      const numVal = Number(val);
      if (val !== '' && !isNaN(numVal)) {
        extraColumns[eh.name] = numVal;
      } else {
        extraColumns[eh.name] = val;
      }
    });

    parsedRecords.push({
      noReg: reg,
      nama: nama,
      kualitas,
      kuantitas,
      kehadiran,
      kedisiplinan,
      skor,
      periode,
      extraColumns
    });
  }

  return parsedRecords.map(normalizeEvaluationRecord);
}

/**
 * Fetch evaluations directly from sheet tabs A, B, C, NS, MTC, LAB, QC
 * and merge them into existing evaluations
 */
export async function fetchEvaluationsFromAllTabs(
  spreadsheetId: string = DEFAULT_SPREADSHEET_ID, 
  currentList: Evaluation[] = []
): Promise<{ mergedList: Evaluation[]; updatedCount: number; insertedCount: number }> {
  const tabs = ['A', 'B', 'C', 'NS', 'MTC', 'LAB', 'QC'];
  const mergedList = [...currentList];
  let updatedCount = 0;
  let insertedCount = 0;

  for (const tab of tabs) {
    try {
      const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${tab}`;
      const res = await fetch(sheetUrl, { cache: 'no-cache' });
      if (!res.ok) continue;

      const csvText = await res.text();
      const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
      if (lines.length < 2) continue;

      const rawHeaders = parseCSVLine(lines[0]);
      const headers = rawHeaders.map(h => h.toLowerCase().replace(/[\s\.\-_]/g, ''));

      const noRegIdx = headers.findIndex(h => h.includes('noreg') || h.includes('no_reg') || h.includes('register') || h.includes('id') || h === 'no. reg');
      const namaIdx = headers.findIndex(h => h.includes('nama') || h.includes('name'));
      const jabIdx = headers.findIndex(h => h.includes('jabatan') || h.includes('jab'));
      const nil1Idx = headers.findIndex(h => h.includes('kualitas') || h.includes('nil1') || h.includes('nilai1'));
      const nil2Idx = headers.findIndex(h => h.includes('kuantitas') || h.includes('nil2') || h.includes('nilai2'));
      const skorIdx = headers.findIndex(h => h.includes('skor') || h.includes('total'));
      const periodeIdx = headers.findIndex(h => h.includes('periode') || h.includes('bulan'));
      const timestampIdx = headers.findIndex(h => h.includes('timestamp') || h.includes('waktu') || h.includes('tgl'));

      if (noRegIdx === -1 || namaIdx === -1) continue;

      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i]);
        if (cols.length < 3) continue;

        const regRaw = cols[noRegIdx]?.trim();
        const namaRaw = cols[namaIdx]?.trim();
        if (!regRaw || regRaw.toUpperCase() === 'TEST' || regRaw.toUpperCase() === 'TEST001') continue;

        const normalized = normalizeEvaluationRecord({ noReg: regRaw, nama: namaRaw });
        const cleanNoReg = normalized.noReg;
        const cleanNama = normalized.nama;

        const nil1 = nil1Idx !== -1 ? Number(cols[nil1Idx]) || 0 : 0;
        const nil2 = nil2Idx !== -1 ? Number(cols[nil2Idx]) || 0 : 0;
        const average = (nil1 + nil2) / 2;
        const periodeRaw = periodeIdx !== -1 && cols[periodeIdx] ? cols[periodeIdx] : 'Juni 2026';
        const cleanPeriod = parseAndNormalizePeriode(periodeRaw);
        const submittedAt = timestampIdx !== -1 && cols[timestampIdx] ? cols[timestampIdx] : new Date().toISOString();

        const officialEmp = PREPOPULATED_EMPLOYEES.find(e => normalizeNoReg(e.noReg) === normalizeNoReg(cleanNoReg));
        const isShiftMtc = officialEmp ? isShiftMtcEmployee(officialEmp) : isShiftMtcEmployee({ noReg: cleanNoReg, jabatan: cols[jabIdx] });

        let cleanGrup = tab;
        if (isShiftMtc) {
          if (['A', 'B', 'C'].includes(tab)) {
            cleanGrup = tab;
          } else {
            cleanGrup = 'MTC';
          }
        } else if (officialEmp) {
          cleanGrup = officialEmp.grup || tab;
        }

        const isSupportive = isShiftMtc && ['A', 'B', 'C'].includes(tab);

        const existingIdx = mergedList.findIndex(e => 
          normalizeNoReg(e.noReg) === normalizeNoReg(cleanNoReg) &&
          parseAndNormalizePeriode(e.periode).trim().toLowerCase() === cleanPeriod.trim().toLowerCase() &&
          (e.grup ? e.grup.trim().toUpperCase() : '') === cleanGrup.trim().toUpperCase() &&
          (!!e.isSupportive) === isSupportive
        );

        if (existingIdx !== -1) {
          const cur = mergedList[existingIdx];
          if (cur.nil1 !== nil1 || cur.nil2 !== nil2 || cur.pendingApproval === true) {
            mergedList[existingIdx] = {
              ...cur,
              nil1,
              nil2,
              average,
              periode: cleanPeriod,
              nama: cleanNama,
              grup: cleanGrup,
              pendingApproval: false,
              isSupportive
            };
            updatedCount++;
          }
        } else {
          mergedList.push({
            id: `eval-tab-${tab}-${Date.now()}-${Math.random().toString(36).substr(2, 7)}`,
            periode: cleanPeriod,
            noReg: cleanNoReg,
            nama: cleanNama,
            jabatan: jabIdx !== -1 ? (cols[jabIdx]?.trim() || (officialEmp?.jabatan || '')) : (officialEmp?.jabatan || ''),
            grup: cleanGrup,
            nil1,
            nil2,
            average,
            submittedAt,
            pendingApproval: false,
            isDemo: false,
            isSupportive
          });
          insertedCount++;
        }
      }
    } catch (tabErr) {
      console.warn(`Could not sync tab ${tab}:`, tabErr);
    }
  }

  return { mergedList, updatedCount, insertedCount };
}
