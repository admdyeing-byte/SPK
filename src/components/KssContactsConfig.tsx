/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { KssContact, GroupType } from '../types';
import { Phone, User, Save, Edit2, Check, Smartphone, Sparkles, HelpCircle } from 'lucide-react';

interface KssContactsConfigProps {
  contacts: KssContact[];
  onSaveContacts: (newContacts: KssContact[]) => void;
  onShowAlert?: (title: string, message: string) => void;
}

export default function KssContactsConfig({
  contacts,
  onSaveContacts,
  onShowAlert,
}: KssContactsConfigProps) {
  const [editingGroup, setEditingGroup] = useState<GroupType | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');

  const handleStartEdit = (contact: KssContact) => {
    setEditingGroup(contact.group);
    setEditName(contact.name);
    setEditPhone(contact.phone);
  };

  const handleCancelEdit = () => {
    setEditingGroup(null);
  };

  const handleSaveContact = (group: GroupType) => {
    // Basic phone number cleaning
    let cleanPhone = editPhone.replace(/[^0-9]/g, '');
    
    // If phone starts with 0, convert to Indonesian international 62
    if (cleanPhone.startsWith('0')) {
      cleanPhone = '62' + cleanPhone.substring(1);
    }

    if (cleanPhone && !cleanPhone.startsWith('62')) {
      if (onShowAlert) {
        onShowAlert(
          'Nomor Tidak Valid',
          'Nomor telepon WhatsApp sebaiknya menggunakan kode negara Indonesia (diawali dengan 62). Contoh: 628123456789'
        );
      }
      return;
    }

    const updated = contacts.map(c => {
      if (c.group === group) {
        return {
          ...c,
          name: editName.trim() || `KSS Grup ${group}`,
          phone: cleanPhone,
        };
      }
      return c;
    });

    onSaveContacts(updated);
    setEditingGroup(null);

    if (onShowAlert) {
      onShowAlert('Kontak Diperbarui', `Berhasil menyimpan kontak KSS untuk Grup ${group}.`);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col overflow-hidden animate-fade-in">
      {/* Header Panel */}
      <div className="p-6 border-b border-slate-150 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">
              <Phone className="w-5 h-5" />
            </div>
            <h3 className="font-extrabold text-slate-800 text-sm uppercase tracking-wider">Kontak WhatsApp</h3>
          </div>
          <p className="text-xs text-slate-450 mt-1">Kelola nomor WhatsApp personal Kepala Shift (KSS) untuk pengiriman pengingat manual.</p>
        </div>
      </div>

      {/* Info Tips */}
      <div className="mx-6 mt-4 p-3.5 bg-blue-50/55 border border-blue-100 rounded-xl text-xs text-blue-850 leading-relaxed flex items-start gap-2.5">
        <Sparkles className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
        <div>
          <p className="font-bold">Cara Kerja Kontak KSS</p>
          <p className="mt-0.5 text-blue-800">
            Ketika Anda menyimpan nomor WA KSS di sini, tombol <strong className="font-bold">"Kirim WA Manual"</strong> pada tombol notifikasi di atas akan secara otomatis mendeteksi nomor ini ketika Anda memilih Grup tujuan. Anda tidak perlu lagi menyalin atau mengetik nomor telepon KSS secara manual!
          </p>
        </div>
      </div>

      {/* Main List */}
      <div className="p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {contacts.map((contact) => {
            const isEditing = editingGroup === contact.group;

            return (
              <div
                key={contact.group}
                className={`p-4 border rounded-xl flex flex-col justify-between transition-all duration-150 ${
                  isEditing
                    ? 'border-blue-500 bg-blue-50/10 shadow-sm'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[9.5px] font-extrabold uppercase ${
                        contact.group === 'A' ? 'bg-blue-50 text-blue-700 border border-blue-100' :
                        contact.group === 'B' ? 'bg-purple-50 text-purple-700 border border-purple-100' :
                        contact.group === 'C' ? 'bg-orange-50 text-orange-700 border border-orange-100' :
                        contact.group === 'MTC' ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                        'bg-slate-50 text-slate-600 border border-slate-150'
                      }`}>
                        Grup {contact.group}
                      </span>
                      <span className="text-[10.5px] text-slate-400 font-bold uppercase tracking-wider"></span>
                    </div>

                    {isEditing ? (
                      <div className="space-y-2 pt-1">
                        <div>
                          <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">Nama KSS</label>
                          <div className="relative">
                            <User className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              placeholder={`Nama KSS Grup ${contact.group}`}
                              className="w-full text-xs py-1.5 pl-8 pr-3 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">No. WhatsApp</label>
                          <div className="relative">
                            <Smartphone className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                            <input
                              type="text"
                              value={editPhone}
                              onChange={(e) => setEditPhone(e.target.value)}
                              placeholder="Contoh: 628123456789"
                              className="w-full text-xs py-1.5 pl-8 pr-3 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          </div>
                          <span className="text-[9px] text-slate-400 block mt-0.5">Wajib diawali dengan kode negara (62...)</span>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1 pt-1">
                        <h4 className="font-extrabold text-slate-800 text-sm uppercase">{contact.name}</h4>
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                          <Smartphone className="w-3.5 h-3.5 text-slate-400" />
                          <span>{contact.phone ? `+${contact.phone}` : <span className="text-slate-400 italic font-normal">Belum diatur</span>}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {!isEditing && (
                    <button
                      type="button"
                      onClick={() => handleStartEdit(contact)}
                      className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition cursor-pointer"
                      title="Edit Kontak KSS"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {isEditing && (
                  <div className="flex justify-end gap-1.5 mt-4 pt-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      className="px-2.5 py-1.5 border border-slate-200 text-slate-500 rounded-lg text-xs font-semibold hover:bg-slate-50 transition cursor-pointer"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSaveContact(contact.group)}
                      className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1 hover:bg-blue-700 transition cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" /> Simpan
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
