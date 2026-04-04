import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  X,
  Mail,
  Phone,
  GraduationCap,
  User,
  ShieldCheck,
  Calendar,
  Hash,
  MessagesSquare,
  Edit2,
  Archive,
  CheckCircle2
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import DeleteConfirmModal from './DeleteConfirmModal';

const memberSchema = z.object({
  full_name: z.string().min(1, '名前を入力してください'),
  full_name_kana: z.string().optional(),
  mssv: z.string().min(1, '学籍番号を入力してください'),
  email: z.string().optional().or(z.literal('')),
  university_email: z.string().optional().or(z.literal('')),
  phone: z.string().optional(),
  line_nickname: z.string().optional(),
  role: z.enum(['admin', 'executive', 'member', 'alumni']),
  university_year: z.number().min(1).max(4),
});

type MemberFormData = z.infer<typeof memberSchema>;

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface MemberDetailDrawerProps {
  member: any | null; // Full member data object
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: any) => Promise<void>;
  onDelete: (id: string) => void;
}

export default function MemberDetailDrawer({ member, isOpen, onClose, onSave, onDelete }: MemberDetailDrawerProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<MemberFormData>({
    resolver: zodResolver(memberSchema)
  });

  // Re-sync form when member changes or edit mode enters
  useEffect(() => {
    if (member) {
      reset({
        full_name: member.users?.full_name || '',
        full_name_kana: member.users?.full_name_kana || '',
        mssv: member.users?.mssv || '',
        email: member.users?.email || '',
        university_email: member.users?.university_email || '',
        phone: member.users?.phone || '',
        line_nickname: member.users?.line_nickname || '',
        role: member.role || 'member',
        university_year: member.university_year || 1,
      });
    }
    if (!isOpen) setIsEditing(false);
  }, [member, isOpen, reset]);

  if (!isOpen || !member) return null;

  const roleLabels: Record<string, { label: string; bg: string; text: string }> = {
    admin: { label: '管理者', bg: 'bg-[#D62976]/10', text: 'text-[#D62976]' },
    executive: { label: '運営', bg: 'bg-[#4F5BD5]/10', text: 'text-[#4F5BD5]' },
    member: { label: 'メンバー', bg: 'bg-[#FEDA75]/10', text: 'text-[#CDA01E]' },
    alumni: { label: '卒業生', bg: 'bg-stone-100', text: 'text-stone-500' },
  };

  const getGradeStyle = (year: number) => {
    switch (year) {
      case 1: return 'bg-[#4F5BD5] text-white'; // Fresh blue
      case 4: return 'bg-[#CDA01E] text-white'; // Gold/Bronze for seniors
      default: return 'bg-stone-200 text-stone-700';
    }
  };

  const detailConfig = [
    { label: '氏名', value: member.users?.full_name, sub: member.users?.full_name_kana, icon: User },
    { label: '学籍番号', value: member.users?.mssv, icon: Hash },
    { label: '役割', value: roleLabels[member.role]?.label || '不明', icon: ShieldCheck, badge: true },
    { label: '学年', value: `${member.university_year}年生`, icon: GraduationCap, yearBadge: true },
    { label: '連絡用メール', value: member.users?.email, icon: Mail, copy: true },
    { label: '大学メール', value: member.users?.university_email || '未設定', icon: GraduationCap },
    { label: '電話番号', value: member.users?.phone || '未設定', icon: Phone },
    { label: 'LINE名', value: member.users?.line_nickname || '未設定', icon: MessagesSquare }
  ];

  return (
    <>
      {/* Overlay - Japanese accessibility focus */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-stone-900/80 (backdrop-blur-md was too heavy) z-[100]"
      />

      {/* Modal Container */}
      <div className="fixed inset-0 z-[101] flex items-center justify-center p-4 sm:p-10 pointer-events-none overflow-hidden">
        <div className="relative w-full max-w-xl bg-white rounded-[3rem] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden pointer-events-auto border border-stone-100">
          {/* Close Button - Absolute Positioned */}
          <button
            onClick={onClose}
            className="absolute top-8 right-8 z-10 p-3 text-stone-300 hover:text-stone-900 transition-all active:scale-95 bg-stone-50 rounded-2xl shadow-sm"
          >
            <X size={20} />
          </button>

          {/* Scrollable Content Area */}
          <div className="flex-1 overflow-y-auto px-8 pt-12 pb-6 space-y-8 custom-scrollbar will-change-scroll">

            {isEditing ? (
              <form id="member-edit-form" onSubmit={handleSubmit(async (data) => { await onSave(data); setIsEditing(false); })} className="space-y-12 py-4">
                {/* 1. BASIC INFORMATION */}
                <div className="space-y-6">
                  <label className="text-[12px] font-black uppercase text-[#4F5BD5] tracking-[0.3em]">Basic Profile</label>
                  <div className="grid grid-cols-1 gap-6">
                    <div className="space-y-2">
                      <span className="text-[13px] font-bold text-stone-500 pl-1">氏名 (Full Name) *</span>
                      <input {...register('full_name')} className="w-full h-14 bg-stone-50 rounded-2xl px-6 font-bold outline-none border border-transparent focus:border-[#4F5BD5]/20 focus:bg-white transition-all text-black" />
                      {errors.full_name && <p className="text-red-500 text-[10px] font-black ml-2">{errors.full_name.message}</p>}
                    </div>
                    <div className="space-y-2">
                      <span className="text-[13px] font-bold text-stone-500 pl-1">フリガナ (Kana)</span>
                      <input {...register('full_name_kana')} className="w-full h-14 bg-stone-50 rounded-2xl px-6 font-bold outline-none border border-transparent focus:border-[#4F5BD5]/20 focus:bg-white transition-all text-black" />
                    </div>
                  </div>
                </div>

                {/* 2. CLUB & ACADEMIC */}
                <div className="space-y-6">
                  <label className="text-[12px] font-black uppercase text-[#D62976] tracking-[0.3em]">Club Configuration</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <span className="text-[13px] font-bold text-stone-500 pl-1">学籍番号 (Student ID) *</span>
                      <input {...register('mssv')} className="w-full h-14 bg-stone-50 rounded-2xl px-6 font-bold outline-none border border-transparent focus:border-[#D62976]/20 focus:bg-white transition-all text-black" />
                      {errors.mssv && <p className="text-red-500 text-[10px] font-black ml-2">{errors.mssv.message}</p>}
                    </div>
                    <div className="space-y-2">
                      <span className="text-[13px] font-bold text-stone-500 pl-1">役割 (Role)</span>
                      <select {...register('role')} className="w-full h-14 bg-stone-50 rounded-2xl px-6 font-bold outline-none appearance-none cursor-pointer border border-transparent focus:border-[#D62976]/20 text-black">
                        <option value="member">メンバー</option>
                        <option value="executive">運営</option>
                        <option value="admin">管理者</option>
                        <option value="alumni">卒業生</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <span className="text-[13px] font-bold text-stone-500 pl-1">学年 (Grade)</span>
                      <select {...register('university_year', { valueAsNumber: true })} className="w-full h-14 bg-stone-50 rounded-2xl px-6 font-bold outline-none appearance-none cursor-pointer border border-transparent focus:border-[#D62976]/20 text-black">
                        <option value={1}>1年生</option>
                        <option value={2}>2年生</option>
                        <option value={3}>3年生</option>
                        <option value={4}>4年生</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* 3. CONTACT CHANNELS */}
                <div className="space-y-6">
                  <label className="text-[12px] font-black uppercase text-emerald-600 tracking-[0.3em]">Communication</label>
                  <div className="grid grid-cols-1 gap-6">
                    <div className="space-y-2">
                      <span className="text-[13px] font-bold text-stone-500 pl-1">連絡用メール (Contact Email)</span>
                      <input {...register('email')} className="w-full h-14 bg-stone-50 rounded-2xl px-6 font-bold outline-none border border-transparent focus:border-emerald-100 focus:bg-white transition-all text-black" />
                      {errors.email && <p className="text-red-500 text-[10px] font-black ml-2">{errors.email.message}</p>}
                    </div>
                    <div className="space-y-2">
                      <span className="text-[13px] font-bold text-stone-500 pl-1">大学メール (University Email)</span>
                      <input {...register('university_email')} className="w-full h-14 bg-stone-50 rounded-2xl px-6 font-bold outline-none border border-transparent focus:border-emerald-100 focus:bg-white transition-all text-black" />
                      {errors.university_email && <p className="text-red-500 text-[10px] font-black ml-2">{errors.university_email.message}</p>}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <span className="text-[13px] font-bold text-stone-500 pl-1">電話番号 (Phone)</span>
                        <input {...register('phone')} className="w-full h-14 bg-stone-50 rounded-2xl px-6 font-bold outline-none border border-transparent focus:border-emerald-100 focus:bg-white transition-all text-black" />
                      </div>
                      <div className="space-y-2">
                        <span className="text-[13px] font-bold text-stone-500 pl-1">LINE名</span>
                        <input {...register('line_nickname')} className="w-full h-14 bg-stone-50 rounded-2xl px-6 font-bold outline-none border border-transparent focus:border-emerald-100 focus:bg-white transition-all text-black" />
                      </div>
                    </div>
                  </div>
                </div>
              </form>
            ) : (
              <>
                {/* Profile Details Grid */}
                <div className="grid grid-cols-1 gap-6">
                  {detailConfig.map((item) => (
                    <div
                      key={item.label}
                      className="group"
                    >
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-xl bg-stone-50 flex items-center justify-center shrink-0 text-stone-300 group-hover:text-[#4F5BD5] transition-colors">
                          <item.icon size={18} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <label className="text-[14px] font-bold text-black mb-1 block font-sans">
                            {item.label}
                          </label>
                          <div className="flex items-center gap-3">
                            {item.badge ? (
                              <span className={cn("px-4 py-1.5 rounded-full text-[13px] font-black tracking-wider uppercase", roleLabels[member.role]?.bg, roleLabels[member.role]?.text)}>
                                {item.value}
                              </span>
                            ) : item.yearBadge ? (
                              <span className={cn("px-4 py-1.5 rounded-full text-[13px] font-black tracking-wider", getGradeStyle(member.university_year))}>
                                {item.value}
                              </span>
                            ) : (
                              <span className={cn(
                                "text-[17px] font-bold break-words leading-tight",
                                item.label === '氏名'
                                  ? "text-[#D62976] font-serif"
                                  : "text-black font-sans"
                              )}>
                                {item.value}
                                {item.sub && <span className="block text-[13px] text-stone-400 font-sans font-medium mt-1">({item.sub})</span>}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Status Section */}
                <div className="pt-6 border-t border-stone-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calendar size={14} className="text-stone-300" />
                    <span className="text-[11px] font-black uppercase text-stone-400 tracking-widest leading-none">
                      登録日: {new Date(member.created_at).toLocaleDateString('ja-JP')}
                    </span>
                  </div>
                  <div className={cn(
                    "flex items-center gap-2 px-4 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-widest",
                    member.is_active ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
                  )}>
                    {member.is_active ? "Active" : "Inactive"}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Bottom Actions Area */}
          <div className="px-8 py-5 border-t border-stone-100 shrink-0 bg-stone-50/10 flex flex-col gap-3">
            {isEditing ? (
              <div className="flex gap-3">
                <button
                  onClick={() => setIsEditing(false)}
                  className="flex-1 h-11 bg-white border border-stone-200 text-stone-500 rounded-xl font-bold text-[13px] hover:bg-stone-50 transition-all active:scale-95"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  form="member-edit-form"
                  disabled={isSubmitting}
                  className="flex-[2] h-11 bg-[#4F5BD5] text-white rounded-xl font-black text-[13px] shadow-lg shadow-indigo-200/50 hover:brightness-110 flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50"
                >
                  {isSubmitting ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <CheckCircle2 size={16} />}
                  保存する
                </button>
              </div>
            ) : (
              <>
                <div className="flex gap-3">
                  <button
                    onClick={() => setIsEditing(true)}
                    className="flex-1 h-11 bg-[#4F5BD5] text-white rounded-xl font-black text-[13px] shadow-lg shadow-indigo-200/50 hover:bg-[#3D4AB8] flex items-center justify-center gap-2 active:scale-95 transition-all"
                  >
                    <Edit2 size={16} />
                    編集する
                  </button>
                  <button
                    onClick={() => setIsDeleteConfirmOpen(true)}
                    className="group/del flex items-center justify-center gap-2 h-11 px-0 hover:px-4 bg-white border border-rose-100 text-rose-500 rounded-xl hover:bg-rose-500 hover:text-white transition-all duration-300 active:scale-95 shadow-sm overflow-hidden"
                    title="メンバーをアーカイブ (Archive member)"
                  >
                    <div className="w-11 h-11 flex items-center justify-center shrink-0">
                      <Archive size={18} />
                    </div>
                    <span className="max-w-0 overflow-hidden whitespace-nowrap group-hover/del:max-w-[80px] transition-all duration-300 text-[11px] font-black uppercase tracking-[0.2em] opacity-0 group-hover/del:opacity-100">
                      Archive
                    </span>
                  </button>
                </div>
                <button
                  onClick={onClose}
                  className="h-11 w-full bg-stone-100/50 text-stone-500 rounded-xl font-extrabold text-[12px] hover:bg-stone-100 transition-all active:scale-95"
                >
                  戻る (Back)
                </button>
              </>
            )}
          </div>

        </div>
      </div>

      {/* Delete Confirmation Modal Layer */}
      <DeleteConfirmModal
        isOpen={isDeleteConfirmOpen}
        onClose={() => setIsDeleteConfirmOpen(false)}
        onConfirm={() => {
          onClose(); // Close the drawer
          onDelete(member.id);
        }}
        memberName={member.users?.full_name || '—'}
      />
    </>
  );
}
