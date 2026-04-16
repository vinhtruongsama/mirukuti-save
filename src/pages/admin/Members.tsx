import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { Search, Eye, UserPlus, FileUp, FilterX, ChevronLeft, ChevronRight, Shield, LayoutGrid, Archive, Download } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store/useAppStore';
import { useDebounce } from '../../hooks/useDebounce';
import { cn } from '../../lib/utils';

// --- NEW REFINED COMPONENTS ---
import { MemberDirectorySkeleton } from '../../components/members/MemberDirectorySkeleton';
import MemberDetailDrawer from '../../components/members/MemberDetailDrawer';
import MemberImport from '../../components/members/MemberImport';

import { useAuthStore } from '../../store/useAuthStore';

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
  university_email: z.string().min(1, '大学メールを入力してください').email('無効な大学メールです'),
  line_nickname: z.string().optional(),
  hometown: z.string().optional(),
  role: z.enum(['president', 'vice_president', 'treasurer', 'executive', 'member', 'alumni']),
  university_year: z.number().min(0).max(4),
  nationality: z.string().optional(),
});

type MemberFormData = z.infer<typeof memberSchema>;

export default function Members() {
  const queryClient = useQueryClient();
  const { currentUser } = useAuthStore();
  const { selectedYear } = useAppStore();

  // 0. Check Permission: Only 'president' (部長) can grant roles
  const { data: currentUserMembership } = useQuery({
    queryKey: ['current-user-rank', currentUser?.id, selectedYear?.id],
    queryFn: async () => {
      if (!currentUser || !selectedYear) return null;
      const { data, error } = await supabase
        .from('club_memberships')
        .select('role')
        .eq('user_id', currentUser.id)
        .eq('academic_year_id', selectedYear.id)
        .single();
      if (error) return null;
      return data;
    },
    enabled: !!currentUser && !!selectedYear
  });

  const isPresident = currentUserMembership?.role === 'president';
  const isVicePresident = currentUserMembership?.role === 'vice_president';
  const isExecutive = currentUserMembership?.role === 'executive';

  const canEditMembers = isPresident || isVicePresident || isExecutive;
  const canToggleDisclosure = isPresident || isVicePresident;

  // --- UI STATES ---
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 300); // Task 1: 300ms debounce
  const [roleFilter, setRoleFilter] = useState('all');
  const [gradeFilter, setGradeFilter] = useState('all');
  const [genderFilter, setGenderFilter] = useState('all');
  const [onlyNewFilter, setOnlyNewFilter] = useState(false); // Task: New member filter

  const [currentPage, setCurrentPage] = useState(1);
  const isCompact = false; // Density toggle UI removed as requested
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
      const { data, error } = await supabase
        .from('club_memberships')
        .select(`
          *,
          users!inner(*)
        `)
        .eq('academic_year_id', selectedYear.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedYear,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  // Helper: New Member check (From DB Column)
  const isNewlyAdded = (user?: any) => {
    return !!user?.is_new;
  };

  // --- FILTER & PAGINATION LOGIC ---
  const filteredData = useMemo(() => {
    let result = [...members];

    if (roleFilter !== 'all') {
      result = result.filter(m => m.role === roleFilter);
    }

    if (gradeFilter !== 'all') {
      result = result.filter(m => m.users?.university_year === parseInt(gradeFilter));
    }

    if (genderFilter !== 'all') {
      result = result.filter(m => m.users?.gender === genderFilter);
    }

    if (onlyNewFilter) {
      result = result.filter(m => isNewlyAdded(m.users));
    }

    const query = debouncedSearch?.trim().toLowerCase();
    if (query) {
      result = result.filter(m =>
        (m.users?.full_name?.toLowerCase().includes(query)) ||
        (m.users?.full_name_kana?.toLowerCase().includes(query)) ||
        (m.users?.mssv?.toLowerCase().includes(query)) ||
        (m.users?.email?.toLowerCase().includes(query))
      );
    }
    return result;
  }, [members, roleFilter, gradeFilter, genderFilter, debouncedSearch, onlyNewFilter]);

  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const paginatedData = useMemo(() => {
    return filteredData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  }, [filteredData, currentPage]);

  // --- APP SETTINGS (Global Toggle) ---
  const { data: settings, isLoading: isSettingsLoading } = useQuery({
    queryKey: ['app-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('*');
      if (error) throw error;

      return data.reduce((acc: any, curr) => {
        acc[curr.key] = curr.value;
        return acc;
      }, {});
    }
  });
  const isSeniorAdmin = isPresident || isVicePresident;
  // Members management is for admins only, so we always show full info to them
  // regardless of the toggle on My Page (which is for members)
  const isFullDisclosure = true; 

  const toggleEditMutation = useMutation({
    mutationFn: async (currentVal: boolean) => {
      const { error } = await supabase
        .from('app_settings')
        .update({ value: (!currentVal) as any })
        .eq('key', 'allow_profile_edit');
      if (error) throw error;
      return !currentVal;
    },
    onSuccess: (newValue) => {
      queryClient.invalidateQueries({ queryKey: ['app-settings'] });
      toast.success(newValue ? '編集モードを再開しました' : '編集モードを停止しました');
    },
    onError: (err: any) => toast.error(err.message)
  });

  // Reset page when triggers change
  useEffect(() => {
    setCurrentPage(1);
  }, [roleFilter, gradeFilter, genderFilter, onlyNewFilter, debouncedSearch]);

  // --- MUTATIONS ---
  const saveMutation = useMutation({
    mutationFn: async (data: MemberFormData & { password?: string }) => {
      let finalUserId = data.user_id;

      if (data.user_id && data.membership_id) {
        // Update existing
        const { error: userError } = await supabase.from('users').update({
          full_name: data.full_name,
          full_name_kana: data.full_name_kana,
          gender: data.gender,
          email: data.email && data.email.trim() !== '' ? data.email.trim() : null,
          mssv: data.mssv,
          phone: data.phone,
          university_email: data.university_email,
          line_nickname: data.line_nickname,
          hometown: data.hometown,
          nationality: data.nationality,
          university_year: data.university_year // Year moved here
        }).eq('id', data.user_id);
        if (userError) throw userError;

        const { error: memError } = await supabase.from('club_memberships').update({
          role: data.role,
        }).eq('id', data.membership_id);
        if (memError) throw memError;

      } else {
        // --- SMART UPSERT LOGIC (Manual Registration) ---
        const emailToUse = data.email && data.email.trim() !== '' ? data.email.trim() : null;

        // 1. Check if MSSV exists
        const { data: existingUser } = await supabase
          .from('users')
          .select('id, email, full_name, deleted_at')
          .eq('mssv', data.mssv)
          .maybeSingle();

        // 2. Handle Archived status
        if (existingUser && existingUser.deleted_at !== null) {
          toast.error('Thành viên này đang nằm trong Archive. Vui lòng khôi phục từ danh sách đã xóa.');
          throw new Error('User archived');
        }

        // 3. Prevent Email hijacking from another user
        if (emailToUse) {
          const { data: userWithEmail } = await supabase
            .from('users')
            .select('id, mssv, full_name')
            .eq('email', emailToUse)
            .maybeSingle();

          if (userWithEmail && userWithEmail.id !== existingUser?.id) {
            toast.error(`Email này đang được sử dụng bởi [${userWithEmail.mssv} - ${userWithEmail.full_name}]. Không thể gán cho người khác.`);
            throw new Error('Email conflict');
          }
        }

        let targetUserId = existingUser?.id;

        // 4. Upsert User (Update details if exists, else create)
        const { data: savedUser, error: upsertUserError } = await supabase
          .from('users')
          .upsert({
            id: targetUserId || undefined, // Supabase generates ID if undefined
            mssv: data.mssv,
            full_name: data.full_name,
            full_name_kana: data.full_name_kana,
            gender: data.gender,
            phone: data.phone,
            university_email: data.university_email,
            email: emailToUse,
            line_nickname: data.line_nickname,
            hometown: data.hometown,
            university_year: data.university_year,
            nationality: data.nationality,
            is_new: !targetUserId // Only set "new" badge if truly new
          }, { onConflict: 'mssv' })
          .select('id')
          .single();

        if (upsertUserError) {
          toast.error('Lỗi khi lưu thông tin thành viên: ' + upsertUserError.message);
          throw upsertUserError;
        }

        targetUserId = savedUser.id;

        // Check if membership is archived, we should probably also block, but since the user table error caught it, it's fine.
        // Wait, if the user was active but membership was deleted, we should restore membership.
        const { error: insertMemError } = await supabase.from('club_memberships').upsert({
          user_id: targetUserId, academic_year_id: selectedYear!.id,
          role: data.role,
          is_active: true,
          deleted_at: null // If membership was deleted but user wasn't, just restore it
        }, { onConflict: 'user_id,academic_year_id' });
        if (insertMemError) throw insertMemError;

        finalUserId = targetUserId;
      }

      // Handle Password Assignment & Auth sync
      try {
        // MUST ensure they exist in auth.users first before manipulating passwords
        const { error: ensureAuthError } = await supabase.rpc('admin_ensure_member_auth', {
          p_mssv: data.mssv
        });
        if (ensureAuthError) console.warn("Failed to ensure auth user:", ensureAuthError);

        let targetPassword = data.password?.trim();
        // Custom password only required/used if they're an admin, members use their MSSV as default (handled by ensure function)
        if (data.role !== 'member' && targetPassword && targetPassword !== '') {
          const { error: pwdError } = await supabase.rpc('admin_set_user_password', {
            p_target_user_id: finalUserId,
            p_new_password: targetPassword
          });
          if (pwdError) console.warn("Failed to set custom password:", pwdError);
        }
      } catch (err) {
        console.warn("Auth sync skipped:", err);
      }
    },
    onSuccess: () => {
      toast.success('データが保存されました');
      queryClient.invalidateQueries({ queryKey: ['admin-members'] });
      queryClient.invalidateQueries({ queryKey: ['archived-members'] });
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
      toast.success('解除箱に入れました');
      queryClient.invalidateQueries({ queryKey: ['admin-members'] });
      queryClient.invalidateQueries({ queryKey: ['archived-members'] });
    }
  });

  // --- ACTIONS ---
  const exportToExcel = () => {
    try {
      const ws = XLSX.utils.json_to_sheet([]);

      const exportHeaders = ['No', '学籍番号', '氏名', 'フリガナ', '学年', '役割'];
      if (isFullDisclosure) {
        exportHeaders.push('性別', '電話番号', '大学メール', 'メール', 'LINEニックネーム', '国籍');
      }

      const headers = [
        ['部員一覧表'],
        [`エクスポート日時：${format(new Date(), 'yyyy-MM-dd HH:mm:ss')}`],
        [isFullDisclosure ? '全ての情報を開示' : '制限された情報の開示（氏名・学籍番号のみ）'],
        [''],
        exportHeaders
      ];

      XLSX.utils.sheet_add_aoa(ws, headers, { origin: 'A1' });

      const rowData = filteredData.map((m: any, idx) => {
        const row = [
          idx + 1,
          m.users?.mssv || '',
          m.users?.full_name || '',
          m.users?.full_name_kana || '',
          m.users?.university_year || '',
          m.role === 'president' ? '部長' :
            m.role === 'vice_president' ? '副部長' :
              m.role === 'treasurer' ? '会計' :
                m.role === 'executive' ? '幹部' :
                  m.role === 'alumni' ? '卒業生' : '部員',
        ];

        if (isFullDisclosure) {
          row.push(
            m.users?.gender === 'Male' ? '男性' : m.users?.gender === 'Female' ? '女性' : 'その他',
            m.users?.phone || '',
            m.users?.university_email || '',
            m.users?.email || '',
            m.users?.line_nickname || '',
            m.users?.nationality || ''
          );
        }
        return row;
      });

      XLSX.utils.sheet_add_aoa(ws, rowData, { origin: 'A5' });

      // Add Total Row
      const totalRowOrigin = `A${rowData.length + 5}`;
      XLSX.utils.sheet_add_aoa(ws, [
        ['合計:', filteredData.length]
      ], { origin: totalRowOrigin });

      // Column widths
      ws['!cols'] = [
        { wch: 6 },  // No
        { wch: 15 }, // MSSV
        { wch: 20 }, // Full Name
        { wch: 30 }, // Furigana
        { wch: 5 }, // Grade
        { wch: 5 }, // Role
        { wch: 10 }, // Gender
        { wch: 15 }, // Phone
        { wch: 35 }, // Uni Email
        { wch: 35 }, // Personal Email
        { wch: 20 }, // LINE Nickname
        { wch: 15 }  // Nationality
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Members');

      const fileName = `Member_List_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`;
      XLSX.writeFile(wb, fileName);
      toast.success('Excelをエクスポートしました');
    } catch (error: any) {
      console.error('Export error:', error);
      toast.error('エクスポートに失敗しました');
    }
  };

  // Note: Edit and Delete are handled via MemberDetailDrawer

  // Grade styling logic (Task 2)
  const getGradeBadge = (year: number): { bg: string; text: string; border: string; label: string } => {
    const validYear = (year === 0 || year) ? year : 1; // 0 (alumni) is a valid year
    switch (validYear) {
      case 0: return { bg: 'bg-stone-50', text: 'text-stone-400', border: 'border-stone-100', label: '卒業生' };
      case 1: return { bg: 'bg-[#06C755]/10', text: 'text-[#06C755]', border: 'border-[#06C755]/20', label: '1年生' }; // LINE Green
      case 2: return { bg: 'bg-[#4F5BD5]/10', text: 'text-[#4F5BD5]', border: 'border-[#4F5BD5]/20', label: '2年生' }; // Blue
      case 3: return { bg: 'bg-rose-500/10', text: 'text-rose-500', border: 'border-rose-500/20', label: '3年生' }; // Red
      case 4: return { bg: 'bg-purple-500/10', text: 'text-purple-500', border: 'border-purple-500/20', label: '4年生' }; // Purple
      default: return { bg: 'bg-stone-50', text: 'text-stone-500', border: 'border-stone-100', label: `${validYear}年生` };
    }
  };

  return (
    <div className="min-h-full flex flex-col space-y-8 lg:space-y-12">
      {/* 1. PRESTIGIOUS HEADER (App-Style Optimized) */}
      <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 lg:gap-8 shrink-0 px-2 lg:px-0">
        <div className="flex flex-row items-center justify-between w-full lg:w-auto">
          <div className="w-1.5 h-12 mr-4 rounded-full bg-gradient-to-b from-[#D62976] to-[#4F5BD5] mt-1 hidden sm:block" />
          <div className="flex flex-col">
            <h1 className="text-[32px] lg:text-[48px] font-black text-stone-900 tracking-tighter leading-none mb-1 lg:mb-2 text-glow">部員一覧表</h1>
            <div className="flex items-center gap-2 text-[10px] lg:text-[12px] font-black uppercase tracking-[0.4em]">

            </div>
          </div>
        </div>

        {/* TOP LEVEL ACTIONS */}
        <div className="w-full lg:w-auto flex flex-wrap items-center justify-end gap-3 lg:gap-4 order-last lg:order-none mt-4 lg:mt-0">
          {canEditMembers && (
            <>
              <button
                onClick={exportToExcel}
                className="h-12 lg:h-14 flex-2 sm:flex-none px-4 lg:px-8 bg-white border border-stone-100 text-[#4F5BD5] rounded-2xl lg:rounded-[1.8rem] text-[12px] lg:text-[13px] font-black shadow-sm transition-all hover:bg-indigo-50 active:scale-95 flex items-center justify-center gap-2"
              >
                <Download size={16} className="text-[#4F5BD5]" />
                <span>EXCEL</span>
              </button>

              <button
                onClick={() => setIsImportOpen(true)}
                className="h-12 lg:h-14 flex-2 sm:flex-none px-4 lg:px-8 bg-white border border-stone-100 text-stone-600 rounded-2xl lg:rounded-[1.8rem] text-[12px] lg:text-[13px] font-black shadow-sm transition-all hover:bg-stone-50 active:scale-95 flex items-center justify-center gap-2"
              >
                <FileUp size={16} className="text-stone-500" />
                <span>インポート</span>
              </button>

              <button
                onClick={() => { setSelectedMember({ users: {}, role: 'member', university_year: 1 }); }}
                className="h-12 lg:h-14 flex-1 sm:flex-none px-6 lg:px-10 bg-[#4F5BD5] text-white rounded-2xl lg:rounded-[1.8rem] text-[12px] lg:text-[13px] font-black shadow-lg shadow-[#4F5BD5]/20 hover:bg-[#3d4bb5] transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                <UserPlus size={18} />
                <span>登録</span>
              </button>
            </>
          )}

          <Link
            to="/admin/members/archived"
            className="h-12 lg:h-14 flex-1 sm:flex-none px-4 lg:px-8 bg-white border border-stone-100 text-stone-600 rounded-2xl lg:rounded-[1.8rem] text-[12px] lg:text-[13px] font-black shadow-sm transition-all hover:bg-stone-50 active:scale-95 flex items-center justify-center gap-2 group"
            title="アーカイブ管理"
          >
            <Archive size={16} className="text-stone-900 group-hover:text-rose-500 transition-colors" />
            <span>解除された部員</span>
          </Link>
        </div>
      </header>

      {/* 2. ADMIN INSIGHTS - GLOBAL TOGGLE */}
      <div className="space-y-6 lg:space-y-10">
        <div className="w-full lg:w-fit bg-stone-900/5 backdrop-blur-xl border border-stone-200/40 p-4 lg:p-5 rounded-[2rem] shadow-sm overflow-hidden">
          <div className="flex items-center gap-6 lg:gap-12">
            <div className="flex items-center gap-4">
              <div className={cn(
                "w-10 h-10 lg:w-12 lg:h-12 rounded-xl flex items-center justify-center transition-colors duration-500",
                isSettingsLoading
                  ? "bg-stone-100"
                  : settings?.allow_profile_edit
                    ? "bg-emerald-500 shadow-lg shadow-emerald-500/20"
                    : "bg-white border border-stone-200"
              )}>
                <Shield className={cn("w-5 h-5", (settings?.allow_profile_edit && !isSettingsLoading) ? "text-white" : "text-stone-300")} />
              </div>
              <div>
                <p className="text-[14px] lg:text-[16px] font-black text-stone-900 tracking-tight leading-tight mb-0.5">
                  マイページの開示 : <span className={isSettingsLoading ? "text-stone-300" : settings?.allow_profile_edit ? "text-emerald-600" : "text-rose-500"}>
                    {isSettingsLoading ? '読み込み中...' : settings?.allow_profile_edit ? 'ON' : 'OFF'}
                  </span>
                </p>
                <div className="flex items-center gap-2">
                  <span className={cn("text-[13px] font-bold uppercase tracking-widest", isSettingsLoading ? "text-stone-300" : settings?.allow_profile_edit ? "text-emerald-500" : "text-rose-400")}>
                    {isSettingsLoading ? '設定を確認しています' : settings?.allow_profile_edit ? '全ての情報を開示中' : '部員には氏名・学籍番号のみ表示'}
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={() => toggleEditMutation.mutate(settings?.allow_profile_edit ?? false)}
              disabled={isSettingsLoading || toggleEditMutation.isPending || !canToggleDisclosure}
              className={cn(
                "relative inline-flex h-7 w-12 items-center rounded-full transition-all duration-500",
                (settings?.allow_profile_edit && !isSettingsLoading) ? 'bg-emerald-500' : 'bg-stone-300'
              )}
            >
              <div className={cn(
                "h-5 w-5 transform rounded-full bg-white shadow-md transition-all duration-500",
                (settings?.allow_profile_edit && !isSettingsLoading) ? "translate-x-6" : "translate-x-1"
              )} />
            </button>
          </div>
        </div>

        {/* 3. ADVANCED FILTER BAR & DENSITY TOGGLE (Task 2) */}
        <section className="bg-white/70 backdrop-blur-3xl border border-stone-100 p-3 lg:p-4 rounded-[2rem] lg:rounded-[3.5rem] flex flex-col xl:flex-row gap-4 shrink-0 shadow-2xl shadow-stone-200/10">

          {/* Debounced Search Input */}
          <div className="relative flex-1 group">
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-14 h-14 flex items-center justify-center pointer-events-none z-10">
              <Search className="w-5 h-5 text-stone-500 group-focus-within:text-[#D62976] transition-all duration-300 group-focus-within:scale-110" />
            </div>
            <input
              type="text"
              placeholder="名前、フリガナ、学籍番号で検索..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-14 lg:h-16 pl-14 pr-10 bg-stone-50 border-2 border-stone-200 focus:border-[#D62976] focus:bg-white rounded-3xl text-[14px] lg:text-[15px] font-bold text-stone-900 focus:outline-none placeholder:text-stone-400 transition-all shadow-sm group-hover:border-stone-300"
            />
          </div>

          {/* Dropdown Selectors & Density Toggle */}
          <div className="flex flex-wrap items-center gap-3 p-1">
            <div className="hidden lg:flex items-center px-6 bg-stone-50/50 rounded-2xl border border-stone-100 h-11">
              <span className="text-[14px] font-black text-stone-900 tracking-tighter">
                {filteredData.length} <span className="text-stone-600 font-bold ml-1">結果</span>
              </span>
            </div>

            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="h-11 bg-white border border-stone-200 rounded-2xl px-4 text-[13px] font-bold text-stone-600 focus:ring-2 focus:ring-[#4F5BD5]/20 transition-all outline-none"
            >
              <option value="all">全ての役割</option>
              <option value="president">部長</option>
              <option value="vice_president">副部長</option>
              <option value="treasurer">会計</option>
              <option value="executive">幹部</option>
              <option value="member">部員</option>
            </select>

            <select
              value={gradeFilter}
              onChange={(e) => setGradeFilter(e.target.value)}
              className="h-11 bg-white border border-stone-200 rounded-2xl px-4 text-[13px] font-bold text-stone-600 focus:ring-2 focus:ring-[#4F5BD5]/20 transition-all outline-none"
            >
              <option value="all">全学年</option>
              <option value="1">1年生</option>
              <option value="2">2年生</option>
              <option value="3">3年生</option>
              <option value="4">4年生</option>
              <option value="alumni">卒業生</option>
            </select>

            <button
              onClick={() => setOnlyNewFilter(!onlyNewFilter)}
              className={`h-11 px-5 rounded-2xl text-[13px] font-black transition-all border flex items-center gap-2 ${onlyNewFilter
                ? 'bg-[#D62976] text-white border-[#D62976] shadow-lg'
                : 'bg-white text-stone-600 border-stone-200 hover:border-[#D62976]/40'
                }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${onlyNewFilter ? 'bg-white animate-ping' : 'bg-[#D62976]'}`} />
              <span>新規メンバーのみ</span>
            </button>

            <button
              onClick={() => { setSearchTerm(''); setRoleFilter('all'); setGradeFilter('all'); setGenderFilter('all'); setOnlyNewFilter(false); }}
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
                    <th className={`px-10 border-b border-stone-100 text-[16px] font-black uppercase tracking-[0.25em] text-stone-700 ${isCompact ? 'py-5' : 'py-7'}`}>氏名</th>
                    <th className={`px-8 border-b border-stone-100 text-[16px] font-black uppercase tracking-[0.25em] text-stone-700 ${isCompact ? 'py-5' : 'py-7'}`}>学籍番号 {isFullDisclosure && '& メアド'}</th>
                    <th className={`px-8 border-b border-stone-100 text-[16px] font-black uppercase tracking-[0.25em] text-stone-700 ${isCompact ? 'py-5' : 'py-7'}`}>役割</th>
                    <th className={`px-8 border-b border-stone-100 text-[16px] font-black uppercase tracking-[0.25em] text-stone-700 ${isCompact ? 'py-5' : 'py-7'}`}>学年</th>
                    <th className={`px-10 text-right border-b border-stone-100 text-[16px] font-black uppercase tracking-[0.25em] text-stone-700 ${isCompact ? 'py-5' : 'py-7'}`}>アクション</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-50/60 bg-white/20 font-sans">
                  {paginatedData.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-10 py-48 text-center text-stone-400 uppercase tracking-[0.5em] font-black">データが見つかりません</td>
                    </tr>
                  ) : (
                    <>
                      {paginatedData.map((mem) => {
                        const gradeStyle = getGradeBadge(mem.users?.university_year);
                        return (
                          <tr
                            key={mem.id}
                            className="group hover:bg-stone-50/60 transition-all duration-300"
                          >
                            <td className={`px-10 ${isCompact ? 'py-4' : 'py-8'}`}>
                              <div className="flex items-center gap-5">
                                <div className="min-w-0 flex items-center gap-3">
                                  {isNewlyAdded(mem.users) && (
                                    <span className="shrink-0 px-2.5 py-0.5 bg-gradient-to-r from-[#D62976] to-[#4F5BD5] text-white text-[8px] font-black rounded-full shadow-[0_4px_10px_rgba(214,41,118,0.3)] animate-bounce-subtle">
                                      NEW
                                    </span>
                                  )}
                                  <div className="min-w-0">
                                    <span className="font-extrabold text-stone-900 block truncate text-[14px]">{mem.users?.full_name || '無'}</span>
                                    {!isCompact && <span className="text-[10px] font-black text-stone-800 uppercase tracking-widest">{mem.users?.full_name_kana || ''}</span>}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className={`px-8 ${isCompact ? 'py-4 text-[14px]' : 'py-8 text-[16px]'}`}>
                              <div className="font-extrabold text-stone-800 mb-1 flex items-center gap-2">{mem.users?.mssv || '無'}</div>
                              {isFullDisclosure && mem.users?.university_email && (
                                <div className="text-[10px] font-black text-[#4F5BD5] opacity-50 truncate max-w-[150px]">{mem.users.university_email}</div>
                              )}
                            </td>
                            <td className={`px-8 ${isCompact ? 'py-4' : 'py-8'}`}>
                              <span className={`px-4 py-1.5 rounded-lg border-2 text-[10px] lg:text-[11px] font-black uppercase tracking-widest transition-all ${mem.role === 'president' ? 'bg-[#D62976]/5 text-[#D62976] border-[#D62976]/10' :
                                mem.role === 'vice_president' ? 'bg-[#4F5BD5]/5 text-[#4F5BD5] border-[#4F5BD5]/10' :
                                  mem.role === 'treasurer' ? 'bg-emerald-500/5 text-emerald-600 border-emerald-500/10' :
                                    mem.role === 'executive' ? 'bg-indigo-500/5 text-indigo-600 border-indigo-500/10' :
                                      mem.role === 'alumni' ? 'bg-stone-50 text-stone-400 border-stone-100' :
                                        'bg-amber-400/5 text-amber-600 border-amber-400/10'
                                }`}>
                                {mem.role === 'president' ? '部長' :
                                  mem.role === 'vice_president' ? '副部長' :
                                    mem.role === 'treasurer' ? '会計' :
                                      mem.role === 'executive' ? '幹部' :
                                        mem.role === 'alumni' ? '卒業生' : '部員'}
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
                          </tr>
                        );
                      })}
                    </>
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
                  const gradeBadge = getGradeBadge(mem.users?.university_year);
                  return (
                    <div
                      key={mem.id}
                      onClick={() => setSelectedMember(mem)}
                      className="relative bg-white rounded-[2.5rem] p-5 border border-stone-100 shadow-xl shadow-stone-200/10 active:scale-[0.98] transition-all group overflow-hidden"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0 flex flex-col py-1">
                          <div className="flex flex-col mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-[16px] font-black text-stone-900 truncate leading-tight">
                                {mem.users?.full_name_kana || mem.users?.full_name}
                              </span>
                              {isNewlyAdded(mem.users) && (
                                <span className="px-2 py-0.5 bg-[#D62976] text-white text-[8px] font-black rounded-md animate-pulse">NEW</span>
                              )}
                            </div>
                            {mem.users?.full_name_kana && (
                              <span className="text-[10px] font-black text-stone-400 truncate uppercase mt-0.5 tracking-wider">
                                {mem.users?.full_name}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[12px] font-bold text-stone-400 font-mono tracking-wider">{mem.users?.mssv}</span>
                            <span className="w-1 h-1 rounded-full bg-stone-200" />
                            <span className={cn("text-[11px] font-black", gradeBadge.text)}>
                              {gradeBadge.label}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-2 shrink-0">
                          <span className={`px-4 py-1.5 rounded-xl border-2 text-[9px] font-black uppercase tracking-widest ${mem.role === 'president' ? 'bg-[#D62976]/5 text-[#D62976] border-[#D62976]/10' :
                            mem.role === 'vice_president' ? 'bg-[#4F5BD5]/5 text-[#4F5BD5] border-[#4F5BD5]/10' :
                              'bg-stone-50 text-stone-400 border-stone-100'
                            }`}>
                            {mem.role === 'president' ? '部長' : mem.role === 'vice_president' ? '副部長' : mem.role === 'treasurer' ? '会計' : mem.role === 'executive' ? '幹部' : mem.role === 'alumni' ? '卒業生' : '部員'}
                          </span>
                        </div>
                      </div>

                      {/* Subtle profile indicator */}
                      <div className="absolute right-4 bottom-4 opacity-10 group-active:opacity-30">
                        <Eye size={12} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>


          {/* PREMIUM PAGINATION SYSTEM */}
          {!isLoading && totalPages > 1 && (
            <div className="px-6 lg:px-10 py-8 lg:py-10 bg-white border-t border-stone-50 flex flex-col sm:flex-row items-center justify-between gap-6 lg:gap-8 shrink-0">
              <div className="text-[12px] lg:text-[14px] font-black text-stone-400 uppercase tracking-[0.2em] flex items-center justify-center sm:justify-start gap-3 lg:gap-4 w-full sm:w-auto text-center">
                <span className="hidden xs:block w-8 h-px bg-stone-100" />
                <span>Page <span className="text-[#4F5BD5] border-b-2 border-indigo-100">{currentPage}</span> of <span className="text-stone-900">{totalPages}</span></span>
              </div>

              <div className="flex items-center justify-center sm:justify-end gap-5 w-full sm:w-auto">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="w-16 lg:w-14 h-16 lg:h-14 flex items-center justify-center bg-brand-stone-900 text-white rounded-2xl shadow-xl shadow-stone-200/50 active:scale-90 disabled:opacity-20 disabled:scale-95 disabled:cursor-not-allowed transition-all"
                  title="Previous"
                >
                  <ChevronLeft size={22} strokeWidth={3} />
                </button>

                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="w-16 lg:w-14 h-16 lg:h-14 flex items-center justify-center bg-brand-stone-900 text-white rounded-2xl shadow-xl shadow-stone-200/50 active:scale-90 disabled:opacity-20 disabled:scale-95 disabled:cursor-not-allowed transition-all"
                  title="Next"
                >
                  <ChevronRight size={22} strokeWidth={3} />
                </button>
              </div>
            </div>
          )}
        </section>



        {/* --- SLIDE OVER PANEL & MODALS --- */}
        <MemberDetailDrawer
          member={selectedMember}
          isOpen={!!selectedMember}
          isPresident={isPresident}
          isVicePresident={isVicePresident}
          isFullDisclosure={isFullDisclosure}
          canEdit={canEditMembers}
          onClose={() => setSelectedMember(null)}
          onSave={async (data) => {
            if (!canEditMembers) {
              toast.error('編集権限が必要です（部長・副部長・幹部）。');
              return;
            }

            const isNew = !selectedMember.id;
            const targetUserId = selectedMember.user_id || selectedMember.users?.id;
            const targetMembershipId = selectedMember.id;

            if (!isNew && (!targetUserId || !targetMembershipId)) {
              console.error('Missing identifiers:', { targetUserId, targetMembershipId, selectedMember });
              toast.error('ユーザーIDが見つかりません。再試行してください。');
              return;
            }

            try {
              await saveMutation.mutateAsync({
                ...data,
                user_id: targetUserId,
                membership_id: targetMembershipId,
                university_year: Number(data.university_year),
                email: data.email
              });
              setSelectedMember(null);
            } catch (err: any) {
              console.error('Mutation error:', err);
              // Error toast is already triggered by mutation's onError
            }
          }}
          onDelete={(id) => deleteMutation.mutate(id)}
        />

      </div>
      <MemberImport
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        onSuccess={() => {
          setIsImportOpen(false);
          queryClient.invalidateQueries({ queryKey: ['admin-members'] });
          queryClient.invalidateQueries({ queryKey: ['archived-members'] });
        }}
      />

      {/* Edit Form Modal is now integrated into MemberDetailDrawer */}

    </div>
  );
}
