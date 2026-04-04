import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Eye, UserPlus, FileUp, FilterX, ChevronLeft, ChevronRight, Shield, LayoutGrid, Archive } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store/useAppStore';
import { useDebounce } from '../../hooks/useDebounce';

// --- NEW REFINED COMPONENTS ---
import { MemberDirectorySkeleton } from '../../components/members/MemberDirectorySkeleton';
import MemberDetailDrawer from '../../components/members/MemberDetailDrawer';
import MemberImport from '../../components/members/MemberImport';

// --- ZOD SCHEMA (Optimized) ---
const memberSchema = z.object({
  user_id: z.string().optional(),
  membership_id: z.string().optional(),
  email: z.string().email('無効なメールアドレスです').optional().or(z.literal('')),
  mssv: z.string().min(1, '学籍番号を入力してください'),
  full_name: z.string().min(1, '名前を入力してください'),
  full_name_kana: z.string().optional(),
  gender: z.string().optional().nullable(),
  phone: z.string().optional(),
  university_email: z.string().email('無効な大学メールです').optional().or(z.literal('')),
  line_nickname: z.string().optional(),
  hometown: z.string().optional(),
  role: z.enum(['admin', 'executive', 'member', 'alumni']),
  university_year: z.number().min(1).max(4),
});

type MemberFormData = z.infer<typeof memberSchema>;

export default function Members() {
  const queryClient = useQueryClient();
  const { selectedYear } = useAppStore();

  // --- UI STATES ---
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 300); // Task 1: 300ms debounce
  const [roleFilter, setRoleFilter] = useState('all');
  const [gradeFilter, setGradeFilter] = useState('all');
  const [genderFilter, setGenderFilter] = useState('all');

  const [currentPage, setCurrentPage] = useState(1);
  const [isCompact, setIsCompact] = useState(false); // Task: Density toggle
  const itemsPerPage = isCompact ? 25 : 15;

  // Modal / Drawer states
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<any>(null);

  // --- DATA FETCHING (Supabase) ---
  const {
    data: members = [],
    isLoading,
    isError,
    refetch
  } = useQuery({
    queryKey: ['admin-members', selectedYear?.id],
    queryFn: async () => {
      if (!selectedYear) return [];

      // Safety: ensure we are actually fetching
      console.log('Fetching members for year:', selectedYear.id);

      const { data, error } = await supabase
        .from('club_memberships')
        .select(`
          *,
          users!inner(*)
        `)
        .eq('academic_year_id', selectedYear.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Supabase Query Error:', error);
        throw error;
      }
      return data || [];
    },
    enabled: !!selectedYear,
    staleTime: 5 * 60 * 1000,
    retry: 1, // Only retry once to avoid long hangs
  });

  // --- FILTER & PAGINATION LOGIC ---
  const filteredData = useMemo(() => {
    let result = [...members];

    // 1. Role Filter
    if (roleFilter !== 'all') {
      result = result.filter(m => m.role === roleFilter);
    }

    // 2. Grade Filter
    if (gradeFilter !== 'all') {
      result = result.filter(m => m.university_year === parseInt(gradeFilter));
    }

    // 3. Gender Filter
    if (genderFilter !== 'all') {
      result = result.filter(m => m.users?.gender === genderFilter);
    }

    // 4. Search Filter (Debounced)
    const query = debouncedSearch?.trim().toLowerCase();
    if (query) {
      result = result.filter(m =>
        (m.users?.full_name?.toLowerCase().includes(query)) ||
        (m.users?.mssv?.toLowerCase().includes(query)) ||
        (m.users?.email?.toLowerCase().includes(query))
      );
    }
    return result;
  }, [members, roleFilter, gradeFilter, genderFilter, debouncedSearch]);

  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const paginatedData = useMemo(() => {
    return filteredData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  }, [filteredData, currentPage]);

  // Reset page when triggers change
  useEffect(() => {
    setCurrentPage(1);
  }, [roleFilter, gradeFilter, genderFilter, debouncedSearch]);

  // --- MUTATIONS ---
  const saveMutation = useMutation({
    mutationFn: async (data: MemberFormData) => {
      if (data.user_id && data.membership_id) {
        // Update existing
        const { error: userError } = await supabase.from('users').update({
          full_name: data.full_name,
          full_name_kana: data.full_name_kana,
          gender: data.gender,
          mssv: data.mssv,
          phone: data.phone,
          university_email: data.university_email,
          line_nickname: data.line_nickname,
          hometown: data.hometown
        }).eq('id', data.user_id);
        if (userError) throw userError;

        const { error: memError } = await supabase.from('club_memberships').update({
          role: data.role,
          university_year: data.university_year
        }).eq('id', data.membership_id);
        if (memError) throw memError;

      } else {
        // Insert logic
        const { data: existingUser } = await supabase.from('users').select('id').eq('email', data.email!).maybeSingle();
        let targetUserId = existingUser?.id;

        if (!targetUserId) {
          targetUserId = crypto.randomUUID();
          const { error: insertUserError } = await supabase.from('users').insert({
            id: targetUserId, email: data.email!, mssv: data.mssv,
            full_name: data.full_name, full_name_kana: data.full_name_kana,
            gender: data.gender, phone: data.phone, university_email: data.university_email,
            line_nickname: data.line_nickname, hometown: data.hometown
          });
          if (insertUserError) throw insertUserError;
        }

        const { error: insertMemError } = await supabase.from('club_memberships').insert({
          user_id: targetUserId, academic_year_id: selectedYear!.id,
          role: data.role,
          university_year: data.university_year, is_active: true
        });
        if (insertMemError) throw insertMemError;
      }
    },
    onSuccess: () => {
      toast.success('データが保存されました');
      queryClient.invalidateQueries({ queryKey: ['admin-members'] });
    },
    onError: (err: any) => toast.error(err.message)
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      // Find the user_id for this membership first
      const mem = members.find(m => m.id === id);
      if (!mem?.user_id) throw new Error('User not found');
      
      const { error } = await supabase.rpc('archive_member', { user_uuid: mem.user_id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('メンバーをアーカイブしました');
      queryClient.invalidateQueries({ queryKey: ['admin-members'] });
    }
  });

  // --- ACTIONS ---
  // Note: Edit and Delete are handled via MemberDetailDrawer

  // Grade styling logic (Task 2)
  const getGradeBadge = (year: number): { bg: string; text: string; border: string; label: string } => {
    switch (year) {
      case 1: return { bg: 'bg-[#4F5BD5]/10', text: 'text-[#4F5BD5]', border: 'border-[#4F5BD5]/20', label: '1年生' }; // Blue
      case 4: return { bg: 'bg-[#CDA01E]/10', text: 'text-[#CDA01E]', border: 'border-[#CDA01E]/20', label: '4年生' }; // Gold
      default: return { bg: 'bg-stone-50', text: 'text-stone-500', border: 'border-stone-100', label: `${year}年生` };
    }
  };

  return (
    <div className="min-h-full flex flex-col space-y-10 lg:space-y-12">

      {/* 1. PRESTIGIOUS HEADER */}
      <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8 shrink-0 px-2 lg:px-0">
        <div className="space-y-4">
          <div className="flex items-center gap-4 lg:gap-6">
            <div className="w-2 lg:w-2.5 h-10 lg:h-12 bg-stone-900 rounded-full" />
            <h1 className="text-[26px] lg:text-[30px] font-black text-stone-900 tracking-tight leading-none uppercase font-serif">
              メンバー名簿
            </h1>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:flex items-center gap-3 lg:gap-4 w-full lg:w-auto">
          <button
            onClick={() => setIsImportOpen(true)}
            className="flex items-center justify-center gap-3 px-6 py-5 lg:px-8 lg:py-5 bg-stone-50 hover:bg-stone-100 text-stone-900 rounded-[2rem] text-[13px] lg:text-[15px] font-black tracking-tight border border-stone-200 transition-all active:scale-95 group shadow-sm"
          >
            <FileUp className="w-5 h-5 text-stone-400 group-hover:text-stone-900 transition-colors" />
            <span className="lg:hidden text-[12px] leading-tight">スマート<br />インポート</span>
            <span className="hidden lg:inline">スマートインポート</span>
          </button>
          
          <button
            onClick={() => { setSelectedMember({ users: {}, role: 'member', university_year: 1 }); }}
            className="flex items-center justify-center gap-3 px-6 py-5 lg:px-10 lg:py-5 bg-[#4F5BD5] hover:brightness-110 text-white rounded-[2rem] text-[13px] lg:text-[15px] font-black tracking-tight transition-all shadow-[0_20px_50px_rgba(79,91,213,0.3)] active:scale-95 group"
          >
            <UserPlus className="w-5 h-5 group-hover:scale-110 transition-transform" />
            <span className="lg:hidden text-[12px] leading-tight text-left">新規メンバー<br />登録</span>
            <span className="hidden lg:inline">新規登録</span>
          </button>
          
          <Link
            to="/admin/members/archived"
            className="col-span-2 lg:col-span-1 hidden sm:flex h-14 lg:w-16 lg:h-16 items-center justify-center rounded-3xl lg:rounded-full transition-all border-2 bg-white border-stone-100 text-stone-300 hover:text-[#D62976] hover:border-[#D62976]/20 shadow-sm group"
            title="アーカイブ管理 (Archived records)"
          >
            <Archive size={20} className="lg:size-[24px] group-hover:scale-110 transition-transform" />
          </Link>
        </div>
      </header>

      {/* 2. ADVANCED FILTER BAR & DENSITY TOGGLE (Task 2) */}
      <section className="bg-white/70 backdrop-blur-3xl border border-stone-100 p-3 lg:p-4 rounded-[2rem] lg:rounded-[3.5rem] flex flex-col xl:flex-row gap-4 shrink-0 shadow-2xl shadow-stone-200/10">

        {/* Debounced Search Input */}
        <div className="relative flex-1 group">
          <Search className="absolute left-10 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-600 group-focus-within:text-[#D62976] transition-colors" />
          <input
            type="text"
            placeholder="名前、学籍番号、メールで一括検索..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-20 pr-10 py-5 lg:py-6 bg-transparent text-stone-900 rounded-[2.5rem] text-[13px] lg:text-[14px] font-bold focus:outline-none placeholder:text-stone-300 transition-all"
          />
        </div>

        {/* Dropdown Selectors & Density Toggle */}
        <div className="flex flex-wrap items-center gap-3 p-1">
          <div className="hidden lg:flex bg-stone-50 rounded-2xl p-1 gap-1 border border-stone-100">
            <button
              onClick={() => setIsCompact(false)}
              className={`px-4 py-2 rounded-xl text-[14px] font-black transition-all ${!isCompact ? 'bg-white shadow-sm text-[#4F5BD5]' : 'text-stone-400 hover:text-stone-600'}`}
            >
              標準
            </button>
            <button
              onClick={() => setIsCompact(true)}
              className={`px-4 py-2 rounded-xl text-[12px] font-black transition-all ${isCompact ? 'bg-white shadow-sm text-[#4F5BD5]' : 'text-stone-400 hover:text-stone-600'}`}
            >
              コンパクト
            </button>
          </div>

          <select
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value)}
            className="flex-1 h-12 lg:h-14 bg-stone-50/80 border-none text-stone-700 text-[14px] lg:text-[14px] font-black px-6 lg:px-8 rounded-2xl outline-none focus:ring-4 focus:ring-[#4F5BD5]/10 hover:bg-stone-100 transition-all appearance-none cursor-pointer min-w-[140px]"
          >
            <option value="all">全ての役割</option>
            <option value="admin">管理者</option>
            <option value="executive">運営</option>
            <option value="member">メンバー</option>
            <option value="alumni">卒業生</option>
          </select>

          <select
            value={gradeFilter}
            onChange={e => setGradeFilter(e.target.value)}
            className="flex-1 h-12 lg:h-14 bg-stone-50/80 border-none text-stone-700 text-[13px] lg:text-[14px] font-black px-6 lg:px-8 rounded-2xl outline-none focus:ring-4 focus:ring-[#4F5BD5]/10 hover:bg-stone-100 transition-all appearance-none cursor-pointer min-w-[110px]"
          >
            <option value="all">全学年</option>
            <option value="1">1年生</option>
            <option value="2">2年生</option>
            <option value="3">3年生</option>
            <option value="4">4年生</option>
          </select>

          <button
            onClick={() => { setSearchTerm(''); setRoleFilter('all'); setGradeFilter('all'); setGenderFilter('all'); }}
            className="flex-none h-12 lg:h-14 px-5 lg:px-6 bg-stone-50 text-stone-400 hover:text-rose-500 rounded-2xl transition-all border border-transparent hover:border-rose-100"
            title="リセット"
          >
            <FilterX className="w-5 h-5" />
          </button>
        </div>
      </section>

      {/* 3. PERFORMANCE TABLE & MOBILE CARDS (Task 1, 2 & Mobile) */}
      <section className="flex-1 min-h-0 bg-transparent lg:bg-white/40 lg:border border-stone-100 rounded-[3rem] lg:rounded-[4rem] flex flex-col overflow-hidden">

        {/* Desktop View: Traditional Table */}
        <div className="hidden lg:block flex-1 overflow-x-auto custom-scrollbar">
          {isLoading ? (
            <MemberDirectorySkeleton />
          ) : (
            <table className="w-full text-left text-[16px] text-stone-600 border-separate border-spacing-0">
              <thead className="bg-stone-50/50 backdrop-blur-md sticky top-0 z-10">
                <tr>
                  <th className={`px-10 border-b border-stone-100 text-[14px] font-black uppercase tracking-[0.25em] text-stone-400 ${isCompact ? 'py-5' : 'py-7'}`}>氏名</th>
                  <th className={`px-8 border-b border-stone-100 text-[14px] font-black uppercase tracking-[0.25em] text-stone-400 ${isCompact ? 'py-5' : 'py-7'}`}>学籍番号 & メアド</th>
                  <th className={`px-8 border-b border-stone-100 text-[14px] font-black uppercase tracking-[0.25em] text-stone-400 ${isCompact ? 'py-5' : 'py-7'}`}>役割</th>
                  <th className={`px-8 border-b border-stone-100 text-[14px] font-black uppercase tracking-[0.25em] text-stone-400 ${isCompact ? 'py-5' : 'py-7'}`}>学年</th>
                  <th className={`px-10 text-right border-b border-stone-100 text-[14px] font-black uppercase tracking-[0.25em] text-stone-400 ${isCompact ? 'py-5' : 'py-7'}`}>アクション</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50/60 bg-white/20 font-sans">
                {paginatedData.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-10 py-48 text-center text-stone-200 uppercase tracking-[0.5em] font-black">データが見つかりません</td>
                  </tr>
                ) : (
                  <AnimatePresence mode="popLayout">
                    {paginatedData.map((mem) => {
                      const gradeStyle = getGradeBadge(mem.university_year);
                      return (
                        <motion.tr
                          key={mem.id}
                          layout
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="group hover:bg-stone-50/60 transition-all duration-300"
                        >
                          <td className={`px-10 ${isCompact ? 'py-4' : 'py-8'}`}>
                            <div className="flex items-center gap-5">
                              <div className="min-w-0">
                                <span className="font-extrabold text-stone-900 block truncate text-[14px]">{mem.users?.full_name || '—'}</span>
                                {!isCompact && <span className="text-[12px] font-black text-stone-300 uppercase tracking-widest">{mem.users?.full_name_kana || ''}</span>}
                              </div>
                            </div>
                          </td>
                          <td className={`px-8 ${isCompact ? 'py-4 text-[14px]' : 'py-8 text-[16px]'}`}>
                            <div className="font-extrabold text-stone-800 mb-1 flex items-center gap-2">{mem.users?.mssv || '—'}</div>
                            {!isCompact && <div className="text-[13px] font-bold text-stone-400 tracking-tight opacity-70">{mem.users?.email || '—'}</div>}
                          </td>
                          <td className={`px-8 ${isCompact ? 'py-4' : 'py-8'}`}>
                            <span className={`px-4 py-1.5 rounded-lg border-2 text-[10px] lg:text-[11px] font-black uppercase tracking-widest transition-all ${mem.role === 'admin' ? 'bg-[#D62976]/5 text-[#D62976] border-[#D62976]/10' :
                              mem.role === 'executive' ? 'bg-[#4F5BD5]/5 text-[#4F5BD5] border-[#4F5BD5]/10' :
                                mem.role === 'alumni' ? 'bg-stone-50 text-stone-400 border-stone-100 shadow-none' :
                                  'bg-[#FEDA75]/5 text-[#CDA01E] border-[#FEDA75]/10 shadow-sm'
                              }`}>
                              {mem.role === 'admin' ? '管理者' : mem.role === 'executive' ? '運営' : mem.role === 'alumni' ? '卒業生' : 'メンバー'}
                            </span>
                          </td>
                          <td className={`px-8 ${isCompact ? 'py-4 text-[14px]' : 'py-8 text-[16px]'}`}>
                            <div className={`inline-flex items-center gap-2 px-3 lg:px-4 py-1 lg:py-1.5 rounded-lg border-2 text-[11px] lg:text-[12px] font-black tracking-tight ${gradeStyle.bg} ${gradeStyle.text} ${gradeStyle.border}`}>
                              {gradeStyle.label}
                            </div>
                          </td>
                          <td className={`px-10 text-right ${isCompact ? 'py-4' : 'py-8'}`}>
                            <div className="flex items-center justify-end gap-3">
                              <button onClick={() => setSelectedMember(mem)} className="w-10 h-10 lg:w-12 lg:h-12 flex items-center justify-center bg-white border border-stone-100 text-stone-400 hover:text-stone-900 hover:border-stone-900 hover:shadow-2xl rounded-xl lg:rounded-2xl transition-all shadow-sm" title="詳細"><Eye className="w-4 h-4 lg:w-5 lg:h-5" /></button>
                            </div>
                          </td>
                        </motion.tr>
                      );
                    })}
                  </AnimatePresence>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Mobile View: Dynamic Card Grid (Touch Optimized) */}
        <div className="lg:hidden flex-1 overflow-y-auto space-y-4 px-1 py-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-48 gap-4">
              <div className="w-12 h-12 border-4 border-[#4F5BD5]/20 border-t-[#4F5BD5] rounded-full animate-spin" />
              <span className="text-sm font-black text-stone-300 uppercase tracking-[0.4em]">メンバーを読み込み中...</span>
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center py-20 bg-rose-50 rounded-[2rem] border border-rose-100 p-6 text-center">
              <Shield className="w-12 h-12 text-rose-200 mb-4" />
              <p className="text-[13px] font-black uppercase text-rose-500 tracking-widest mb-2">Error loading directory</p>
              <p className="text-[11px] font-bold text-rose-400 mb-6">セッションが切れたか、通信エラーが発生しました</p>
              <button onClick={() => refetch()} className="px-6 py-3 bg-white text-rose-500 rounded-xl font-black text-[12px] shadow-sm border border-rose-100 active:scale-95 transition-all">再試行する (Retry)</button>
            </div>
          ) : paginatedData.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 bg-white rounded-[2rem] border border-stone-100">
              <LayoutGrid className="w-12 h-12 text-stone-100 mb-4" />
              <p className="text-[13px] font-black uppercase text-stone-300 tracking-widest">該当するメンバーはいません</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {paginatedData.map(mem => {
                const g = getGradeBadge(mem.university_year);
                return (
                  <motion.div
                    key={mem.id}
                    onClick={() => setSelectedMember(mem)}
                    className="bg-white rounded-[2.5rem] p-6 border border-stone-100 shadow-xl shadow-stone-200/20 active:bg-stone-50 transition-all group"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <h4 className="text-[16px] font-black text-stone-900 tracking-tight leading-tight group-hover:text-[#4F5BD5] transition-colors truncate uppercase">{mem.users?.full_name}</h4>
                        <p className="text-[13px] font-bold text-stone-400 font-mono">{mem.users?.mssv}</p>
                      </div>
                      <span className={`shrink-0 px-4 py-1.5 rounded-xl border-2 text-[10px] font-black uppercase tracking-widest ${
                        mem.role === 'admin' ? 'bg-[#D62976]/5 text-[#D62976] border-[#D62976]/10' :
                        mem.role === 'executive' ? 'bg-[#4F5BD5]/5 text-[#4F5BD5] border-[#4F5BD5]/10' :
                        mem.role === 'alumni' ? 'bg-stone-50 text-stone-400 border-stone-100' :
                        'bg-[#FEDA75]/5 text-[#CDA01E] border-[#FEDA75]/10'
                      }`}>
                        {mem.role === 'admin' ? '管理者' : mem.role === 'executive' ? '運営' : mem.role === 'alumni' ? '卒業生' : '一般'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between border-t border-stone-50 pt-4 mt-2">
                       <div className={`px-4 py-1.5 rounded-lg border-2 text-[11px] font-black tracking-tight ${g.bg} ${g.text} ${g.border}`}>
                        {g.label}
                      </div>
                      <div className="flex items-center gap-2 text-stone-300">
                         <span className="text-[10px] font-black uppercase tracking-widest group-hover:text-stone-900 transition-colors">View Profile</span>
                         <Eye size={14} className="group-hover:text-[#4F5BD5] transition-colors" />
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>


        {/* ARTFUL PAGINATION (Task 1) */}
        {!isLoading && totalPages > 1 && (
          <div className="px-10 py-8 bg-stone-50/50 backdrop-blur-xl border-t border-stone-100 flex items-center justify-between shrink-0">
            <div className="hidden sm:block text-[13px] font-black text-stone-300 uppercase tracking-[0.3em]">
              全 {totalPages} ページ中 <span className="text-stone-900 border-b-2 border-[#4F5BD5] py-0.5">{currentPage}</span> ページを表示
            </div>
            <div className="flex gap-4 w-full sm:w-auto">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="flex-1 sm:flex-none w-14 h-14 flex items-center justify-center bg-white border border-stone-200 rounded-[1.2rem] disabled:opacity-20 disabled:scale-95 disabled:cursor-not-allowed hover:bg-stone-900 hover:text-white hover:border-stone-900 transition-all shadow-lg active:scale-90"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="flex-1 sm:flex-none w-14 h-14 flex items-center justify-center bg-white border border-stone-200 rounded-[1.2rem] disabled:opacity-20 disabled:scale-95 disabled:cursor-not-allowed hover:bg-[#4F5BD5] hover:text-white hover:border-[#4F5BD5] transition-all shadow-lg active:scale-90"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </div>
          </div>
        )}
      </section>

      <div className="lg:hidden fixed bottom-8 right-8 z-[100]">
        <button
          onClick={() => { setSelectedMember({ users: {}, role: 'member', university_year: 1 }); }}
          className="w-16 h-16 bg-[#4F5BD5] text-white rounded-full shadow-[0_20px_50px_rgba(79,91,213,0.5)] flex items-center justify-center active:scale-90 transition-all"
        >
          <UserPlus size={28} />
        </button>
      </div>

      {/* --- SLIDE OVER PANEL & MODALS --- */}
      <MemberDetailDrawer
        member={selectedMember}
        isOpen={!!selectedMember}
        onClose={() => setSelectedMember(null)}
        onSave={async (data) => {
          try {
            await saveMutation.mutateAsync({
              user_id: selectedMember.users?.id,
              membership_id: selectedMember.id,
              ...data,
              email: data.email // Use form's email
            });
            setSelectedMember(null); // Optional: close on save success
          } catch (err: any) {
             console.error('Save failed:', err);
             // Error breadcrumb already handled by mutation onError toast
          }
        }}
        onDelete={(id) => deleteMutation.mutate(id)}
      />

      <MemberImport
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
      />

      {/* Edit Form Modal is now integrated into MemberDetailDrawer */}

    </div>
  );
}
