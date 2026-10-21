/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Bell, Megaphone, Clock, AlertCircle, X, Check, Send, 
  Trash2, ExternalLink, HelpCircle, Volume2, Info, MessageCircle
} from 'lucide-react';
import { PREPOPULATED_EMPLOYEES, GROUPS } from '../data';
import { Evaluation, Employee, KssContact } from '../types';
import { 
  isFirebaseActive, 
  listenToAnnouncements, 
  saveCloudAnnouncement, 
  deleteCloudAnnouncement 
} from '../firebase';
import { MONTH_NAMES_ID, isSameEmployee } from '../utils';

interface NotificationBellProps {
  evaluations: Evaluation[];
  activeGroup: string;
  onShowAlert?: (title: string, message: string) => void;
  employees?: Employee[];
  kssContacts?: KssContact[];
}

interface Announcement {
  id: string;
  text: string;
  createdAt: string;
}

// Chime sound generator using browser AudioContext
export function playNotificationSound() {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // First chime
    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    osc1.connect(gain1);
    gain1.connect(audioCtx.destination);
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
    gain1.gain.setValueAtTime(0.12, audioCtx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.35);
    osc1.start(audioCtx.currentTime);
    osc1.stop(audioCtx.currentTime + 0.35);
    
    // Second chime slightly delayed and higher pitch
    setTimeout(() => {
      const osc2 = audioCtx.createOscillator();
      const gain2 = audioCtx.createGain();
      osc2.connect(gain2);
      gain2.connect(audioCtx.destination);
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(659.25, audioCtx.currentTime); // E5
      gain2.gain.setValueAtTime(0.12, audioCtx.currentTime);
      gain2.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.45);
      osc2.start(audioCtx.currentTime);
      osc2.stop(audioCtx.currentTime + 0.45);
    }, 130);
  } catch (err) {
    console.warn('Playback of system chime blocked/unsupported:', err);
  }
}

// Loud digital alarm siren sound generator
export function playAlarmSound() {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const now = audioCtx.currentTime;
    
    const playBeep = (startTime: number, duration: number, freq: number) => {
      const osc = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      osc.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, startTime);
      
      gainNode.gain.setValueAtTime(0.15, startTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    // Urgent dual sawtooth beeps
    playBeep(now, 0.15, 880);
    playBeep(now + 0.2, 0.15, 880);
    playBeep(now + 0.4, 0.15, 1100);
    playBeep(now + 0.6, 0.3, 1100);
  } catch (err) {
    console.warn('Playback of system alarm sound blocked/unsupported:', err);
  }
}

export default function NotificationBell({ evaluations, activeGroup, onShowAlert, employees, kssContacts = [] }: NotificationBellProps) {
  const employeeSource = employees || PREPOPULATED_EMPLOYEES;
  const [isOpen, setIsOpen] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [newAnnouncementText, setNewAnnouncementText] = useState('');
  const [isSubmittingAnnouncement, setIsSubmittingAnnouncement] = useState(false);
  const [simulatedTime, setSimulatedTime] = useState(false); // Mode simulasi alarm tanggal >= 15
  const [dismissedReminderDate, setDismissedReminderDate] = useState<string>('');
  const [isAlarmModalOpen, setIsAlarmModalOpen] = useState(false);
  const [waRecipient, setWaRecipient] = useState('');
  const [selectedWaGroup, setSelectedWaGroup] = useState('');
  const [hasUnread, setHasUnread] = useState(false);
  const [sentBroadcastGroups, setSentBroadcastGroups] = useState<string[]>([]);
  const [broadcastingAnnId, setBroadcastingAnnId] = useState<string | null>(null);
  const [sentAnnBroadcastGroups, setSentAnnBroadcastGroups] = useState<string[]>([]);

  // Load announcements from Firestore or localStorage
  useEffect(() => {
    let unsubscribe = () => {};
    if (isFirebaseActive) {
      unsubscribe = listenToAnnouncements((items) => {
        setAnnouncements(items);
        if (items.length > 0) {
          const lastSeen = localStorage.getItem('last_seen_announcement_id');
          if (lastSeen !== items[0].id) {
            setHasUnread(true);
            playNotificationSound();
          }
        }
      });
    } else {
      const stored = localStorage.getItem('local_announcements');
      if (stored) {
        try {
          setAnnouncements(JSON.parse(stored));
        } catch {}
      }
    }
    return () => unsubscribe();
  }, []);

  // Sync locally stored announcements if firebase is inactive
  const saveLocalAnnouncement = (newAnn: Announcement) => {
    const list = [newAnn, ...announcements];
    setAnnouncements(list);
    localStorage.setItem('local_announcements', JSON.stringify(list));
  };

  const removeLocalAnnouncement = (id: string) => {
    const list = announcements.filter(a => a.id !== id);
    setAnnouncements(list);
    localStorage.setItem('local_announcements', JSON.stringify(list));
  };

  // Check today's date and time
  const today = new Date();
  const todayDateStr = today.toISOString().split('T')[0]; // format YYYY-MM-DD
  const currentDay = today.getDate();
  const currentHour = today.getHours();

  // Determine if reminder period is active (aktif sepanjang hari mulai dari tanggal 15)
  const isReminderPeriodActive = simulatedTime || (currentDay >= 15);

  // Get current Indonesian month readable string
  const currentMonthName = MONTH_NAMES_ID[today.getMonth()];
  const currentPeriodReadable = `${currentMonthName} ${today.getFullYear()}`;

  // Get Deadline Date string (21st of current month)
  const getDeadlineString = () => {
    const year = today.getFullYear();
    const month = today.getMonth();
    const deadlineDate = new Date(year, month, 21);
    const daysId = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const dayName = daysId[deadlineDate.getDay()];
    return `${dayName}, 21 ${MONTH_NAMES_ID[month]} ${year}`;
  };

  const deadlineString = getDeadlineString();

  // Helper to find incomplete groups
  const getIncompleteGroups = () => {
    const allGroups = ['A', 'B', 'C', 'NS', 'MTC', 'LAB', 'QC'];
    return allGroups.filter(g => {
      const groupEmps = employeeSource.filter(emp => emp.grup === g);
      if (groupEmps.length === 0) return false;
      // Group is incomplete if at least one employee has not been inputted for current period
      return groupEmps.some(emp => {
        return !evaluations.some(e => 
          isSameEmployee(e, emp) && 
          e.periode.trim().toLowerCase() === currentPeriodReadable.trim().toLowerCase()
        );
      });
    });
  };

  const incompleteGroups = getIncompleteGroups();
  
  // Determine if this specific user has an active reminder
  const isUserReminderActive = () => {
    if (!isReminderPeriodActive) return false;
    if (activeGroup === 'NONE') return false;
    
    if (activeGroup === 'ALL') {
      // Admin sees if ANY group is incomplete
      return incompleteGroups.length > 0;
    } else {
      // Standard group sees if their own group is incomplete
      return incompleteGroups.includes(activeGroup);
    }
  };

  const isReminderDue = isUserReminderActive();

  // Check if alarm should ring (reminder is due, and has not been dismissed today)
  useEffect(() => {
    const dismissedToday = localStorage.getItem(`dismissed_reminder_${todayDateStr}_${activeGroup}`);
    if (isReminderDue && dismissedToday !== 'true') {
      setIsAlarmModalOpen(true);
      playAlarmSound();
      
      // Ring alarm again after some seconds if not answered, but don't loop infinitely
      const interval = setInterval(() => {
        const stillDismissed = localStorage.getItem(`dismissed_reminder_${todayDateStr}_${activeGroup}`);
        if (isReminderDue && stillDismissed !== 'true') {
          playAlarmSound();
        } else {
          clearInterval(interval);
        }
      }, 8000); // sound every 8s until acknowledged or completed

      return () => clearInterval(interval);
    } else {
      setIsAlarmModalOpen(false);
    }
  }, [isReminderDue, todayDateStr, activeGroup]);

  // Handle acknowledging / opening the reminder
  const handleAcknowledgeReminder = () => {
    localStorage.setItem(`dismissed_reminder_${todayDateStr}_${activeGroup}`, 'true');
    setIsAlarmModalOpen(false);
    if (onShowAlert) {
      onShowAlert('Alarm Dimatikan', 'Pengingat berhasil dibaca. Alarm tidak akan berbunyi lagi hari ini selama data belum terisi penuh.');
    }
  };

  // Admin template broadcast function
  const handleSendAnnouncement = async () => {
    if (!newAnnouncementText.trim()) return;
    setIsSubmittingAnnouncement(true);
    const id = 'ann_' + Date.now();
    const success = await saveCloudAnnouncement(id, newAnnouncementText.trim());
    if (!success) {
      // Fallback to local device storage
      saveLocalAnnouncement({
        id,
        text: newAnnouncementText.trim(),
        createdAt: new Date().toISOString()
      });
    }
    setNewAnnouncementText('');
    setIsSubmittingAnnouncement(false);
    if (onShowAlert) {
      onShowAlert('Pesan Disiarkan', 'Pengumuman penting berhasil dikirim ke seluruh pengguna secara real-time!');
    }
  };

  const handleDeleteAnnouncement = async (id: string) => {
    if (isFirebaseActive) {
      await deleteCloudAnnouncement(id);
    } else {
      removeLocalAnnouncement(id);
    }
  };

  const getAppUrl = (): string => {
    const origin = window.location.origin;
    if (
      origin.includes('ais-dev-') || 
      origin.includes('ais-pre-') || 
      origin.includes('localhost') || 
      origin.includes('127.0.0.1')
    ) {
      return 'https://form-penilaian-karyawan-543541790120.asia-southeast1.run.app';
    }
    return origin;
  };

  // Compile WhatsApp prefilled template URL
  const getWhatsAppURLForContact = (group: string, phone: string) => {
    const appUrl = getAppUrl();
    const textTemplate = `⏰*REMINDER INPUT NILAI*

Menginfokan bahwa Penilaian untuk *Grup ${group}* belum diinput ke dalam sistem.

Mohon diisi sebelum *${deadlineString}*. Terima kasih atas perhatian dan kerjasamanya. 🙏

🔗 *Link Aplikasi Penilaian:*
👉 ${appUrl}`;

    return `https://api.whatsapp.com/send?phone=${phone.replace(/[^0-9]/g, '')}&text=${encodeURIComponent(textTemplate)}`;
  };

  const getWhatsAppURL = (group: string) => {
    return getWhatsAppURLForContact(group, waRecipient);
  };

  // Prepare dynamic template string for rendering
  const getReminderTemplateText = () => {
    const targetGroupText = activeGroup === 'ALL' 
      ? incompleteGroups.map(g => `Grup ${g}`).join('/')
      : `Grup ${activeGroup}`;
    const appUrl = getAppUrl();

    return `⏰REMINDER INPUT NILAI

Menginfokan bahwa Penilaian untuk ${targetGroupText} belum diinput ke dalam sistem.

Mohon diisi sebelum [Hari/Tanggal]. Terima kasih atas perhatian dan kerjasamanya. 🙏

🔗 Link Aplikasi:
${appUrl}`;
  };

  const currentReminderText = getReminderTemplateText().replace('[Hari/Tanggal]', deadlineString);

  return (
    <div className="relative inline-block">
      {/* Bell Button */}
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          setHasUnread(false);
          if (announcements.length > 0) {
            localStorage.setItem('last_seen_announcement_id', announcements[0].id);
          }
        }}
        className={`relative p-2 rounded-full transition cursor-pointer flex items-center justify-center ${
          isOpen 
            ? 'bg-blue-100 text-blue-700' 
            : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
        }`}
        title="Notifikasi & Reminder"
      >
        <Bell className={`w-5 h-5 ${isReminderDue ? 'animate-bounce text-rose-500' : ''}`} />
        
        {/* Red dot for active alarm/reminder */}
        {isReminderDue && (
          <span className="absolute -top-1 -right-1 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
          </span>
        )}

        {/* Green/Blue dot for unread announcements */}
        {!isReminderDue && hasUnread && (
          <span className="absolute top-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white"></span>
        )}
      </button>

      {/* Notifications dropdown panel */}
      {isOpen && (
        <div className="absolute right-0 mt-3 w-[calc(100vw-32px)] sm:w-96 max-w-sm bg-white rounded-xl shadow-2xl border border-slate-200 z-[100] animate-fade-in flex flex-col max-h-[80vh] overflow-y-auto">
          {/* Header */}
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 rounded-t-xl">
            <div className="flex items-center gap-1.5 font-bold text-slate-800 text-xs uppercase tracking-wider">
              <Bell className="w-4 h-4 text-blue-600" />
              <span>Notifikasi & Pengingat</span>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-1 hover:bg-slate-200 rounded-md text-slate-400 hover:text-slate-600 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-4 space-y-4 text-xs">
            {/* Alarm Simulator Toggle for easy testing */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-slate-500" />
                  <div>
                    <span className="font-bold text-[10px] text-slate-700 uppercase tracking-wider block">Mode Simulasi Alarm</span>
                    <span className="text-[9px] text-slate-500">Paksa aktif tanggal &gt;= 15</span>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={simulatedTime} 
                    onChange={(e) => {
                      setSimulatedTime(e.target.checked);
                      if (e.target.checked) playAlarmSound();
                    }}
                    className="sr-only peer" 
                  />
                  <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
              <button
                type="button"
                onClick={() => playAlarmSound()}
                className="w-full py-1.5 px-2.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-700 rounded text-[9.5px] font-bold flex items-center justify-center gap-1 cursor-pointer transition active:scale-[0.97]"
              >
                <Volume2 className="w-3.5 h-3.5" /> Tes Suara Nada Alarm (Siren)
              </button>
            </div>

            {/* Reminder Block */}
            {isReminderDue ? (
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 space-y-2.5 animate-pulse-subtle">
                <div className="flex items-center gap-1.5 text-rose-700 font-bold uppercase tracking-wider text-[10px]">
                  <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                  <span>Alarm Pengingat Aktif</span>
                </div>
                
                <div className="bg-white p-2.5 rounded-lg border border-rose-100 font-mono text-[10.5px] leading-relaxed whitespace-pre-wrap text-slate-800 shadow-3xs">
                  {currentReminderText}
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleAcknowledgeReminder}
                    className="flex-1 py-1.5 px-3 bg-rose-600 hover:bg-rose-700 text-white font-extrabold uppercase text-[10px] rounded-md transition shadow-sm flex items-center justify-center gap-1"
                  >
                    <Check className="w-3 h-3" /> Buka Notifikasi & Matikan Alarm
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-emerald-50 border border-emerald-150 rounded-xl p-3 text-emerald-800 flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <div>
                  <span className="font-bold block text-[10px] uppercase">Semua Penilaian Aman</span>
                  <p className="text-[9.5px] text-slate-600 mt-0.5">Tidak ada grup yang terlambat mengisi data bulan berjalan.</p>
                </div>
              </div>
            )}

            {/* Admin Announcement Creator Block */}
            {activeGroup === 'ALL' && (
              <div className="bg-blue-50/50 border border-blue-150/50 rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-center gap-1.5 text-blue-800 font-bold uppercase tracking-wider text-[10px]">
                  <Megaphone className="w-4 h-4 text-blue-600" />
                  <span>Siarkan Pengumuman Baru</span>
                </div>
                <div className="space-y-2">
                  <textarea
                    value={newAnnouncementText}
                    onChange={(e) => setNewAnnouncementText(e.target.value)}
                    placeholder="Tulis pesan pengumuman penting untuk semua user..."
                    rows={2}
                    className="w-full p-2 border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={handleSendAnnouncement}
                    disabled={isSubmittingAnnouncement || !newAnnouncementText.trim()}
                    className="w-full py-1.5 px-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-bold uppercase text-[10px] rounded-md transition flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" /> Kirim Siaran Pengumuman
                  </button>
                </div>
              </div>
            )}

            {/* WhatsApp Integration Guidance Block */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">Integrasi WhatsApp Otomatis</span>
                <span className="px-1.5 py-0.5 bg-slate-200 text-slate-600 rounded text-[8px] font-black uppercase">Persiapan</span>
              </div>
              
              <div className="space-y-2 text-[10.5px] text-slate-650 leading-relaxed list-decimal pl-1">
                <p><strong>Persiapan Teknis agar WhatsApp Otomatis Mengirim Pengingat:</strong></p>
                <div className="space-y-1.5 text-[10px] bg-white p-2.5 rounded-lg border border-slate-150 font-medium text-slate-600">
                  <div>
                    <span className="font-bold text-slate-800">1. WhatsApp API Gateway</span>
                    <p>Memerlukan akun gateway pihak ketiga (contoh: <strong>Fonnte</strong>, <strong>Wablas</strong>, atau <strong>Green API</strong>) untuk menghubungkan akun WA via QR code.</p>
                  </div>
                  <div>
                    <span className="font-bold text-slate-800">2. Server/Cron Job</span>
                    <p>Membuat script script di server (Node.js / Cloud Function) yang dijadwalkan otomatis (cron job) berjalan setiap hari mulai tanggal 15 di jam 12.00 WIB.</p>
                  </div>
                  <div>
                    <span className="font-bold text-slate-800">3. Filter Database</span>
                    <p>Script server tersebut membaca Firestore/Spreadsheet untuk mendapatkan daftar grup yang belum selesai, mengambil nomor telepon KSS dari profil, lalu mengirim pesan via HTTP API Gateway.</p>
                  </div>
                </div>

                {/* Manual WA Trigger Tool for Admin */}
                {activeGroup === 'ALL' && incompleteGroups.length > 0 && (
                  <div className="border-t pt-2.5 mt-2 space-y-2">
                    <span className="font-bold text-[10px] text-slate-700 block uppercase">Kirim WA Manual (Sekarang)</span>
                    <div className="space-y-1.5">
                      <div className="flex gap-1.5 items-center">
                        <select
                          value={selectedWaGroup}
                          onChange={(e) => {
                            const groupVal = e.target.value;
                            setSelectedWaGroup(groupVal);
                            if (groupVal === 'BROADCAST') {
                              setWaRecipient('');
                            } else if (groupVal) {
                              const contact = kssContacts.find(c => c.group === groupVal);
                              if (contact && contact.phone) {
                                setWaRecipient(contact.phone);
                              } else {
                                setWaRecipient('');
                              }
                            } else {
                              setWaRecipient('');
                            }
                          }}
                          className="w-full p-1 border border-slate-200 rounded text-[10px] font-bold bg-white text-slate-700 cursor-pointer focus:outline-none"
                        >
                          <option value="">Pilih Grup Tujuan...</option>
                          <option value="BROADCAST" className="text-blue-700 font-extrabold">📢 Kirim Broadcast ke Semua KSS...</option>
                          {incompleteGroups.map(g => {
                            const contact = kssContacts.find(c => c.group === g);
                            const suffix = contact && contact.phone ? ` (${contact.name})` : ' (No Belum Diatur)';
                            return (
                              <option key={g} value={g}>WA Grup {g}{suffix}</option>
                            );
                          })}
                        </select>
                      </div>

                      {selectedWaGroup === 'BROADCAST' ? (
                        <div className="p-2.5 bg-blue-50/50 border border-blue-100 rounded-lg space-y-2 text-[11px] animate-fade-in">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-blue-800 uppercase text-[9px] tracking-wider">Asisten Broadcast WA</span>
                            <button 
                              type="button"
                              onClick={() => setSentBroadcastGroups([])}
                              className="text-[9px] text-blue-600 hover:underline font-bold cursor-pointer"
                            >
                              Reset Status
                            </button>
                          </div>
                          
                          <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1">
                            {incompleteGroups.map(g => {
                              const contact = kssContacts.find(c => c.group === g);
                              const target = {
                                group: g,
                                name: contact ? contact.name : `KSS Grup ${g}`,
                                phone: contact ? contact.phone : '',
                              };
                              const isSent = sentBroadcastGroups.includes(target.group);
                              const hasNoPhone = !target.phone;
                              
                              return (
                                <div key={target.group} className="flex items-center justify-between bg-white border border-slate-150 p-1.5 rounded-md">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5">
                                      <span className="px-1 bg-slate-100 text-[8.5px] font-extrabold rounded uppercase text-slate-600">Grup {target.group}</span>
                                      <span className="font-semibold text-slate-700 truncate max-w-[100px] text-[10px]">{target.name}</span>
                                    </div>
                                    <span className="text-[9px] text-slate-400 font-mono block">
                                      {hasNoPhone ? '⚠️ No Belum Diatur' : `+${target.phone}`}
                                    </span>
                                  </div>
                                  
                                  {hasNoPhone ? (
                                    <span className="text-[8.5px] text-slate-400 font-bold italic">N/A</span>
                                  ) : isSent ? (
                                    <span className="text-[8.5px] text-emerald-600 font-extrabold flex items-center gap-0.5">
                                      ✓ Terbuka
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const url = getWhatsAppURLForContact(target.group, target.phone);
                                        window.open(url, '_blank');
                                        if (!sentBroadcastGroups.includes(target.group)) {
                                          setSentBroadcastGroups([...sentBroadcastGroups, target.group]);
                                        }
                                      }}
                                      className="px-1.5 py-0.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-[8.5px] font-bold rounded transition cursor-pointer"
                                    >
                                      Kirim
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          {/* Sequential Next Button */}
                          {(() => {
                            const validTargets = incompleteGroups.map(g => {
                              const contact = kssContacts.find(c => c.group === g);
                              return {
                                group: g,
                                name: contact ? contact.name : `KSS Grup ${g}`,
                                phone: contact ? contact.phone : '',
                              };
                            }).filter(t => t.phone);
                            
                            const nextUnsent = validTargets.find(t => !sentBroadcastGroups.includes(t.group));
                            const validCount = validTargets.length;
                            
                            if (validCount === 0) {
                              return (
                                <p className="text-[10px] text-amber-700 text-center font-bold bg-amber-50 p-1.5 border border-amber-200 rounded">
                                  ⚠️ Tidak ada nomor WA KSS yang dikonfigurasi. Silakan isi di tab Kontak WA KSS.
                                </p>
                              );
                            }

                            if (!nextUnsent) {
                              return (
                                <div className="p-2 bg-emerald-50 border border-emerald-200 rounded text-center space-y-1">
                                  <p className="text-[10.5px] text-emerald-850 font-extrabold">🎉 Broadcast Selesai!</p>
                                  <p className="text-[9.5px] text-emerald-700">Semua {validCount} WhatsApp pengingat telah dibuka.</p>
                                </div>
                              );
                            }

                            return (
                              <button
                                type="button"
                                onClick={() => {
                                  const url = getWhatsAppURLForContact(nextUnsent.group, nextUnsent.phone);
                                  window.open(url, '_blank');
                                  setSentBroadcastGroups([...sentBroadcastGroups, nextUnsent.group]);
                                }}
                                className="w-full py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-[10px] font-black uppercase tracking-wider transition cursor-pointer shadow-3xs flex items-center justify-center gap-1 active:scale-[0.98]"
                              >
                                Kirim Berikutnya: Grup {nextUnsent.group} ({nextUnsent.name})
                              </button>
                            );
                          })()}
                        </div>
                      ) : (
                        <div className="flex gap-1.5 items-center">
                          <input
                            type="tel"
                            value={waRecipient}
                            onChange={(e) => setWaRecipient(e.target.value)}
                            placeholder="No. WA (Contoh: 628123456789)"
                            className="flex-1 p-1 border border-slate-200 rounded text-[10px] focus:outline-none font-mono"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (!selectedWaGroup) {
                                if (onShowAlert) {
                                  onShowAlert('Grup Belum Dipilih', 'Silakan pilih grup tujuan terlebih dahulu dari daftar.');
                                }
                                return;
                              }
                              if (!waRecipient.trim()) {
                                if (onShowAlert) {
                                  onShowAlert('Nomor Kosong', 'Silakan masukkan nomor telepon WhatsApp tujuan.');
                                }
                                return;
                              }
                              const url = getWhatsAppURLForContact(selectedWaGroup, waRecipient);
                              window.open(url, '_blank');
                            }}
                            className="p-1 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-wider rounded transition cursor-pointer active:scale-95 shadow-3xs shrink-0"
                          >
                            Kirim WA
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Announcement Board */}
            <div className="space-y-2 border-t pt-3">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Papan Informasi Departemen</span>
              {announcements.length === 0 ? (
                <p className="text-slate-400 italic text-[10px] text-center py-2">Belum ada pengumuman baru dari Administrator.</p>
              ) : (
                <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                  {announcements.map((ann) => (
                    <div key={ann.id} className="p-2.5 bg-slate-50 border border-slate-150 rounded-lg space-y-1 relative group">
                      {activeGroup === 'ALL' && (
                        <button
                          type="button"
                          onClick={() => handleDeleteAnnouncement(ann.id)}
                          className="absolute right-1.5 top-1.5 p-0.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded opacity-0 group-hover:opacity-100 transition duration-150 cursor-pointer animate-fade-in"
                          title="Hapus Pengumuman"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                      <p className="text-[11px] text-slate-700 leading-relaxed font-semibold pr-4">{ann.text}</p>
                      
                      <div className="flex items-center justify-between text-[8px] text-slate-400 font-mono pt-1">
                        <span>📢 {new Date(ann.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        
                        {activeGroup === 'ALL' && (
                          <button
                            type="button"
                            onClick={() => {
                              if (broadcastingAnnId === ann.id) {
                                setBroadcastingAnnId(null);
                              } else {
                                setBroadcastingAnnId(ann.id);
                                setSentAnnBroadcastGroups([]);
                              }
                            }}
                            className="px-1.5 py-0.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded font-bold text-[8.5px] uppercase flex items-center gap-0.5 cursor-pointer transition active:scale-95"
                          >
                            <Send className="w-2.5 h-2.5" /> Broadcast WA
                          </button>
                        )}
                      </div>

                      {/* Accordion panel for broadcasting this specific announcement */}
                      {activeGroup === 'ALL' && broadcastingAnnId === ann.id && (
                        <div className="mt-2 p-2 bg-emerald-50/50 border border-emerald-100 rounded-md space-y-1.5 text-[9.5px]">
                          <div className="flex items-center justify-between font-bold text-emerald-800 text-[8.5px] uppercase tracking-wider">
                            <span>Kirim ke WA KSS</span>
                            <button
                              type="button"
                              onClick={() => setSentAnnBroadcastGroups([])}
                              className="text-blue-600 hover:underline cursor-pointer"
                            >
                              Reset Status
                            </button>
                          </div>
                          
                          <div className="space-y-1 max-h-[120px] overflow-y-auto pr-0.5">
                            {['A', 'B', 'C', 'NS', 'MTC', 'LAB', 'QC'].map(g => {
                              const contact = kssContacts.find(c => c.group === g);
                              const target = {
                                group: g,
                                name: contact ? contact.name : `KSS Grup ${g}`,
                                phone: contact ? contact.phone : '',
                              };
                              const isSent = sentAnnBroadcastGroups.includes(target.group);
                              const hasNoPhone = !target.phone;
                              
                              return (
                                <div key={target.group} className="flex items-center justify-between bg-white p-1 rounded border border-slate-100 text-[9px]">
                                  <div className="truncate pr-1">
                                    <span className="font-extrabold text-slate-700 text-[8px] bg-slate-100 px-1 rounded uppercase mr-1">Grup {target.group}</span>
                                    <span className="text-slate-600 font-semibold">{target.name}</span>
                                  </div>
                                  {hasNoPhone ? (
                                    <span className="text-[8px] text-slate-400 italic">No Belum Diatur</span>
                                  ) : isSent ? (
                                    <span className="text-[8.5px] text-emerald-600 font-extrabold">Terbuka ✓</span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const appUrl = getAppUrl();
                                        const formattedText = `📢 *PENGUMUMAN DEPARTEMEN YARN DYEING* (Grup ${target.group})
                                        
${ann.text}

Mohon dapat diperhatikan dan diinfokan kepada seluruh rekan-rekan. Terima kasih. 🙏

🔗 *Link Aplikasi:*
👉 ${appUrl}`;
                                        const url = `https://api.whatsapp.com/send?phone=${target.phone.replace(/[^0-9]/g, '')}&text=${encodeURIComponent(formattedText)}`;
                                        window.open(url, '_blank');
                                        if (!sentAnnBroadcastGroups.includes(target.group)) {
                                          setSentAnnBroadcastGroups([...sentAnnBroadcastGroups, target.group]);
                                        }
                                      }}
                                      className="px-1.5 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[8.5px] font-bold transition cursor-pointer"
                                    >
                                      Kirim
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          {/* Sequential Broadcast to all KSS */}
                          {(() => {
                            const validTargets = ['A', 'B', 'C', 'NS', 'MTC', 'LAB', 'QC'].map(g => {
                              const contact = kssContacts.find(c => c.group === g);
                              return {
                                group: g,
                                name: contact ? contact.name : `KSS Grup ${g}`,
                                phone: contact ? contact.phone : '',
                              };
                            }).filter(t => t.phone);
                            
                            const nextUnsent = validTargets.find(t => !sentAnnBroadcastGroups.includes(t.group));
                            const validCount = validTargets.length;
                            
                            if (validCount > 0 && nextUnsent) {
                              return (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const appUrl = getAppUrl();
                                    const formattedText = `📢 *PENGUMUMAN DEPARTEMEN YARN DYEING* (Grup ${nextUnsent.group})
                                    
${ann.text}

Mohon dapat diperhatikan dan diinfokan kepada seluruh rekan-rekan. Terima kasih. 🙏

🔗 *Link Aplikasi:*
👉 ${appUrl}`;
                                    const url = `https://api.whatsapp.com/send?phone=${nextUnsent.phone.replace(/[^0-9]/g, '')}&text=${encodeURIComponent(formattedText)}`;
                                    window.open(url, '_blank');
                                    setSentAnnBroadcastGroups([...sentAnnBroadcastGroups, nextUnsent.group]);
                                  }}
                                  className="w-full py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-[8.5px] font-black uppercase tracking-wider transition cursor-pointer text-center shadow-3xs"
                                >
                                  Kirim Berikutnya: Grup {nextUnsent.group} ({nextUnsent.name})
                                </button>
                              );
                            }
                            if (validCount > 0 && !nextUnsent) {
                              return (
                                <p className="text-[8.5px] text-emerald-800 text-center font-bold bg-emerald-100 p-1 rounded">
                                  🎉 Semua KSS telah terkirim!
                                </p>
                              );
                            }
                            return null;
                          })()}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* Alarm Full-Overlay Modal (Rings prominently on the screen with dynamic height) */}
      {isAlarmModalOpen && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 z-[9999] animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-4 sm:p-5 border-2 sm:border-4 border-rose-500/30 flex flex-col max-h-[90vh] my-auto animate-bounce-subtle text-left overflow-hidden">
            
            {/* Header: Fixed top */}
            <div className="shrink-0 flex items-center justify-between pb-2.5 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 sm:w-10 sm:h-10 bg-rose-50 border border-rose-200 text-rose-500 rounded-full flex items-center justify-center shrink-0 animate-pulse">
                  <Bell className="w-5 h-5 text-rose-600 animate-bounce" />
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-black text-rose-600 uppercase tracking-wide">⏰ REMINDER UTAMA INPUT NILAI</h3>
                  <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Departemen Yarn Dyeing</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleAcknowledgeReminder}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-100 transition cursor-pointer"
                title="Tutup Pengingat"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body: Scrollable middle area */}
            <div className="flex-1 overflow-y-auto min-h-0 py-3 space-y-3 pr-1 text-left">
              {/* Reminder Text Preview */}
              <div className="space-y-1">
                <span className="text-[9.5px] font-extrabold text-slate-500 uppercase tracking-wider block">Format Pesan Pengingat:</span>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 font-mono text-[10.5px] sm:text-[11px] leading-relaxed whitespace-pre-wrap text-slate-800 shadow-3xs">
                  {currentReminderText}
                </div>
              </div>

              {/* WhatsApp Broadcast Feature Section */}
              <div className="p-3 bg-emerald-50/40 border border-emerald-100 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-emerald-700 uppercase tracking-wider flex items-center gap-1.5">
                    <MessageCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                    {activeGroup === 'ALL' ? 'Broadcast WA Kepala Grup (KSS)' : 'Bagikan Pengingat Ke WA Shift'}
                  </span>
                  {activeGroup === 'ALL' && (
                    <button 
                      type="button"
                      onClick={() => setSentBroadcastGroups([])}
                      className="text-[9px] text-blue-600 hover:underline font-bold transition active:scale-95 cursor-pointer"
                    >
                      Reset Status
                    </button>
                  )}
                </div>

                {activeGroup === 'ALL' ? (
                  <div className="space-y-2">
                    <div className="space-y-1.5 max-h-[140px] sm:max-h-[180px] overflow-y-auto pr-1">
                      {incompleteGroups.map(g => {
                        const contact = kssContacts.find(c => c.group === g);
                        const target = {
                          group: g,
                          name: contact ? contact.name : `KSS Grup ${g}`,
                          phone: contact ? contact.phone : '',
                        };
                        const isSent = sentBroadcastGroups.includes(target.group);
                        const hasNoPhone = !target.phone;
                        
                        return (
                          <div key={target.group} className="flex items-center justify-between bg-white border border-slate-200 p-2 rounded-lg shadow-3xs">
                            <div className="min-w-0 flex-1 pr-2">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="px-1.5 py-0.5 bg-slate-100 text-[8px] font-extrabold rounded uppercase text-slate-700 border border-slate-200">Grup {target.group}</span>
                                <span className="font-bold text-slate-800 truncate text-[10.5px]">{target.name}</span>
                              </div>
                              <span className="text-[9px] text-slate-400 font-mono block mt-0.5">
                                {hasNoPhone ? '⚠️ No Belum Diatur' : `+${target.phone}`}
                              </span>
                            </div>
                            
                            {hasNoPhone ? (
                              <span className="text-[8.5px] text-slate-400 font-bold italic bg-slate-100 px-2 py-1 rounded">N/A</span>
                            ) : isSent ? (
                              <span className="text-[8.5px] text-emerald-700 font-extrabold flex items-center gap-0.5 bg-emerald-50 px-2 py-1 rounded border border-emerald-200">
                                ✓ Terbuka
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  const url = getWhatsAppURLForContact(target.group, target.phone);
                                  window.open(url, '_blank');
                                  if (!sentBroadcastGroups.includes(target.group)) {
                                    setSentBroadcastGroups([...sentBroadcastGroups, target.group]);
                                  }
                                }}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-[9.5px] font-black uppercase tracking-wider rounded-lg transition cursor-pointer flex items-center gap-1 shadow-3xs active:scale-95"
                              >
                                <Send className="w-2.5 h-2.5" /> Kirim
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Sequential Broadcast Button */}
                    {(() => {
                      const validTargets = incompleteGroups.map(g => {
                        const contact = kssContacts.find(c => c.group === g);
                        return {
                          group: g,
                          name: contact ? contact.name : `KSS Grup ${g}`,
                          phone: contact ? contact.phone : '',
                        };
                      }).filter(t => t.phone);
                      
                      const nextUnsent = validTargets.find(t => !sentBroadcastGroups.includes(t.group));
                      const validCount = validTargets.length;
                      
                      if (validCount === 0) {
                        return (
                          <p className="text-[9.5px] text-amber-700 text-center font-bold bg-amber-50 p-2 border border-amber-200 rounded-lg">
                            ⚠️ Tidak ada nomor WA KSS yang dikonfigurasi. Silakan isi di tab Kontak WA KSS.
                          </p>
                        );
                      }

                      if (!nextUnsent) {
                        return (
                          <div className="p-2 bg-emerald-50 border border-emerald-150 rounded-lg text-center">
                            <p className="text-[10px] text-emerald-800 font-extrabold">🎉 Selesai!</p>
                            <p className="text-[9px] text-emerald-600">Seluruh pengingat WA telah dibuka.</p>
                          </div>
                        );
                      }

                      return (
                        <button
                          type="button"
                          onClick={() => {
                            const url = getWhatsAppURLForContact(nextUnsent.group, nextUnsent.phone);
                            window.open(url, '_blank');
                            if (!sentBroadcastGroups.includes(nextUnsent.group)) {
                              setSentBroadcastGroups([...sentBroadcastGroups, nextUnsent.group]);
                            }
                          }}
                          className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-lg text-[10px] font-black uppercase tracking-wider transition cursor-pointer shadow-3xs flex items-center justify-center gap-1.5 active:scale-[0.98]"
                        >
                          <MessageCircle className="w-3.5 h-3.5 animate-pulse text-emerald-100" /> Kirim Berikutnya: Grup {nextUnsent.group} ({nextUnsent.name})
                        </button>
                      );
                    })()}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-[10px] text-slate-500 leading-normal font-medium">
                      Sebagai Kepala Grup/KSS, Anda dapat langsung menyebarkan format pesan pengingat resmi ini ke grup WhatsApp shift/tim Anda untuk mempercepat pengisian:
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        const appUrl = getAppUrl();
                        const textTemplate = `⏰*REMINDER PENILAIAN SHIFT ${activeGroup}*

Menginfokan kepada seluruh rekan-rekan Shift ${activeGroup} bahwa Penilaian Karyawan untuk periode ini belum diinput secara lengkap ke dalam sistem.

Mohon kerja samanya untuk segera mengisi form penilaian sebelum *${deadlineString}*. Terima kasih atas perhatian dan kerja samanya! 🙏

🔗 *Link Aplikasi Penilaian:*
👉 ${appUrl}`;
                        
                        const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(textTemplate)}`;
                        window.open(url, '_blank');
                      }}
                      className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-lg text-[10px] font-black uppercase tracking-wider transition cursor-pointer shadow-3xs flex items-center justify-center gap-1.5 active:scale-[0.98]"
                    >
                      <MessageCircle className="w-3.5 h-3.5 text-emerald-100" /> Share Ke Grup WA Shift {activeGroup}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Footer: Fixed bottom */}
            <div className="shrink-0 pt-2.5 sm:pt-3 border-t border-slate-150 space-y-1.5 text-center">
              <button
                type="button"
                onClick={handleAcknowledgeReminder}
                className="w-full py-2.5 sm:py-3 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-black uppercase text-[11px] sm:text-xs tracking-wider rounded-xl transition shadow-md flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.98]"
              >
                <Check className="w-4 h-4 shrink-0" /> Saya Mengerti & Matikan Alarm Hari Ini
              </button>
              
              <p className="text-[9px] text-slate-400 italic font-medium">
                Sistem alarm akan otomatis berbunyi kembali besok jika Anda belum selesai menginput seluruh penilaian kelompok Anda.
              </p>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
