/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Evaluation, GroupType, Employee, HrmsRecord } from '../types';
import { PREPOPULATED_EMPLOYEES } from '../data';
import { formatLokalWaktu, MONTH_NAMES_ID, isShiftMtcEmployee, getShiftMtcGroup, isSameEmployee, parseAndNormalizePeriode, getPeriodTimestamp, isSecondedToNSEmployee, getSecondedOriginalGroup, compareEmpId, matchesMonthAndYear, extractAvailableYears } from '../utils';
import { Search, Trash2, Filter, Info, Pencil, Eye, X, Save, ArrowUpDown, ArrowUp, ArrowDown, Calendar, ThumbsUp, Check, RefreshCw, FileSpreadsheet, Users, Download } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell, LabelList } from 'recharts';
import { CsvExportModal } from './CsvExportModal';
import { getAccessToken } from '../googleAuth';

export function getPerformanceLabel(average: number): { label: string; bgClass: string; textClass: string; borderClass: string } {
  if (average >= 4.5) {
    return {
      label: 'Sangat Baik',
      bgClass: 'bg-emerald-50 text-emerald-750 border-emerald-200/60',
      textClass: 'text-emerald-700',
      borderClass: 'border-emerald-200'
    };
  } else if (average >= 3.5) {
    return {
      label: 'Baik',
      bgClass: 'bg-blue-50 text-blue-750 border-blue-200/60',
      textClass: 'text-blue-700',
      borderClass: 'border-blue-200'
    };
  } else if (average >= 2.5) {
    return {
      label: 'Sedang',
      bgClass: 'bg-amber-50 text-amber-750 border-amber-200/60',
      textClass: 'text-amber-700',
      borderClass: 'border-amber-200'
    };
  } else {
    return {
      label: 'Cukup',
      bgClass: 'bg-rose-50 text-rose-750 border-rose-200/60',
      textClass: 'text-rose-700',
      borderClass: 'border-rose-200'
    };
  }
}

/**
 * Maps a total score out of 20 to a star rating (out of 5) and performance level.
 * Rule:
 * - 20-19: Sangat Baik (5 Stars)
 * - 18-17: Baik (4 Stars)
 * - 16-15: Sedang (3 Stars)
 * - 14 and below: Cukup (2 Stars)
 */
export function getRatingAndLabelFromScore(score: number): { average: number; label: string } {
  const rounded = Math.round(score);
  if (rounded >= 20) {
    return { average: 5.0, label: 'Sangat Baik' };
  } else if (rounded === 19) {
    return { average: 4.5, label: 'Sangat Baik' };
  } else if (rounded === 18) {
    return { average: 4.0, label: 'Baik' };
  } else if (rounded === 17) {
    return { average: 3.5, label: 'Baik' };
  } else if (rounded === 16) {
    return { average: 3.0, label: 'Sedang' };
  } else if (rounded === 15) {
    return { average: 2.5, label: 'Sedang' };
  } else if (rounded === 14) {
    return { average: 1.0, label: 'Cukup' };
  } else if (rounded === 13) {
    return { average: 0.5, label: 'Cukup' };
  } else {
    return { average: 0.0, label: 'Cukup' };
  }
}

function getPreviousPeriodString(periodStr: string): string {
  if (!periodStr) return '';
  const parts = periodStr.split(' ');
  if (parts.length !== 2) return '';
  const monthName = parts[0];
  const year = parseInt(parts[1]);
  if (isNaN(year)) return '';
  const index = MONTH_NAMES_ID.indexOf(monthName);
  if (index === -1) return '';
  let prevIndex = index - 1;
  let prevYear = year;
  if (prevIndex < 0) {
    prevIndex = 11;
    prevYear -= 1;
  }
  return `${MONTH_NAMES_ID[prevIndex]} ${prevYear}`;
}

// Custom Star icons for high-fidelity Google Maps style reviews
const StarIcon = ({ fillPercent }: { fillPercent: number; key?: React.Key }) => {
  const gradId = React.useId().replace(/:/g, "");
  
  if (fillPercent >= 100) {
    return (
      <svg viewBox="0 0 24 24" className="w-4 h-4 text-amber-400 fill-amber-400 inline-block stroke-amber-500" strokeWidth="1">
        <path d="M12 .587l3.668 7.431 8.2 1.192-5.934 5.787 1.4 8.168L12 18.896l-7.334 3.84 1.4-8.168L.132 9.21l8.2-1.192z" />
      </svg>
    );
  }
  
  if (fillPercent <= 0) {
    return (
      <svg viewBox="0 0 24 24" className="w-4 h-4 text-slate-200 fill-slate-100 inline-block stroke-slate-300" strokeWidth="1">
        <path d="M12 .587l3.668 7.431 8.2 1.192-5.934 5.787 1.4 8.168L12 18.896l-7.334 3.84 1.4-8.168L.132 9.21l8.2-1.192z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4 inline-block stroke-amber-500" strokeWidth="1">
      <defs>
        <linearGradient id={gradId}>
          <stop offset={`${fillPercent}%`} stopColor="#fbbf24" />
          <stop offset={`${fillPercent}%`} stopColor="#f1f5f9" />
        </linearGradient>
      </defs>
      <path 
        d="M12 .587l3.668 7.431 8.2 1.192-5.934 5.787 1.4 8.168L12 18.896l-7.334 3.84 1.4-8.168L.132 9.21l8.2-1.192z" 
        fill={`url(#${gradId})`}
      />
    </svg>
  );
};

const StarRating = ({ rating }: { rating: number }) => {
  const stars = [];
  for (let i = 1; i <= 5; i++) {
    const diff = rating - (i - 1);
    let fillPercent = 0;
    if (diff >= 1) {
      fillPercent = 100;
    } else if (diff > 0) {
      fillPercent = Math.round(diff * 100);
    }
    stars.push(<StarIcon key={i} fillPercent={fillPercent} />);
  }
  return <div className="flex items-center gap-0.5 inline-flex">{stars}</div>;
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-white/95 backdrop-blur-sm p-4 rounded-xl border border-slate-200 shadow-xl text-xs max-w-xs">
        <p className="font-extrabold text-slate-800 text-[13px] border-b border-slate-100 pb-2 mb-2 flex items-center justify-between">
          <span>📊 {label}</span>
          <span className="bg-slate-100 text-slate-600 font-mono text-[10px] px-2 py-0.5 rounded-full">
            Total: {data.totalCount} Karyawan
          </span>
        </p>
        <div className="space-y-1.5 font-semibold text-slate-600">
          <div className="flex items-center justify-between gap-6">
            <span className="flex items-center gap-1.5 text-emerald-600 font-extrabold">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
              Sangat Baik
            </span>
            <span className="font-mono text-slate-800 font-black">
              {data['Sangat Baik (Count)']} Org ({data['Sangat Baik %']}%)
            </span>
          </div>
          <div className="flex items-center justify-between gap-6">
            <span className="flex items-center gap-1.5 text-blue-600 font-extrabold">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block"></span>
              Baik
            </span>
            <span className="font-mono text-slate-800 font-black">
              {data['Baik (Count)']} Org ({data['Baik %']}%)
            </span>
          </div>
          <div className="flex items-center justify-between gap-6">
            <span className="flex items-center gap-1.5 text-amber-600 font-extrabold">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"></span>
              Sedang
            </span>
            <span className="font-mono text-slate-800 font-black">
              {data['Sedang (Count)']} Org ({data['Sedang %']}%)
            </span>
          </div>
          <div className="flex items-center justify-between gap-6">
            <span className="flex items-center gap-1.5 text-rose-600 font-extrabold">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block"></span>
              Cukup
            </span>
            <span className="font-mono text-slate-800 font-black">
              {data['Cukup (Count)']} Org ({data['Cukup %']}%)
            </span>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

interface DashboardSummaryProps {
  evaluations: Evaluation[];
  hrmsRecords: HrmsRecord[];
  currentGroup: GroupType | 'ALL' | 'NONE';
  onDeleteEvaluation: (id: string, name: string) => void;
  onUpdateEvaluation: (updated: Evaluation) => void;
  onApproveEvaluation?: (evaluation: Evaluation) => void;
  onSyncFromSpreadsheet?: () => Promise<void>;
  hasWebhookUrl?: boolean;
  employees?: Employee[];
  presensiDatabaseElement?: React.ReactNode;
  spreadsheetId?: string;
  accessToken?: string | null;
}

export default function DashboardSummary({ 
  evaluations, 
  hrmsRecords = [],
  currentGroup, 
  onDeleteEvaluation, 
  onUpdateEvaluation,
  onApproveEvaluation,
  onSyncFromSpreadsheet,
  hasWebhookUrl = false,
  employees,
  presensiDatabaseElement,
  spreadsheetId,
  accessToken
}: DashboardSummaryProps) {
  const employeeSource = employees || PREPOPULATED_EMPLOYEES;

  // Helper to find HRMS record for an operator in a specific period
  const findHrmsRecord = (noReg: string, nama: string, periodStr: string) => {
    if (!hrmsRecords || hrmsRecords.length === 0) return null;
    const normalizedPeriod = parseAndNormalizePeriode(periodStr).toLowerCase().trim();
    return hrmsRecords.find(hr => {
      const isSameEmp = isSameEmployee({ noReg, nama }, { noReg: hr.noReg, nama: hr.nama });
      const samePeriod = parseAndNormalizePeriode(hr.periode).toLowerCase().trim() === normalizedPeriod;
      return isSameEmp && samePeriod;
    });
  };

  const [searchTerm, setSearchTerm] = useState('');
  const [groupFilter, setGroupFilter] = useState<string>('ALL');
  const [monthFilter, setMonthFilter] = useState<string>('ALL');
  const [yearFilter, setYearFilter] = useState<string>('ALL');
  const [starFilter, setStarFilter] = useState<number | 'ALL'>('ALL');
  const [entriesPerPage, setEntriesPerPage] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [editingEval, setEditingEval] = useState<Evaluation | null>(null);
  const [viewingEval, setViewingEval] = useState<Evaluation | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState<'history' | 'missing'>('history');
  const [selectedTrendNoReg, setSelectedTrendNoReg] = useState<string>('');
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [cachedToken, setCachedToken] = useState<string | null>(accessToken || null);

  useEffect(() => {
    if (!accessToken) {
      getAccessToken().then(token => {
        if (token) setCachedToken(token);
      }).catch(() => {});
    } else {
      setCachedToken(accessToken);
    }
  }, [accessToken]);

  const handleSyncClick = async () => {
    if (!onSyncFromSpreadsheet) return;
    setIsSyncing(true);
    try {
      await onSyncFromSpreadsheet();
    } finally {
      setIsSyncing(false);
    }
  };

  // Modal edit fields
  const [editNama, setEditNama] = useState('');
  const [editNoReg, setEditNoReg] = useState('');
  const [editGrup, setEditGrup] = useState('');
  const [editNil1, setEditNil1] = useState(1);
  const [editNil2, setEditNil2] = useState(1);
  const [editPeriode, setEditPeriode] = useState('');

  // Calculate dynamic period options (This Month, Last Month, and other custom periods)
  const dObj = new Date();
  const currentMonthIdx = dObj.getMonth();
  const currentYear = dObj.getFullYear();
  const thisPeriod = `${MONTH_NAMES_ID[currentMonthIdx]} ${currentYear}`;

  const prevMonthIdx = currentMonthIdx === 0 ? 11 : currentMonthIdx - 1;
  const prevYear = currentMonthIdx === 0 ? currentYear - 1 : currentYear;
  const prevPeriod = `${MONTH_NAMES_ID[prevMonthIdx]} ${prevYear}`;

  const uniquePeriods = Array.from(new Set(evaluations.map(e => parseAndNormalizePeriode(e.periode)))).filter(Boolean);
  const periodOptions = Array.from(new Set([thisPeriod, prevPeriod, ...uniquePeriods])).sort();

  const periodFilter = (monthFilter === 'ALL' && yearFilter === 'ALL')
    ? 'ALL'
    : (monthFilter !== 'ALL' && yearFilter !== 'ALL')
      ? `${monthFilter} ${yearFilter}`
      : (monthFilter !== 'ALL' ? monthFilter : yearFilter);

  const matchesSelectedPeriod = (p: any) => matchesMonthAndYear(p, monthFilter, yearFilter);

  const availableYears = React.useMemo(() => {
    return extractAvailableYears([...periodOptions, ...hrmsRecords.map(h => h.periode)], currentYear);
  }, [periodOptions, hrmsRecords, currentYear]);

  // Filter based on KSS group access (KSS cannot bypass their group boundary unless they are ALL/Admin)
  const groupBoundEvaluations = evaluations.filter(e => {
    const isSupportive = e.isSupportive === true || (e.isSupportive as any) === 'true';
    if (currentGroup === 'ALL') {
      // Hide supportive evaluations in global admin view to avoid duplicate rows and keep official headcount correct
      return !isSupportive;
    }
    if (currentGroup !== 'NONE') {
      const emp = (employees || PREPOPULATED_EMPLOYEES).find(x => isSameEmployee(e, x));
      const originalGroup = emp ? emp.grup : e.grup;

      if (currentGroup === 'MTC') {
        return e.grup === 'MTC';
      } else {
        // Shift groups (A, B, C) see:
        // 1. Evaluations with e.grup === currentGroup (their standard shift employees + supportive/recommendation drafts)
        // 2. OR: Official MTC evaluations (e.grup === 'MTC' && !isSupportive) for employees whose original group matches currentGroup OR if they are a shift MTC employee belonging to this shift
        // 3. OR: Official NS evaluations (e.grup === 'NS' && !isSupportive) for seconded employees whose original group matches currentGroup
        const isShiftMtc = emp ? isShiftMtcEmployee(emp) : false;
        const isSeconded = emp ? isSecondedToNSEmployee(emp, e.periode) : false;
        const belongsToShift = isShiftMtc 
          ? (getShiftMtcGroup(emp) === currentGroup) 
          : (isSeconded 
              ? (getSecondedOriginalGroup(emp) === currentGroup) 
              : (originalGroup === currentGroup));

        if (isShiftMtc) {
          // KSS Shift (A, B, C) views their own evaluation entered into Sheet Shift (e.grup === currentGroup)
          // without colliding with Sheet MTC evaluations
          return e.grup === currentGroup;
        }

        return e.grup === currentGroup || 
               (e.grup === 'NS' && !isSupportive && isSeconded && belongsToShift);
      }
    }
    return true;
  });

  // Filter history table based on search query, local group filter, and period filter
  const displayedEvaluations = groupBoundEvaluations.filter(e => {
    const matchesSearch = e.nama.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          e.noReg.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesGroup = groupFilter === 'ALL' || e.grup === groupFilter;
    const matchesPeriod = matchesSelectedPeriod(e.periode);
    return matchesSearch && matchesGroup && matchesPeriod;
  });

  // Sorting state
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleSort = (col: string) => {
    if (sortColumn === col) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(col);
      setSortDirection('asc');
    }
    setCurrentPage(1);
  };

  // Sort displayedEvaluations according to active sort option, otherwise default to unique ID (empId) sequence
  const sortedEvaluations = [...displayedEvaluations].sort((a, b) => {
    if (sortColumn === null) {
      // 1. Sort by period timestamp descending (latest period/month on top)
      const timeA = getPeriodTimestamp(parseAndNormalizePeriode(a.periode));
      const timeB = getPeriodTimestamp(parseAndNormalizePeriode(b.periode));
      if (timeA !== timeB) {
        return timeB - timeA; // Descending (latest period first)
      }
      // 2. If same period, sort by employee unique ID (empId)
      return compareEmpId(a.empId, b.empId, a.noReg, b.noReg, employees);
    }

    if (sortColumn === 'empId') {
      const cmp = compareEmpId(a.empId, b.empId, a.noReg, b.noReg, employees);
      return sortDirection === 'asc' ? cmp : -cmp;
    }

    let valA: any = '';
    let valB: any = '';

    switch (sortColumn) {
      case 'nama':
        valA = a.nama.toLowerCase();
        valB = b.nama.toLowerCase();
        break;
      case 'noReg':
        valA = a.noReg.toLowerCase();
        valB = b.noReg.toLowerCase();
        break;
      case 'nil1':
        valA = a.nil1;
        valB = b.nil1;
        break;
      case 'nil2':
        valA = a.nil2;
        valB = b.nil2;
        break;
      case 'skor':
        valA = a.nil1 + a.nil2;
        valB = b.nil1 + b.nil2;
        break;
      case 'periode':
        valA = a.periode.toLowerCase();
        valB = b.periode.toLowerCase();
        break;
      case 'submittedAt':
        valA = new Date(a.submittedAt || 0).getTime();
        valB = new Date(b.submittedAt || 0).getTime();
        break;
      default:
        break;
    }

    if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
    if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  // Calculate pagination
  const totalPages = Math.ceil(sortedEvaluations.length / entriesPerPage);
  const safeCurrentPage = Math.min(currentPage, totalPages || 1);
  const indexOfLastEval = safeCurrentPage * entriesPerPage;
  const indexOfFirstEval = indexOfLastEval - entriesPerPage;
  const currentEntries = sortedEvaluations.slice(indexOfFirstEval, indexOfLastEval);

  const renderSortIndicator = (column: string) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="w-3.5 h-3.5 ml-1 text-slate-300 opacity-50 group-hover/th:opacity-100 inline-block shrink-0 transition" />;
    }
    return sortDirection === 'asc' 
      ? <ArrowUp className="w-3.5 h-3.5 ml-1 text-blue-600 inline-block shrink-0 font-extrabold animate-pulse" /> 
      : <ArrowDown className="w-3.5 h-3.5 ml-1 text-blue-600 inline-block shrink-0 font-extrabold animate-pulse" />;
  };

  // Dynamic denominator count based on active group
  const activePeriodToCheck = periodFilter === 'ALL' ? thisPeriod : periodFilter;

  const totalOperatorsCount = currentGroup === 'ALL' 
    ? employeeSource.length 
    : currentGroup === 'MTC'
      ? employeeSource.filter(emp => emp.grup === 'MTC' || isShiftMtcEmployee(emp)).length
      : (currentGroup === 'A' || currentGroup === 'B' || currentGroup === 'C')
        ? employeeSource.filter(emp => {
            if (isShiftMtcEmployee(emp)) {
              return getShiftMtcGroup(emp) === currentGroup;
            }
            return emp.grup === currentGroup;
          }).length
        : currentGroup === 'NS'
          ? employeeSource.filter(emp => emp.grup === 'NS' || isSecondedToNSEmployee(emp, activePeriodToCheck)).length
          : employeeSource.filter(emp => emp.grup === currentGroup).length;

  // Filter active group employees to find who is missing an evaluation in this active period
  const activeGroupEmployees = employeeSource.filter(emp => {
    if (currentGroup === 'ALL') {
      return true;
    }
    if (currentGroup === 'MTC') {
      return emp.grup === 'MTC' || isShiftMtcEmployee(emp);
    }
    if (currentGroup === 'A' || currentGroup === 'B' || currentGroup === 'C') {
      if (isShiftMtcEmployee(emp)) {
        return getShiftMtcGroup(emp) === currentGroup;
      }
      return emp.grup === currentGroup;
    }
    if (currentGroup === 'NS') {
      return emp.grup === 'NS' || isSecondedToNSEmployee(emp, activePeriodToCheck);
    }
    return emp.grup === currentGroup;
  });

  const unevaluatedEmployees = activeGroupEmployees.filter(emp => {
    // If we are Shift A/B/C, and this is a seconded employee, they are frozen so Shift Kss cannot evaluate them.
    // They are evaluated by Kss NS. Therefore, we should check if they have an NS evaluation, but we don't
    // want to mark them as "Belum Dinilai" for the Shift KSS because they cannot act on it anyway.
    if ((currentGroup === 'A' || currentGroup === 'B' || currentGroup === 'C') && isSecondedToNSEmployee(emp, activePeriodToCheck)) {
      return false; // Not considered unevaluated for the shift
    }

    const hasEval = evaluations.some(e => {
      if (!isSameEmployee(e, emp)) return false;
      
      const periodMatches = parseAndNormalizePeriode(e.periode).trim().toLowerCase() === 
                            parseAndNormalizePeriode(activePeriodToCheck).trim().toLowerCase();
      if (!periodMatches) return false;

      // Special check for MTC shift operators and MTC non-shift operators under MTC access:
      // They are only considered evaluated by MTC if there is an official evaluation (grup: 'MTC', not supportive)
      if (currentGroup === 'MTC') {
        return e.grup === 'MTC' && !e.isSupportive;
      }

      // Special check for MTC shift operators under Shift (A/B/C) access:
      // They are considered evaluated under this shift ONLY if an evaluation for this specific shift group exists.
      // KSS MTC and KSS Shift evaluations are independent and do not collide or lock each other.
      if ((currentGroup === 'A' || currentGroup === 'B' || currentGroup === 'C') && isShiftMtcEmployee(emp)) {
        return e.grup === currentGroup;
      }

      // Special check for seconded employees under NS access:
      // They are evaluated if there is an official evaluation from NS
      if (currentGroup === 'NS' && isSecondedToNSEmployee(emp, activePeriodToCheck)) {
        return e.grup === 'NS' && !e.isSupportive;
      }

      return !e.isSupportive; // General case: only count official ratings
    });
    return !hasEval;
  });

  const filteredUnevaluatedEmployees = unevaluatedEmployees.filter(emp => {
    const matchesSearch = emp.nama.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          emp.noReg.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (emp.empId && emp.empId.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesGroup = groupFilter === 'ALL' || emp.grup === groupFilter;
    return matchesSearch && matchesGroup;
  }).sort((a, b) => compareEmpId(a.empId, b.empId, a.noReg, b.noReg, employees));

  const handleSelectForEvaluation = (noReg: string) => {
    window.dispatchEvent(
      new CustomEvent('select-employee-for-evaluation', {
        detail: { noReg }
      })
    );
  };

  const activePeriodEvaluations = groupBoundEvaluations.filter(e => {
    return parseAndNormalizePeriode(e.periode).trim().toLowerCase() === 
           parseAndNormalizePeriode(activePeriodToCheck).trim().toLowerCase();
  });

  const totalEvaluated = totalOperatorsCount - unevaluatedEmployees.length;
  
  const avgNil1 = activePeriodEvaluations.length > 0 
    ? parseFloat((activePeriodEvaluations.reduce((sum, e) => sum + e.nil1, 0) / activePeriodEvaluations.length).toFixed(1)) 
    : 0;

  const avgNil2 = activePeriodEvaluations.length > 0 
    ? parseFloat((activePeriodEvaluations.reduce((sum, e) => sum + e.nil2, 0) / activePeriodEvaluations.length).toFixed(1)) 
    : 0;

  const combinedAvg = activePeriodEvaluations.length > 0 
    ? parseFloat((activePeriodEvaluations.reduce((sum, e) => sum + e.average, 0) / activePeriodEvaluations.length).toFixed(1)) 
    : 0;

  // Find top operator(s) with robust tie-handling
  const bestOperators = React.useMemo(() => {
    // 1. Filter evaluations for active group & period
    const filteredEvals = evaluations.filter(e => {
      const matchesPeriod = matchesSelectedPeriod(e.periode);
      const isSupportive = e.isSupportive === true || (e.isSupportive as any) === 'true';
      if (currentGroup === 'ALL') {
        return !isSupportive && matchesPeriod;
      } else {
        const emp = (employees || PREPOPULATED_EMPLOYEES).find(x => isSameEmployee(e, x));
        const originalGroup = emp ? emp.grup : e.grup;
        // Check if employee belongs to currentGroup
        let isGroupMatch = false;
        if (currentGroup === 'MTC') {
          isGroupMatch = e.grup === 'MTC';
        } else {
          isGroupMatch = e.grup === currentGroup;
        }
        return isGroupMatch && matchesPeriod;
      }
    });

    // 2. Group by employee (No. Reg) to get their overall average in this period
    const empMap = new Map<string, { noReg: string; nama: string; grup: string; totalAverage: number; count: number }>();
    filteredEvals.forEach(e => {
      const key = e.noReg.toUpperCase();
      const existing = empMap.get(key) || { noReg: e.noReg, nama: e.nama, grup: e.grup, totalAverage: 0, count: 0 };
      existing.totalAverage += e.average;
      existing.count += 1;
      empMap.set(key, existing);
    });

    // 3. Compute final average
    const opsWithAvg = Array.from(empMap.values()).map(o => ({
      noReg: o.noReg,
      nama: o.nama,
      grup: o.grup,
      average: parseFloat((o.totalAverage / o.count).toFixed(2)),
      count: o.count
    }));

    if (opsWithAvg.length === 0) return [];

    // Find highest average
    const maxAvg = Math.max(...opsWithAvg.map(o => o.average));
    
    // Filter operators who achieved this maximum average
    return opsWithAvg.filter(o => o.average === maxAvg && o.average > 0);
  }, [evaluations, currentGroup, monthFilter, yearFilter, employees]);

  // Google Maps Style Rating calculations
  const operatorRankings = React.useMemo(() => {
    const baseEmployees = currentGroup === 'ALL' 
      ? (groupFilter === 'ALL' ? employeeSource : employeeSource.filter(e => e.grup === groupFilter))
      : activeGroupEmployees;

    const list = baseEmployees.map(emp => {
      const empEvals = evaluations.filter(e => {
        const isMatch = isSameEmployee(e, emp);
        const matchesPeriod = matchesSelectedPeriod(e.periode);
        return isMatch && matchesPeriod;
      });

      if (empEvals.length === 0) return null;

      const totalAverage = empEvals.reduce((sum, e) => sum + e.average, 0);
      const avg = parseFloat((totalAverage / empEvals.length).toFixed(2));
      const activePeriods = Array.from(new Set(empEvals.map(e => e.periode)));
      const periodeDisplay = (monthFilter === 'ALL' && yearFilter === 'ALL')
        ? 'Semua Periode' 
        : (monthFilter !== 'ALL' && yearFilter !== 'ALL'
          ? `${monthFilter} ${yearFilter}`
          : (monthFilter !== 'ALL' ? `Bulan ${monthFilter}` : `Tahun ${yearFilter}`));
      
      // Fetch HRMS Kehadiran and Kedisiplinan for this operator in the matched period(s)
      const empHrms = hrmsRecords.filter(hr => {
        const isMatch = isSameEmployee({ noReg: emp.noReg, nama: emp.nama }, { noReg: hr.noReg, nama: hr.nama });
        const matchesPeriod = matchesSelectedPeriod(hr.periode);
        return isMatch && matchesPeriod;
      });

      const avgKehadiran = empHrms.length > 0
        ? parseFloat((empHrms.reduce((sum, hr) => sum + hr.kehadiran, 0) / empHrms.length).toFixed(1))
        : null;
      const avgKedisiplinan = empHrms.length > 0
        ? parseFloat((empHrms.reduce((sum, hr) => sum + hr.kedisiplinan, 0) / empHrms.length).toFixed(1))
        : null;

      // Calculate total accumulated score (including Kualitas, Kuantitas, Kehadiran, Kedisiplinan)
      let accumulatedScore = 0;
      empEvals.forEach(e => {
        const matchingHrms = empHrms.find(hr => parseAndNormalizePeriode(hr.periode) === parseAndNormalizePeriode(e.periode));
        const hrKehadiran = matchingHrms ? matchingHrms.kehadiran : 0;
        const hrKedisiplinan = matchingHrms ? matchingHrms.kedisiplinan : 0;
        accumulatedScore += (e.nil1 + e.nil2 + hrKehadiran + hrKedisiplinan);
      });

      const maxPossibleScore = empEvals.length * 20;
      const averageScore = parseFloat((accumulatedScore / empEvals.length).toFixed(1));

      const avgNil1 = parseFloat((empEvals.reduce((sum, e) => sum + e.nil1, 0) / empEvals.length).toFixed(1));
      const avgNil2 = parseFloat((empEvals.reduce((sum, e) => sum + e.nil2, 0) / empEvals.length).toFixed(1));

      return {
        noReg: emp.noReg,
        nama: emp.nama,
        grup: emp.grup,
        average: getRatingAndLabelFromScore(averageScore).average,
        count: empEvals.length,
        periode: periodeDisplay,
        accumulatedScore,
        maxPossibleScore,
        averageScore,
        avgNil1,
        avgNil2,
        avgKehadiran,
        avgKedisiplinan
      };
    }).filter(Boolean) as { 
      noReg: string; 
      nama: string; 
      grup: string; 
      average: number; 
      count: number; 
      periode: string; 
      accumulatedScore: number;
      maxPossibleScore: number;
      averageScore: number;
      avgNil1: number;
      avgNil2: number;
      avgKehadiran: number | null;
      avgKedisiplinan: number | null;
    }[];

    // Sort descending by average score out of 20
    return list.sort((a, b) => b.averageScore - a.averageScore);
  }, [evaluations, hrmsRecords, currentGroup, monthFilter, yearFilter, groupFilter, activeGroupEmployees, employeeSource]);

  const overallAverage = React.useMemo(() => {
    if (operatorRankings.length === 0) return 0;
    const sum = operatorRankings.reduce((acc, op) => acc + op.average, 0);
    return parseFloat((sum / operatorRankings.length).toFixed(2));
  }, [operatorRankings]);

  const overallKehadiran = React.useMemo(() => {
    const validRecs = operatorRankings.filter(op => op.avgKehadiran !== null);
    if (validRecs.length === 0) return null;
    const sum = validRecs.reduce((acc, op) => acc + (op.avgKehadiran || 0), 0);
    return parseFloat((sum / validRecs.length).toFixed(1));
  }, [operatorRankings]);

  const overallKedisiplinan = React.useMemo(() => {
    const validRecs = operatorRankings.filter(op => op.avgKedisiplinan !== null);
    if (validRecs.length === 0) return null;
    const sum = validRecs.reduce((acc, op) => acc + (op.avgKedisiplinan || 0), 0);
    return parseFloat((sum / validRecs.length).toFixed(1));
  }, [operatorRankings]);

  const overallKualitas = React.useMemo(() => {
    if (operatorRankings.length === 0) return 0;
    const sum = operatorRankings.reduce((acc, op) => acc + op.avgNil1, 0);
    return parseFloat((sum / operatorRankings.length).toFixed(1));
  }, [operatorRankings]);

  const overallKuantitas = React.useMemo(() => {
    if (operatorRankings.length === 0) return 0;
    const sum = operatorRankings.reduce((acc, op) => acc + op.avgNil2, 0);
    return parseFloat((sum / operatorRankings.length).toFixed(1));
  }, [operatorRankings]);

  // Groupings for star levels (5, 4, 3, 2, 1)
  const starCounts = React.useMemo(() => {
    const counts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    operatorRankings.forEach(op => {
      const score = op.average;
      if (score >= 4.5) counts[5] += 1;
      else if (score >= 3.5) counts[4] += 1;
      else if (score >= 2.5) counts[3] += 1;
      else if (score >= 0.5) counts[2] += 1;
      else counts[1] += 1;
    });
    return counts;
  }, [operatorRankings]);

  // Display rankings with star filtering
  const displayedRankings = React.useMemo(() => {
    if (starFilter === 'ALL') return operatorRankings;
    if (starFilter === 5) {
      return operatorRankings.filter(op => op.average >= 4.5);
    }
    if (starFilter === 4) {
      return operatorRankings.filter(op => op.average >= 3.5 && op.average < 4.5);
    }
    if (starFilter === 3) {
      return operatorRankings.filter(op => op.average >= 2.5 && op.average < 3.5);
    }
    if (starFilter === 2) {
      return operatorRankings.filter(op => op.average >= 0.5 && op.average < 2.5);
    }
    if (starFilter === 1) {
      return operatorRankings.filter(op => op.average < 0.5);
    }
    return operatorRankings;
  }, [operatorRankings, starFilter]);

  // Menghitung distribusi predikat per grup untuk grafik batang bertumpuk (Hanya untuk Admin)
  const distributionData = React.useMemo(() => {
    if (currentGroup !== 'ALL') return [];
    
    // Group rankings by group name
    const groupsMap = new Map<string, {
      SangatBaik: number;
      Baik: number;
      Sedang: number;
      Cukup: number;
      total: number;
    }>();
    
    // Filter out active groups from currently evaluated operators
    const activeGroups = Array.from(new Set(operatorRankings.map(op => op.grup))).filter(Boolean) as string[];
    activeGroups.sort();
    
    activeGroups.forEach((g: string) => {
      groupsMap.set(g, { SangatBaik: 0, Baik: 0, Sedang: 0, Cukup: 0, total: 0 });
    });
    
    operatorRankings.forEach(op => {
      const g = op.grup;
      const stats = groupsMap.get(g) || { SangatBaik: 0, Baik: 0, Sedang: 0, Cukup: 0, total: 0 };
      
      const { label } = getRatingAndLabelFromScore(op.averageScore);
      if (label === 'Sangat Baik') {
        stats.SangatBaik += 1;
      } else if (label === 'Baik') {
        stats.Baik += 1;
      } else if (label === 'Sedang') {
        stats.Sedang += 1;
      } else {
        stats.Cukup += 1;
      }
      stats.total += 1;
      groupsMap.set(g, stats);
    });
    
    const data = Array.from(groupsMap.entries()).map(([group, stats]) => {
      const total = stats.total;
      const pctSangatBaik = total > 0 ? parseFloat(((stats.SangatBaik / total) * 100).toFixed(1)) : 0;
      const pctBaik = total > 0 ? parseFloat(((stats.Baik / total) * 100).toFixed(1)) : 0;
      const pctSedang = total > 0 ? parseFloat(((stats.Sedang / total) * 100).toFixed(1)) : 0;
      const pctCukup = total > 0 ? parseFloat(((stats.Cukup / total) * 100).toFixed(1)) : 0;
      
      const getReadableGroupName = (g: string) => g.length === 1 ? `Grup ${g}` : g;
      
      return {
        grup: getReadableGroupName(group),
        groupRaw: group,
        'Sangat Baik %': pctSangatBaik,
        'Baik %': pctBaik,
        'Sedang %': pctSedang,
        'Cukup %': pctCukup,
        'Sangat Baik (Count)': stats.SangatBaik,
        'Baik (Count)': stats.Baik,
        'Sedang (Count)': stats.Sedang,
        'Cukup (Count)': stats.Cukup,
        totalCount: total,
      };
    });
    
    return data.sort((a, b) => a.groupRaw.localeCompare(b.groupRaw));
  }, [operatorRankings, currentGroup]);

  // Mengambil daftar operator unik yang memiliki riwayat penilaian
  const uniqueEvaluatedEmployees = React.useMemo(() => {
    const map = new Map<string, { nama: string; noReg: string }>();
    evaluations.forEach(e => {
      if (e.noReg) {
        // Jika bukan admin (currentGroup !== 'ALL'), check apakah employee termasuk dalam activeGroupEmployees
        if (currentGroup !== 'ALL') {
          const belongsToGroup = activeGroupEmployees.some(
            emp => emp.noReg.toUpperCase() === e.noReg.toUpperCase()
          );
          if (!belongsToGroup) {
            return;
          }
        }
        map.set(e.noReg, { nama: e.nama, noReg: e.noReg });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.nama.localeCompare(b.nama));
  }, [evaluations, currentGroup, activeGroupEmployees]);

  const activeTrendNoReg = selectedTrendNoReg || (uniqueEvaluatedEmployees[0]?.noReg || '');

  // Menghitung rata-rata nilai perusahaan per periode untuk pembanding
  const companyPeriodAverages = React.useMemo(() => {
    const periodMap = new Map<string, { total: number; count: number }>();
    evaluations.forEach(e => {
      const current = periodMap.get(e.periode) || { total: 0, count: 0 };
      periodMap.set(e.periode, {
        total: current.total + e.average,
        count: current.count + 1
      });
    });
    return periodMap;
  }, [evaluations]);

  // Membuat dataset tren kronologis untuk karyawan terpilih
  const trendData = React.useMemo(() => {
    if (!activeTrendNoReg) return [];
    
    const empEvals = evaluations.filter(e => e.noReg === activeTrendNoReg);
    
    return empEvals
      .map(e => {
        const companyAvgData = companyPeriodAverages.get(e.periode);
        const companyAvg = companyAvgData ? Number((companyAvgData.total / companyAvgData.count).toFixed(2)) : 0;
        return {
          periode: e.periode,
          'Rata-rata Karyawan': Number(e.average.toFixed(2)),
          'Rata-rata Perusahaan': companyAvg,
          'Kualitas': e.nil1,
          'Kuantitas': e.nil2,
          parsedTimestamp: getPeriodTimestamp(e.periode)
        };
      })
      .sort((a, b) => a.parsedTimestamp - b.parsedTimestamp);
  }, [evaluations, activeTrendNoReg, companyPeriodAverages]);

  return (
    <div id="dashboard-container" className="space-y-4">
      
      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Operator</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{totalOperatorsCount}</p>
        </div>
        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Sudah Dinilai</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{totalEvaluated} / {totalOperatorsCount}</p>
        </div>
        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Rata-rata Grup</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">{combinedAvg > 0 ? combinedAvg : '0.0'}</p>
        </div>
      </div>

      {/* Warning Banner for Unevaluated Employees */}
      {unevaluatedEmployees.length > 0 && (
        <div id="unevaluated-warning-banner" className="bg-rose-50 border border-rose-200 text-rose-850 p-4 rounded-xl flex items-start gap-3.5 shadow-3xs animate-fade-in">
          <div className="w-10 h-10 bg-rose-100/80 border border-rose-250 text-rose-600 rounded-lg flex items-center justify-center shrink-0">
            <Info className="w-5 h-5 text-rose-500 animate-pulse" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-xs font-black uppercase tracking-wider text-rose-800 flex items-center gap-1.5">
              <span>⚠️ PEMBERITAHUAN PENILAIAN BULAN INI</span>
              <span className="bg-rose-100 text-rose-800 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded border border-rose-200/50">BELUM LENGKAP</span>
            </h4>
            <p className="text-[11.5px] text-slate-650 mt-1 leading-relaxed">
              Ada <span className="font-extrabold text-rose-700">{unevaluatedEmployees.length} karyawan</span> di grup aktif Anda yang belum mendapatkan penilaian kerja di periode <span className="font-bold">{thisPeriod}</span>. Harap segera melengkapi sebelum akhir batas periode.
            </p>
            <div className="mt-2.5 flex items-center gap-2">
              <button
                id="btn-view-missing-tab"
                type="button"
                onClick={() => {
                  setActiveTab('missing');
                  const cardElement = document.getElementById('history-table-card');
                  if (cardElement) {
                    cardElement.scrollIntoView({ behavior: 'smooth' });
                  }
                }}
                className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white text-[10px] font-extrabold uppercase tracking-wider rounded-lg transition duration-150 cursor-pointer shadow-3xs"
              >
                Lihat Daftar Karyawan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History and Search Table formatted professionally */}
      <div id="history-table-card" className="bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col overflow-hidden">
        {/* Tab Selection */}
        <div className="flex border-b border-slate-200 bg-slate-50/50 px-6 gap-2">
          <button
            id="tab-history"
            type="button"
            onClick={() => setActiveTab('history')}
            className={`py-3 px-4 text-xs font-black uppercase tracking-wider border-b-2 transition cursor-pointer flex items-center gap-2 ${
              activeTab === 'history'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            📋 Nilai ({displayedEvaluations.length})
          </button>
          <button
            id="tab-missing"
            type="button"
            onClick={() => setActiveTab('missing')}
            className={`py-3 px-4 text-xs font-black uppercase tracking-wider border-b-2 transition cursor-pointer flex items-center gap-2 relative ${
              activeTab === 'missing'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            ⚠️ Belum Dinilai ({unevaluatedEmployees.length})
            {unevaluatedEmployees.length > 0 && (
              <span className="flex h-2 w-2 absolute top-2 right-1">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
              </span>
            )}
          </button>
        </div>

        <div className="p-6 border-b border-slate-150 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-50/20">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div>
              <h3 className="font-bold text-slate-800 text-sm">
                {activeTab === 'missing' 
                  ? `Daftar Karyawan Belum Dinilai (${currentGroup === 'ALL' ? 'Semua Grup' : `Grup ${currentGroup}`})`
                  : `Skor Penilaian (${currentGroup === 'ALL' ? 'Semua Grup' : `Grup ${currentGroup}`})`
                }
              </h3>
              <p className="text-[11px] text-slate-450 mt-0.5">
                {activeTab === 'missing'
                  ? `Periode Aktif: ${thisPeriod} • Menampilkan ${filteredUnevaluatedEmployees.length} dari ${unevaluatedEmployees.length} karyawan yang belum diinput draf penilaiannya.`
                  : `Total terekam: ${displayedEvaluations.length} operator dalam draf`
                }
              </p>
            </div>
            {onSyncFromSpreadsheet && hasWebhookUrl && currentGroup === 'ALL' && (
              <button
                type="button"
                onClick={handleSyncClick}
                disabled={isSyncing}
                className="self-start sm:self-auto p-2 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50 border border-emerald-200 text-emerald-700 rounded-lg flex items-center justify-center gap-1.5 transition cursor-pointer active:scale-95 shadow-3xs"
                title="Tarik & sinkronkan data terbaru yang diredirect langsung dari Google Spreadsheet"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-emerald-600 shrink-0 ${isSyncing ? 'animate-spin' : ''}`} />
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5 max-w-md w-full md:w-auto">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[150px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Cari Nama / No. Reg..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full text-xs py-1.5 bg-white border border-slate-200 rounded-md pl-8 pr-3 focus:outline-none focus:ring-1 focus:ring-blue-500 transition duration-150"
              />
            </div>

            {/* Local Selection Filter (Admin only can filter other groups) */}
            {currentGroup === 'ALL' && (
              <div className="relative shrink-0">
                <select
                  value={groupFilter}
                  onChange={(e) => {
                    setGroupFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="bg-white text-xs border border-slate-200 py-1.5 pl-3 pr-8 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer appearance-none shrink-0"
                >
                  <option value="ALL">Semua Grup</option>
                  <option value="A">Grup A</option>
                  <option value="B">Grup B</option>
                  <option value="C">Grup C</option>
                  <option value="NS">Non-Shift (NS)</option>
                  <option value="MTC">MTC</option>
                  <option value="LAB">LAB</option>
                  <option value="QC">QC</option>
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center pr-2.5 pointer-events-none text-slate-400">
                  <Filter className="w-3 h-3" />
                </div>
              </div>
            )}

            {/* Month Filter Dropdown */}
            <div className="relative shrink-0">
              <select
                value={monthFilter}
                onChange={(e) => {
                  setMonthFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="bg-white text-xs border border-slate-200 py-1.5 pl-3 pr-8 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer appearance-none shrink-0 font-medium text-slate-700"
                title="Filter Bulan"
              >
                <option value="ALL">Semua Bulan</option>
                {MONTH_NAMES_ID.map(m => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <div className="absolute inset-y-0 right-0 flex items-center pr-2.5 pointer-events-none text-slate-400">
                <Calendar className="w-3.5 h-3.5" />
              </div>
            </div>

            {/* Year Filter Dropdown */}
            <div className="relative shrink-0">
              <select
                value={yearFilter}
                onChange={(e) => {
                  setYearFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="bg-white text-xs border border-slate-200 py-1.5 pl-3 pr-8 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer appearance-none shrink-0 font-medium text-slate-700"
                title="Filter Tahun"
              >
                <option value="ALL">Semua Tahun</option>
                {availableYears.map(y => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <div className="absolute inset-y-0 right-0 flex items-center pr-2.5 pointer-events-none text-slate-400">
                <Calendar className="w-3.5 h-3.5" />
              </div>
            </div>

            {/* Download CSV Button */}
            <button
              id="dashboard-download-csv-btn"
              type="button"
              onClick={() => setIsCsvModalOpen(true)}
              className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-md flex items-center gap-1.5 transition text-xs font-bold shadow-3xs cursor-pointer shrink-0"
              title="Unduh rekap penilaian dalam format CSV sesuai format SPK (NIK, Nama Karyawan, KUALITAS, KUANTITAS, KEHADIRAN, KEDISIPLINAN)"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Unduh CSV</span>
            </button>

            {/* Show Entries Dropdown */}
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Show</span>
              <select
                value={entriesPerPage}
                onChange={(e) => {
                  setEntriesPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="bg-white border border-slate-200 text-slate-700 py-1 px-1.5 pr-6 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer text-xs font-bold appearance-none bg-[url('data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%2394a3b8%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpolyline%20points%3D%226%209%2012%2015%2018%209%22%3E%3C%2Fpolyline%3E%3C%2Fsvg%3E')] bg-[length:12px] bg-[right_5px_center] bg-no-repeat"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>
        </div>
           {/* Conditionally render based on activeTab */}
        {activeTab === 'missing' ? (
          <div className="overflow-x-auto relative">
            <table className="w-full text-left border-collapse text-xs text-slate-650 min-w-[950px]">
              <thead className="sticky top-0 bg-white border-b border-slate-200 z-20">
                <tr className="bg-slate-50 text-[10.5px] font-black uppercase text-slate-400 tracking-wider whitespace-nowrap">
                  <th className="p-3 md:p-4 whitespace-nowrap">Nama Karyawan</th>
                  <th className="p-3 md:p-4 whitespace-nowrap">No. Reg</th>
                  <th className="p-3 md:p-4 text-center whitespace-nowrap">Grup</th>
                  <th className="p-3 md:p-4 whitespace-nowrap">Jabatan</th>
                  <th className="p-3 md:p-4 text-center whitespace-nowrap">Status Periode {thisPeriod}</th>
                  <th className="p-3 md:p-4 text-center whitespace-nowrap">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUnevaluatedEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-16 text-xs text-slate-400 bg-white whitespace-nowrap">
                      <div className="w-12 h-12 bg-green-50 border border-green-150 rounded-full flex items-center justify-center mx-auto mb-3 text-green-600 shadow-3xs">
                        <Check className="w-6 h-6 animate-bounce" />
                      </div>
                      <p className="font-extrabold text-slate-800 text-sm uppercase tracking-wider whitespace-nowrap">Semua Karyawan Sudah Dinilai! 🎉</p>
                      <p className="text-[11.5px] text-slate-500 mt-1 max-w-md mx-auto leading-relaxed whitespace-normal">
                        Luar biasa! Seluruh karyawan di grup ini telah mendapatkan draf penilaian kerja untuk periode aktif <strong className="font-bold">{thisPeriod}</strong>.
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredUnevaluatedEmployees.map((emp) => (
                    <tr key={emp.noReg} className="hover:bg-rose-50/20 bg-white group transition-colors whitespace-nowrap">
                      <td className="p-2.5 md:p-3 font-semibold text-slate-800 whitespace-nowrap">{emp.nama}</td>
                      <td className="p-2.5 md:p-3 text-slate-500 font-mono text-xs whitespace-nowrap">{emp.noReg}</td>
                      <td className="p-2.5 md:p-3 text-center whitespace-nowrap">
                        <span className={`inline-block px-2.5 py-0.5 rounded-md text-[10px] font-extrabold uppercase ${
                          emp.grup === 'A' ? 'bg-blue-50 text-blue-700 border border-blue-100' :
                          emp.grup === 'B' ? 'bg-purple-50 text-purple-700 border border-purple-100' :
                          emp.grup === 'C' ? 'bg-orange-50 text-orange-700 border border-orange-100' :
                          'bg-slate-50 text-slate-600 border border-slate-150'
                        }`}>
                          Grup {emp.grup}
                        </span>
                      </td>
                      <td className="p-2.5 md:p-3 text-slate-550 font-medium whitespace-nowrap">{emp.jabatan || '-'}</td>
                      <td className="p-2.5 md:p-3 text-center whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200 uppercase tracking-wider whitespace-nowrap">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                          Belum Dinilai
                        </span>
                      </td>
                      <td className="p-2.5 md:p-3 text-center whitespace-nowrap">
                        <button
                          id={`btn-nilai-${emp.noReg}`}
                          type="button"
                          onClick={() => handleSelectForEvaluation(emp.noReg)}
                          className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-[10px] uppercase tracking-wider rounded-lg transition duration-150 shadow-3xs cursor-pointer active:scale-95 whitespace-nowrap"
                          title={`Klik untuk menilai ${emp.nama} di formulir input`}
                        >
                          ✍️ Nilai Operator
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <>
            {/* Dense evaluation table */}
            <div className="overflow-x-auto max-h-[580px] overflow-y-auto relative border border-slate-150 rounded-xl shadow-3xs">
              <table className="w-full text-left border-collapse text-xs text-slate-650 min-w-[1100px]">
                <thead className="sticky top-0 bg-white border-b border-slate-200 z-20">
                  <tr className="whitespace-nowrap">
                    <th className="p-3 md:p-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-center md:sticky md:left-0 bg-white hover:bg-slate-50 md:z-30 md:border-r border-slate-200 md:shadow-[2px_0_4px_rgba(0,0,0,0.03)] min-w-[50px] max-w-[50px] select-none text-center whitespace-nowrap">No.</th>
                    <th className="p-3 md:p-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-center md:sticky md:left-[50px] bg-white hover:bg-slate-50 md:z-30 md:border-r border-slate-200 md:shadow-[2px_0_4px_rgba(0,0,0,0.03)] min-w-[150px] max-w-[150px] select-none text-center whitespace-nowrap">Aksi</th>
                    <th 
                      onClick={() => handleSort('nama')}
                      className="p-3 md:p-4 text-xs font-bold text-slate-400 uppercase tracking-wider md:sticky md:left-[200px] bg-white hover:bg-slate-50 md:z-30 md:border-r border-slate-200 md:shadow-[2px_0_4px_rgba(0,0,0,0.03)] min-w-[180px] cursor-pointer select-none group/th transition-colors duration-150 whitespace-nowrap"
                      title="Urutkan berdasarkan Nama"
                    >
                      <div className="flex items-center gap-1">
                        <span>Nama Karyawan</span>
                        {renderSortIndicator('nama')}
                      </div>
                    </th>
                    <th 
                      onClick={() => handleSort('noReg')}
                      className="p-3 md:p-4 text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer select-none hover:bg-slate-50 group/th transition-colors duration-150 whitespace-nowrap"
                      title="Urutkan berdasarkan No. Reg"
                    >
                      <div className="flex items-center gap-1">
                        <span>No. Reg</span>
                        {renderSortIndicator('noReg')}
                      </div>
                    </th>
                    <th 
                      onClick={() => handleSort('nil1')}
                      className="p-3 md:p-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-center cursor-pointer select-none hover:bg-slate-50 group/th transition-colors duration-150 whitespace-normal"
                      title="Urutkan berdasarkan Kualitas"
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>Kualitas (Nilai 1)</span>
                        {renderSortIndicator('nil1')}
                      </div>
                    </th>
                    <th 
                      onClick={() => handleSort('nil2')}
                      className="p-3 md:p-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-center cursor-pointer select-none hover:bg-slate-50 group/th transition-colors duration-150 whitespace-normal"
                      title="Urutkan berdasarkan Kuantitas"
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>Kuantitas (Nilai 2)</span>
                        {renderSortIndicator('nil2')}
                      </div>
                    </th>
                    <th 
                      className="p-3 md:p-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-center select-none hover:bg-slate-50 transition-colors duration-150 whitespace-normal w-24 min-w-[96px]"
                      title="Kehadiran (HRMS)"
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>Kehadiran (HRMS)</span>
                      </div>
                    </th>
                    <th 
                      className="p-3 md:p-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-center select-none hover:bg-slate-50 transition-colors duration-150 whitespace-normal w-24 min-w-[96px]"
                      title="Kedisiplinan (HRMS)"
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>Disiplin (HRMS)</span>
                      </div>
                    </th>
                    <th 
                      onClick={() => handleSort('skor')}
                      className="p-3 md:p-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right cursor-pointer select-none hover:bg-slate-50 group/th transition-colors duration-150 whitespace-nowrap"
                      title="Urutkan berdasarkan Total Skor"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>Skor</span>
                        {renderSortIndicator('skor')}
                      </div>
                    </th>
                    <th 
                      onClick={() => handleSort('periode')}
                      className="p-3 md:p-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-center cursor-pointer select-none hover:bg-slate-50 group/th transition-colors duration-150 whitespace-nowrap"
                      title="Urutkan berdasarkan Periode"
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>Periode</span>
                        {renderSortIndicator('periode')}
                      </div>
                    </th>
                    <th 
                      onClick={() => handleSort('submittedAt')}
                      className="p-3 md:p-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right cursor-pointer select-none hover:bg-slate-50 group/th transition-colors duration-150 whitespace-nowrap"
                      title="Urutkan berdasarkan Tanggal Input"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>Tanggal Input</span>
                        {renderSortIndicator('submittedAt')}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {currentEntries.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="text-center py-10 text-xs text-slate-400">
                        <Info className="w-5 h-5 mx-auto text-slate-300 mb-1.5" />
                        Belum ditemukan riwayat penilaian operator.
                      </td>
                    </tr>
                  ) : (
                    currentEntries.map((e, index) => {
                      const isPending = e.pendingApproval === true;
                      const serialNumber = (safeCurrentPage - 1) * entriesPerPage + index + 1;
                      
                      // Cek jika data baru saja ditambahkan (dalam 2 menit terakhir)
                      const isRecentlyAdded = Date.now() - new Date(e.submittedAt).getTime() < 120000;
                      
                      // Logika pembatasan edit untuk non-admin
                      const todayDay = new Date().getDate();
                      const isPeriodOpenForEdit = todayDay <= 25;
                      const hasBeenEdited = (e.editedCount || 0) >= 1;
                      const canNonAdminEdit = isPeriodOpenForEdit && !hasBeenEdited;
                      const isEditable = currentGroup === 'ALL' || canNonAdminEdit;

                      let editTooltip = "Edit Penilaian";
                      if (currentGroup !== 'ALL') {
                        if (!isPeriodOpenForEdit) {
                          editTooltip = "Edit nilai sudah melewati batas tanggal penilaian yang telah ditentukan";
                        } else if (hasBeenEdited) {
                          editTooltip = "Hanya bisa edit 1 kali";
                        }
                      }

                      const rowBgClass = isRecentlyAdded 
                        ? 'bg-emerald-50/40 border-l-4 border-emerald-500 animate-pulse' 
                        : isPending 
                        ? 'bg-amber-50/20' 
                        : '';

                      return (
                        <tr key={e.id} className={`hover:bg-slate-50 group transition-colors ${rowBgClass}`}>
                          <td className="p-2.5 md:p-3 md:sticky md:left-0 bg-white group-hover:bg-slate-50 md:border-r border-slate-200 md:shadow-[2px_0_4px_rgba(0,0,0,0.03)] md:z-10 transition-colors min-w-[50px] max-w-[50px] text-center font-bold text-slate-400 font-mono text-xs whitespace-nowrap">
                            {serialNumber}
                          </td>
                          <td className="p-2.5 md:p-3 md:sticky md:left-[50px] bg-white group-hover:bg-slate-50 md:border-r border-slate-200 md:shadow-[2px_0_4px_rgba(0,0,0,0.03)] md:z-10 transition-colors min-w-[150px] max-w-[150px] text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1.5 whitespace-nowrap">
                              {/* View button (Visible to everyone) */}
                              <button
                                type="button"
                                onClick={() => {
                                  setViewingEval(e);
                                }}
                                className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition duration-150 cursor-pointer whitespace-nowrap"
                                title="Lihat Detail Penilaian"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
    
                              {/* Approve button (Admin only when pendingApproval) */}
                              {currentGroup === 'ALL' && isPending && onApproveEvaluation && (
                                <button
                                  type="button"
                                  onClick={() => onApproveEvaluation(e)}
                                  className="px-2 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 rounded-md transition duration-150 cursor-pointer flex items-center gap-1 shrink-0 font-bold text-[10px]"
                                  title="Setujui dan Sinkronkan ke Google Spreadsheet"
                                >
                                  <ThumbsUp className="w-3 h-3 text-emerald-600 animate-bounce" />
                                  <span>Setujui</span>
                                </button>
                              )}
    
                              {/* Edit button (KSS and Admin only) */}
                              {currentGroup !== 'NONE' && (
                                <button
                                  type="button"
                                  disabled={!isEditable}
                                  onClick={() => {
                                    if (!isEditable) return;
                                    setEditingEval(e);
                                    setEditNama(e.nama);
                                    setEditNoReg(e.noReg);
                                    setEditGrup(e.grup);
                                    setEditNil1(e.nil1);
                                    setEditNil2(e.nil2);
                                    setEditPeriode(e.periode);
                                  }}
                                  className={`p-1.5 rounded-md transition duration-150 ${
                                    isEditable 
                                      ? 'text-blue-500 hover:text-blue-700 hover:bg-blue-50 cursor-pointer' 
                                      : 'text-slate-350 bg-slate-100/30 cursor-not-allowed opacity-50'
                                  }`}
                                  title={editTooltip}
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                              )}
    
                              {/* Delete button (Admin only) */}
                              {currentGroup === 'ALL' && (
                                <button
                                  type="button"
                                  onClick={() => onDeleteEvaluation(e.id, e.nama)}
                                  className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-md transition duration-150 cursor-pointer"
                                  title="Hapus Penilaian"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="p-2.5 md:p-3 md:sticky md:left-[200px] bg-white group-hover:bg-slate-50 md:border-r border-slate-200 md:shadow-[2px_0_4px_rgba(0,0,0,0.03)] md:z-10 transition-colors min-w-[180px] whitespace-nowrap">
                            <div className="flex flex-col whitespace-nowrap">
                              <span className="font-semibold text-slate-700 whitespace-nowrap">{e.nama}</span>
                              {isPending && (
                                <span className="inline-flex items-center gap-1 w-max text-[9px] bg-amber-50 text-amber-700 border border-amber-200 font-bold uppercase px-1.5 py-0.5 rounded-md mt-1 animate-pulse whitespace-nowrap">
                                  ⏳ Edit Pending (Grup {e.editedBy})
                                </span>
                              )}
                              {/* Badge handling for Opt MTC Shift and recommendation records */}
                              {(() => {
                                const empObj = (employees || PREPOPULATED_EMPLOYEES).find(x => isSameEmployee(e, x));
                                const isShiftMtc = empObj ? isShiftMtcEmployee(empObj) : isShiftMtcEmployee(e);

                                if (isShiftMtc) {
                                  // Shift KSS view (A, B, C): Display info if KSS MTC also submitted evaluation
                                  if (currentGroup === 'A' || currentGroup === 'B' || currentGroup === 'C') {
                                    const mtcEval = evaluations.find(x => 
                                      isSameEmployee(x, e) &&
                                      parseAndNormalizePeriode(x.periode).trim().toLowerCase() === parseAndNormalizePeriode(e.periode).trim().toLowerCase() &&
                                      x.grup === 'MTC'
                                    );
                                    if (mtcEval) {
                                      return (
                                        <span className="inline-flex items-center gap-1 w-max text-[9px] bg-sky-100/80 text-sky-900 border border-sky-200 font-extrabold uppercase px-1.5 py-0.5 rounded-md mt-1 whitespace-nowrap" title="KSS MTC juga telah menilai di Sheet MTC">
                                          🛠️ Sheet MTC: N1: {mtcEval.nil1}, N2: {mtcEval.nil2} (Avg: {mtcEval.average.toFixed(1)})
                                        </span>
                                      );
                                    }
                                    return (
                                      <span className="inline-flex items-center gap-1 w-max text-[9px] bg-slate-100 text-slate-500 border border-slate-200 font-medium px-1.5 py-0.5 rounded-md mt-1 whitespace-nowrap">
                                        ℹ️ Sheet Shift {e.grup} (MTC terpisah)
                                      </span>
                                    );
                                  }

                                  // KSS MTC view (MTC) or Admin (ALL): Display info from Shift KSS
                                  if (currentGroup === 'MTC' || currentGroup === 'ALL') {
                                    const shiftEval = evaluations.find(x => 
                                      isSameEmployee(x, e) &&
                                      parseAndNormalizePeriode(x.periode).trim().toLowerCase() === parseAndNormalizePeriode(e.periode).trim().toLowerCase() &&
                                      (!!x.isSupportive || (x.grup && ['A', 'B', 'C'].includes(x.grup)))
                                    );

                                    if (shiftEval) {
                                      return (
                                        <span className="inline-flex items-center gap-1 w-max text-[9px] bg-amber-100/85 text-amber-900 border border-amber-200 font-extrabold uppercase px-1.5 py-0.5 rounded-md mt-1 whitespace-nowrap" title={`Penilaian dari KSS Shift (Grup ${shiftEval.editedBy || shiftEval.grup || 'Shift'})`}>
                                          ⚡ Sheet Shift ({shiftEval.editedBy || shiftEval.grup}): N1: {shiftEval.nil1}, N2: {shiftEval.nil2} (Avg: {shiftEval.average.toFixed(1)})
                                        </span>
                                      );
                                    }
                                  }
                                }

                                if (e.isSupportive) {
                                  if (currentGroup !== 'A' && currentGroup !== 'B' && currentGroup !== 'C') {
                                    return (
                                      <span className="inline-flex items-center gap-1 w-max text-[9px] bg-amber-100/80 text-amber-900 border border-amber-200 font-extrabold uppercase px-1.5 py-0.5 rounded-md mt-1 whitespace-nowrap">
                                        ⭐ Rekomendasi ({e.grup || 'Shift'})
                                      </span>
                                    );
                                  }
                                }

                                return null;
                              })()}
                              {isRecentlyAdded && (
                                <span className="inline-flex items-center gap-1 w-max text-[9px] bg-emerald-100 text-emerald-800 border border-emerald-200 font-extrabold uppercase px-1.5 py-0.5 rounded-md mt-1 animate-bounce whitespace-nowrap">
                                  ✨ Baru Saja Diinput
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-2.5 md:p-3 text-slate-550 font-mono text-xs whitespace-nowrap">{e.noReg}</td>
                          <td className="p-2.5 md:p-3 text-center whitespace-normal">
                            <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded text-xs font-bold whitespace-normal inline-block">
                              {e.nil1}
                            </span>
                          </td>
                          <td className="p-2.5 md:p-3 text-center whitespace-normal">
                            <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded text-xs font-bold whitespace-normal inline-block">
                              {e.nil2}
                            </span>
                          </td>
                          {(() => {
                            const hrmsRec = findHrmsRecord(e.noReg, e.nama, e.periode);
                            return (
                              <>
                                <td className="p-2.5 md:p-3 text-center whitespace-normal">
                                  <span className="bg-indigo-50/50 text-indigo-750 border border-indigo-200/40 px-2 py-1 rounded text-xs font-black whitespace-normal inline-block">
                                    {hrmsRec ? hrmsRec.kehadiran : '-'}
                                  </span>
                                </td>
                                <td className="p-2.5 md:p-3 text-center whitespace-normal">
                                  <span className="bg-indigo-50/50 text-indigo-750 border border-indigo-200/40 px-2 py-1 rounded text-xs font-black whitespace-normal inline-block">
                                    {hrmsRec ? hrmsRec.kedisiplinan : '-'}
                                  </span>
                                </td>
                              </>
                            );
                          })()}
                          {(() => {
                            const hrmsRec = findHrmsRecord(e.noReg, e.nama, e.periode);
                            const hrmsKehadiran = hrmsRec ? hrmsRec.kehadiran : 0;
                            const hrmsKedisiplinan = hrmsRec ? hrmsRec.kedisiplinan : 0;
                            const totalSkor = e.nil1 + e.nil2 + hrmsKehadiran + hrmsKedisiplinan;
                            return (
                              <td className={`p-2.5 md:p-3 text-right font-black text-sm whitespace-nowrap ${totalSkor <= 12 ? 'text-rose-600' : 'text-blue-800'}`}>
                                {totalSkor}
                              </td>
                            );
                          })()}
                          <td className="p-2.5 md:p-3 text-center whitespace-nowrap">
                            <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-md text-[10px] font-bold font-sans whitespace-nowrap">
                              {e.periode}
                            </span>
                          </td>
                          <td className="p-2.5 md:p-3 text-right text-slate-400 text-[10px] font-mono whitespace-nowrap">
                            {formatLokalWaktu(e.submittedAt)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                <tfoot className="sticky bottom-0 bg-white border-t border-slate-200 z-20 shadow-[0_-2px_4px_rgba(0,0,0,0.03)]">
                  <tr className="whitespace-nowrap">
                    <th className="p-3 md:p-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-center md:sticky md:left-0 bg-white hover:bg-slate-50 md:z-30 md:border-r border-slate-200 md:shadow-[2px_0_4px_rgba(0,0,0,0.03)] min-w-[50px] max-w-[50px] select-none text-center whitespace-nowrap">No.</th>
                    <th className="p-3 md:p-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-center md:sticky md:left-[50px] bg-white hover:bg-slate-50 md:z-30 md:border-r border-slate-200 md:shadow-[2px_0_4px_rgba(0,0,0,0.03)] min-w-[150px] max-w-[150px] select-none text-center whitespace-nowrap">Aksi</th>
                    <th 
                      onClick={() => handleSort('nama')}
                      className="p-3 md:p-4 text-xs font-bold text-slate-400 uppercase tracking-wider md:sticky md:left-[200px] bg-white hover:bg-slate-50 md:z-30 md:border-r border-slate-200 md:shadow-[2px_0_4px_rgba(0,0,0,0.03)] min-w-[180px] cursor-pointer select-none group/th transition-colors duration-150 whitespace-nowrap"
                      title="Urutkan berdasarkan Nama"
                    >
                      <div className="flex items-center gap-1">
                        <span>Nama Karyawan</span>
                        {renderSortIndicator('nama')}
                      </div>
                    </th>
                    <th 
                      onClick={() => handleSort('noReg')}
                      className="p-3 md:p-4 text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer select-none hover:bg-slate-50 group/th transition-colors duration-150 whitespace-nowrap"
                      title="Urutkan berdasarkan No. Reg"
                    >
                      <div className="flex items-center gap-1">
                        <span>No. Reg</span>
                        {renderSortIndicator('noReg')}
                      </div>
                    </th>
                    <th 
                      onClick={() => handleSort('nil1')}
                      className="p-3 md:p-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-center cursor-pointer select-none hover:bg-slate-50 group/th transition-colors duration-150 whitespace-normal"
                      title="Urutkan berdasarkan Kualitas"
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>Kualitas (Nilai 1)</span>
                        {renderSortIndicator('nil1')}
                      </div>
                    </th>
                    <th 
                      onClick={() => handleSort('nil2')}
                      className="p-3 md:p-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-center cursor-pointer select-none hover:bg-slate-50 group/th transition-colors duration-150 whitespace-normal"
                      title="Urutkan berdasarkan Kuantitas"
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>Kuantitas (Nilai 2)</span>
                        {renderSortIndicator('nil2')}
                      </div>
                    </th>
                    <th 
                      className="p-3 md:p-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-center select-none hover:bg-slate-50 transition-colors duration-150 whitespace-normal w-24 min-w-[96px]"
                      title="Kehadiran (HRMS)"
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>Kehadiran (HRMS)</span>
                      </div>
                    </th>
                    <th 
                      className="p-3 md:p-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-center select-none hover:bg-slate-50 transition-colors duration-150 whitespace-normal w-24 min-w-[96px]"
                      title="Kedisiplinan (HRMS)"
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>Disiplin (HRMS)</span>
                      </div>
                    </th>
                    <th 
                      onClick={() => handleSort('skor')}
                      className="p-3 md:p-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right cursor-pointer select-none hover:bg-slate-50 group/th transition-colors duration-150 whitespace-nowrap"
                      title="Urutkan berdasarkan Total Skor"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>Skor</span>
                        {renderSortIndicator('skor')}
                      </div>
                    </th>
                    <th 
                      onClick={() => handleSort('periode')}
                      className="p-3 md:p-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-center cursor-pointer select-none hover:bg-slate-50 group/th transition-colors duration-150 whitespace-nowrap"
                      title="Urutkan berdasarkan Periode"
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>Periode</span>
                        {renderSortIndicator('periode')}
                      </div>
                    </th>
                    <th 
                      onClick={() => handleSort('submittedAt')}
                      className="p-3 md:p-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right cursor-pointer select-none hover:bg-slate-50 group/th transition-colors duration-150 whitespace-nowrap"
                      title="Urutkan berdasarkan Tanggal Input"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>Tanggal Input</span>
                        {renderSortIndicator('submittedAt')}
                      </div>
                    </th>
                  </tr>
                </tfoot>
              </table>
            </div>
    
            {/* Pagination controls */}
            {totalPages > 1 && (
              <div className="p-4 bg-slate-50 border-t border-slate-150 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-medium text-slate-550">
                <div>
                  Menampilkan <span className="font-bold text-slate-700">{indexOfFirstEval + 1}</span> - <span className="font-bold text-slate-700">{Math.min(indexOfLastEval, displayedEvaluations.length)}</span> dari <span className="font-bold text-slate-700">{displayedEvaluations.length}</span> baris
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={safeCurrentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    className="px-2.5 py-1 bg-white border border-slate-200 hover:border-slate-350 disabled:opacity-40 rounded-md shadow-3xs cursor-pointer text-[10px] font-extrabold uppercase"
                  >
                    Prev
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(pageNum => (
                    <button
                      key={pageNum}
                      type="button"
                      onClick={() => setCurrentPage(pageNum)}
                      className={`w-7 h-7 flex items-center justify-center rounded-md font-bold text-[11px] cursor-pointer transition ${
                        pageNum === safeCurrentPage
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-white border border-slate-200 hover:border-slate-350 text-slate-700'
                      }`}
                    >
                      {pageNum}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={safeCurrentPage === totalPages}
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    className="px-2.5 py-1 bg-white border border-slate-200 hover:border-slate-350 disabled:opacity-40 rounded-md shadow-3xs cursor-pointer text-[10px] font-extrabold uppercase"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}

      </div>

      {presensiDatabaseElement}

      {/* Visual Analytics Grid (Peringkat Dashboard) - Placed below Table */}
      <div id="visual-analytics-grid" className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Google Maps Style Ratings Card (1 Col) */}
        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex flex-col justify-between animate-fade-in">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <div>
                <h3 className="font-extrabold text-slate-800 text-xs uppercase tracking-wider">Rating</h3>
                <p className="text-[10px] text-slate-400 mt-0.5">Statistik ulasan bintang operator</p>
              </div>
              <span className="bg-blue-50 text-blue-700 text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                {currentGroup === 'ALL' ? 'Admin View' : `Grup ${currentGroup}`}
              </span>
            </div>

            {/* Dropdown Filters on Rating Card */}
            <div className="grid grid-cols-1 gap-2 mb-4">
              {currentGroup === 'ALL' && (
                <div className="flex flex-col space-y-1">
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Grup</label>
                  <div className="relative">
                    <select
                      value={groupFilter}
                      onChange={(e) => {
                        setGroupFilter(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="w-full bg-slate-50 text-[10px] border border-slate-200 py-1.5 pl-2.5 pr-6 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer appearance-none font-bold text-slate-650 shadow-3xs"
                    >
                      <option value="ALL">Semua Grup</option>
                      <option value="A">Grup A</option>
                      <option value="B">Grup B</option>
                      <option value="C">Grup C</option>
                      <option value="NS">Non-Shift (NS)</option>
                      <option value="MTC">MTC</option>
                      <option value="LAB">LAB</option>
                      <option value="QC">QC</option>
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center pr-1.5 pointer-events-none text-slate-400">
                      <Users className="w-3 h-3" />
                    </div>
                  </div>
                </div>
              )}

              {/* Month and Year Filter Selectors */}
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col space-y-1">
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Bulan</label>
                  <div className="relative">
                    <select
                      value={monthFilter}
                      onChange={(e) => {
                        setMonthFilter(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="w-full bg-slate-50 text-[10px] border border-slate-200 py-1.5 pl-2.5 pr-6 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer appearance-none font-bold text-slate-650 shadow-3xs"
                    >
                      <option value="ALL">Semua Bulan</option>
                      {MONTH_NAMES_ID.map(m => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center pr-1.5 pointer-events-none text-slate-400">
                      <Calendar className="w-3 h-3" />
                    </div>
                  </div>
                </div>

                <div className="flex flex-col space-y-1">
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Tahun</label>
                  <div className="relative">
                    <select
                      value={yearFilter}
                      onChange={(e) => {
                        setYearFilter(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="w-full bg-slate-50 text-[10px] border border-slate-200 py-1.5 pl-2.5 pr-6 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer appearance-none font-bold text-slate-650 shadow-3xs"
                    >
                      <option value="ALL">Semua Tahun</option>
                      {availableYears.map(y => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center pr-1.5 pointer-events-none text-slate-400">
                      <Calendar className="w-3 h-3" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Total score showcase */}
            <div className="flex items-center gap-4 bg-slate-50/50 p-4 rounded-xl border border-slate-100 mb-3">
              <div className="text-center shrink-0">
                <span className="text-4xl font-black text-slate-800 tracking-tight block">
                  {overallAverage > 0 ? overallAverage.toFixed(1) : '0.0'}
                </span>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5 block">dari 5</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center">
                  <StarRating rating={overallAverage} />
                </div>
                <p className="text-[10px] font-semibold text-slate-550 mt-1 leading-snug">
                  {operatorRankings.length} Operator Dinilai
                </p>
                <p className="text-[9px] text-slate-400">
                  {periodFilter === 'ALL' ? 'Semua Periode' : periodFilter}
                </p>
              </div>
            </div>



            {/* Google Maps style star distribution bars */}
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Pilih Tingkat Bintang:</p>
              {[5, 4, 3, 2, 1].map((stars) => {
                const count = starCounts[stars] || 0;
                const total = operatorRankings.length;
                const percent = total > 0 ? (count / total) * 100 : 0;
                const isActive = starFilter === stars;
                const starLabelsMap: Record<number, string> = {
                  5: 'Bintang 4.5 - 5 (Skor 19 - 20) Sangat Baik',
                  4: 'Bintang 3.5 - 4 (Skor 17 - 18) Baik',
                  3: 'Bintang 2.5 - 3 (Skor 15 - 16) Sedang',
                  2: 'Bintang 0.5 - 1 (Skor 13 - 14) Cukup',
                  1: 'Bintang 0 (Skor <= 12) Cukup'
                };

                return (
                  <button
                    key={stars}
                    type="button"
                    onClick={() => {
                      setStarFilter(prev => prev === stars ? 'ALL' : stars);
                    }}
                    className={`w-full flex items-center gap-2.5 text-left p-1.5 rounded-lg transition-all duration-200 cursor-pointer text-xs ${
                      isActive 
                        ? 'bg-amber-50/80 border border-amber-200 text-amber-900 shadow-3xs scale-[1.01]' 
                        : 'hover:bg-slate-50 border border-transparent text-slate-600'
                    }`}
                    title={`Saring: ${starLabelsMap[stars]}`}
                  >
                    <span className="w-14 text-[10px] font-black text-slate-500 shrink-0 flex items-center gap-0.5">
                      {stars} <span className="text-amber-400">★</span>
                    </span>
                    
                    {/* Progress Bar Container */}
                    <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden relative border border-slate-150/40">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${
                          isActive ? 'bg-amber-400' : 'bg-slate-400'
                        }`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>

                    <span className="w-8 text-[10px] font-bold text-slate-400 text-right shrink-0 font-mono">
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Clear Filters Button */}
            {starFilter !== 'ALL' && (
              <button
                type="button"
                onClick={() => setStarFilter('ALL')}
                className="w-full mt-4 py-1.5 px-3 border border-dashed border-slate-300 hover:border-slate-400 bg-slate-50 hover:bg-slate-100 text-[10px] font-extrabold text-slate-600 uppercase tracking-wider rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <X className="w-3 h-3 text-slate-400" />
                Reset Filter Bintang
              </button>
            )}
          </div>

          <div className="bg-slate-50 rounded-lg p-2.5 text-center text-[9px] text-slate-500 leading-relaxed font-medium mt-4">
            Klik baris bintang di atas untuk memfilter tabel peringkat di sebelah kanan.
          </div>
        </div>

        {/* Operator Ranking Table (2 Cols) */}
        <div className="lg:col-span-2 bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex flex-col justify-between animate-fade-in">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3 mb-3">
              <div>
                <h3 className="font-extrabold text-slate-800 text-xs uppercase tracking-wider">
                  Peringkat
                </h3>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Diurutkan berdasarkan ulasan ulasan tertinggi (bisa di-scroll & No/Nama dibekukan)
                </p>
              </div>

              {/* Status Indicator for Star Filter */}
              {starFilter !== 'ALL' && (
                <span className="bg-amber-100 border border-amber-200 text-amber-800 text-[9px] font-black px-2.5 py-1 rounded-md uppercase tracking-wider flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  Filter: {starFilter} Bintang
                </span>
              )}
            </div>

            {/* Main Ranking Table (Scrollable & Sticky) */}
            <div className="overflow-auto max-h-[500px] border border-slate-150 rounded-xl relative">
              <table className="w-full border-collapse min-w-[750px]">
                <thead>
                  <tr className="text-slate-400 text-[9px] font-extrabold uppercase tracking-wider">
                    <th className="sticky top-0 md:left-0 z-30 bg-slate-50 border-b border-slate-150 py-2.5 px-2 text-center w-12 min-w-[48px] max-w-[48px]">No</th>
                    <th className="sticky top-0 md:left-12 z-30 bg-slate-50 border-b border-slate-150 py-2.5 px-3 text-left w-48 min-w-[192px] max-w-[192px]">Nama Lengkap</th>
                    <th className="sticky top-0 z-20 bg-slate-50 border-b border-slate-150 py-2.5 px-3 text-left min-w-[120px]">Periode</th>
                    <th className="sticky top-0 z-20 bg-slate-50 border-b border-slate-150 py-2.5 px-3 text-center min-w-[150px]">Ulasan Bintang</th>
                    <th className="sticky top-0 z-20 bg-slate-50 border-b border-slate-150 py-2.5 px-3 text-right w-24 min-w-[96px]">Skor</th>
                    <th className="sticky top-0 z-20 bg-slate-50 border-b border-slate-150 py-2.5 px-3 text-right w-24 min-w-[96px]">Nilai Rerata</th>
                    <th className="sticky top-0 z-20 bg-slate-50 border-b border-slate-150 py-2.5 px-3 text-center w-24 min-w-[96px]">Evaluasi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {displayedRankings.length > 0 ? (
                    displayedRankings.map((op, idx) => {
                      let rowBg = 'hover:bg-slate-50/50';
                      let cellBgClass = 'bg-white group-hover/tr:bg-slate-50';
                      if (starFilter === 'ALL') {
                        if (idx === 0) {
                          rowBg = 'bg-amber-50/10 hover:bg-amber-50/25';
                          cellBgClass = 'bg-[#fefdfb] group-hover/tr:bg-[#fdf9f1]';
                        } else if (idx === 1) {
                          rowBg = 'bg-slate-50/10 hover:bg-slate-50/25';
                          cellBgClass = 'bg-[#fafafb] group-hover/tr:bg-[#f4f4f6]';
                        } else if (idx === 2) {
                          rowBg = 'bg-orange-50/10 hover:bg-orange-50/25';
                          cellBgClass = 'bg-[#fffbf9] group-hover/tr:bg-[#fff5ef]';
                        }
                      }

                      return (
                        <tr 
                          key={op.noReg} 
                          className={`text-xs transition-colors duration-150 ${rowBg} group/tr`}
                        >
                          {/* Rank No - Sticky left-0 */}
                          <td className={`md:sticky md:left-0 md:z-10 ${cellBgClass} text-center font-black text-slate-400 font-mono py-3 px-2 w-12 min-w-[48px] max-w-[48px] md:shadow-[2px_0_5px_-2px_rgba(0,0,0,0.08)] md:border-r border-slate-100`}>
                            {idx + 1}
                          </td>

                          {/* Operator Details - Sticky left-12 */}
                          <td className={`md:sticky md:left-12 md:z-10 ${cellBgClass} py-3 px-3 w-48 min-w-[192px] max-w-[192px] md:shadow-[2px_0_5px_-2px_rgba(0,0,0,0.08)] md:border-r border-slate-100`}>
                            <div className="font-extrabold text-slate-800 tracking-tight uppercase truncate">
                              {op.nama}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5 text-[9px] text-slate-400 font-mono">
                              <span>No. Reg: {op.noReg}</span>
                              <span className="text-slate-300">•</span>
                              <span className="bg-slate-100 text-slate-600 font-extrabold px-1 rounded uppercase scale-[0.9] shrink-0">
                                Grup {op.grup}
                              </span>
                            </div>
                          </td>

                          {/* Periode Column */}
                          <td className="py-3 px-3 text-left font-semibold text-slate-600 min-w-[120px] bg-transparent">
                            <span className="bg-slate-100 text-slate-700 text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider whitespace-nowrap">
                              {periodFilter === 'ALL' ? 'Semua Periode' : (op.periode || periodFilter)}
                            </span>
                          </td>

                          {/* Custom 5-Star Component */}
                          <td className="py-3 px-3 text-center whitespace-nowrap min-w-[150px] bg-transparent">
                            <div className="inline-flex flex-col items-center">
                              <StarRating rating={op.average} />
                            </div>
                          </td>

                          {/* Skor (Jumlah total skornya) */}
                          <td className="py-3 px-3 text-right min-w-[96px] bg-transparent">
                            <div className="flex flex-col items-end">
                              <span className="font-extrabold text-slate-800 tracking-tight text-sm">
                                {op.averageScore.toFixed(1)}
                              </span>
                              <span className="text-[10px] text-slate-400 font-medium font-mono">
                                /20
                              </span>
                              {op.count > 1 && (
                                <span className="text-[9px] text-slate-400 font-medium block mt-0.5">
                                  Poin: {op.accumulatedScore.toFixed(0)}/{op.maxPossibleScore}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Numeric Rating */}
                          <td className="py-3 px-3 text-right min-w-[96px] bg-transparent">
                            <div className="flex flex-col items-end">
                              <div>
                                <span className="font-black text-slate-800 tracking-tight text-sm">
                                  {op.average.toFixed(1)}
                                </span>
                                <span className="text-[10px] text-slate-400 font-medium ml-0.5">/5</span>
                              </div>
                              {(() => {
                                const badge = getPerformanceLabel(op.average);
                                return (
                                  <span className={`inline-block px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase mt-1 border ${badge.bgClass} ${badge.textClass} ${badge.borderClass} tracking-wide`}>
                                    {badge.label}
                                  </span>
                                );
                              })()}
                            </div>
                          </td>

                          {/* Total evaluation cycles */}
                          <td className="py-3 px-3 text-center min-w-[96px] bg-transparent">
                            <span className="bg-blue-50 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-blue-100/50">
                              {op.count} Kali
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td 
                        colSpan={11} 
                        className="py-12 text-center text-slate-400 font-medium bg-white"
                      >
                        <div className="w-12 h-12 bg-slate-50 border border-slate-150 rounded-full flex items-center justify-center mx-auto mb-3">
                          <span className="text-lg">⭐</span>
                        </div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tidak ada operator yang cocok</p>
                        <p className="text-[9px] text-slate-400 mt-1 max-w-[240px] mx-auto leading-relaxed">
                          Tidak ditemukan operator dengan kriteria penilaian bintang ini pada periode terpilih.
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-3 mt-4 text-[10px] text-slate-400 flex items-center gap-1.5 font-medium justify-between">
            <span>Menampilkan <strong>{displayedRankings.length}</strong> dari <strong>{operatorRankings.length}</strong> operator dinilai.</span>
            <span className="text-[9px] uppercase tracking-wider font-extrabold text-blue-600">Terupdate Otomatis</span>
          </div>
        </div>
      </div>

      {/* Analisis Distribusi Predikat per Grup (Hanya untuk Admin) */}
      {currentGroup === 'ALL' && distributionData.length > 0 && (
        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 animate-fade-in mt-6 mb-6">
          <div className="border-b border-slate-100 pb-4 mb-5">
            <h3 className="font-extrabold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5">
              📊 Analisis Distribusi Predikat per Grup
            </h3>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Menampilkan persentase jumlah karyawan Sangat Baik, Baik, Sedang, dan Cukup di masing-masing grup untuk periode terpilih ({periodFilter === 'ALL' ? 'Semua Periode' : periodFilter})
            </p>
          </div>

          <div className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={distributionData}
                margin={{ top: 20, right: 30, left: -10, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis 
                  dataKey="grup" 
                  tick={{ fill: '#64748b', fontSize: 10, fontWeight: 'bold' }}
                  axisLine={{ stroke: '#cbd5e1' }}
                />
                <YAxis 
                  tickFormatter={(val) => `${val}%`}
                  domain={[0, 100]}
                  tick={{ fill: '#64748b', fontSize: 10, fontWeight: 'bold' }}
                  axisLine={{ stroke: '#cbd5e1' }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="Sangat Baik %" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Baik %" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Sedang %" stackId="a" fill="#f59e0b" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Cukup %" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="flex flex-wrap justify-center items-center gap-x-6 gap-y-2 mt-4 text-[10px] font-bold text-slate-500 uppercase tracking-wide border-b border-slate-100 pb-4">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm inline-block bg-[#10b981]" />
              <span>Sangat Baik %</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm inline-block bg-[#3b82f6]" />
              <span>Baik %</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm inline-block bg-[#f59e0b]" />
              <span>Sedang %</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm inline-block bg-[#ef4444]" />
              <span>Cukup %</span>
            </div>
          </div>
          
          <div className="mt-4 pt-1 flex flex-wrap gap-x-4 gap-y-1.5 text-[9px] text-slate-400 font-bold uppercase tracking-wider justify-center sm:justify-start">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#10b981] inline-block"></span> Sangat Baik (Skor 19 - 20)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#3b82f6] inline-block"></span> Baik (Skor 17 - 18)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#f59e0b] inline-block"></span> Sedang (Skor 15 - 16)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#ef4444] inline-block"></span> Cukup (Skor ≤ 14)
            </span>
          </div>
        </div>
      )}

      {/* Tren Performa Karyawan per Periode */}
      {uniqueEvaluatedEmployees.length > 0 && (
        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 animate-fade-in mt-6 mb-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4 mb-5">
            <div>
              <h3 className="font-extrabold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5">
                📈 Tren Performa Karyawan per Periode
              </h3>
              <p className="text-[10px] text-slate-400 mt-0.5">
                Visualisasi perkembangan performa ulasan rata-rata dari waktu ke waktu dibanding rata-rata tim
              </p>
            </div>
            <div className="flex items-center gap-2 max-w-xs w-full">
              <label className="text-[10px] font-bold text-slate-400 uppercase whitespace-nowrap">Pilih Karyawan:</label>
              <select
                value={activeTrendNoReg}
                onChange={(e) => setSelectedTrendNoReg(e.target.value)}
                className="w-full bg-slate-50 text-[10px] border border-slate-200 py-1.5 px-2.5 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 font-bold text-slate-700 cursor-pointer shadow-3xs"
              >
                {uniqueEvaluatedEmployees.map(emp => (
                  <option key={emp.noReg} value={emp.noReg}>
                    {emp.nama} ({emp.noReg})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {trendData.length < 2 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              <Info className="w-5 h-5 mx-auto text-slate-300 mb-1.5" />
              Karyawan ini baru memiliki {trendData.length} penilaian. Tren performa memerlukan minimal 2 periode penilaian untuk ditampilkan.
            </div>
          ) : (
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={trendData}
                  margin={{ top: 10, right: 30, left: -20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="periode" 
                    tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 'bold' }}
                    axisLine={{ stroke: '#cbd5e1' }}
                  />
                  <YAxis 
                    domain={[1, 5]} 
                    tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 'bold' }}
                    axisLine={{ stroke: '#cbd5e1' }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'rgba(255, 255, 255, 0.95)', 
                      borderRadius: '8px', 
                      borderColor: '#e2e8f0', 
                      fontSize: '11px', 
                      boxShadow: '0 4px 12px rgba(0,0,0,0.05)' 
                    }} 
                  />
                  <Legend 
                    wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', paddingTop: '10px' }} 
                  />
                  <Line 
                    type="monotone" 
                    dataKey="Rata-rata Karyawan" 
                    stroke="#3b82f6" 
                    strokeWidth={3} 
                    activeDot={{ r: 8 }} 
                  />
                  <Line 
                    type="monotone" 
                    dataKey="Rata-rata Perusahaan" 
                    stroke="#94a3b8" 
                    strokeWidth={2} 
                    strokeDasharray="5 5" 
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Edit Evaluation Modal */}
      {editingEval && (() => {
        const prevPeriodStr = getPreviousPeriodString(editingEval.periode);
        const prevEval = evaluations.find(
          e => isSameEmployee(e, editingEval) && e.periode === prevPeriodStr
        );
        const currentTotal = editNil1 + editNil2;
        const prevTotal = prevEval ? (prevEval.nil1 + prevEval.nil2) : 0;
        const diff = currentTotal - prevTotal;

        return (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-3xs flex items-center justify-center p-4 z-50 animate-fade-in">
            <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 border border-slate-200 flex flex-col space-y-4">
              <div className="flex items-center justify-between border-b pb-3 border-slate-100">
                <div className="flex items-center gap-2 text-blue-600">
                  <div className="p-1.5 bg-blue-50 rounded-lg">
                    <Pencil className="w-5 h-5" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-850 uppercase tracking-wider">Ubah Data Penilaian</h4>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingEval(null)}
                  className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-55 rounded-md transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3.5 text-xs">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Nama Karyawan</label>
                  <input
                    type="text"
                    value={editNama}
                    disabled
                    className="w-full text-xs py-1.5 px-3 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-500 cursor-not-allowed select-none focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">No. Reg</label>
                    <input
                      type="text"
                      value={editNoReg}
                      disabled
                      className="w-full text-xs py-1.5 px-3 bg-slate-50 border border-slate-200 rounded-lg uppercase font-mono font-bold text-slate-500 cursor-not-allowed select-none focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Grup Divisi</label>
                    <select
                      value={editGrup}
                      disabled
                      className="w-full text-xs py-1.5 px-3 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-500 cursor-not-allowed select-none focus:outline-none pointer-events-none"
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
                </div>

                {/* Previous period reference row with trend indicator */}
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1.5">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Periode Bulan Kemarin</div>
                  <div className="flex justify-between items-center">
                    <div className="text-xs text-slate-700 font-medium">
                      <span className="font-semibold text-slate-900">{prevPeriodStr || 'Mei 2026'}</span>
                      <span className="mx-1.5 text-slate-300">|</span>
                      <span>Nilai 1: <strong className="text-slate-900">{prevEval ? prevEval.nil1 : '-'}</strong></span>
                      <span className="mx-1.5 text-slate-300">|</span>
                      <span>Nilai 2: <strong className="text-slate-900">{prevEval ? prevEval.nil2 : '-'}</strong></span>
                    </div>
                    {/* Trend indicator */}
                    <div>
                      {prevEval ? (
                        diff > 0 ? (
                          <span className="inline-flex items-center gap-0.5 text-xs font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100" title={`Naik ${diff} poin dibanding bulan kemarin`}>
                            <ArrowUp className="w-3.5 h-3.5 text-emerald-500 inline-block" />
                            <span> +{diff}</span>
                          </span>
                        ) : diff < 0 ? (
                          <span className="inline-flex items-center gap-0.5 text-xs font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-100" title={`Turun ${Math.abs(diff)} poin dibanding bulan kemarin`}>
                            <ArrowDown className="w-3.5 h-3.5 text-rose-500 inline-block" />
                            <span> {diff}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-0.5 text-xs font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100" title="Stabil / Tidak ada perubahan">
                            <span className="text-[10px] font-sans">═</span>
                            <span> 0</span>
                          </span>
                        )
                      ) : (
                        <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider bg-slate-100 px-1.5 py-0.5 rounded border border-slate-150">Tidak Ada Data</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Recommendation from shift (for MTC KSS review in edit modal) */}
                {(() => {
                  const empObj = PREPOPULATED_EMPLOYEES.find(x => isSameEmployee(editingEval, x));
                  const isShiftMtc = empObj ? isShiftMtcEmployee(empObj) : isShiftMtcEmployee(editingEval);
                  const recEval = isShiftMtc 
                    ? evaluations.find(e => 
                        isSameEmployee(e, editingEval) &&
                        parseAndNormalizePeriode(e.periode).trim().toLowerCase() === parseAndNormalizePeriode(editingEval.periode).trim().toLowerCase() &&
                        (!!e.isSupportive || (e.grup && ['A', 'B', 'C'].includes(e.grup)))
                      )
                    : null;
                  
                  if (!recEval) return null;
                  return (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1.5">
                      <div className="text-[10px] font-extrabold text-amber-800 uppercase tracking-wider">
                        ⭐ Rekomendasi MTC Shift (Grup {recEval.editedBy || recEval.grup})
                      </div>
                      <div className="text-xs text-slate-700 font-medium">
                        <span>Nilai 1: <strong className="text-slate-900">{recEval.nil1}</strong></span>
                        <span className="mx-1.5 text-slate-300">|</span>
                        <span>Nilai 2: <strong className="text-slate-900">{recEval.nil2}</strong></span>
                        <span className="mx-1.5 text-slate-300">|</span>
                        <span>Rerata: <strong className="text-amber-700 font-extrabold">{recEval.average.toFixed(1)}</strong></span>
                      </div>
                    </div>
                  );
                })()}

                <div className="grid grid-cols-2 gap-3 pb-1">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Kualitas (Nilai 1)</label>
                    <select
                      value={editNil1}
                      onChange={(e) => setEditNil1(Number(e.target.value))}
                      className="w-full text-xs py-1.5 px-3 bg-slate-50 border border-slate-200 rounded-lg font-bold text-blue-750"
                    >
                      <option value={1}>1</option>
                      <option value={2}>2</option>
                      <option value={3}>3</option>
                      <option value={4}>4</option>
                      <option value={5}>5</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Kuantitas (Nilai 2)</label>
                    <select
                      value={editNil2}
                      onChange={(e) => setEditNil2(Number(e.target.value))}
                      className="w-full text-xs py-1.5 px-3 bg-slate-50 border border-slate-200 rounded-lg font-bold text-blue-750"
                    >
                      <option value={1}>1</option>
                      <option value={2}>2</option>
                      <option value={3}>3</option>
                      <option value={4}>4</option>
                      <option value={5}>5</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Periode</label>
                  <input
                    type="text"
                    value={editPeriode}
                    disabled
                    className="w-full text-xs py-1.5 px-3 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-500 cursor-not-allowed select-none focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingEval(null)}
                  className="flex-1 py-2 text-center text-xs font-bold text-slate-500 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!editNama.trim() || !editNoReg.trim() || !editPeriode.trim()) {
                      if ((window as any).showCustomAlert) {
                        (window as any).showCustomAlert('Validasi Gagal', 'Harap isi semua kolom!');
                      } else {
                        alert('Harap isi semua kolom!');
                      }
                      return;
                    }
                    onUpdateEvaluation({
                      ...editingEval,
                      nama: editNama.trim(),
                      noReg: editNoReg.trim().toUpperCase(),
                      grup: editGrup,
                      nil1: editNil1,
                      nil2: editNil2,
                      average: parseFloat(((editNil1 + editNil2) / 2).toFixed(2)),
                      periode: editPeriode.trim()
                    } as Evaluation);
                    setEditingEval(null);
                  }}
                  className="flex-1 py-2 text-center text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-1"
                >
                  <Save className="w-3.5 h-3.5" /> Simpan
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* View Evaluation Modal */}
      {viewingEval && (() => {
        const prevPeriodStr = getPreviousPeriodString(viewingEval.periode);
        const prevEval = evaluations.find(
          e => isSameEmployee(e, viewingEval) && e.periode === prevPeriodStr
        );
        const currentTotal = viewingEval.nil1 + viewingEval.nil2;
        const prevTotal = prevEval ? (prevEval.nil1 + prevEval.nil2) : 0;
        const diff = currentTotal - prevTotal;

        return (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-3xs flex items-center justify-center p-4 z-50 animate-fade-in">
            <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 border border-slate-200 flex flex-col space-y-4">
              <div className="flex items-center justify-between border-b pb-3 border-slate-100">
                <div className="flex items-center gap-2 text-slate-700">
                  <div className="p-1.5 bg-slate-100 rounded-lg">
                    <Eye className="w-5 h-5 text-slate-500" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Detail Penilaian Operator</h4>
                </div>
                <button
                  type="button"
                  onClick={() => setViewingEval(null)}
                  className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-md transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3.5 text-xs">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Nama Karyawan</label>
                  <div className="w-full text-xs py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-700 select-all">
                    {viewingEval.nama}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">No. Reg</label>
                    <div className="w-full text-xs py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg font-mono font-bold text-slate-700">
                      {viewingEval.noReg}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Grup Divisi</label>
                    <div className="w-full text-xs py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-700">
                      Grup {viewingEval.grup}
                    </div>
                  </div>
                </div>

                {/* Previous period reference row with trend indicator */}
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1.5">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Periode Bulan Kemarin</div>
                  <div className="flex justify-between items-center">
                    <div className="text-xs text-slate-700 font-medium">
                      <span className="font-semibold text-slate-900">{prevPeriodStr || 'Mei 2026'}</span>
                      <span className="mx-1.5 text-slate-300">|</span>
                      <span>Nilai 1: <strong className="text-slate-900">{prevEval ? prevEval.nil1 : '-'}</strong></span>
                      <span className="mx-1.5 text-slate-300">|</span>
                      <span>Nilai 2: <strong className="text-slate-900">{prevEval ? prevEval.nil2 : '-'}</strong></span>
                    </div>
                    {/* Trend indicator */}
                    <div>
                      {prevEval ? (
                        diff > 0 ? (
                          <span className="inline-flex items-center gap-0.5 text-xs font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100" title={`Naik ${diff} poin dibanding bulan kemarin`}>
                            <ArrowUp className="w-3.5 h-3.5 text-emerald-500 inline-block" />
                            <span> +{diff}</span>
                          </span>
                        ) : diff < 0 ? (
                          <span className="inline-flex items-center gap-0.5 text-xs font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-100" title={`Turun ${Math.abs(diff)} poin dibanding bulan kemarin`}>
                            <ArrowDown className="w-3.5 h-3.5 text-rose-500 inline-block" />
                            <span> {diff}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-0.5 text-xs font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100" title="Stabil / Tidak ada perubahan">
                            <span className="text-[10px] font-sans">═</span>
                            <span> 0</span>
                          </span>
                        )
                      ) : (
                        <span className="text-[10px] font-bold text-slate-400 italic bg-slate-100 px-1.5 py-0.5 rounded">
                          Tidak Ada Data
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Recommendation from shift (for MTC KSS review in detail modal) */}
                {(() => {
                  const empObj = PREPOPULATED_EMPLOYEES.find(x => isSameEmployee(viewingEval, x));
                  const isShiftMtc = empObj ? isShiftMtcEmployee(empObj) : isShiftMtcEmployee(viewingEval);
                  const recEval = isShiftMtc 
                    ? evaluations.find(e => 
                        isSameEmployee(e, viewingEval) &&
                        parseAndNormalizePeriode(e.periode).trim().toLowerCase() === parseAndNormalizePeriode(viewingEval.periode).trim().toLowerCase() &&
                        (!!e.isSupportive || (e.grup && ['A', 'B', 'C'].includes(e.grup)))
                      )
                    : null;
                  
                  if (!recEval) return null;
                  return (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1.5">
                      <div className="text-[10px] font-extrabold text-amber-800 uppercase tracking-wider">
                        ⭐ Rekomendasi MTC Shift (Grup {recEval.editedBy || recEval.grup})
                      </div>
                      <div className="text-xs text-slate-700 font-medium">
                        <span>Nilai 1: <strong className="text-slate-900">{recEval.nil1}</strong></span>
                        <span className="mx-1.5 text-slate-300">|</span>
                        <span>Nilai 2: <strong className="text-slate-900">{recEval.nil2}</strong></span>
                        <span className="mx-1.5 text-slate-300">|</span>
                        <span>Rerata: <strong className="text-amber-700 font-extrabold">{recEval.average.toFixed(1)}</strong></span>
                      </div>
                    </div>
                  );
                })()}

                <div className="grid grid-cols-2 gap-3 pb-1">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Kualitas (Nilai 1)</label>
                    <div className="w-full text-xs py-2 px-3 bg-blue-50/50 border border-blue-100 rounded-lg font-bold text-blue-700 text-center">
                      {viewingEval.nil1}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Kuantitas (Nilai 2)</label>
                    <div className="w-full text-xs py-2 px-3 bg-blue-50/50 border border-blue-100 rounded-lg font-bold text-blue-700 text-center">
                      {viewingEval.nil2}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Periode</label>
                    <div className="w-full text-xs py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg font-semibold text-slate-700">
                      {viewingEval.periode}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Total Skor & Rata-rata</label>
                    <div className="w-full text-xs py-2 px-3 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-800">
                      Skor: {currentTotal} • Avg: {viewingEval.average}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Predikat Hasil Penilaian</label>
                  {(() => {
                    const badge = getPerformanceLabel(viewingEval.average);
                    return (
                      <div className={`w-full text-center py-2 px-3 rounded-lg font-extrabold uppercase border text-xs ${badge.bgClass} ${badge.textClass} ${badge.borderClass} tracking-wider shadow-3xs`}>
                        {badge.label}
                      </div>
                    );
                  })()}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setViewingEval(null)}
                  className="w-full py-2 text-center text-xs font-bold text-white bg-slate-700 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* CSV Export Modal */}
      <CsvExportModal
        isOpen={isCsvModalOpen}
        onClose={() => setIsCsvModalOpen(false)}
        evaluations={evaluations}
        employees={employeeSource}
        initialPeriod={periodFilter !== 'ALL' ? periodFilter : thisPeriod}
        availablePeriods={periodOptions}
        accessToken={cachedToken}
        spreadsheetId={spreadsheetId || '12LeSP25CHhUqO5FxC2Ca407ArtTFSJbNPoR38D6J23I'}
      />

    </div>
  );
}
