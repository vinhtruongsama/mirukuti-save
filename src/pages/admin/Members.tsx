import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, 
  Edit2, 
  Trash2, 
  UserPlus, 
  FileUp,
  X,
  FilterX,
  ChevronLeft,
  ChevronRight,
  Shield,
  LayoutGrid
} from 'lucide-react';
import { toast } from 'sonner';

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
  email: z.string().email('無効なメールアドレスです'),
  mssv: z.string().min(1, '学籍番号を入力してください'),
  full_name: z.string().min(1, '名前を入力してください'),
  full_name_kana: z.string().optional(),
  gender: z.enum(['Male', 'Female', 'Other']).optional().nullable(),
  phone: z.string().optional(),
  university_email: z.string().email('無効な大学メールです').optional().or(z.literal('')),
  line_nickname: z.string().optional(),
  hometown: z.string().optional(),
  role: z.enum(['admin', 'executive', 'member', 'alumni']),
  department: z.string().optional(),
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
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<any>(null); // For Detail Drawer
  const [editingMember, setEditingMember] = useState<MemberFormData | null>(null);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<MemberFormData>({
    resolver: zodResolver(memberSchema),
    defaultValues: { role: 'member', university_year: 1 }
  });

  // --- DATA FETCHING (Supabase) ---
  const { 
    data: members = [], 
    isLoading, 
    isError, 
    error: queryError, 
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
      if (editingMember?.user_id && editingMember?.membership_id) {
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
        }).eq('id', editingMember.user_id);
        if (userError) throw userError;

        const { error: memError } = await supabase.from('club_memberships').update({
          role: data.role,
          department: data.department,
          university_year: data.university_year
        }).eq('id', editingMember.membership_id);
        if (memError) throw memError;

      } else {
        // Insert logic
        const { data: existingUser } = await supabase.from('users').select('id').eq('email', data.email).maybeSingle();
        let targetUserId = existingUser?.id;

        if (!targetUserId) {
          targetUserId = crypto.randomUUID();
          const { error: insertUserError } = await supabase.from('users').insert({
            id: targetUserId, email: data.email, mssv: data.mssv,
            full_name: data.full_name, full_name_kana: data.full_name_kana,
            gender: data.gender, phone: data.phone, university_email: data.university_email,
            line_nickname: data.line_nickname, hometown: data.hometown
          });
          if (insertUserError) throw insertUserError;
        }

        const { error: insertMemError } = await supabase.from('club_memberships').insert({
          user_id: targetUserId, academic_year_id: selectedYear!.id,
          role: data.role, department: data.department,
          university_year: data.university_year, is_active: true
        });
        if (insertMemError) throw insertMemError;
      }
    },
    onSuccess: () => {
      toast.success('データが保存されました');
      queryClient.invalidateQueries({ queryKey: ['admin-members'] });
      setIsFormOpen(false);
      setEditingMember(null);
      reset();
    },
    onError: (err: any) => toast.error(err.message)
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('club_memberships')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('メンバーを削除しました');
      queryClient.invalidateQueries({ queryKey: ['admin-members'] });
    }
  });

  // --- ACTIONS ---
  const handleEdit = (mem: any) => {
    const payload: MemberFormData = {
      user_id: mem.users.id,
      membership_id: mem.id,
      email: mem.users.email,
      mssv: mem.users.mssv || '',
      full_name: mem.users.full_name,
      full_name_kana: mem.users.full_name_kana || '',
      gender: mem.users.gender || null,
      phone: mem.users.phone || '',
      university_email: mem.users.university_email || '',
      line_nickname: mem.users.line_nickname || '',
      hometown: mem.users.hometown || '',
      role: mem.role as any,
      department: mem.department || '',
      university_year: mem.university_year,
    };
    setEditingMember(payload);
    reset(payload);
    setIsFormOpen(true);
  };

  // Grade styling logic (Task 2)
  const getGradeBadge = (year: number) => {
    switch (year) {
      case 1: return { bg: 'bg-[#4F5BD5]/10', text: 'text-[#4F5BD5]', border: 'border-[#4F5BD5]/20', label: '1年生' }; // Blue
      case 4: return { bg: 'bg-[#CDA01E]/10', text: 'text-[#CDA01E]', border: 'border-[#CDA01E]/20', label: '4年生' }; // Gold
      default: return { bg: 'bg-stone-50', text: 'text-stone-500', border: 'border-stone-100', label: `${year}年生` };
    }
  };

  return (
    <div className="min-h-full flex flex-col space-y-10 lg:space-y-12">
      
      {/* 1. PRESTIGIOUS HEADER (Task 3) */}
      <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-8 shrink-0">
        <div className="space-y-4">
           <div className="flex items-center gap-6">
              <div className="w-2.5 h-12 bg-stone-900 rounded-full" />
              <h1 className="text-4xl lg:text-6xl font-black text-stone-900 tracking-tight leading-none uppercase">メンバー名簿</h1>
           </div>
           <p className="text-stone-400 font-extrabold tracking-[0.4em] uppercase text-[13px] ml-9 opacity-80 flex items-center gap-3">
              <Shield className="w-5 h-5 text-stone-200" /> Member Directory / {selectedYear?.name} Database
           </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-4 w-full lg:w-auto">
          <button 
            onClick={() => setIsImportOpen(true)}
            className="flex-1 lg:flex-none flex items-center justify-center gap-4 px-8 py-5 bg-stone-50 hover:bg-stone-100 text-stone-900 rounded-[2rem] text-[15px] font-black tracking-tight border border-stone-200 transition-all active:scale-95 group shadow-sm"
          >
            <FileUp className="w-6 h-6 text-stone-400 group-hover:text-stone-900 transition-colors" /> スマートインポート
          </button>
          <button 
            onClick={() => { setEditingMember(null); reset({ role: 'member', university_year: 1 }); setIsFormOpen(true); }}
            className="flex-1 lg:flex-none flex items-center justify-center gap-4 px-10 py-5 bg-[#4F5BD5] hover:brightness-110 text-white rounded-[2rem] text-[15px] font-black tracking-tight transition-all shadow-[0_20px_50px_rgba(79,91,213,0.3)] active:scale-95 group"
          >
            <UserPlus className="w-6 h-6 group-hover:scale-110 transition-transform" /> 新規登録
          </button>
        </div>
      </header>

      {/* 2. ADVANCED FILTER BAR & DENSITY TOGGLE (Task 2) */}
      <section className="bg-white/70 backdrop-blur-3xl border border-stone-100 p-3 lg:p-4 rounded-[2rem] lg:rounded-[3.5rem] flex flex-col xl:flex-row gap-4 shrink-0 shadow-2xl shadow-stone-200/10">
        
        {/* Debounced Search Input */}
        <div className="relative flex-1 group">
          <Search className="absolute left-10 top-1/2 -translate-y-1/2 w-6 h-6 text-stone-300 group-focus-within:text-[#4F5BD5] transition-colors" />
          <input 
            type="text"
            placeholder="名前、学籍番号、メールで一括検索..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-20 pr-10 py-5 lg:py-6 bg-transparent text-stone-900 rounded-[2.5rem] text-[16px] lg:text-[17px] font-bold focus:outline-none placeholder:text-stone-300 transition-all"
          />
        </div>

        {/* Dropdown Selectors & Density Toggle */}
        <div className="flex flex-wrap items-center gap-3 p-1">
          <div className="hidden lg:flex bg-stone-50 rounded-2xl p-1 gap-1 border border-stone-100">
            <button 
              onClick={() => setIsCompact(false)}
              className={`px-4 py-2 rounded-xl text-[12px] font-black transition-all ${!isCompact ? 'bg-white shadow-sm text-[#4F5BD5]' : 'text-stone-400 hover:text-stone-600'}`}
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
            className="flex-1 h-12 lg:h-14 bg-stone-50/80 border-none text-stone-700 text-[13px] lg:text-[14px] font-black px-6 lg:px-8 rounded-2xl outline-none focus:ring-4 focus:ring-[#4F5BD5]/10 hover:bg-stone-100 transition-all appearance-none cursor-pointer min-w-[120px]"
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
                  <th className={`px-10 border-b border-stone-100 text-[12px] font-black uppercase tracking-[0.25em] text-stone-400 ${isCompact ? 'py-5' : 'py-7'}`}>氏名</th>
                  <th className={`px-8 border-b border-stone-100 text-[12px] font-black uppercase tracking-[0.25em] text-stone-400 ${isCompact ? 'py-5' : 'py-7'}`}>学籍番号 & メアド</th>
                  <th className={`px-8 border-b border-stone-100 text-[12px] font-black uppercase tracking-[0.25em] text-stone-400 ${isCompact ? 'py-5' : 'py-7'}`}>役割</th>
                  <th className={`px-8 border-b border-stone-100 text-[12px] font-black uppercase tracking-[0.25em] text-stone-400 ${isCompact ? 'py-5' : 'py-7'}`}>学部・学年</th>
                  <th className={`px-10 text-right border-b border-stone-100 text-[12px] font-black uppercase tracking-[0.25em] text-stone-400 ${isCompact ? 'py-5' : 'py-7'}`}>アクション</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50/60 bg-white/20 font-sans">
                {paginatedData.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-10 py-48 text-center text-stone-200 uppercase tracking-[0.5em] font-black">No Data Found</td>
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
                          onClick={() => setSelectedMember(mem)}
                          className="group hover:bg-stone-50/60 transition-all duration-300 cursor-pointer"
                        >
                          <td className={`px-10 ${isCompact ? 'py-4' : 'py-8'}`}>
                            <div className="flex items-center gap-5">
                               <div className={`rounded-xl bg-stone-50 border border-stone-100 flex items-center justify-center font-black text-stone-400 shadow-sm group-hover:bg-white group-hover:scale-105 transition-all ${isCompact ? 'w-10 h-10 text-[13px]' : 'w-14 h-14 text-xl'}`}>
                                  {mem.users?.full_name?.charAt(0) || 'U'}
                               </div>
                               <div className="min-w-0">
                                 <span className={`font-extrabold text-stone-900 block truncate ${isCompact ? 'text-[15px]' : 'text-[18px]'}`}>{mem.users?.full_name || '—'}</span>
                                 {!isCompact && <span className="text-[12px] font-black text-stone-300 uppercase tracking-widest">{mem.users?.full_name_kana || ''}</span>}
                               </div>
                            </div>
                          </td>
                          <td className={`px-8 ${isCompact ? 'py-4 text-[14px]' : 'py-8 text-[16px]'}`}>
                            <div className="font-extrabold text-stone-800 mb-1 flex items-center gap-2">{mem.users?.mssv || '—'}</div>
                            {!isCompact && <div className="text-[13px] font-bold text-stone-400 tracking-tight opacity-70 underline underline-offset-4 decoration-stone-200">{mem.users?.email || '—'}</div>}
                          </td>
                          <td className={`px-8 ${isCompact ? 'py-4' : 'py-8'}`}>
                            <span className={`px-4 py-1.5 rounded-lg border-2 text-[10px] lg:text-[11px] font-black uppercase tracking-widest transition-all ${
                              mem.role === 'admin' ? 'bg-[#D62976]/5 text-[#D62976] border-[#D62976]/10' :
                              mem.role === 'executive' ? 'bg-[#4F5BD5]/5 text-[#4F5BD5] border-[#4F5BD5]/10' :
                              mem.role === 'alumni' ? 'bg-stone-50 text-stone-400 border-stone-100 shadow-none' :
                              'bg-[#FEDA75]/5 text-[#CDA01E] border-[#FEDA75]/10 shadow-sm'
                            }`}>
                              {mem.role === 'admin' ? '管理者' : mem.role === 'executive' ? '運営' : mem.role === 'alumni' ? '卒業生' : 'メンバー'}
                            </span>
                          </td>
                          <td className={`px-8 ${isCompact ? 'py-4 text-[14px]' : 'py-8 text-[16px]'}`}>
                            {!isCompact && <div className="font-bold text-stone-700 mb-2">{mem.department || '未設定'}</div>}
                            <div className={`inline-flex items-center gap-2 px-3 lg:px-4 py-1 lg:py-1.5 rounded-lg border-2 text-[11px] lg:text-[12px] font-black tracking-tight ${gradeStyle.bg} ${gradeStyle.text} ${gradeStyle.border}`}>
                               {gradeStyle.label}
                            </div>
                          </td>
                          <td className={`px-10 text-right ${isCompact ? 'py-4' : 'py-8'}`}>
                            <div className="flex items-center justify-end gap-2 lg:gap-3" onClick={e => e.stopPropagation()}>
                              <button onClick={() => handleEdit(mem)} className="w-10 h-10 lg:w-12 lg:h-12 flex items-center justify-center bg-white border border-stone-100 text-stone-400 hover:text-[#4F5BD5] hover:border-[#4F5BD5]/40 hover:shadow-2xl rounded-xl lg:rounded-2xl transition-all"><Edit2 className="w-4 h-4 lg:w-5 lg:h-5" /></button>
                              <button onClick={() => window.confirm('削除しますか？') && deleteMutation.mutate(mem.id)} className="w-10 h-10 lg:w-12 lg:h-12 flex items-center justify-center bg-white border border-stone-100 text-stone-400 hover:text-rose-500 hover:border-rose-200 hover:shadow-2xl rounded-xl lg:rounded-2xl transition-all"><Trash2 className="w-4 h-4 lg:w-5 lg:h-5" /></button>
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
                <span className="text-sm font-black text-stone-300 uppercase tracking-[0.4em]">Loading members...</span>
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
               <p className="text-[13px] font-black uppercase text-stone-300 tracking-widest">No entries found</p>
             </div>
           ) : (
             <div className="grid grid-cols-1 gap-4">
               {paginatedData.map(mem => {
                 const g = getGradeBadge(mem.university_year);
                 return (
                   <motion.div 
                     key={mem.id}
                     whileTap={{ scale: 0.98 }}
                     onClick={() => setSelectedMember(mem)}
                     className="bg-white rounded-[2.5rem] p-6 border border-stone-100 shadow-xl shadow-stone-200/20 space-y-4 active:bg-stone-50 transition-colors"
                   >
                     <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                           <div className="w-14 h-14 rounded-2xl bg-stone-50 border border-stone-100 flex items-center justify-center font-black text-stone-400 shadow-sm text-xl">
                              {mem.users?.full_name?.charAt(0) || 'U'}
                           </div>
                           <div>
                              <h4 className="text-[17px] font-black text-stone-900 tracking-tight">{mem.users?.full_name}</h4>
                              <p className="text-[13px] font-bold text-stone-800">{mem.users?.mssv}</p>
                           </div>
                        </div>
                        <span className={`px-4 py-1.5 rounded-xl border-2 text-[10px] font-black uppercase tracking-widest ${mem.role === 'admin' ? 'bg-rose-50 text-rose-500 border-rose-100' : mem.role === 'executive' ? 'bg-indigo-50 text-indigo-500 border-indigo-100' : 'bg-stone-50 text-stone-400 border-stone-100'}`}>
                          {mem.role === 'admin' ? '管理者' : mem.role === 'executive' ? '運営' : '一般'}
                        </span>
                     </div>
                     
                     <div className="flex items-center justify-between border-t border-stone-50 pt-4">
                        <div className={`px-4 py-1.5 rounded-lg border-2 text-[11px] font-black ${g.bg} ${g.text} ${g.border}`}>
                           {g.label}
                        </div>
                        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                           <button onClick={(e) => { e.stopPropagation(); handleEdit(mem); }} className="w-10 h-10 flex items-center justify-center bg-stone-50 rounded-xl text-stone-400 active:bg-stone-900 active:text-white transition-all"><Edit2 size={16} /></button>
                           <button onClick={(e) => { e.stopPropagation(); window.confirm('削除？') && deleteMutation.mutate(mem.id); }} className="w-10 h-10 flex items-center justify-center bg-stone-50 rounded-xl text-stone-400 active:bg-rose-500 active:text-white transition-all"><Trash2 size={16} /></button>
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
               Showing <span className="text-stone-900 border-b-2 border-[#4F5BD5] py-0.5">{currentPage}</span> / {totalPages} Pages
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

      {/* 4. MOBILE FLOATING ACTION BUTTON (Task: Ease for Mobile) */}
      <div className="lg:hidden fixed bottom-8 right-8 z-[100]">
        <button 
            onClick={() => { setEditingMember(null); reset({ role: 'member', university_year: 1 }); setIsFormOpen(true); }}
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
      />

      <MemberImport 
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
      />

      {/* Edit Form Modal (Traditional Dialog remains for heavy editing) */}
      <AnimatePresence>
        {isFormOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
             <motion.div 
               initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
               onClick={() => setIsFormOpen(false)}
               className="absolute inset-0 bg-stone-900/40 backdrop-blur-md"
             />
             <motion.div 
               initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
               className="relative w-full max-w-2xl bg-white rounded-[3rem] shadow-2xl p-0 overflow-hidden flex flex-col max-h-[90vh]"
             >
                <div className="p-10 border-b border-stone-100 flex justify-between items-center bg-stone-50/50">
                  <h2 className="text-3xl font-black text-stone-900 tracking-tight">
                    {editingMember ? 'メンバー編集' : '新規登録'}
                  </h2>
                  <button onClick={() => setIsFormOpen(false)} className="p-3 bg-white rounded-2xl hover:bg-stone-900 hover:text-white transition-all shadow-sm">
                    <X size={24} />
                  </button>
                </div>

                <div className="p-10 overflow-y-auto custom-scrollbar flex-1 bg-white">
                  <form id="member-form" onSubmit={handleSubmit((d) => saveMutation.mutate(d))} className="space-y-10">
                    <div className="space-y-6">
                      <label className="text-[11px] font-black uppercase text-[#4F5BD5] tracking-[0.3em]">Basic Profile</label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                         <div className="space-y-2">
                            <span className="text-[11px] font-black uppercase text-stone-400 tracking-widest pl-1">氏名 *</span>
                            <input {...register('full_name')} className="w-full h-14 bg-stone-50 rounded-2xl px-6 font-bold outline-none border border-transparent focus:border-[#4F5BD5]/20 focus:bg-white transition-all" />
                            {errors.full_name && <p className="text-red-500 text-[10px] font-black ml-2">{errors.full_name.message}</p>}
                         </div>
                         <div className="space-y-2">
                            <span className="text-[11px] font-black uppercase text-stone-400 tracking-widest pl-1">学籍番号 *</span>
                            <input {...register('mssv')} className="w-full h-14 bg-stone-50 rounded-2xl px-6 font-bold outline-none border border-transparent focus:border-[#4F5BD5]/20 focus:bg-white transition-all" />
                         </div>
                      </div>
                      <div className="space-y-2">
                        <span className="text-[11px] font-black uppercase text-stone-400 tracking-widest pl-1">メールアドレス *</span>
                        <input {...register('email')} readOnly={!!editingMember} className="w-full h-14 bg-stone-50 rounded-2xl px-6 font-bold opacity-80" />
                      </div>
                    </div>

                    <div className="space-y-6">
                      <label className="text-[11px] font-black uppercase text-[#D62976] tracking-[0.3em]">Club Configuration</label>
                      <div className="grid grid-cols-2 gap-6">
                         <div className="space-y-2">
                            <span className="text-[11px] font-black uppercase text-stone-400 tracking-widest pl-1">役割</span>
                            <select {...register('role')} className="w-full h-14 bg-stone-50 rounded-2xl px-6 font-bold outline-none appearance-none">
                              <option value="member">メンバー</option>
                              <option value="executive">運営</option>
                              <option value="admin">管理者</option>
                              <option value="alumni">卒業生</option>
                            </select>
                         </div>
                         <div className="space-y-2">
                            <span className="text-[11px] font-black uppercase text-stone-400 tracking-widest pl-1">学年</span>
                            <select {...register('university_year', { valueAsNumber: true })} className="w-full h-14 bg-stone-50 rounded-2xl px-6 font-bold outline-none appearance-none">
                              <option value={1}>1年生</option>
                              <option value={2}>2年生</option>
                              <option value={3}>3年生</option>
                              <option value={4}>4年生</option>
                            </select>
                         </div>
                      </div>
                    </div>
                  </form>
                </div>

                <div className="p-10 border-t border-stone-100 flex gap-4 bg-stone-50/50">
                  <button onClick={() => setIsFormOpen(false)} className="flex-1 h-16 bg-white rounded-[1.5rem] font-black border border-stone-200">キャンセル</button>
                  <button 
                    type="submit" 
                    form="member-form"
                    disabled={saveMutation.isPending}
                    className="flex-1 h-16 bg-[#4F5BD5] text-white rounded-[1.5rem] font-black shadow-xl"
                  >
                    {saveMutation.isPending ? '保存中...' : '保存する'}
                  </button>
                </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
