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
  CheckCircle2,
  Globe
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import DeleteConfirmModal from './DeleteConfirmModal';

const memberSchema = z.object({
  full_name: z.string().min(1, '名前を入力してください'),
  full_name_kana: z.string().optional(),
  gender: z.string().optional().nullable(),
  mssv: z.string().min(1, '学籍番号を入力してください'),
  email: z.string().optional().or(z.literal('')),
  university_email: z.string().min(1, '大学メールを入力してください').email('無効なメールアドレスです'),
  phone: z.string().optional(),
  line_nickname: z.string().optional(),
  role: z.enum(['president', 'vice_president', 'treasurer', 'executive', 'member', 'alumni']),
  university_year: z.number().min(0).max(4),
  nationality: z.string().optional(),
  password: z.string().optional().or(z.literal('')), // Thêm field password
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
  isPresident?: boolean;
  isVicePresident?: boolean;
  isFullDisclosure?: boolean;
  canEdit?: boolean;
}

export default function MemberDetailDrawer({ member, isOpen, onClose, onSave, onDelete, isPresident, isVicePresident, isFullDisclosure, canEdit }: MemberDetailDrawerProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  const { register, handleSubmit, reset, formState: { errors, isSubmitting }, watch } = useForm<MemberFormData>({
    resolver: zodResolver(memberSchema)
  });

  const selectedRole = watch('role');

  // Re-sync form when member changes or edit mode enters
  useEffect(() => {
    if (member) {
      reset({
        full_name: member.users?.full_name || '',
        full_name_kana: member.users?.full_name_kana || '',
        gender: member.users?.gender || '',
        mssv: member.users?.mssv || '',
        email: member.users?.email || '',
        university_email: member.users?.university_email || '',
        phone: member.users?.phone || '',
        line_nickname: member.users?.line_nickname || '',
        role: (member.role === 'admin' ? 'president' : member.role) || 'member',
        university_year: member.users?.university_year || 1,
        nationality: member.users?.nationality || '',
        password: '',
      });
      if (!member.id) {
        setIsEditing(true);
      }
    }
    if (!isOpen) setIsEditing(false);
  }, [member, isOpen, reset]);

  if (!isOpen || !member) return null;

  const roleLabels: Record<string, { label: string; bg: string; text: string }> = {
    president: { label: '部長', bg: 'bg-[#D62976]/10', text: 'text-[#D62976]' },
    vice_president: { label: '副部長', bg: 'bg-indigo-500/10', text: 'text-indigo-600' },
    treasurer: { label: '会計', bg: 'bg-emerald-500/10', text: 'text-emerald-600' },
    executive: { label: '幹部', bg: 'bg-[#4F5BD5]/10', text: 'text-[#4F5BD5]' },
    member: { label: '部員', bg: 'bg-amber-400/10', text: 'text-amber-600' },
    alumni: { label: '卒業生', bg: 'bg-stone-100', text: 'text-stone-500' },
  };

  const getGradeStyle = (year: number) => {
    const validYear = (year === 0 || year) ? year : 1;
    switch (validYear) {
      case 0: return 'bg-stone-50 text-stone-400';
      case 1: return 'bg-[#06C755]/10 text-[#06C755]'; // LINE Green
      case 2: return 'bg-[#4F5BD5]/10 text-[#4F5BD5]'; // Blue
      case 3: return 'bg-rose-500/10 text-rose-500'; // Red
      case 4: return 'bg-purple-500/10 text-purple-500'; // Purple
      default: return 'bg-stone-50 text-stone-500';
    }
  };

  const detailConfig = [
    { label: '氏名', value: member.users?.full_name, sub: member.users?.full_name_kana, icon: User },
    { label: '学籍番号', value: member.users?.mssv, icon: Hash },
    { label: '役割', value: roleLabels[member.role]?.label || '不明', icon: ShieldCheck, badge: true },
    { label: '学年', value: (member.users?.university_year === 0) ? '卒業生' : `${member.users?.university_year || 1}年生`, icon: GraduationCap, yearBadge: true },
    ...(isFullDisclosure ? [
      { label: '連絡用メール', value: member.users?.email?.trim() || '無', icon: Mail, copy: true },
      { label: '大学メール', value: member.users?.university_email?.trim() || '無', icon: GraduationCap },
      { label: '電話番号', value: member.users?.phone?.trim() || '無', icon: Phone },
      { label: '国籍', value: member.users?.nationality?.trim() || '無', icon: Globe },
      { label: 'LINE', value: member.users?.line_nickname?.trim() ? `@${member.users.line_nickname.trim()}` : '無', icon: MessagesSquare }
    ] : [])
  ];

  const onHandleSave = async (data: any) => {
    // If NOT president, ensure role is NOT changed from original
    const finalData = {
      ...data,
      role: isPresident ? data.role : member.role,
      password: isPresident ? data.password : '' // Only president can set password
    };
    await onSave(finalData);
  };

  return (
    <>
      {/* Overlay - Outside click disabled to prevent accidental data loss */}
      <div
        className="fixed inset-0 bg-stone-900/80 z-[100]"
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
          <div className="flex-1 overflow-y-auto px-5 sm:px-8 pt-10 sm:pt-12 pb-6 space-y-6 sm:space-y-8 custom-scrollbar will-change-scroll">

            {isEditing ? (
              <form id="member-edit-form" onSubmit={handleSubmit(async (data) => { await onHandleSave(data); setIsEditing(false); })} className="space-y-12 py-4">
                {/* 1. BASIC INFORMATION */}
                <div className="space-y-6">
                  <label className="text-[12px] font-black uppercase text-[#4F5BD5] tracking-[0.3em]">Basic Profile</label>
                  <div className="grid grid-cols-1 gap-6">
                    <div className="space-y-2">
                      <span className="text-[13px] font-bold text-stone-500 pl-1">氏名 (Full Name) <span className="text-rose-500">*</span></span>
                      <input id="full_name" {...register('full_name')} className="w-full h-14 bg-stone-50 rounded-2xl px-6 font-bold outline-none border-2 border-stone-100 focus:border-[#4F5BD5] focus:bg-white transition-all text-black" />
                      {errors.full_name && <p className="text-red-500 text-[10px] font-black ml-2">{errors.full_name.message}</p>}
                    </div>
                    <div className="space-y-2">
                      <span className="text-[13px] font-bold text-stone-500 pl-1">フリガナ (Kana)</span>
                      <input id="full_name_kana" {...register('full_name_kana')} className="w-full h-14 bg-stone-50 rounded-2xl px-6 font-bold outline-none border-2 border-stone-100 focus:border-[#4F5BD5] focus:bg-white transition-all text-black" />
                    </div>
                    <div className="space-y-2">
                       <span className="text-[13px] font-bold text-stone-500 pl-1">性別 (Gender)</span>
                       <select id="gender" {...register('gender')} className="w-full h-14 bg-stone-50 rounded-2xl px-6 font-bold outline-none appearance-none cursor-pointer border-2 border-stone-100 focus:border-[#4F5BD5] focus:bg-white transition-all text-black">
                         <option value="">未設定</option>
                         <option value="Male">男性 (Male)</option>
                         <option value="Female">女性 (Female)</option>
                         <option value="Other">その他 (Other)</option>
                       </select>
                    </div>
                  </div>
                </div>

                {/* 2. CLUB & ACADEMIC */}
                <div className="space-y-6">
                  <label className="text-[12px] font-black uppercase text-[#D62976] tracking-[0.3em]">Club Configuration</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <span className="text-[13px] font-bold text-stone-500 pl-1">学籍番号 (Student ID) <span className="text-rose-500">*</span></span>
                      <input id="mssv" {...register('mssv')} className="w-full h-14 bg-stone-50 rounded-2xl px-6 font-bold outline-none border-2 border-stone-100 focus:border-[#D62976] focus:bg-white transition-all text-black" />
                      {errors.mssv && <p className="text-red-500 text-[10px] font-black ml-2">{errors.mssv.message}</p>}
                    </div>
                    <div className="space-y-2">
                      <span className="text-[13px] font-bold text-stone-500 pl-1">役割 (Role) {!isPresident && !isVicePresident && <span className="text-[10px] text-rose-500 font-black ml-1">(部長・副部長のみ変更可能)</span>}</span>
                      <select
                        id="role"
                        {...register('role')}
                        disabled={!isPresident && !isVicePresident}
                        className="w-full h-14 bg-stone-50 rounded-2xl px-6 font-bold outline-none appearance-none cursor-pointer border-2 border-stone-100 focus:border-[#D62976] focus:bg-white text-black disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <option value="president">部長</option>
                        <option value="vice_president">副部長</option>
                        <option value="treasurer">会計</option>
                        <option value="executive">幹部</option>
                        <option value="member">部員</option>
                        <option value="alumni">卒業生</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <span className="text-[13px] font-bold text-stone-500 pl-1">学年 (Grade)</span>
                      <select id="university_year" {...register('university_year', { valueAsNumber: true })} className="w-full h-14 bg-stone-50 rounded-2xl px-6 font-bold outline-none appearance-none cursor-pointer border-2 border-stone-100 focus:border-[#D62976] focus:bg-white text-black">
                        <option value={1}>1年生</option>
                        <option value={2}>2年生</option>
                        <option value={3}>3年生</option>
                        <option value={4}>4年生</option>
                        <option value={0}>卒業生</option>
                      </select>
                    </div>

                    {isPresident && ['president', 'vice_president', 'treasurer', 'executive'].includes(selectedRole) && (
                      <div className="space-y-2 relative">
                        <span className="text-[13px] font-bold text-stone-500 pl-1">
                          初期パスワード <span className="text-rose-500">*</span>
                        </span>
                        <input
                          id="password"
                          {...register('password', {
                            required: ['president', 'vice_president', 'treasurer', 'executive'].includes(selectedRole) ? '初期パスワードを入力してください' : false
                          })}
                          type="text"
                          placeholder="管理者ログイン用に設定"
                          className={`w-full h-14 bg-amber-50/50 rounded-2xl font-black px-6 outline-none border-2 transition-all text-amber-900 placeholder:text-amber-700/30 ${errors.password ? 'border-rose-400 bg-rose-50/30' : 'border-amber-100 focus:border-amber-400 focus:bg-amber-50'
                            }`}
                        />
                        {errors.password && (
                          <span className="text-[10px] text-rose-500 font-bold block pl-1 mt-1">
                            {errors.password.message as string}
                          </span>
                        )}
                        {!errors.password && (
                          <span className="text-[10px] text-amber-600/80 font-bold block pl-1 mt-1">
                            ※ 管理者ログイン用にパスワードを設定します
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* 3. CONTACT CHANNELS */}
                <div className="space-y-6">
                  <label className="text-[12px] font-black uppercase text-emerald-600 tracking-[0.3em]">Communication</label>
                  <div className="grid grid-cols-1 gap-6">
                    <div className="space-y-2">
                      <span className="text-[13px] font-bold text-stone-500 pl-1">連絡用メール (Contact Email)</span>
                      <input id="email" {...register('email')} className="w-full h-14 bg-stone-50 rounded-2xl px-6 font-bold outline-none border-2 border-stone-100 focus:border-emerald-400 focus:bg-white transition-all text-black" />
                      {errors.email && <p className="text-red-500 text-[10px] font-black ml-2">{errors.email.message}</p>}
                    </div>
                    <div className="space-y-2">
                      <span className="text-[13px] font-bold text-stone-500 pl-1">大学メール (University Email) <span className="text-rose-500">*</span></span>
                      <input id="university_email" {...register('university_email')} className="w-full h-14 bg-stone-50 rounded-2xl px-6 font-bold outline-none border-2 border-stone-100 focus:border-emerald-400 focus:bg-white transition-all text-black" />
                      {errors.university_email && <p className="text-red-500 text-[10px] font-black ml-2">{errors.university_email.message}</p>}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <span className="text-[13px] font-bold text-stone-500 pl-1">電話番号 (Phone)</span>
                        <input id="phone" {...register('phone')} className="w-full h-14 bg-stone-50 rounded-2xl px-6 font-bold outline-none border-2 border-stone-100 focus:border-emerald-400 focus:bg-white transition-all text-black" />
                      </div>
                      <div className="space-y-2">
                        <span className="text-[13px] font-bold text-stone-500 pl-1">LINE名</span>
                        <input id="line_nickname" {...register('line_nickname')} className="w-full h-14 bg-stone-50 rounded-2xl px-6 font-bold outline-none border-2 border-stone-100 focus:border-emerald-400 focus:bg-white transition-all text-black" />
                      </div>
                      <div className="space-y-2">
                        <span className="text-[13px] font-bold text-stone-500 pl-1">国籍 (Nationality)</span>
                        <div className="relative group">
                          <select 
                            id="nationality" 
                            {...register('nationality')} 
                            className="w-full h-12 sm:h-14 bg-stone-50 rounded-2xl px-5 sm:px-6 text-[13px] sm:text-[14px] font-bold outline-none appearance-none cursor-pointer border-2 border-stone-100 focus:border-emerald-400 focus:bg-white transition-all text-black pr-12"
                          >
                            <option value="">未設定</option>
                            <option value="日本">日本 (Japan)</option>
                            <option value="ベトナム">ベトナム (Vietnam)</option>
                            <option value="ミャンマー">ミャンマー (Myanmar)</option>
                            <option value="中国">中国 (China)</option>
                            <option value="韓国">韓国 (South Korea)</option>
                            <option value="台湾">台湾 (Taiwan)</option>
                            <option value="タイ">タイ (Thailand)</option>
                            <option value="インドネシア">インドネシア (Indonesia)</option>
                            <option value="フィリピン">フィリピン (Philippines)</option>
                            <option value="マレーシア">マレーシア (Malaysia)</option>
                            <option value="カンボジア">カンボジア (Cambodia)</option>
                            <option value="ラオス">ラオス (Laos)</option>
                            <option value="ネパール">ネパール (Nepal)</option>
                            <option value="その他">その他 (Other)</option>
                          </select>
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-stone-300 group-focus-within:text-emerald-500">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </form>
            ) : (
              <>
                {/* Profile Details Grid */}
                <div className="grid grid-cols-1 gap-4">
                  {detailConfig.map((item) => (
                    <div
                      key={item.label}
                      className="group"
                    >
                      <div className="flex items-start gap-3 sm:gap-4">
                        <div className="w-8 sm:w-10 h-8 sm:h-10 rounded-lg sm:rounded-xl bg-stone-50 flex items-center justify-center shrink-0 text-stone-300 group-hover:text-[#4F5BD5] transition-colors mt-0.5">
                          <item.icon size={14} className="sm:w-[18px] sm:h-[18px]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <label className="text-[12px] sm:text-[14px] font-bold text-black mb-0.5 block font-sans">
                            {item.label}
                          </label>
                          <div className="flex items-center gap-3">
                            {item.badge ? (
                              <span className={cn("px-4 py-1.5 rounded-full text-[13px] font-black tracking-wider uppercase", roleLabels[member.role]?.bg, roleLabels[member.role]?.text)}>
                                {item.value}
                              </span>
                            ) : item.yearBadge ? (
                              <span className={cn("px-4 py-1.5 rounded-full text-[13px] font-black tracking-wider", getGradeStyle((member.users?.university_year === 0 || member.users?.university_year) ? member.users.university_year : 1))}>
                                {item.value}
                              </span>
                            ) : (
                              <span className={cn(
                                "text-[17px] font-bold break-words leading-tight",
                                item.label === '氏名'
                                  ? "text-[#D62976] font-serif"
                                  : item.label === 'LINE'
                                    ? "text-[#06C755] font-sans"
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
                      登録日: {member.created_at ? new Date(member.created_at).toLocaleDateString('ja-JP') : new Date().toLocaleDateString('ja-JP')}
                    </span>
                  </div>
                  <div className={cn(
                    "flex items-center gap-2 px-4 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-widest",
                    member.is_active !== false ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
                  )}>
                    {member.is_active !== false ? "Active" : "Inactive"}
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
                  onClick={() => {
                    if (!member.id) onClose();
                    else setIsEditing(false);
                  }}
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
                  {canEdit && isFullDisclosure && (
                    <button
                      onClick={() => setIsEditing(true)}
                      className="flex-1 h-11 bg-[#4F5BD5] text-white rounded-xl font-black text-[13px] shadow-lg shadow-indigo-200/50 hover:bg-[#3D4AB8] flex items-center justify-center gap-2 active:scale-95 transition-all"
                    >
                      <Edit2 size={16} />
                      編集する
                    </button>
                  )}
                  {canEdit && (
                    <button
                      onClick={() => setIsDeleteConfirmOpen(true)}
                      className="flex items-center justify-center gap-2 h-11 px-6 bg-[#D62976] text-white rounded-xl shadow-lg shadow-rose-200/50 hover:brightness-110 active:scale-95 transition-all"
                      title="解除箱へ移動します"
                    >
                      <Archive size={18} />
                      <span className="text-[11px] font-black uppercase tracking-[0.2em]">
                        解除箱へ
                      </span>
                    </button>
                  )}
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
        variant="soft"
        onConfirm={() => {
          onClose(); // Close the drawer
          onDelete(member.id);
        }}
        memberName={member.users?.full_name || '—'}
      />
    </>
  );
}
