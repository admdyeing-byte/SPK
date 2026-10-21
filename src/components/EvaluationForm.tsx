/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Employee, Evaluation, GroupType, PresensiRecord, HrmsRecord } from '../types';
import { PREPOPULATED_EMPLOYEES, GROUPS } from '../data';
import { getPeriodePenilaian, getPeriodeBulanKemarin, isShiftMtcEmployee, getShiftMtcGroup, isSameEmployee, parseAndNormalizePeriode, MONTH_NAMES_ID, normalizeNoReg, isSecondedToNSEmployee, getSecondedOriginalGroup, compareEmpId } from '../utils';
import RatingInput from './RatingInput';
import { mapPresensiType } from './PresensiDatabase';
import { 
  User, ClipboardList, AlertCircle, Sparkles, CheckCircle2, ChevronDown, 
  Terminal, HelpCircle, ArrowLeft, ArrowRight, Table, Send, Check 
} from 'lucide-react';

interface EvaluationFormProps {
  currentGroup: GroupType | 'ALL' | 'NONE';
  onAddEvaluation: (evaluation: Omit<Evaluation, 'id' | 'submittedAt'>) => Promise<boolean>;
  onAddEvaluationsBatch?: (batch: Omit<Evaluation, 'id' | 'submittedAt'>[]) => Promise<boolean>;
  isDemoMode: boolean;
  onToggleDemoMode: () => void;
  evaluations: Evaluation[];
  onShowAlert?: (title: string, message: string) => void;
  employees?: Employee[];
  presensiRecords?: PresensiRecord[];
  hrmsRecords?: HrmsRecord[];
}

export default function EvaluationForm({ 
  currentGroup, 
  onAddEvaluation, 
  onAddEvaluationsBatch, 
  isDemoMode, 
  onToggleDemoMode,
  evaluations,
  onShowAlert,
  employees,
  presensiRecords = [],
  hrmsRecords = []
}: EvaluationFormProps) {
  const employeeSource = employees || PREPOPULATED_EMPLOYEES;
  // Common states
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Overrides / Choice states for duplicate warning resolution
  const [duplicateBatchCheck, setDuplicateBatchCheck] = useState<{
    dupes: Employee[];
    news: Employee[];
  } | null>(null);

  const [duplicateManualCheck, setDuplicateManualCheck] = useState<{
    noReg: string;
    nama: string;
  } | null>(null);

  // Period info
  const periodInfo = getPeriodePenilaian(new Date(), isDemoMode);
  const prevMonthPeriod = getPeriodeBulanKemarin(new Date());

  // Hitung rentang tanggal penilaian (cut-off 21 s.d 20) secara dinamis
  const dynamicPeriodRange = React.useMemo(() => {
    const parts = periodInfo.readable.trim().split(' ');
    const monthNameUpper = parts[0]?.toUpperCase();
    const yearStr = parts[1] || String(new Date().getFullYear());

    const monthIdx = MONTH_NAMES_ID.findIndex(m => m.toUpperCase() === monthNameUpper);
    if (monthIdx === -1) {
      return "21 Juni 2026 s.d 20 Juli 2026";
    }

    let prevMonthIdx = monthIdx - 1;
    let prevYear = parseInt(yearStr, 10);
    if (prevMonthIdx < 0) {
      prevMonthIdx = 11;
      prevYear -= 1;
    }

    const startMonthName = MONTH_NAMES_ID[prevMonthIdx];
    const endMonthName = MONTH_NAMES_ID[monthIdx];
    const endYear = yearStr;

    return `21 ${startMonthName} ${prevYear} s.d 20 ${endMonthName} ${endYear}`;
  }, [periodInfo.readable]);

  // Check if any employee in the current active group (or all if admin) has submissions in this period
  const hasSubmissionsInPeriod = evaluations.some(e => {
    const periodMatches = parseAndNormalizePeriode(e.periode).trim().toLowerCase() === 
                          parseAndNormalizePeriode(periodInfo.readable).trim().toLowerCase();
    if (!periodMatches) return false;
    
    if (currentGroup === 'ALL') {
      return true;
    }
    return e.grup === currentGroup;
  });

  const today = new Date();
  const currentMonthName = MONTH_NAMES_ID[today.getMonth()];
  const nextMonthName = MONTH_NAMES_ID[(today.getMonth() + 1) % 12];

  // =========================================================================
  // STATE & LOGIC FOR GROUP PENILAIAN WIZARD (KSS ACTIVE MODE)
  // =========================================================================
  const isAllGroupMode = currentGroup === 'ALL';
  const groupEmployees = employeeSource.filter(emp => {
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
      return emp.grup === 'NS' || isSecondedToNSEmployee(emp, periodInfo.readable);
    }
    return emp.grup === currentGroup;
  }).sort((a, b) => compareEmpId(a.empId, b.empId, a.noReg, b.noReg, employeeSource));

  const isEmployeeInputFrozen = (emp: Employee | undefined | null): boolean => {
    if (!emp) return false;
    // Pengecualian: operator MTC shift tidak pernah dibekukan
    if (isShiftMtcEmployee(emp)) return false;
    return isSecondedToNSEmployee(emp, periodInfo.readable) && currentGroup !== 'NS' && currentGroup !== 'ALL';
  };

  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [showingReview, setShowingReview] = useState(false);

  // Load and manage draft ratings
  const [draftRatings, setDraftRatings] = useState<Record<string, { nil1: number; nil2: number }>>({});
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [focusedField, setFocusedField] = useState<'nil1' | 'nil2'>('nil1');

  // Reset focus to first rating column (KUALITAS) whenever the current employee or group changes
  useEffect(() => {
    setFocusedField('nil1');
  }, [currentIndex, currentGroup]);

  // Reset indices & load draft on group change
  useEffect(() => {
    setDuplicateBatchCheck(null);
    setDuplicateManualCheck(null);
    setErrorMsg(null);
    setSuccessMsg(null);
    
    if (!isAllGroupMode && currentGroup !== 'NONE') {
      let savedIndex = 0;
      try {
        const indexStr = localStorage.getItem(`draft_current_index_v1_${currentGroup}`);
        if (indexStr) {
          savedIndex = parseInt(indexStr) || 0;
        }
      } catch {}

      let savedReview = false;
      try {
        const reviewStr = localStorage.getItem(`draft_showing_review_v1_${currentGroup}`);
        if (reviewStr === 'true') {
          savedReview = true;
        }
      } catch {}

      if (savedIndex >= groupEmployees.length) {
        savedIndex = 0;
      }

      // Check draft period
      let savedPeriod = '';
      try {
        savedPeriod = localStorage.getItem(`draft_period_v1_${currentGroup}`) || '';
      } catch {}

      // If there are saved ratings, but the saved period is missing or does not match current periodInfo.readable,
      // clear the draft so they don't get stuck with old month's drafts!
      const hasSavedRatings = localStorage.getItem(`draft_ratings_v1_${currentGroup}`) !== null;
      if (hasSavedRatings && savedPeriod !== periodInfo.readable) {
        savedIndex = 0;
        savedReview = false;
        try {
          localStorage.removeItem(`draft_ratings_v1_${currentGroup}`);
          localStorage.removeItem(`draft_current_index_v1_${currentGroup}`);
          localStorage.removeItem(`draft_showing_review_v1_${currentGroup}`);
          localStorage.removeItem(`draft_period_v1_${currentGroup}`);
        } catch {}
        setDraftRatings({});
      } else {
        try {
          const saved = localStorage.getItem(`draft_ratings_v1_${currentGroup}`);
          setDraftRatings(saved ? JSON.parse(saved) : {});
        } catch {
          setDraftRatings({});
        }
      }

      // If savedIndex points to a frozen operator (e.g. perbantuan NS), automatically advance to the next non-frozen operator (kecuali opt. mtc shift)
      if (groupEmployees[savedIndex] && isEmployeeInputFrozen(groupEmployees[savedIndex]) && !isShiftMtcEmployee(groupEmployees[savedIndex])) {
        let nextValid = -1;
        for (let i = savedIndex + 1; i < groupEmployees.length; i++) {
          if (!isEmployeeInputFrozen(groupEmployees[i]) || isShiftMtcEmployee(groupEmployees[i])) {
            nextValid = i;
            break;
          }
        }
        if (nextValid === -1) {
          for (let i = 0; i < groupEmployees.length; i++) {
            if (!isEmployeeInputFrozen(groupEmployees[i]) || isShiftMtcEmployee(groupEmployees[i])) {
              nextValid = i;
              break;
            }
          }
        }
        if (nextValid !== -1) {
          savedIndex = nextValid;
        }
      }

      setCurrentIndex(savedIndex);
      setShowingReview(savedReview);
      setIsTransitioning(false);
    }
  }, [currentGroup, isAllGroupMode, groupEmployees.length, periodInfo.readable]);

  // Persist current session progress steps dynamic changes
  useEffect(() => {
    if (!isAllGroupMode && currentGroup !== 'NONE') {
      try {
        localStorage.setItem(`draft_current_index_v1_${currentGroup}`, currentIndex.toString());
      } catch {}
    }
  }, [currentIndex, currentGroup, isAllGroupMode]);

  useEffect(() => {
    if (!isAllGroupMode && currentGroup !== 'NONE') {
      try {
        localStorage.setItem(`draft_showing_review_v1_${currentGroup}`, showingReview.toString());
      } catch {}
    }
  }, [showingReview, currentGroup, isAllGroupMode]);

  // Read ratings of active draft employee
  const activeEmp = groupEmployees[currentIndex];
  const draftNil1 = activeEmp ? (draftRatings[activeEmp.noReg]?.nil1 || 0) : 0;
  const draftNil2 = activeEmp ? (draftRatings[activeEmp.noReg]?.nil2 || 0) : 0;
  
  const hasSubmitted = activeEmp 
    ? evaluations.some(e => {
        if (!isSameEmployee(e, activeEmp)) return false;
        
        const periodMatches = parseAndNormalizePeriode(e.periode).trim().toLowerCase() === 
                              parseAndNormalizePeriode(periodInfo.readable).trim().toLowerCase();
        if (!periodMatches) return false;

        if (currentGroup === 'ALL') {
          return true;
        }
        return e.grup === currentGroup;
      })
    : false;

  // Handle a rating selection
  const handleSelectDraftRating = (field: 'nil1' | 'nil2', value: number) => {
    if (!activeEmp) return;
    setErrorMsg(null);

    const prevEntry = draftRatings[activeEmp.noReg] || { nil1: 0, nil2: 0 };
    const nextNil1 = field === 'nil1' ? value : prevEntry.nil1;
    const nextNil2 = field === 'nil2' ? value : prevEntry.nil2;

    const updated = {
      ...draftRatings,
      [activeEmp.noReg]: {
        nil1: nextNil1,
        nil2: nextNil2
      }
    };

    setDraftRatings(updated);
    try {
      localStorage.setItem(`draft_ratings_v1_${currentGroup}`, JSON.stringify(updated));
      localStorage.setItem(`draft_period_v1_${currentGroup}`, periodInfo.readable);
    } catch (e) {
      console.error(e);
    }

    // Auto-focus the next field if we just rated KUALITAS
    if (field === 'nil1') {
      setFocusedField('nil2');
    }

    // Auto-advance transition if both ratings are successfully selected
    if (nextNil1 > 0 && nextNil2 > 0) {
      setIsTransitioning(true);
      const timer = setTimeout(() => {
        setIsTransitioning(false);
        
        // Find if there is any other operator that is still unrated/uninput (skip frozen operators, kecuali opt. mtc shift)
        let nextUnratedIdx = -1;
        
        // 1. Search forward from currentIndex + 1
        for (let i = currentIndex + 1; i < groupEmployees.length; i++) {
          const emp = groupEmployees[i];
          if (isEmployeeInputFrozen(emp) && !isShiftMtcEmployee(emp)) continue; // Skip frozen operator (e.g. perbantuan NS)
          const r = updated[emp.noReg];
          if (!r || r.nil1 === 0 || r.nil2 === 0) {
            nextUnratedIdx = i;
            break;
          }
        }
        
        // 2. Wrap around and search from 0 to currentIndex
        if (nextUnratedIdx === -1) {
          for (let i = 0; i < currentIndex; i++) {
            const emp = groupEmployees[i];
            if (isEmployeeInputFrozen(emp) && !isShiftMtcEmployee(emp)) continue; // Skip frozen operator (e.g. perbantuan NS)
            const r = updated[emp.noReg];
            if (!r || r.nil1 === 0 || r.nil2 === 0) {
              nextUnratedIdx = i;
              break;
            }
          }
        }

        if (nextUnratedIdx !== -1) {
          setCurrentIndex(nextUnratedIdx);
        } else {
          setShowingReview(true);
        }
      }, 800);
      return () => clearTimeout(timer);
    }
  };

  // Direct editing within Review Table cell
  const handleUpdateDraftCell = (noReg: string, field: 'nil1' | 'nil2', val: number) => {
    const prevEntry = draftRatings[noReg] || { nil1: 0, nil2: 0 };
    const updated = {
      ...draftRatings,
      [noReg]: {
        ...prevEntry,
        [field]: val
      }
    };
    setDraftRatings(updated);
    try {
      localStorage.setItem(`draft_ratings_v1_${currentGroup}`, JSON.stringify(updated));
      localStorage.setItem(`draft_period_v1_${currentGroup}`, periodInfo.readable);
    } catch {}
  };

  // Clear drafts
  const handleResetDrafts = () => {
    const empty = {};
    setDraftRatings(empty);
    try {
      localStorage.removeItem(`draft_ratings_v1_${currentGroup}`);
      localStorage.removeItem(`draft_current_index_v1_${currentGroup}`);
      localStorage.removeItem(`draft_showing_review_v1_${currentGroup}`);
      localStorage.removeItem(`draft_period_v1_${currentGroup}`);
    } catch {}
    setCurrentIndex(0);
    setShowingReview(false);
    setShowResetConfirm(false);
  };

  // Keyboard confirmation listeners for Enter, Space, and Escape keys
  useEffect(() => {
    if (!showResetConfirm && !duplicateBatchCheck && !duplicateManualCheck) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (showResetConfirm) {
          handleResetDrafts();
        } else if (duplicateBatchCheck) {
          const checkObj = duplicateBatchCheck;
          setDuplicateBatchCheck(null);
          if (checkObj.news.length > 0) {
            executeBatchSubmissions(checkObj.news);
          } else if (currentGroup === 'ALL') {
            executeBatchSubmissions(groupEmployees);
          }
        } else if (duplicateManualCheck) {
          setDuplicateManualCheck(null);
          if (currentGroup === 'ALL') {
            executeManualSubmission();
          }
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setShowResetConfirm(false);
        setDuplicateBatchCheck(null);
        setDuplicateManualCheck(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showResetConfirm, duplicateBatchCheck, duplicateManualCheck, currentGroup, groupEmployees]);

  // Actual sender for batch data (accepts custom list of employees to submit)
  const executeBatchSubmissions = async (listToSend: typeof groupEmployees) => {
    setIsSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    setDuplicateBatchCheck(null);

    const payload = listToSend.map(emp => {
      const submitted = getSubmittedEvaluation(emp);
      const r = (draftRatings[emp.noReg] && draftRatings[emp.noReg].nil1 > 0 && draftRatings[emp.noReg].nil2 > 0)
        ? draftRatings[emp.noReg]
        : (submitted ? { nil1: submitted.nil1, nil2: submitted.nil2 } : { nil1: 0, nil2: 0 });
      return {
        empId: emp.empId,
        periode: periodInfo.readable,
        grup: currentGroup === 'ALL' ? emp.grup : currentGroup,
        noReg: emp.noReg,
        nama: emp.nama,
        jabatan: emp.jabatan || '',
        nil1: r.nil1,
        nil2: r.nil2,
        skor: r.nil1 + r.nil2,
        average: parseFloat(((r.nil1 + r.nil2) / 2).toFixed(2)),
        isSupportive: false
      };
    });

    try {
      let success = false;
      if (onAddEvaluationsBatch) {
        success = await onAddEvaluationsBatch(payload);
      } else {
        // Fallback sequentially
        for (const item of payload) {
          await onAddEvaluation(item);
        }
        success = true;
      }

      if (success) {
        setSuccessMsg(`Berhasil! Data evaluasi untuk ${listToSend.length} karyawan Grup ${currentGroup} telah dikirim ke Google Spreadsheet.`);
        // Clean draft values
        setDraftRatings({});
        try {
          localStorage.removeItem(`draft_ratings_v1_${currentGroup}`);
          localStorage.removeItem(`draft_current_index_v1_${currentGroup}`);
          localStorage.removeItem(`draft_showing_review_v1_${currentGroup}`);
          localStorage.removeItem(`draft_period_v1_${currentGroup}`);
        } catch {}
        setCurrentIndex(0);
        setShowingReview(false);
      } else {
        setErrorMsg('Gagal menyinkronkan data dengan Google Spreadsheet. Cek setelan URL Webhook Apps Script.');
      }
    } catch (e: any) {
      setErrorMsg(e?.message || 'Gagal menyimpan penilaian kerja.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper to check if an employee has already been submitted for the current active period
  const checkIsSubmitted = (emp: Employee) => {
    return evaluations.some(e => {
      if (!isSameEmployee(e, emp)) return false;
      
      const periodMatches = parseAndNormalizePeriode(e.periode).trim().toLowerCase() === 
                            parseAndNormalizePeriode(periodInfo.readable).trim().toLowerCase();
      if (!periodMatches) return false;

      if (currentGroup === 'ALL') {
        return true;
      }
      return e.grup === currentGroup;
    });
  };

  // Helper to retrieve the submitted evaluation of an employee for the current active period
  const getSubmittedEvaluation = (emp: Employee) => {
    return evaluations.find(e => {
      if (!isSameEmployee(e, emp)) return false;
      
      const periodMatches = parseAndNormalizePeriode(e.periode).trim().toLowerCase() === 
                            parseAndNormalizePeriode(periodInfo.readable).trim().toLowerCase();
      if (!periodMatches) return false;

      if (currentGroup === 'ALL') {
        return true;
      }
      return e.grup === currentGroup;
    });
  };

  // Submit whole batch to spreadsheet
  const handleSendBatchToSpreadsheet = async () => {
    if (!periodInfo.isOpen) {
      setErrorMsg('Penilaian ditutup di luar jangkauan tanggal.');
      return;
    }

    const activeEmployees = groupEmployees.filter(emp => !isEmployeeInputFrozen(emp));

    // Only uncompleted if they are not already submitted and do not have a draft rating
    const uncompleted = activeEmployees.filter(emp => {
      if (checkIsSubmitted(emp)) return false;
      const r = draftRatings[emp.noReg];
      return !r || r.nil1 === 0 || r.nil2 === 0;
    });

    if (uncompleted.length > 0) {
      setErrorMsg(`Masih ada ${uncompleted.length} karyawan belum dinilai. Selesaikan semuanya terlebih dahulu.`);
      return;
    }

    // If there are unsubmitted employees, send unsubmitted ones. If all are submitted, allow re-sending activeEmployees batch
    const unsubmittedList = activeEmployees.filter(emp => !checkIsSubmitted(emp));
    const listToSend = unsubmittedList.length > 0 ? unsubmittedList : activeEmployees;

    if (listToSend.length === 0) {
      setSuccessMsg('Semua karyawan pada grup ini sudah dinilai.');
      return;
    }

    // Verify duplicate entries in the database/spreadsheet for listToSend only (if unsubmittedList was non-empty)
    if (unsubmittedList.length > 0) {
      const duplicateList = listToSend.filter(emp => {
        return evaluations.some(e => {
          const matchesNoRegAndPeriod = isSameEmployee(e, emp) && 
                                        parseAndNormalizePeriode(e.periode).trim().toLowerCase() === parseAndNormalizePeriode(periodInfo.readable).trim().toLowerCase();
          if (!matchesNoRegAndPeriod) return false;
          
          if (currentGroup === 'ALL') {
            return true;
          }
          return e.grup === currentGroup;
        });
      });

      if (duplicateList.length > 0) {
        const nonDuplicateList = listToSend.filter(emp => {
          return !evaluations.some(e => {
            const matchesNoRegAndPeriod = isSameEmployee(e, emp) && 
                                          parseAndNormalizePeriode(e.periode).trim().toLowerCase() === parseAndNormalizePeriode(periodInfo.readable).trim().toLowerCase();
            if (!matchesNoRegAndPeriod) return false;
            
            if (currentGroup === 'ALL') {
              return true;
            }
            return e.grup === currentGroup;
          });
        });
        setDuplicateBatchCheck({ dupes: duplicateList, news: nonDuplicateList });
        return;
      }
    }

    // Proceed directly
    await executeBatchSubmissions(listToSend);
  };

  const ratedCount = groupEmployees.filter(emp => {
    if (isEmployeeInputFrozen(emp)) return true; // Frozen employee does not require rating from this KSS
    if (checkIsSubmitted(emp)) return true; // Already submitted employee does not require rating from this KSS
    const r = draftRatings[emp.noReg];
    return r && r.nil1 > 0 && r.nil2 > 0;
  }).length;
  const totalCount = groupEmployees.length;
  const unfilledCount = totalCount - ratedCount;
  const isGroupFullyRated = totalCount > 0 && ratedCount === totalCount;

  // Determine if there are employees in this group who still need to be submitted to Google Sheets
  const hasStandardUnsubmitted = groupEmployees.some(emp => {
    if (isEmployeeInputFrozen(emp) && !isShiftMtcEmployee(emp)) return false;
    return !checkIsSubmitted(emp);
  });

  // Auto-skip navigasi otomatis: Ketika sistem mendeteksi karyawan aktif yang statusnya dibekukan (kecuali opt. mtc shift),
  // penilaian langsung melompat ke nomor urut berikutnya secara otomatis.
  useEffect(() => {
    if (isAllGroupMode || (currentGroup as string) === 'NONE' || (currentGroup as string) === 'NS') return;
    if (!groupEmployees || groupEmployees.length === 0) return;
    if (currentIndex < 0 || currentIndex >= groupEmployees.length) return;

    const currentEmp = groupEmployees[currentIndex];
    if (currentEmp && isEmployeeInputFrozen(currentEmp) && !isShiftMtcEmployee(currentEmp)) {
      // 1. Cari ke depan dari currentIndex + 1 yang belum dinilai dan tidak dibekukan (kecuali opt. mtc shift)
      let targetIdx = -1;
      for (let i = currentIndex + 1; i < groupEmployees.length; i++) {
        const emp = groupEmployees[i];
        if (isEmployeeInputFrozen(emp) && !isShiftMtcEmployee(emp)) continue;
        const r = draftRatings[emp.noReg];
        const isSubmitted = checkIsSubmitted(emp);
        if ((!r || r.nil1 === 0 || r.nil2 === 0) && !isSubmitted) {
          targetIdx = i;
          break;
        }
      }

      // 2. Jika tidak ada unrated di depan, cari ke depan dari currentIndex + 1 yang tidak dibekukan (nomor urut berikutnya)
      if (targetIdx === -1) {
        for (let i = currentIndex + 1; i < groupEmployees.length; i++) {
          const emp = groupEmployees[i];
          if (!isEmployeeInputFrozen(emp) || isShiftMtcEmployee(emp)) {
            targetIdx = i;
            break;
          }
        }
      }

      // 3. Jika di depan sudah habis, cari dari awal (0 s.d. currentIndex - 1) yang belum dinilai dan tidak dibekukan
      if (targetIdx === -1) {
        for (let i = 0; i < currentIndex; i++) {
          const emp = groupEmployees[i];
          if (isEmployeeInputFrozen(emp) && !isShiftMtcEmployee(emp)) continue;
          const r = draftRatings[emp.noReg];
          const isSubmitted = checkIsSubmitted(emp);
          if ((!r || r.nil1 === 0 || r.nil2 === 0) && !isSubmitted) {
            targetIdx = i;
            break;
          }
        }
      }

      // 4. Jika masih belum ditemukan, cari dari awal yang tidak dibekukan
      if (targetIdx === -1) {
        for (let i = 0; i < groupEmployees.length; i++) {
          const emp = groupEmployees[i];
          if (!isEmployeeInputFrozen(emp) || isShiftMtcEmployee(emp)) {
            targetIdx = i;
            break;
          }
        }
      }

      if (targetIdx !== -1 && targetIdx !== currentIndex) {
        setCurrentIndex(targetIdx);
      } else if (targetIdx === -1) {
        setShowingReview(true);
      }
    }
  }, [currentIndex, groupEmployees, draftRatings, periodInfo.readable, currentGroup, isAllGroupMode, evaluations]);

  // =========================================================================
  // STATE & LOGIC FOR REGULAR MANUAL FORM (ADMIN MODE / ALL ACCESS)
  // =========================================================================
  const [selectedEmpId, setSelectedEmpId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const [manualNoReg, setManualNoReg] = useState('');
  const [manualNama, setManualNama] = useState('');
  const [manualGrup, setManualGrup] = useState<GroupType | ''>('');
  const [manualNil1, setManualNil1] = useState<number>(0);
  const [manualNil2, setManualNil2] = useState<number>(0);

  // Load Admin draft form when in ALL group mode
  useEffect(() => {
    if (currentGroup === 'ALL') {
      try {
        const savedAdminDraft = localStorage.getItem('draft_admin_form_v1');
        if (savedAdminDraft) {
          const parsed = JSON.parse(savedAdminDraft);
          setSelectedEmpId(parsed.selectedEmpId || '');
          setSearchQuery(parsed.searchQuery || '');
          setManualNoReg(parsed.manualNoReg || '');
          setManualNama(parsed.manualNama || '');
          setManualGrup(parsed.manualGrup || '');
          setManualNil1(parsed.manualNil1 || 0);
          setManualNil2(parsed.manualNil2 || 0);
        }
      } catch (err) {
        console.error('Failed to load admin draft', err);
      }
    }
  }, [currentGroup]);

  // Persist Admin draft form on any state change
  useEffect(() => {
    if (currentGroup === 'ALL') {
      try {
        const adminDraft = {
          selectedEmpId,
          searchQuery,
          manualNoReg,
          manualNama,
          manualGrup,
          manualNil1,
          manualNil2
        };
        localStorage.setItem('draft_admin_form_v1', JSON.stringify(adminDraft));
      } catch (err) {
        console.error('Failed to save admin draft', err);
      }
    }
  }, [currentGroup, selectedEmpId, searchQuery, manualNoReg, manualNama, manualGrup, manualNil1, manualNil2]);

  // Arrow key & numeric key navigation listener for rating selection
  useEffect(() => {
    // Only intercept if we are actively on an input screen, not inside dialogs/reviews
    if (showResetConfirm || duplicateBatchCheck || duplicateManualCheck) return;

    const handleArrowKeyDown = (e: KeyboardEvent) => {
      // Do not intercept if focus is inside standard text input/select/textarea
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'SELECT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return;
      }

      // 1. Handle numeric key entries (1 to 5) for quick rating selection
      const isNumberKey = ['1', '2', '3', '4', '5'].includes(e.key);
      if (isNumberKey) {
        e.preventDefault();
        const val = parseInt(e.key, 10);
        
        // Check if we are in wizard mode or manual admin mode
        const isWizard = !isAllGroupMode && currentGroup !== 'NONE' && !showingReview;
        const isManual = isAllGroupMode && selectedEmpId; // selectedEmpId is present if rating a manual employee

        if (isWizard) {
          if (!activeEmp || hasSubmitted) return;
          
          // Select rating for the currently focused field (will auto-focus the next field if KUALITAS is rated)
          handleSelectDraftRating(focusedField, val);
        } else if (isManual) {
          if (focusedField === 'nil1') {
            setManualNil1(val);
            setFocusedField('nil2');
          } else {
            setManualNil2(val);
          }
        }
        return;
      }

      // 2. Handle arrow key navigation between fields
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedField('nil1');
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedField('nil2');
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        
        // Check if we are in wizard mode or manual admin mode
        const isWizard = !isAllGroupMode && currentGroup !== 'NONE' && !showingReview;
        const isManual = isAllGroupMode && selectedEmpId; // selectedEmpId is present if rating a manual employee

        if (isWizard) {
          if (!activeEmp || hasSubmitted) return;
          const currVal = focusedField === 'nil1' ? draftNil1 : draftNil2;
          let nextVal = 0;
          if (e.key === 'ArrowLeft') {
            nextVal = currVal <= 1 ? 5 : currVal - 1;
          } else {
            nextVal = currVal === 0 ? 1 : (currVal >= 5 ? 1 : currVal + 1);
          }
          handleSelectDraftRating(focusedField, nextVal);
        } else if (isManual) {
          const currVal = focusedField === 'nil1' ? manualNil1 : manualNil2;
          let nextVal = 0;
          if (e.key === 'ArrowLeft') {
            nextVal = currVal <= 1 ? 5 : currVal - 1;
          } else {
            nextVal = currVal === 0 ? 1 : (currVal >= 5 ? 1 : currVal + 1);
          }
          if (focusedField === 'nil1') {
            setManualNil1(nextVal);
          } else {
            setManualNil2(nextVal);
          }
        }
      }
    };

    window.addEventListener('keydown', handleArrowKeyDown);
    return () => window.removeEventListener('keydown', handleArrowKeyDown);
  }, [
    showResetConfirm,
    duplicateBatchCheck,
    duplicateManualCheck,
    isAllGroupMode,
    currentGroup,
    showingReview,
    selectedEmpId,
    activeEmp,
    hasSubmitted,
    focusedField,
    draftNil1,
    draftNil2,
    manualNil1,
    manualNil2
  ]);

  // Handle auto-selection of employee from dashboard
  useEffect(() => {
    const handleSelectEmployeeEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ noReg: string }>;
      if (customEvent.detail && customEvent.detail.noReg) {
        const targetNoReg = customEvent.detail.noReg.toUpperCase();
        if (isAllGroupMode) {
          const emp = employeeSource.find(item => item.noReg.toUpperCase() === targetNoReg);
          if (emp) {
            setSelectedEmpId(emp.noReg);
            setManualNoReg(emp.noReg);
            setManualNama(emp.nama);
            setManualGrup(emp.grup as GroupType);
            setIsDropdownOpen(false);
            setErrorMsg(null);
            const formElement = document.getElementById('evaluation-form-card');
            if (formElement) {
              formElement.scrollIntoView({ behavior: 'smooth' });
            }
          }
        } else {
          const idx = groupEmployees.findIndex(item => isSameEmployee(item, { noReg: targetNoReg }));
          if (idx !== -1) {
            const targetEmp = groupEmployees[idx];
            if (isEmployeeInputFrozen(targetEmp) && !isShiftMtcEmployee(targetEmp)) {
              let nextValid = -1;
              for (let i = idx + 1; i < groupEmployees.length; i++) {
                if (!isEmployeeInputFrozen(groupEmployees[i]) || isShiftMtcEmployee(groupEmployees[i])) {
                  nextValid = i;
                  break;
                }
              }
              if (nextValid === -1) {
                for (let i = 0; i < groupEmployees.length; i++) {
                  if (!isEmployeeInputFrozen(groupEmployees[i]) || isShiftMtcEmployee(groupEmployees[i])) {
                    nextValid = i;
                    break;
                  }
                }
              }
              setCurrentIndex(nextValid !== -1 ? nextValid : idx);
            } else {
              setCurrentIndex(idx);
            }
            setShowingReview(false);
            const formElement = document.getElementById('evaluation-form-card');
            if (formElement) {
              formElement.scrollIntoView({ behavior: 'smooth' });
            }
          }
        }
      }
    };

    window.addEventListener('select-employee-for-evaluation', handleSelectEmployeeEvent);
    return () => {
      window.removeEventListener('select-employee-for-evaluation', handleSelectEmployeeEvent);
    };
  }, [isAllGroupMode, employeeSource, groupEmployees]);

  // Filter prepopulated list for drop-down selection
  const filteredEmployeesList = employeeSource.filter(emp => {
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      return emp.nama.toLowerCase().includes(q) || emp.noReg.toLowerCase().includes(q) || (emp.empId && emp.empId.toLowerCase().includes(q));
    }
    return true;
  }).sort((a, b) => compareEmpId(a.empId, b.empId, a.noReg, b.noReg, employeeSource));

  const handleSelectEmployee = (emp: Employee | 'manual') => {
    if (emp === 'manual') {
      setSelectedEmpId('manual');
      setManualNoReg('');
      setManualNama('');
      setManualGrup('');
    } else {
      setSelectedEmpId(emp.noReg);
      setManualNoReg(emp.noReg);
      setManualNama(emp.nama);
      setManualGrup(emp.grup as GroupType);
    }
    setIsDropdownOpen(false);
    setErrorMsg(null);
  };

  const calculateLiveAverage = () => {
    if (manualNil1 > 0 && manualNil2 > 0) {
      return ((manualNil1 + manualNil2) / 2).toFixed(1);
    }
    return '-';
  };

  const executeManualSubmission = async () => {
    setIsSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    setDuplicateManualCheck(null);

    const averageVal = parseFloat(((manualNil1 + manualNil2) / 2).toFixed(2));
    const targetEmp = employeeSource.find(emp => 
      isSameEmployee(emp, { noReg: manualNoReg.trim(), nama: manualNama.trim() })
    );
    const finalGrup = currentGroup === 'ALL' ? (manualGrup || (targetEmp ? targetEmp.grup : 'A')) : currentGroup;

    try {
      const success = await onAddEvaluation({
        empId: targetEmp?.empId,
        periode: periodInfo.readable,
        noReg: manualNoReg.trim().toUpperCase(),
        nama: manualNama.trim(),
        grup: finalGrup,
        jabatan: targetEmp?.jabatan || 'OPERATOR MANUAL',
        nil1: manualNil1,
        nil2: manualNil2,
        average: averageVal,
        isSupportive: false
      });

      if (success) {
        setSuccessMsg(`Berhasil! Evaluasi untuk ${manualNama} (${manualNoReg.toUpperCase()}) telah disimpan.`);
        // Reset inputs
        setManualNil1(0);
        setManualNil2(0);
        setSelectedEmpId('');
        setManualNoReg('');
        setManualNama('');
        setManualGrup('');
        setSearchQuery('');
        try {
          localStorage.removeItem('draft_admin_form_v1');
        } catch {}
        setTimeout(() => setSuccessMsg(null), 5000);
      } else {
        setErrorMsg('Sinkronisasi gagal. Periksa kembali webhook Anda.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Terjadi kesalahan sistem.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAdminFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!periodInfo.isOpen) {
      setErrorMsg('Masa periode penilaian belum terbuka.');
      return;
    }

    if (!manualNoReg.trim()) {
      setErrorMsg('No. Reg karyawan wajib diisi.');
      return;
    }
    if (!manualNama.trim()) {
      setErrorMsg('Nama karyawan wajib diisi.');
      return;
    }
    if (!manualGrup) {
      setErrorMsg('Grup kerja karyawan belum dipilih.');
      return;
    }
    if (manualNil1 < 1 || manualNil1 > 5 || manualNil2 < 1 || manualNil2 > 5) {
      setErrorMsg('Kualitas (Nilai 1) dan Kuantitas (Nilai 2) harus dipilih (skor 1-5).');
      return;
    }

    // Reject duplicate manual submission
    const isDuplicate = evaluations.some(e => {
      const matchesEmp = isSameEmployee(e, { noReg: manualNoReg.trim(), nama: manualNama.trim() });
      const matchesPeriod = parseAndNormalizePeriode(e.periode).trim().toLowerCase() === 
                            parseAndNormalizePeriode(periodInfo.readable).trim().toLowerCase();
      if (!matchesEmp || !matchesPeriod) return false;
      
      if (currentGroup === 'ALL') {
        return true;
      }
      return e.grup === currentGroup;
    });

    if (isDuplicate) {
      setDuplicateManualCheck({
        noReg: manualNoReg.trim().toUpperCase(),
        nama: manualNama.trim()
      });
      return;
    }

    await executeManualSubmission();
  };

  // Switch between views
  const getGroupLabel = (id: string) => {
    const f = GROUPS.find(g => g.id === id);
    return f ? f.name : id;
  };

  // =========================================================================
  // VIEW RENDERER
  // =========================================================================
  return (
    <div id="evaluation-form-card" className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col h-full relative">
      
      {/* Upper header */}
      <div className="mb-5">
        <div className="flex justify-between items-start gap-4 mb-4">
          <div className="flex items-center space-x-2">
            <div className="w-2.5 h-6 bg-blue-600 rounded-full shrink-0"></div>
            <div>
              <h3 id="form-title" className="text-base font-bold text-slate-800">
                {isAllGroupMode ? 'Input Nilai' : `Input Nilai - ${getGroupLabel(currentGroup)}`}
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {isAllGroupMode ? 'Mencari karyawan di seluruh divisi satu per satu' : `• Periode penilaian ${dynamicPeriodRange}`}
              </p>
            </div>
          </div>

          <div className="flex flex-col items-end">
            {/* Combined Period & Status Badge */}
            {(() => {
              let label = 'Closed';
              let styles = 'bg-rose-50 border-rose-200 text-rose-700';
              let dotColor = 'bg-rose-500';
              
              const isGroupCompleted = totalCount > 0 && unfilledCount === 0 && !hasStandardUnsubmitted;
              
              if (periodInfo.isUpcoming) {
                label = 'Pre-Open';
                styles = 'bg-amber-50 border-amber-200 text-amber-700';
                dotColor = 'bg-amber-500';
              } else if (!periodInfo.isOpen) {
                label = 'Closed';
                styles = 'bg-rose-50 border-rose-200 text-rose-700';
                dotColor = 'bg-rose-500';
              } else if (isGroupCompleted) {
                label = 'Finish';
                styles = 'bg-blue-50 border-blue-200 text-blue-700';
                dotColor = 'bg-blue-500';
              } else {
                label = 'Open';
                styles = 'bg-emerald-50 border-emerald-200 text-emerald-700';
                dotColor = 'bg-emerald-500';
              }
              
              return (
                <span id="period-label-badge" className={`px-2.5 py-1 rounded-md font-sans text-xs font-bold flex items-center gap-1.5 border ${styles}`}>
                  <span className={`w-2 h-2 rounded-full ${dotColor} ${label === 'Open' ? 'animate-pulse' : ''}`} />
                  {periodInfo.readable} / {label}
                </span>
              );
            })()}
          </div>
        </div>

        {/* Demo trigger warning */}
        {!periodInfo.isOpen && (
          <div className="p-3 bg-amber-50 border border-amber-200/60 rounded-lg flex items-start gap-2 text-amber-800 text-[11px] mb-3 leading-relaxed">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
            <div>
              <span className="font-bold">Informasi!!!</span>
              <p className="mt-0.5 text-slate-650 font-medium">
                {periodInfo.isUpcoming ? (
                  `Penilaian untuk periode bulan ${periodInfo.readable} dapat DIAKSES pada tanggal 15 s.d 25 ${periodInfo.readable} .`
                ) : (
                  `Penilaian untuk periode bulan ${currentMonthName} sudah DITUTUP. Untuk penilaian periode bulan ${nextMonthName} dapat DIAKSES pada tanggal 15 s.d 25 tiap bulan.`
                )}
              </p>
              {currentGroup === 'ALL' && (
                <button
                  type="button"
                  onClick={onToggleDemoMode}
                  className="mt-1.5 text-[9px] font-bold uppercase tracking-wider text-white bg-amber-600 hover:bg-amber-700 transition duration-150 px-2.5 py-1 rounded-md flex items-center gap-1 cursor-pointer"
                >
                  <Sparkles className="w-3 h-3" /> Masuk Mode Demo
                </button>
              )}
            </div>
          </div>
        )}

        {isDemoMode && periodInfo.isOpen && (
          <div className="p-2 py-1 bg-blue-50 border border-blue-150/40 rounded-lg flex items-center justify-between text-blue-800 text-[11px] font-mono mb-2">
            <span className="flex items-center gap-1 font-semibold">
              <Sparkles className="w-3.5 h-3.5 text-blue-500" /> 
              Uji Coba Demo Aktif
            </span>
            <button
              type="button"
              onClick={() => {
                if (currentGroup !== 'ALL') {
                  if (onShowAlert) {
                    onShowAlert("Akses Terbatas", "Untuk mematikan Mode Demo hubungi admin CP. 081252044206");
                  } else {
                    alert("Untuk mematikan Mode Demo hubungi admin CP. 081252044206");
                  }
                } else {
                  onToggleDemoMode();
                }
              }}
              className="text-[10px] underline hover:text-blue-950 font-bold cursor-pointer"
            >
              Matikan Demo
            </button>
          </div>
        )}
      </div>

      {(!periodInfo.isOpen && !periodInfo.isUpcoming) ? (
        <div className="space-y-4 flex-1 flex flex-col justify-center py-6">
          {hasSubmissionsInPeriod ? (
            <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl flex items-start gap-3 shadow-3xs animate-fade-in">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600 mt-0.5" />
              <div>
                <div className="text-sm font-bold text-emerald-900">
                  Penilaian Periode Bulan {periodInfo.readable} SUDAH SELESAI DIKIRIM
                </div>
                <p className="text-xs text-emerald-700 mt-1 leading-relaxed">
                  Seluruh data penilaian karyawan untuk periode bulan ini telah sukses terkirim ke database pusat.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-slate-50 border border-slate-200 text-slate-700 rounded-xl flex items-start gap-3 shadow-3xs animate-fade-in">
              <AlertCircle className="w-5 h-5 shrink-0 text-slate-500 mt-0.5" />
              <div>
                <div className="text-sm font-bold text-slate-900">
                  Akses Penilaian Periode Bulan {periodInfo.readable} DITUTUP
                </div>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Akses pengisian nilai untuk periode bulan ini belum dibuka atau sudah ditutup. Saat ini belum ada data penilaian yang tersimpan atau dikirimkan untuk grup Anda.
                </p>
              </div>
            </div>
          )}
        </div>
      ) : isAllGroupMode ? (
        // =====================================================================
        // RENDER: STANDARD SINGLE FORM (ADMIN / ALL)
        // =====================================================================
        <form id="admin-form" onSubmit={handleAdminFormSubmit} className="space-y-4 flex-1 flex flex-col justify-between">
          <div className="space-y-4">
            
            {/* Search autocomplete operator picker */}
            <div className="relative">
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1">
                Nama: <span className="text-red-500">*</span>
              </label>

              <button
                type="button"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                disabled={!periodInfo.isOpen && !periodInfo.isUpcoming}
                className="w-full flex items-center justify-between border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 hover:bg-slate-100/50 text-left text-xs text-slate-800 disabled:opacity-50 transition"
              >
                <div className="flex items-center gap-2 overflow-hidden">
                  <User className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="truncate font-semibold text-slate-700">
                    {selectedEmpId === '' 
                      ? 'Pilih Karyawan...' 
                      : selectedEmpId === 'manual' 
                      ? '✍️ Tambah Karyawan Baru (Input Manual)' 
                      : employeeSource.find(e => e.noReg === selectedEmpId)
                        ? `${employeeSource.find(e => e.noReg === selectedEmpId)?.nama} (${selectedEmpId})`
                        : `Pilih Operator`}
                  </span>
                </div>
                <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
              </button>

              {isDropdownOpen && (
                <>
                  {/* Backdrop to close dropdown on click outside */}
                  <div 
                    className="fixed inset-0 z-20" 
                    onClick={() => setIsDropdownOpen(false)}
                  />
                  <div className="absolute z-30 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl p-2.5 flex flex-col gap-2">
                    <input
                      type="text"
                      placeholder="Cari Nama / No. Reg..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      autoFocus
                    />
                    <div className="max-h-48 overflow-y-auto space-y-0.5 pr-1">
                      <button
                        type="button"
                        onClick={() => handleSelectEmployee('manual')}
                        className="w-full text-left px-2 py-1.5 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded flex items-center justify-between"
                      >
                        <span>✍️ Tambah Karyawan Baru (Manual)</span>
                        <span className="text-[9px] bg-blue-200 text-blue-800 px-1 py-0.5 rounded">Manual</span>
                      </button>

                      <div className="h-px bg-slate-100 my-1" />

                      {filteredEmployeesList.length === 0 ? (
                        <div className="text-center py-4 text-xs text-slate-400">
                          Tidak ada karyawan yang cocok
                        </div>
                      ) : (
                        filteredEmployeesList.map((emp) => (
                          <button
                            key={emp.noReg}
                            type="button"
                            onClick={() => handleSelectEmployee(emp)}
                            className={`w-full text-left px-2 py-1.5 text-xs rounded flex items-center justify-between transition ${
                              selectedEmpId === emp.noReg 
                                ? 'bg-slate-100 font-bold text-slate-950 border-l-2 border-blue-600' 
                                : 'hover:bg-slate-50 text-slate-600'
                            }`}
                          >
                            <div>
                              <span className="font-semibold block text-slate-700">{emp.nama}</span>
                              <span className="text-[10px] text-slate-400 font-mono">{emp.noReg} • {emp.jabatan || 'Operator'}</span>
                            </div>
                            <span className="text-[9px] font-bold bg-slate-150 text-slate-600 px-1.5 py-0.5 rounded-full">{emp.grup}</span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Manual field options */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">No. Reg:</label>
                <input
                  type="text"
                  value={manualNoReg}
                  onChange={(e) => setManualNoReg(e.target.value)}
                  disabled={selectedEmpId !== 'manual'}
                  placeholder="Contoh: D0756"
                  className="w-full px-3 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Grup:</label>
                <select
                  value={manualGrup}
                  onChange={(e) => setManualGrup(e.target.value as GroupType)}
                  disabled={selectedEmpId !== 'manual'}
                  className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-500 font-semibold"
                >
                  <option value="">-- Grup --</option>
                  {GROUPS.map((g) => (
                    <option key={g.id} value={g.id}>Grup {g.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {selectedEmpId === 'manual' && (
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Nama Lengkap Karyawan</label>
                <input
                  type="text"
                  value={manualNama}
                  onChange={(e) => setManualNama(e.target.value)}
                  placeholder="Contoh: Muhammad Akhyar"
                  className="w-full px-3 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            )}

            {periodInfo.isUpcoming && (
              <div className="p-3 bg-amber-50 border border-amber-200/50 rounded-lg text-amber-850 text-[11px] font-bold flex items-start gap-2 animate-fade-in leading-relaxed">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  Akses Penilaian bisa diinput pada tanggal 15 {periodInfo.readable}. Anda saat ini hanya bisa melihat draf karyawan.
                </span>
              </div>
            )}

            {/* Ratings Selection */}
            <div className="p-3 bg-slate-50 border border-slate-150 rounded-lg space-y-3.5">
              <RatingInput
                id="admin-form-nil1"
                label="Kualitas (Nilai 1)"
                value={manualNil1}
                onChange={(val) => {
                  setErrorMsg(null);
                  setManualNil1(val);
                }}
                disabled={!periodInfo.isOpen}
                isFocused={focusedField === 'nil1'}
                onFocus={() => setFocusedField('nil1')}
              />
              <RatingInput
                id="admin-form-nil2"
                label="Kuantitas (Nilai 2)"
                value={manualNil2}
                onChange={(val) => {
                  setErrorMsg(null);
                  setManualNil2(val);
                }}
                disabled={!periodInfo.isOpen}
                isFocused={focusedField === 'nil2'}
                onFocus={() => setFocusedField('nil2')}
              />
            </div>
          </div>

          <div className="space-y-3 pt-3 border-t border-slate-100">
            {manualNil1 > 0 && manualNil2 > 0 && (
              <div className="p-2 py-1.5 bg-blue-50 border border-blue-100 rounded text-center flex justify-between items-center text-blue-800">
                <span className="text-[10px] font-bold text-slate-500 font-mono uppercase tracking-widest">Estimasi Rata-Rata</span>
                <span className="text-base font-black font-mono">{calculateLiveAverage()}</span>
              </div>
            )}

            {errorMsg && (
              <p className="text-[11px] text-red-650 font-bold text-center bg-red-50 p-2 rounded-md border border-red-150">
                ⚠️ {errorMsg}
              </p>
            )}

            {successMsg && (
              <p className="text-[11px] text-emerald-800 font-bold text-center bg-emerald-50 p-2 rounded-md border border-emerald-150">
                ✓ {successMsg}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting || selectedEmpId === '' || !periodInfo.isOpen}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold py-2 px-4 rounded-lg text-xs tracking-wider uppercase shadow transition disabled:bg-slate-205 disabled:text-slate-400 cursor-pointer"
            >
              {isSubmitting ? 'Mengirim data...' : 'Kirim Nilai'}
            </button>
          </div>
        </form>
      ) : (
        // =====================================================================
        // RENDER: COMPREHENSIVE SEQUENTIAL INPUT WIZARD (KSS ACTIVE MODE)
        // =====================================================================
        <div className="flex-1 flex flex-col justify-between">
          {!showingReview ? (
            /* ACTIVE QUESTION VIEW */
            <div className="space-y-4">
              {/* Notification of uninput/skipped operators */}
              {unfilledCount > 0 && !hasSubmitted && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs flex items-center justify-between gap-2.5 shadow-3xs animate-fade-in text-amber-805">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                    <span className="truncate">
                      Ada <strong className="font-extrabold text-amber-950 font-mono">{unfilledCount}</strong> operator yang <strong className="font-extrabold">belum dinilai</strong>.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const firstUnratedIdx = groupEmployees.findIndex(emp => {
                        if (isEmployeeInputFrozen(emp)) return false; // Skip frozen operator
                        const r = draftRatings[emp.noReg];
                        return !r || r.nil1 === 0 || r.nil2 === 0;
                      });
                      if (firstUnratedIdx !== -1) {
                        setCurrentIndex(firstUnratedIdx);
                      }
                    }}
                    className="shrink-0 bg-amber-100/80 hover:bg-amber-200 text-amber-900 font-extrabold text-[10px] uppercase px-2.5 py-1 rounded tracking-tight select-none transition cursor-pointer"
                  >
                    Beralih ke Kosong &rarr;
                  </button>
                </div>
              )}

              {activeEmp ? (
                <div className="space-y-4">
                  {/* Active Employee Presentation Header Card */}
                  <div className="p-4 bg-slate-900 text-slate-100 rounded-xl border border-slate-800 relative overflow-hidden shadow-md">
                    <div className="absolute right-3 top-3 opacity-15">
                      <User className="w-16 h-16 text-slate-300" />
                    </div>
                    
                    <span className="text-[10px] font-mono font-bold tracking-widest text-emerald-400 uppercase">Operator Aktif Dinilai</span>
                    <h4 className="text-base font-black tracking-tight text-white mt-1 uppercase">
                      {activeEmp.nama}
                    </h4>
                    
                    <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-1 font-mono">
                      {activeEmp.empId && (
                        <>
                          <span className="text-emerald-400 font-bold bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800/60 text-[10px]">
                            {activeEmp.empId}
                          </span>
                          <span className="text-slate-600">|</span>
                        </>
                      )}
                      <span>No. Reg:</span>
                      <strong className="text-white font-semibold">{activeEmp.noReg}</strong>
                      <span className="text-slate-600">|</span>
                      <span>Grup:</span>
                      <strong className="text-emerald-400">{activeEmp.grup}</strong>
                    </div>

                    {activeEmp.jabatan && (
                      <p className="text-[10px] text-slate-400 italic font-medium mt-1.5 bg-slate-800 p-1.5 px-2 rounded border border-slate-700 truncate" title={activeEmp.jabatan}>
                        Jab: {activeEmp.jabatan}
                      </p>
                    )}

                    {/* Referensi Penilaian Bulan Kemarin */}
                    {(() => {
                      // 1. Resolve previous month evaluation record
                      // Try from evaluations state
                      let prevEval = evaluations.find(
                        e => isSameEmployee(e, activeEmp) && 
                             parseAndNormalizePeriode(e.periode).trim().toLowerCase() === parseAndNormalizePeriode(prevMonthPeriod).trim().toLowerCase()
                      );
                      
                      let resolvedPeriod = prevMonthPeriod;

                      // If not in evaluations, check hrmsRecords matching prevMonthPeriod
                      if (!prevEval && hrmsRecords && hrmsRecords.length > 0) {
                        const hrMatch = hrmsRecords.find(
                          h => isSameEmployee(h, activeEmp) &&
                               parseAndNormalizePeriode(h.periode).trim().toLowerCase() === parseAndNormalizePeriode(prevMonthPeriod).trim().toLowerCase()
                        );
                        if (hrMatch) {
                          prevEval = {
                            id: `hrms-${hrMatch.noReg}-${hrMatch.periode}`,
                            noReg: hrMatch.noReg,
                            nama: hrMatch.nama,
                            nil1: hrMatch.kualitas,
                            nil2: hrMatch.kuantitas,
                            average: (hrMatch.kualitas + hrMatch.kuantitas) / 2,
                            periode: hrMatch.periode,
                            grup: (hrMatch as any).grup || activeEmp.grup,
                            jabatan: (hrMatch as any).jabatan || activeEmp.jabatan || '',
                            submittedAt: '',
                            pendingApproval: false
                          };
                        }
                      }

                      // Fallback: If still not found (e.g. current calendar is far ahead), check latest recorded period in HRMS or evaluations
                      if (!prevEval) {
                        const empHrms = (hrmsRecords || []).filter(h => isSameEmployee(h, activeEmp));
                        if (empHrms.length > 0) {
                          const latestHrms = empHrms[0];
                          resolvedPeriod = latestHrms.periode;
                          prevEval = {
                            id: `hrms-${latestHrms.noReg}-${latestHrms.periode}`,
                            noReg: latestHrms.noReg,
                            nama: latestHrms.nama,
                            nil1: latestHrms.kualitas,
                            nil2: latestHrms.kuantitas,
                            average: (latestHrms.kualitas + latestHrms.kuantitas) / 2,
                            periode: latestHrms.periode,
                            grup: (latestHrms as any).grup || activeEmp.grup,
                            jabatan: (latestHrms as any).jabatan || activeEmp.jabatan || '',
                            submittedAt: '',
                            pendingApproval: false
                          };
                        } else {
                          const pastEvals = evaluations.filter(
                            e => isSameEmployee(e, activeEmp) && 
                                 parseAndNormalizePeriode(e.periode).trim().toLowerCase() !== parseAndNormalizePeriode(periodInfo.readable).trim().toLowerCase()
                          );
                          if (pastEvals.length > 0) {
                            prevEval = pastEvals[pastEvals.length - 1];
                            resolvedPeriod = prevEval.periode;
                          }
                        }
                      }

                      // Presensi bulan kemarin matched by resolvedPeriod
                      const prevMonthPresensi = presensiRecords ? presensiRecords.filter(
                        r => isSameEmployee(r, activeEmp) &&
                             parseAndNormalizePeriode(r.periode).trim().toUpperCase() === parseAndNormalizePeriode(resolvedPeriod).trim().toUpperCase()
                      ) : [];

                      let cutiCount = 0;
                      let sakitCount = 0;
                      let izinCount = 0;
                      let dispensasiCount = 0;
                      let lpCount = 0;

                      prevMonthPresensi.forEach(r => {
                        const type = mapPresensiType(r.presensi);
                        if (type === 'C') cutiCount++;
                        if (type === 'S') sakitCount++;
                        if (type === 'I') izinCount++;
                        if (type === 'D') dispensasiCount++;
                        if (type === 'LP') lpCount++;
                      });

                      const isShiftMtc = isShiftMtcEmployee(activeEmp);
                      const supportiveEval = isShiftMtc
                        ? evaluations.find(e => {
                            const isSameEmp = isSameEmployee(e, activeEmp);
                            const isSamePeriod = parseAndNormalizePeriode(e.periode).trim().toLowerCase() === 
                                                 parseAndNormalizePeriode(periodInfo.readable).trim().toLowerCase();
                            const isSupport = !!e.isSupportive || (e.grup && ['A', 'B', 'C'].includes(e.grup));
                            return isSameEmp && isSamePeriod && isSupport;
                          })
                        : null;

                      return (
                        <div className="mt-3 pt-2.5 border-t border-slate-800 space-y-3">
                          <div>
                            <div className="text-[9px] font-extrabold text-emerald-400 uppercase tracking-widest flex items-center justify-between">
                              <span>Periode Bulan kemarin ({resolvedPeriod}):</span>
                              {prevEval && (
                                <span className="text-[8.5px] font-mono text-emerald-300/80 bg-emerald-950/60 px-1.5 py-0.2 rounded border border-emerald-800/40">
                                  Tersedia Otomatis
                                </span>
                              )}
                            </div>
                            {prevEval ? (
                              <div className="flex items-center gap-2.5 text-xs mt-1.5 text-slate-300 font-medium">
                                <div className="bg-slate-800 px-2.5 py-1 rounded border border-slate-700 flex items-center gap-1.5">
                                  <span className="text-slate-400 text-[10px] font-mono">Nilai 1:</span>
                                  <strong className="text-white font-bold">{prevEval.nil1}</strong>
                                </div>
                                <div className="bg-slate-800 px-2.5 py-1 rounded border border-slate-700 flex items-center gap-1.5">
                                  <span className="text-slate-400 text-[10px] font-mono">Nilai 2:</span>
                                  <strong className="text-white font-bold">{prevEval.nil2}</strong>
                                </div>
                                <div className="bg-slate-800 px-2.5 py-1 rounded border border-slate-700 flex items-center gap-1.5 font-semibold">
                                  <span className="text-slate-400 text-[10px] font-mono">Rerata:</span>
                                  <strong className="text-emerald-400 font-bold">{((prevEval.nil1 + prevEval.nil2) / 2).toFixed(1)}</strong>
                                </div>
                              </div>
                            ) : (
                              <p className="text-[10px] text-slate-500 italic mt-1 bg-slate-800/30 p-1.5 px-2 rounded border border-dashed border-slate-800/50">
                                Belum ada data penilaian di aplikasi untuk periode ini.
                              </p>
                            )}
                          </div>

                          {/* Presensi Bulan Kemarin */}
                          <div className="pt-2 border-t border-slate-800/60">
                            <div className="text-[9px] font-extrabold text-blue-400 uppercase tracking-widest flex items-center justify-between">
                              <span>Absensi Bulan Kemarin ({resolvedPeriod}):</span>
                              {prevMonthPresensi.length > 0 && (
                                <span className="text-[8.5px] font-mono text-blue-300/80 bg-blue-950/60 px-1.5 py-0.2 rounded border border-blue-800/40">
                                  {prevMonthPresensi.length} Hari Terdata
                                </span>
                              )}
                            </div>
                            {prevMonthPresensi.length > 0 ? (
                              <div className="mt-1.5 flex flex-wrap gap-2 text-[11px] font-semibold">
                                <span className={`px-2 py-0.5 rounded border ${cutiCount > 0 ? 'bg-indigo-950 text-indigo-300 border-indigo-900 font-extrabold' : 'bg-slate-800 text-slate-500 border-slate-700'}`}>
                                  Cuti: {cutiCount} Hari
                                </span>
                                <span className={`px-2 py-0.5 rounded border ${sakitCount > 0 ? 'bg-red-950 text-red-300 border-red-900 font-extrabold' : 'bg-slate-800 text-slate-500 border-slate-700'}`}>
                                  Sakit: {sakitCount} Hari
                                </span>
                                <span className={`px-2 py-0.5 rounded border ${izinCount > 0 ? 'bg-amber-950 text-amber-300 border-amber-900 font-extrabold' : 'bg-slate-800 text-slate-500 border-slate-700'}`}>
                                  Izin: {izinCount} Hari
                                </span>
                                <span className={`px-2 py-0.5 rounded border ${dispensasiCount > 0 ? 'bg-purple-950 text-purple-300 border-purple-900 font-extrabold' : 'bg-slate-800 text-slate-500 border-slate-700'}`}>
                                  Dispen: {dispensasiCount} Hari
                                </span>
                                <span className={`px-2 py-0.5 rounded border ${lpCount > 0 ? 'bg-rose-950 text-rose-300 border-rose-900 font-extrabold' : 'bg-slate-800 text-slate-500 border-slate-700'}`}>
                                  LP: {lpCount} Hari
                                </span>
                              </div>
                            ) : (
                              <p className="text-[10px] text-slate-500 italic mt-1 bg-slate-800/30 p-1.5 px-2 rounded border border-dashed border-slate-800/50">
                                Tidak ada catatan ketidakhadiran (Cuti, Sakit, Izin, Dispen, LP) pada bulan kemarin.
                              </p>
                            )}
                          </div>

                          {/* MTC Shift Operator Guidance & Cross-Role Reference */}
                          {isShiftMtc && (
                            <div className="pt-2 border-t border-slate-800/70">
                              {(currentGroup === 'A' || currentGroup === 'B' || currentGroup === 'C') && (
                                <div className="p-2.5 bg-sky-950/80 border border-sky-800 rounded-lg text-[10.5px] space-y-1.5">
                                  <div className="flex items-center justify-between">
                                    <span className="font-extrabold text-sky-300 tracking-wider uppercase text-[9px]">🛠️ OPT. MTC SHIFT {currentGroup} (SHEET {currentGroup})</span>
                                    <span className="text-[9px] bg-sky-900/60 text-sky-200 px-1.5 py-0.5 rounded font-mono font-bold">Terpisah dari KSS MTC</span>
                                  </div>
                                  <p className="text-sky-200 leading-relaxed">
                                    KSS Shift {currentGroup} menilai operator ini ke <strong>Sheet {currentGroup}</strong>. Penilaian ini <strong>tidak saling mengunci</strong> dengan penilaian KSS MTC di Sheet MTC.
                                  </p>
                                  {(() => {
                                    const mtcEval = evaluations.find(e => 
                                      isSameEmployee(e, activeEmp) && 
                                      parseAndNormalizePeriode(e.periode).trim().toLowerCase() === parseAndNormalizePeriode(periodInfo.readable).trim().toLowerCase() &&
                                      e.grup === 'MTC'
                                    );
                                    if (mtcEval) {
                                      return (
                                        <div className="mt-1.5 p-2 bg-slate-900/90 border border-sky-700/50 rounded flex items-center justify-between">
                                          <span className="text-slate-400 text-[10px] font-mono">Ref. Nilai KSS MTC:</span>
                                          <div className="flex items-center gap-2 text-xs font-mono font-bold text-slate-200">
                                            <span>Q: {mtcEval.nil1}</span>
                                            <span>T: {mtcEval.nil2}</span>
                                            <span className="text-sky-400">Avg: {mtcEval.average.toFixed(1)}</span>
                                          </div>
                                        </div>
                                      );
                                    } else {
                                      return (
                                        <p className="text-[9.5px] text-slate-400 italic">KSS MTC belum menginput di Sheet MTC untuk periode ini.</p>
                                      );
                                    }
                                  })()}
                                </div>
                              )}

                              {currentGroup === 'MTC' && (
                                <div className="p-2.5 bg-emerald-950/80 border border-emerald-800 rounded-lg text-[10.5px] space-y-1.5">
                                  <div className="flex items-center justify-between">
                                    <span className="font-extrabold text-emerald-300 tracking-wider uppercase text-[9px]">⚡ OPT. MTC SHIFT (SHEET MTC)</span>
                                    <span className="text-[9px] bg-emerald-900/60 text-emerald-200 px-1.5 py-0.5 rounded font-mono font-bold">Terpisah dari KSS Shift</span>
                                  </div>
                                  <p className="text-emerald-200 leading-relaxed">
                                    KSS MTC menilai operator ini ke <strong>Sheet MTC</strong>. Penilaian tersimpan mandiri dan tidak saling mengunci dengan KSS Shift.
                                  </p>
                                  {(() => {
                                    const shiftEval = evaluations.find(e => 
                                      isSameEmployee(e, activeEmp) && 
                                      parseAndNormalizePeriode(e.periode).trim().toLowerCase() === parseAndNormalizePeriode(periodInfo.readable).trim().toLowerCase() &&
                                      ['A', 'B', 'C'].includes(e.grup)
                                    );
                                    if (shiftEval) {
                                      return (
                                        <div className="mt-1.5 p-2 bg-slate-900/90 border border-emerald-700/50 rounded flex items-center justify-between">
                                          <span className="text-slate-400 text-[10px] font-mono">Ref. KSS Shift ({shiftEval.grup}):</span>
                                          <div className="flex items-center gap-2 text-xs font-mono font-bold text-slate-200">
                                            <span>Q: {shiftEval.nil1}</span>
                                            <span>T: {shiftEval.nil2}</span>
                                            <span className="text-emerald-400">Avg: {shiftEval.average.toFixed(1)}</span>
                                          </div>
                                        </div>
                                      );
                                    } else {
                                      return (
                                        <p className="text-[9.5px] text-slate-400 italic">KSS Shift belum menginput di Sheet Shift untuk periode ini.</p>
                                      );
                                    }
                                  })()}
                                </div>
                              )}
                            </div>
                          )}
                          {isSecondedToNSEmployee(activeEmp, periodInfo.readable) && (
                            <div className="pt-2 border-t border-slate-800/70">
                              {currentGroup === 'NS' ? (
                                <div className="p-2.5 bg-indigo-950/80 border border-indigo-900 rounded-lg text-[10.5px]">
                                  <p className="font-extrabold text-indigo-300 tracking-wider uppercase text-[9px]">💡 INFORMASI PERBANTUAN NS (PENILAIAN UTAMA)</p>
                                  <p className="text-indigo-200 mt-0.5 leading-relaxed">Operator ini didelegasikan sementara ke Non-Shift (NS). Penilaian Anda bertindak sebagai <strong>Penilaian UTAMA</strong> yang disinkronkan ke Spreadsheet utama.</p>
                                </div>
                              ) : (currentGroup === 'A' || currentGroup === 'B' || currentGroup === 'C') ? (
                                <div className="p-2.5 bg-red-950/80 border border-red-900 rounded-lg text-[10.5px]">
                                  <p className="font-extrabold text-rose-300 tracking-wider uppercase text-[9px]">🔒 STATUS DI-BEKUKAN (PERBANTUAN NS)</p>
                                  <p className="text-rose-200 mt-0.5 leading-relaxed font-semibold">Operator ini didelegasikan sementara ke Non-Shift (NS). Penilaian diinput oleh KSS NS. KSS Shift dibekukan/tidak bisa melakukan input untuk operator ini.</p>
                                  <div className="mt-2 pt-2 border-t border-red-900/60 flex flex-wrap items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        // Loncat langsung ke operator aktif unrated berikutnya (abaikan opt yang dibekukan, kecuali opt. mtc shift)
                                        let targetIdx = -1;
                                        for (let i = currentIndex + 1; i < groupEmployees.length; i++) {
                                          if (!isEmployeeInputFrozen(groupEmployees[i]) || isShiftMtcEmployee(groupEmployees[i])) {
                                            const r = draftRatings[groupEmployees[i].noReg];
                                            if (!r || r.nil1 === 0 || r.nil2 === 0) {
                                              targetIdx = i;
                                              break;
                                            }
                                          }
                                        }
                                        if (targetIdx === -1) {
                                          for (let i = 0; i < groupEmployees.length; i++) {
                                            if (!isEmployeeInputFrozen(groupEmployees[i]) || isShiftMtcEmployee(groupEmployees[i])) {
                                              const r = draftRatings[groupEmployees[i].noReg];
                                              if (!r || r.nil1 === 0 || r.nil2 === 0) {
                                                targetIdx = i;
                                                break;
                                              }
                                            }
                                          }
                                        }
                                        if (targetIdx === -1) {
                                          for (let i = currentIndex + 1; i < groupEmployees.length; i++) {
                                            if (!isEmployeeInputFrozen(groupEmployees[i]) || isShiftMtcEmployee(groupEmployees[i])) {
                                              targetIdx = i;
                                              break;
                                            }
                                          }
                                        }
                                        if (targetIdx !== -1) {
                                          setCurrentIndex(targetIdx);
                                        } else {
                                          setShowingReview(true);
                                        }
                                      }}
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-bold text-xs shadow-sm transition cursor-pointer"
                                    >
                                      <span>Loncat ke Operator Berikutnya &rarr;</span>
                                    </button>
                                  </div>
                                  {(() => {
                                    const nsEval = evaluations.find(e => {
                                      const isSameEmp = isSameEmployee(e, activeEmp);
                                      const isSamePeriod = parseAndNormalizePeriode(e.periode).trim().toLowerCase() === 
                                                           parseAndNormalizePeriode(periodInfo.readable).trim().toLowerCase();
                                      return isSameEmp && isSamePeriod && e.grup === 'NS' && !e.isSupportive;
                                    });
                                    if (nsEval) {
                                      return (
                                        <div className="mt-2.5 p-3 bg-slate-900 border border-indigo-850 rounded-lg flex flex-col gap-2">
                                          <div className="flex items-center gap-1.5 text-indigo-400 font-extrabold text-[10px] uppercase tracking-wider">
                                            <span>⭐ HASIL PENILAIAN DARI KSS NS</span>
                                          </div>
                                          <div className="grid grid-cols-3 gap-2 mt-1">
                                            <div className="bg-slate-850 p-2 rounded border border-slate-750 text-center">
                                              <span className="block text-[8px] text-slate-400 uppercase font-mono">Kualitas (Nil 1)</span>
                                              <strong className="text-white text-sm font-extrabold font-mono">{nsEval.nil1}</strong>
                                            </div>
                                            <div className="bg-slate-850 p-2 rounded border border-slate-750 text-center">
                                              <span className="block text-[8px] text-slate-400 uppercase font-mono">Kuantitas (Nil 2)</span>
                                              <strong className="text-white text-sm font-extrabold font-mono">{nsEval.nil2}</strong>
                                            </div>
                                            <div className="bg-slate-850 p-2 rounded border border-slate-750 text-center bg-indigo-950/40 border-indigo-900/40">
                                              <span className="block text-[8px] text-indigo-300 uppercase font-mono">Rerata Akhir</span>
                                              <strong className="text-emerald-400 text-sm font-black font-mono">{nsEval.average.toFixed(1)}</strong>
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    } else {
                                      return (
                                        <p className="text-slate-400 italic text-[9.5px] mt-1.5 bg-slate-950/50 p-2 rounded border border-dashed border-slate-800">
                                          Belum ada penilaian yang diinput oleh KSS NS untuk periode berjalan ({periodInfo.readable}).
                                        </p>
                                      );
                                    }
                                  })()}
                                </div>
                              ) : null}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Duplicate verification indicator */}
                  {(() => {
                    return (
                      <>
                        {hasSubmitted && (
                          <div className="p-3 bg-blue-50 border border-blue-200 text-blue-900 rounded-lg flex items-start gap-2.5 text-[11px] font-semibold">
                            <CheckCircle2 className="w-4 h-4 shrink-0 text-blue-600 mt-0.5" />
                            <div>
                              <span>Operator ini (<strong>{activeEmp?.nama}</strong>) sudah memiliki nilai tersimpan untuk periode <strong>{periodInfo.readable}</strong>.</span>
                              <p className="text-[10px] text-blue-700 font-normal mt-0.5">
                                Untuk mengubah nilai operator ini, klik ikon pensil (✏️) pada tabel daftar nilai di samping kanan.
                              </p>
                            </div>
                          </div>
                        )}

                        {periodInfo.isUpcoming && (
                          <div className="p-3 bg-amber-50 border border-amber-200/50 rounded-xl text-amber-850 text-[11px] font-bold flex items-start gap-2 animate-fade-in leading-relaxed">
                            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                            <span>
                              Akses Penilaian Akan Dibuka pada tanggal 15 {periodInfo.readable}. Anda saat ini hanya bisa meninjau draf karyawan.
                            </span>
                          </div>
                        )}

                        {/* Rating selections */}
                        <div className={`p-4 bg-slate-50 border border-slate-200/80 rounded-xl space-y-4 relative transition-all ${
                          isTransitioning ? 'opacity-30 translate-x-2 blur-xs' : ''
                        }`}>
                          {isTransitioning && (
                            <div className="absolute inset-0 bg-slate-100/10 backdrop-blur-3xs flex items-center justify-center rounded-xl z-10 font-bold text-xs text-emerald-800 font-mono">
                              ✓ Berhasil Terisi! Menyimpan...
                            </div>
                          )}

                          <RatingInput
                            id="wizard-nil1"
                            label="Kualitas (Nilai 1)"
                            value={draftNil1}
                            onChange={(val) => handleSelectDraftRating('nil1', val)}
                            disabled={hasSubmitted || !periodInfo.isOpen || isEmployeeInputFrozen(activeEmp)}
                            isFocused={focusedField === 'nil1'}
                            onFocus={() => setFocusedField('nil1')}
                          />

                          <RatingInput
                            id="wizard-nil2"
                            label="Kuantitas (Nilai 2)"
                            value={draftNil2}
                            onChange={(val) => handleSelectDraftRating('nil2', val)}
                            disabled={hasSubmitted || !periodInfo.isOpen || isEmployeeInputFrozen(activeEmp)}
                            isFocused={focusedField === 'nil2'}
                            onFocus={() => setFocusedField('nil2')}
                          />
                        </div>
                      </>
                    );
                  })()}

                  {/* Manual Sequential Steppers (Auto-skips frozen operators, kecuali opt. mtc shift) */}
                  {(() => {
                    const handleStep = (direction: 'prev' | 'next') => {
                      const step = direction === 'next' ? 1 : -1;
                      let target = currentIndex + step;
                      while (target >= 0 && target < groupEmployees.length) {
                        const targetEmp = groupEmployees[target];
                        if (!isEmployeeInputFrozen(targetEmp) || isShiftMtcEmployee(targetEmp)) {
                          setCurrentIndex(target);
                          return;
                        }
                        target += step;
                      }
                    };
                    const hasPrevNonFrozen = groupEmployees.slice(0, currentIndex).some(e => !isEmployeeInputFrozen(e) || isShiftMtcEmployee(e));
                    const hasNextNonFrozen = groupEmployees.slice(currentIndex + 1).some(e => !isEmployeeInputFrozen(e) || isShiftMtcEmployee(e));

                    return (
                      <div className="flex justify-between items-center bg-slate-50 border border-slate-200/60 rounded-xl p-3">
                        <button
                          type="button"
                          disabled={!hasPrevNonFrozen || isTransitioning}
                          onClick={() => handleStep('prev')}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white shadow-3xs hover:bg-slate-100 disabled:opacity-40 text-slate-700 font-bold text-xs flex items-center gap-1 cursor-pointer transition"
                        >
                          &larr; Prev
                        </button>
                        <div className="text-center font-mono">
                          <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest">No Row Baris</span>
                          <span className="text-xs font-black text-blue-700">
                            {currentIndex + 1} <span className="text-slate-400 font-normal">/</span> {groupEmployees.length}
                          </span>
                        </div>
                        <button
                          type="button"
                          disabled={!hasNextNonFrozen || isTransitioning}
                          onClick={() => handleStep('next')}
                          className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white shadow-3xs hover:bg-slate-100 disabled:opacity-40 text-slate-700 font-bold text-xs flex items-center gap-1 cursor-pointer transition"
                        >
                          Next &rarr;
                        </button>
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <p className="text-xs text-slate-500 py-6 text-center">Tidak ditemukan karyawan pada divisi {currentGroup}.</p>
              )}

              {/* Progress Stepper map */}
              <div className="pt-3 border-t border-slate-100">
                <span className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-2 text-center">Navigasi Nilai</span>
                <div className="flex gap-1.5 flex-wrap justify-center max-h-24 overflow-y-auto p-2 bg-slate-50 border border-slate-200/50 rounded-lg">
                  {groupEmployees.map((emp, idx) => {
                    const isRated = draftRatings[emp.noReg]?.nil1 > 0 && draftRatings[emp.noReg]?.nil2 > 0;
                    const isActive = idx === currentIndex;
                    const isFrozen = isEmployeeInputFrozen(emp);
                    return (
                      <button
                        key={emp.noReg}
                        type="button"
                        onClick={() => {
                          if (isTransitioning) return;
                          if (isEmployeeInputFrozen(emp) && !isShiftMtcEmployee(emp)) {
                            let nextValid = -1;
                            for (let i = idx + 1; i < groupEmployees.length; i++) {
                              if (!isEmployeeInputFrozen(groupEmployees[i]) || isShiftMtcEmployee(groupEmployees[i])) {
                                nextValid = i;
                                break;
                              }
                            }
                            if (nextValid === -1) {
                              for (let i = 0; i < groupEmployees.length; i++) {
                                if (!isEmployeeInputFrozen(groupEmployees[i]) || isShiftMtcEmployee(groupEmployees[i])) {
                                  nextValid = i;
                                  break;
                                }
                              }
                            }
                            if (nextValid !== -1) setCurrentIndex(nextValid);
                            return;
                          }
                          setCurrentIndex(idx);
                        }}
                        className={`w-6 h-6 rounded text-[9px] font-extrabold flex items-center justify-center transition cursor-pointer relative ${
                          isActive 
                            ? 'bg-blue-600 text-white ring-2 ring-blue-300 font-black scale-105' 
                            : isFrozen
                            ? 'bg-slate-200 text-slate-400 border border-dashed border-slate-300 opacity-60 hover:opacity-100'
                            : isRated 
                            ? 'bg-emerald-100 text-emerald-850 hover:bg-emerald-250 border border-emerald-300' 
                            : 'bg-white text-slate-400 border border-slate-200 hover:bg-slate-150'
                        }`}
                        title={isFrozen ? `${emp.nama} (No. ${idx + 1} - Status Dibekukan Perbantuan NS)` : `${emp.nama} (${emp.noReg})`}
                      >
                        {idx + 1}
                        {isFrozen && (
                          <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-rose-500 rounded-full" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Bottom reviews access and counts */}
              <div className="flex items-center justify-between text-xs font-mono font-bold bg-slate-55 p-3 rounded-lg border border-slate-200/40">
                <span className="text-slate-500">Terisi: <strong className="text-slate-800">{ratedCount}</strong> dari {totalCount}</span>
                
                {isGroupFullyRated && hasStandardUnsubmitted && (
                  <button
                    type="button"
                    onClick={() => setShowingReview(true)}
                    className="bg-emerald-600 animate-pulse hover:bg-emerald-700 text-white text-[10px] uppercase font-bold py-1.5 px-3 rounded shadow cursor-pointer transition"
                  >
                    🔍 Lihat Nilai
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* REVIEW & CORRECTION SPREADSHEET TABLE MODE */
            <div className="space-y-4 animate-fade-in">
              <div className="p-3.5 bg-blue-50 border border-blue-150/40 text-blue-900 rounded-lg text-xs leading-relaxed flex items-start gap-2">
                <ClipboardList className="w-5 h-5 shrink-0 text-blue-600" />
                <div>
                  <span className="font-extrabold block">Tinjau Rekapitulasi Evaluasi</span>
                  <p className="mt-0.5 text-slate-650">
                    Semua karyawan grup <strong>{currentGroup}</strong> telah terisi. Harap koreksi nilai akhir di bawah jika ada kesalahan sebelum mengklik tombol Kirim.
                  </p>
                </div>
              </div>

              {/* Mobile horizontal scroll guidance */}
              <div className="md:hidden flex items-center justify-between text-[11px] text-slate-500 bg-slate-100/90 px-3 py-1.5 rounded-lg border border-slate-200/80">
                <span className="flex items-center gap-1 font-medium">
                  <span>👉</span> Geser tabel ke kanan / kiri untuk koreksi nilai
                </span>
                <span className="font-mono text-[10px] text-slate-400">↔ Scroll</span>
              </div>

              {/* Editable scrollable mini spreadsheet with responsive horizontal scroll */}
              <div className="border border-slate-200 rounded-lg max-h-80 overflow-y-auto overflow-x-auto shadow-inner bg-white">
                <table className="w-full min-w-[540px] text-xs text-left text-slate-600 border-collapse">
                  <thead className="bg-slate-900 text-slate-100 uppercase text-[10px] tracking-wide sticky top-0 font-mono">
                    <tr>
                      <th className="py-2.5 px-2 text-center w-8">No</th>
                      <th className="py-2.5 px-2">Nama / No.Reg</th>
                      <th className="py-2.5 px-2 text-center w-24">Kualitas (Nilai 1)</th>
                      <th className="py-2.5 px-2 text-center w-24">Kuantitas (Nilai 2)</th>
                      <th className="py-2.5 px-2 text-center w-14 text-emerald-400">Skor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-150">
                    {groupEmployees.filter(emp => !isEmployeeInputFrozen(emp)).map((emp, idx) => {
                      const submittedEval = getSubmittedEvaluation(emp);
                      const isSubmitted = !!submittedEval;
                      const ratings = isSubmitted 
                        ? { nil1: submittedEval.nil1, nil2: submittedEval.nil2 }
                        : (draftRatings[emp.noReg] || { nil1: 0, nil2: 0 });
                      const totalSkor = ratings.nil1 + ratings.nil2;
                      return (
                        <tr key={emp.noReg} className="hover:bg-slate-50 transition font-medium">
                          <td className="py-2 px-2 text-center text-slate-400 font-mono">{idx + 1}</td>
                          <td className="py-2 px-2">
                            <span className="font-bold text-slate-800 block uppercase max-w-[150px] truncate" title={emp.nama}>{emp.nama}</span>
                            <span className="text-[10px] text-slate-450 font-mono block">{emp.empId ? `${emp.empId} • ` : ''}{emp.noReg}</span>
                            {isSubmitted && (
                              <span className="inline-flex items-center gap-1 text-[9px] bg-emerald-50 text-emerald-800 border border-emerald-200 font-extrabold px-1.5 py-0.5 rounded mt-1 whitespace-nowrap">
                                ✓ Sudah Terkirim
                              </span>
                            )}
                            {(() => {
                              const isShiftMtc = isShiftMtcEmployee(emp);
                              if (currentGroup === 'MTC' && isShiftMtc) {
                                const shiftEval = evaluations.find(x => 
                                  isSameEmployee(x, emp) &&
                                  parseAndNormalizePeriode(x.periode).trim().toLowerCase() === parseAndNormalizePeriode(periodInfo.readable).trim().toLowerCase() &&
                                  (!!x.isSupportive || (x.grup && ['A', 'B', 'C'].includes(x.grup.toUpperCase())))
                                );
                                if (shiftEval) {
                                  return (
                                    <span className="inline-flex items-center gap-1 text-[9px] bg-amber-50 text-amber-800 border border-amber-200 font-extrabold px-1.5 py-0.5 rounded mt-1 whitespace-nowrap">
                                      ⚡ Input Shift ({shiftEval.editedBy || shiftEval.grup}): Q: {shiftEval.nil1} | T: {shiftEval.nil2} (Avg: {shiftEval.average.toFixed(1)})
                                    </span>
                                  );
                                } else {
                                  return (
                                    <span className="inline-flex items-center gap-1 text-[9px] bg-slate-50 text-slate-400 border border-slate-200 border-dashed px-1.5 py-0.5 rounded mt-1 whitespace-nowrap">
                                      ⏳ Belum ada nilai dari KSS Shift
                                    </span>
                                  );
                                }
                              } else if (['A', 'B', 'C'].includes(currentGroup) && isShiftMtc) {
                                const mtcEval = evaluations.find(x => 
                                  isSameEmployee(x, emp) &&
                                  parseAndNormalizePeriode(x.periode).trim().toLowerCase() === parseAndNormalizePeriode(periodInfo.readable).trim().toLowerCase() &&
                                  x.grup === 'MTC'
                                );
                                if (mtcEval) {
                                  return (
                                    <span className="inline-flex items-center gap-1 text-[9px] bg-sky-50 text-sky-800 border border-sky-200 font-extrabold px-1.5 py-0.5 rounded mt-1 whitespace-nowrap">
                                      🛠️ Input KSS MTC: Q: {mtcEval.nil1} | T: {mtcEval.nil2} (Avg: {mtcEval.average.toFixed(1)})
                                    </span>
                                  );
                                } else {
                                  return (
                                    <span className="inline-flex items-center gap-1 text-[9px] bg-slate-50 text-slate-400 border border-slate-200 border-dashed px-1.5 py-0.5 rounded mt-1 whitespace-nowrap">
                                      ⏳ Belum ada nilai dari KSS MTC
                                    </span>
                                  );
                                }
                              }
                              return null;
                            })()}
                          </td>
                          <td className="py-2 px-2 text-center">
                            <select
                              value={ratings.nil1}
                              onChange={(e) => handleUpdateDraftCell(emp.noReg, 'nil1', parseInt(e.target.value))}
                              disabled={isSubmitted || !periodInfo.isOpen}
                              className="bg-slate-100 hover:bg-slate-200/50 border border-slate-300 rounded text-center py-1 px-1 font-bold text-slate-800 focus:outline-none disabled:opacity-55 disabled:cursor-not-allowed"
                            >
                              <option value="1">1</option>
                              <option value="2">2</option>
                              <option value="3">3</option>
                              <option value="4">4</option>
                              <option value="5">5</option>
                            </select>
                          </td>
                          <td className="py-2 px-2 text-center">
                            <select
                              value={ratings.nil2}
                              onChange={(e) => handleUpdateDraftCell(emp.noReg, 'nil2', parseInt(e.target.value))}
                              disabled={isSubmitted || !periodInfo.isOpen}
                              className="bg-slate-100 hover:bg-slate-200/50 border border-slate-300 rounded text-center py-1 px-1 font-bold text-slate-800 focus:outline-none disabled:opacity-55 disabled:cursor-not-allowed"
                            >
                              <option value="1">1</option>
                              <option value="2">2</option>
                              <option value="3">3</option>
                              <option value="4">4</option>
                              <option value="5">5</option>
                            </select>
                          </td>
                          <td className={`py-2 px-2 text-center font-bold font-mono text-xs ${totalSkor <= 6 ? 'text-rose-600' : 'text-emerald-600'}`}>{totalSkor}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Actions for reviews */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowingReview(false)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" /> Edit Manual Row
                </button>
                {showResetConfirm ? (
                  <div className="flex items-center gap-1.5 bg-rose-50 border border-rose-200 p-1.5 rounded-lg">
                    <span className="text-[10px] font-black text-rose-700 px-1">Hapus draf?</span>
                    <button
                      type="button"
                      onClick={handleResetDrafts}
                      className="bg-rose-600 hover:bg-rose-700 text-white px-2.5 py-1 rounded-md text-[10px] font-bold transition cursor-pointer"
                    >
                      Ya
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
                    disabled={!periodInfo.isOpen}
                    className="bg-rose-50 hover:bg-rose-100 text-rose-700 py-2 px-3 rounded-lg text-xs font-bold transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Hapus Draf
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="space-y-2 pt-3 border-t border-slate-100 mt-4">
            {errorMsg && (
              <p className="text-[10px] text-rose-750 font-bold bg-rose-50 border border-rose-200 p-2 rounded text-center">
                ⚠️ {errorMsg}
              </p>
            )}

            {successMsg && (
              <p className="text-[11px] text-emerald-800 font-semibold bg-emerald-50 border border-emerald-200 p-2.5 rounded shadow-3xs text-center flex items-center justify-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{successMsg}</span>
              </p>
            )}

            {showingReview ? (
              <button
                type="button"
                onClick={handleSendBatchToSpreadsheet}
                disabled={isSubmitting || !periodInfo.isOpen}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold py-3.5 rounded-xl shadow-md transition flex items-center justify-center gap-2 cursor-pointer uppercase text-xs tracking-wider"
              >
                {isSubmitting ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>Mengirim Baris ke Google Sheets...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Kirim Data ke Spreadsheet ({groupEmployees.filter(emp => !isEmployeeInputFrozen(emp)).length} Orang)</span>
                  </>
                )}
              </button>
            ) : (
              hasStandardUnsubmitted ? (
                <button
                  type="button"
                  disabled={!isGroupFullyRated}
                  onClick={() => setShowingReview(true)}
                  className={`w-full font-extrabold py-3.5 rounded-xl text-xs tracking-wider uppercase shadow transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    isGroupFullyRated 
                      ? 'bg-blue-600 hover:bg-blue-700 text-white animate-bounce shadow-md shadow-blue-500/20' 
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                  }`}
                >
                  <Table className="w-4 h-4" />
                  <span>Lihat Nilai ({ratedCount} / {totalCount})</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowingReview(true)}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-3.5 rounded-xl text-xs tracking-wider uppercase shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Table className="w-4 h-4" />
                  <span>Tinjau & Kirim Ulang Nilai ({totalCount} Orang)</span>
                </button>
              )
            )}
          </div>
        </div>
      )}

      {/* Dynamic Duplicate Batch Resolution Overlay */}
      {duplicateBatchCheck && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-3xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-slate-200 flex flex-col space-y-4">
            <div className="flex items-center gap-3 text-amber-600 border-b pb-3 border-slate-100">
              <div className="p-1.5 bg-amber-50 rounded-lg animate-pulse">
                <AlertCircle className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-850 uppercase tracking-wider">
                  ⚠️ Data Ganda Terdeteksi
                </h4>
                <p className="text-[10px] text-slate-400 font-medium font-mono">Grup {currentGroup} • Periode {periodInfo.readable}</p>
              </div>
            </div>

            <div className="space-y-3 text-xs leading-relaxed text-slate-600">
              <p>
                Beberapa karyawan dalam draf pengiriman ini sudah memiliki data evaluasi untuk periode <strong>{periodInfo.readable}</strong> di Google Spreadsheet.
              </p>

              <div className="grid grid-cols-3 gap-2.5 bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-center font-mono">
                <div>
                  <div className="text-[10px] text-slate-450 uppercase font-sans font-bold">Total Draf</div>
                  <div className="text-sm font-black text-slate-800">{groupEmployees.length}</div>
                </div>
                <div>
                  <div className="text-[10px] text-amber-550 uppercase font-sans font-bold">Terdaftar</div>
                  <div className="text-sm font-black text-amber-600">{duplicateBatchCheck.dupes.length}</div>
                </div>
                <div>
                  <div className="text-[10px] text-emerald-550 uppercase font-sans font-bold">Baru (Terlewat)</div>
                  <div className="text-sm font-black text-emerald-600">{duplicateBatchCheck.news.length}</div>
                </div>
              </div>

              {duplicateBatchCheck.news.length > 0 ? (
                <div>
                  <label className="block text-[10px] font-bold text-slate-450 uppercase tracking-wider mb-1">
                    Operator Baru yang Belum Dinilai/Kirim:
                  </label>
                  <div className="max-h-24 overflow-y-auto px-2.5 py-2 bg-emerald-50/50 border border-emerald-100 rounded-md text-[11px] font-bold text-emerald-800 flex flex-wrap gap-1.5">
                    {duplicateBatchCheck.news.map(emp => (
                      <span key={emp.noReg} className="bg-emerald-100 px-1.5 py-0.5 rounded text-[10px] font-mono shadow-3xs">
                        {emp.nama} ({emp.noReg})
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-amber-50 border border-amber-100 text-amber-850 rounded-lg text-[11px] font-semibold">
                  Semua karyawan dalam draf grup ini sebenarnya sudah dikirim sebelumnya ke Spreadsheet untuk periode ini.
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2 pt-2">
              {duplicateBatchCheck.news.length > 0 && (
                <button
                  type="button"
                  onClick={() => executeBatchSubmissions(duplicateBatchCheck.news)}
                  className="w-full py-2.5 text-center text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition active:scale-[0.99] cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" /> Kirim Hanya Data Baru ({duplicateBatchCheck.news.length} Orang)
                </button>
              )}

              {/* Overwrite button restricted to ADMIN MODE ('ALL') */}
              {currentGroup === 'ALL' ? (
                <button
                  type="button"
                  onClick={() => executeBatchSubmissions(groupEmployees)}
                  className="w-full py-2 text-center text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg border border-amber-200 transition active:scale-[0.99] cursor-pointer"
                >
                  Tetap Kirim & Timpa Semua ({groupEmployees.length} Orang)
                </button>
              ) : (
                <div className="p-2.5 bg-slate-50 border border-dashed border-slate-200 rounded-md text-[10.5px] text-slate-500 text-center italic">
                  Opsi "Tetap Kirim & Timpa Semua" ditutup & hanya dapat diakses oleh Admin Utama.
                </div>
              )}

              <button
                type="button"
                onClick={() => setDuplicateBatchCheck(null)}
                className="w-full py-2 text-center text-xs font-bold text-slate-500 hover:bg-slate-150 rounded-lg border border-slate-200 transition cursor-pointer"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dynamic Duplicate Manual Resolution Overlay */}
      {duplicateManualCheck && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-3xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 border border-slate-200 flex flex-col space-y-4">
            <div className="flex items-center gap-2 text-amber-655 border-b pb-3 border-slate-100">
              <div className="p-1.5 bg-amber-50 rounded-lg">
                <AlertCircle className="w-5 h-5 text-amber-500" />
              </div>
              <h4 className="text-sm font-bold text-slate-855 uppercase tracking-wider">
                Karyawan Sudah Dinilai!
              </h4>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Karyawan <strong>{duplicateManualCheck.nama} ({duplicateManualCheck.noReg})</strong> sudah memiliki data evaluasi untuk periode <strong>{periodInfo.readable}</strong> di Google Spreadsheet.
            </p>
            
            <p className="text-xs font-semibold text-slate-500 leading-relaxed">
              Apakah Anda ingin mengirim ulang untuk memperbarui/menimpa nilai di Google Spreadsheet?
            </p>

            <div className="flex gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDuplicateManualCheck(null)}
                className="flex-1 py-1.5 text-center text-xs font-bold text-slate-500 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors cursor-pointer"
              >
                Batal
              </button>
              {currentGroup === 'ALL' ? (
                <button
                  type="button"
                  onClick={executeManualSubmission}
                  className="flex-1 py-1.5 text-center text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors cursor-pointer"
                >
                  Ya, Kirim Ulang
                </button>
              ) : (
                <div className="flex-1 px-2.5 py-1.5 text-[10px] text-center text-amber-700 bg-amber-50 rounded-md border border-amber-100 font-bold">
                  Akses Admin Diperlukan
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
