// 1. React & Framework Core
import { useState, useMemo, useCallback, useRef } from 'react';

// 2. Third-party Libraries
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion, AnimatePresence } from 'framer-motion';
import * as Dialog from '@radix-ui/react-dialog';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';

// 3. Icons (Lucide)
import { 
  Search, 
  Edit2, 
  Trash2, 
  Loader2, 
  FilterX, 
  X, 
  UserPlus, 
  FileUp,
  Plus,
  Shield,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Download
} from 'lucide-react';

// 4. Internal Utilities & Stores
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store/useAppStore';
import { useDebounce } from '../../hooks/useDebounce';

// --- EXCEL IMPORT TYPES ---
interface ImportRow {
  email: string;
  full_name: string;
  mssv: string;
  phone?: string;
  hometown?: string;
  role: string;
  department?: string;
  class_name?: string;
  university_year: number;
  _valid: boolean;
  _error?: string;
}

// --- ZOD SCHEMA ---
const memberSchema = z.object({
  user_id: z.string().optional(),
  membership_id: z.string().optional(),
  email: z.string().email('無効なメールアドレスです'),
  mssv: z.string().min(1, '学籍番号を入力してください'),
  full_name: z.string().min(1, '名前を入力してください'),
  phone: z.string().optional(),
  hometown: z.string().optional(),
  role: z.enum(['admin', 'executive', 'member', 'alumni']),
  department: z.string().optional(),
  class_name: z.string().optional(),
  university_year: z.number().min(1).max(4),
});

type MemberFormData = z.infer<typeof memberSchema>;

export default function Members() {
  const queryClient = useQueryClient();
  const { selectedYear } = useAppStore();
  
  // States
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 400);
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;
  
  // Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importData, setImportData] = useState<ImportRow[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editingMember, setEditingMember] = useState<MemberFormData | null>(null);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<MemberFormData>({
    resolver: zodResolver(memberSchema),
    defaultValues: { role: 'member', university_year: 1 }
  });

  // --- EXCEL TEMPLATE GENERATION ---
  const downloadTemplate = useCallback(() => {
    const templateData = [
      {
        '名前': '山田 太郎',
        'メールアドレス': 'yamada@example.com',
        '学籍番号': 'B2001234',
        '電話番号': '09012345678',
        '出身地': '東京都',
        '役職': 'member',
        '学部': '工学部',
        'クラス': 'A1',
        '学年': 1
      },
      {
        '名前': '鈴木 一郎',
        'メールアドレス': 'suzuki@example.com',
        '学籍番号': 'B2005678',
        '電話番号': '08098765432',
        '出身地': '大阪府',
        '役職': 'executive',
        '学部': '経済学部',
        'クラス': 'B2',
        '学年': 2
      }
    ];
    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, 'member_import_template.xlsx');
  }, []);

  // 1. Fetch Members
  const { data: members, isLoading } = useQuery({
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
      return data;
    },
    enabled: !!selectedYear,
  });

  // 2. Client-side Filters & Pagination
  const filteredData = useMemo(() => {
    const rawData = members || [];
    let result = [...rawData];
    
    if (roleFilter && roleFilter !== 'all') {
      result = result.filter(m => m.role === roleFilter);
    }
    
    const query = debouncedSearch?.trim().toLowerCase();
    if (query) {
      result = result.filter(m => 
        (m.users?.full_name?.toLowerCase().includes(query)) || 
        (m.users?.mssv?.toLowerCase().includes(query)) ||
        (m.users?.email?.toLowerCase().includes(query))
      );
    }
    return result;
  }, [members, roleFilter, debouncedSearch]);

  const totalPages = Math.max(1, Math.ceil((filteredData?.length || 0) / itemsPerPage));
  const paginatedData = useMemo(() => {
    const data = filteredData || [];
    return data.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  }, [filteredData, currentPage, itemsPerPage]);

  // Reset page when filter changes
  useMemo(() => setCurrentPage(1), [roleFilter, debouncedSearch]);

  // 3. Save Mutation (Insert/Update)
  const saveMutation = useMutation({
    mutationFn: async (data: MemberFormData) => {
      if (editingMember?.user_id && editingMember?.membership_id) {
        const { error: userError } = await supabase.from('users').update({
          full_name: data.full_name,
          mssv: data.mssv,
          phone: data.phone,
          hometown: data.hometown
        }).eq('id', editingMember.user_id);
        if (userError) throw userError;

        const { error: memError } = await supabase.from('club_memberships').update({
          role: data.role,
          department: data.department,
          class_name: data.class_name,
          university_year: data.university_year
        }).eq('id', editingMember.membership_id);
        if (memError) throw memError;

      } else {
        const { data: existingUser } = await supabase.from('users').select('id').eq('email', data.email).maybeSingle();
        let targetUserId = existingUser?.id;

        if (!targetUserId) {
          targetUserId = crypto.randomUUID();
          const { error: insertUserError } = await supabase.from('users').insert({
            id: targetUserId,
            email: data.email,
            mssv: data.mssv,
            full_name: data.full_name,
            phone: data.phone,
            hometown: data.hometown
          });
          if (insertUserError) throw new Error("ユーザー作成エラー: " + insertUserError.message);
        }

        const { error: insertMemError } = await supabase.from('club_memberships').insert({
          user_id: targetUserId,
          academic_year_id: selectedYear!.id,
          role: data.role,
          department: data.department,
          class_name: data.class_name,
          university_year: data.university_year,
          is_active: true
        });
        if (insertMemError) throw insertMemError;
      }
    },
    onSuccess: () => {
      toast.success(editingMember ? 'メンバー情報を更新しました' : 'メンバーを追加しました');
      queryClient.invalidateQueries({ queryKey: ['admin-members'] });
      setModalOpen(false);
      reset();
    },
    onError: (err: any) => toast.error(err.message)
  });

  const deleteMutation = useMutation({
    mutationFn: async (membershipId: string) => {
      const { error } = await supabase
        .from('club_memberships')
        .update({ deleted_at: new Date().toISOString(), is_active: false })
        .eq('id', membershipId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('メンバーを削除しました');
      queryClient.invalidateQueries({ queryKey: ['admin-members'] });
    },
    onError: (err: any) => toast.error(err.message)
  });

  const openForm = (mem?: any) => {
    if (mem) {
      const payload: MemberFormData = {
        user_id: mem.users.id,
        membership_id: mem.id,
        email: mem.users.email,
        mssv: mem.users.mssv || '',
        full_name: mem.users.full_name,
        phone: mem.users.phone || '',
        hometown: mem.users.hometown || '',
        role: mem.role as any,
        department: mem.department || '',
        class_name: mem.class_name || '',
        university_year: mem.university_year,
      };
      setEditingMember(payload);
      reset(payload);
    } else {
      setEditingMember(null);
      reset({ role: 'member', university_year: 1 });
    }
    setModalOpen(true);
  };

  // --- EXCEL IMPORT LOGIC ---
  const COLUMN_MAP: Record<string, string> = {
    'email': 'email', 'e-mail': 'email', 'mail': 'email', 'メール': 'email', 'メールアドレス': 'email',
    'ho va ten': 'full_name', 'họ và tên': 'full_name', 'ho ten': 'full_name', 'họ tên': 'full_name', 'full_name': 'full_name', 'fullname': 'full_name', 'name': 'full_name', 'tên': 'full_name', '名前': 'full_name', '氏名': 'full_name',
    'mssv': 'mssv', 'ma so sinh vien': 'mssv', 'mã số sinh viên': 'mssv', 'student_id': 'mssv', '学籍番号': 'mssv',
    'phone': 'phone', 'dien thoai': 'phone', 'điện thoại': 'phone', 'sdt': 'phone', 'số điện thoại': 'phone', '電話番号': 'phone', '連絡先': 'phone',
    'que quan': 'hometown', 'quê quán': 'hometown', 'hometown': 'hometown', '出身地': 'hometown', '出身': 'hometown',
    'vai tro': 'role', 'vai trò': 'role', 'role': 'role', 'chuc vu': 'role', 'chức vụ': 'role', '役職': 'role', 'ロール': 'role',
    'khoa': 'department', 'department': 'department', 'khoa / ngành': 'department', 'nganh': 'department', 'ngành': 'department', '学部': 'department', '学科': 'department',
    'lop': 'class_name', 'lớp': 'class_name', 'class': 'class_name', 'class_name': 'class_name', 'クラス': 'class_name',
    'nam': 'university_year', 'năm': 'university_year', 'year': 'university_year', 'sinh vien nam': 'university_year', 'sinh viên năm': 'university_year', 'university_year': 'university_year', '学年': 'university_year',
  };

  const VALID_ROLES = ['admin', 'executive', 'member', 'alumni'];

  const parseExcelFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rawRows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        if (rawRows.length === 0) {
          toast.error('エクセルファイルが空か、データが存在しません。');
          return;
        }

        const headers = Object.keys(rawRows[0]);
        const mapping: Record<string, string> = {};
        headers.forEach(h => {
          const normalized = h.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          const mapped = COLUMN_MAP[h.trim().toLowerCase()] || COLUMN_MAP[normalized];
          if (mapped) mapping[h] = mapped;
        });

        const parsed: ImportRow[] = rawRows.map((row, idx) => {
          const r: any = {
            email: '', full_name: '', mssv: '', phone: '', hometown: '',
            role: 'member', department: '', class_name: '', university_year: 1,
            _valid: true, _error: undefined,
          };

          Object.entries(mapping).forEach(([excelCol, field]) => {
            const val = String(row[excelCol] ?? '').trim();
            if (field === 'university_year') {
              r[field] = parseInt(val) || 1;
            } else if (field === 'role') {
              const lower = val.toLowerCase();
              r[field] = VALID_ROLES.includes(lower) ? lower : 'member';
            } else {
              r[field] = val;
            }
          });

          if (!r.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)) {
            r._valid = false;
            r._error = `${idx + 2}行目: メールアドレスが無効です`;
          } else if (!r.full_name) {
            r._valid = false;
            r._error = `${idx + 2}行目: 名前が入力されていません`;
          } else if (!r.mssv) {
            r._valid = false;
            r._error = `${idx + 2}行目: 学籍番号が入力されていません`;
          }
          return r as ImportRow;
        });

        setImportData(parsed);
        toast.success(`"${file.name}" から ${parsed.length} 行のデータを読み込みました`);
      } catch {
        toast.error('ファイルを読み込めませんでした。');
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) parseExcelFile(file);
  }, [parseExcelFile]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseExcelFile(file);
    e.target.value = '';
  }, [parseExcelFile]);

  const validRows = importData.filter(r => r._valid);
  const invalidRows = importData.filter(r => !r._valid);

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!selectedYear) throw new Error('年度が選択されていません');
      let successCount = 0;
      for (const row of validRows) {
        try {
          const { data: existingUser } = await supabase.from('users').select('id').eq('email', row.email).maybeSingle();
          let userId = existingUser?.id;

          if (!userId) {
            userId = crypto.randomUUID();
            await supabase.from('users').insert({
              id: userId, email: row.email, mssv: row.mssv,
              full_name: row.full_name, phone: row.phone || null, hometown: row.hometown || null,
            });
          } else {
            await supabase.from('users').update({
              full_name: row.full_name, mssv: row.mssv,
              phone: row.phone || null, hometown: row.hometown || null,
            }).eq('id', userId);
          }

          const { data: existingMem } = await supabase.from('club_memberships')
            .select('id').eq('user_id', userId).eq('academic_year_id', selectedYear.id).maybeSingle();

          if (existingMem) {
            await supabase.from('club_memberships').update({
              role: row.role, department: row.department || null,
              class_name: row.class_name || null, university_year: row.university_year,
              is_active: true, deleted_at: null,
            }).eq('id', existingMem.id);
          } else {
            await supabase.from('club_memberships').insert({
              user_id: userId, academic_year_id: selectedYear.id,
              role: row.role, department: row.department || null,
              class_name: row.class_name || null, university_year: row.university_year,
              is_active: true,
            });
          }
          successCount++;
        } catch (err) { continue; }
      }
      return successCount;
    },
    onSuccess: (count) => {
      toast.success(`${count} 名のメンバーをインポートしました`);
      queryClient.invalidateQueries({ queryKey: ['admin-members'] });
      setImportModalOpen(false);
      setImportData([]);
    },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <div className="h-full flex flex-col space-y-8 overflow-hidden font-sans">
      {/* 1. Prestigious Header & Actions */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 shrink-0">
        <div>
           <div className="flex items-center gap-4 mb-3">
              <div className="w-2 h-10 bg-brand-stone-900 rounded-full" />
              <h1 className="text-5xl font-black text-brand-stone-900 tracking-tight">メンバー管理</h1>
           </div>
           <p className="text-brand-stone-400 font-black tracking-[0.3em] uppercase text-[16px] ml-6 opacity-60">
              DATABASE / {selectedYear?.name} ACADEMIC YEAR
           </p>
        </div>
        
        <div className="flex items-center gap-4">
          <button 
            onClick={() => { setImportData([]); setImportModalOpen(true); }}
            className="flex items-center gap-4 px-8 py-5 bg-[#FEDA75]/10 hover:bg-[#FEDA75]/20 text-brand-stone-900 rounded-[1.5rem] text-[16px] font-black tracking-tight transition-all active:scale-95 border-2 border-[#FEDA75]/20 shadow-md"
          >
            <FileUp className="w-6 h-6 text-[#CDA01E]" /> Import Data
          </button>
          <button 
            onClick={() => openForm()}
            className="flex items-center gap-4 px-10 py-5 bg-[#4F5BD5] hover:bg-[#4F5BD5]/90 text-white rounded-[1.5rem] text-[16px] font-black tracking-tight transition-all shadow-2xl shadow-[#4F5BD5]/30 active:scale-95 border-b-4 border-[#3D47A8]"
          >
            <UserPlus className="w-6 h-6" /> 新規登録
          </button>
        </div>
      </div>

      {/* 2. Glassmorphism Filter Bar */}
      <div className="bg-white/70 backdrop-blur-md border border-brand-stone-100 p-3 rounded-[2.5rem] flex flex-col md:flex-row gap-3 shrink-0 shadow-2xl shadow-brand-stone-200/30">
        <div className="relative flex-1 group">
          <Search className="absolute left-8 top-1/2 -translate-y-1/2 w-5 h-5 text-brand-stone-300 group-focus-within:text-[#4F5BD5] transition-colors" />
          <input 
            type="text"
            placeholder="名前、学籍番号、メールで検索..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-16 pr-8 py-5 bg-transparent text-brand-stone-900 rounded-3xl text-[16px] font-black focus:outline-none placeholder:text-brand-stone-200"
          />
        </div>
        <div className="flex gap-3 p-1">
          <select 
            value={roleFilter} 
            onChange={e => setRoleFilter(e.target.value)}
            className="bg-brand-stone-50 border-none text-brand-stone-600 text-[16px] font-black px-8 py-3 rounded-2xl outline-none focus:ring-2 focus:ring-[#4F5BD5]/10 transition-all appearance-none cursor-pointer"
          >
            <option value="all">すべてのロール</option>
            <option value="admin">管理者</option>
            <option value="executive">運営</option>
            <option value="member">メンバー</option>
            <option value="alumni">卒業生</option>
          </select>
          <button 
            onClick={() => { setSearchTerm(''); setRoleFilter('all'); }}
            className="px-6 bg-brand-stone-50 text-brand-stone-400 hover:text-rose-500 rounded-2xl transition-all"
            title="フィルタを解除"
          >
            <FilterX className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* 3. High-Fidelity Data Table */}
      <div className="flex-1 min-h-0 bg-white border border-brand-stone-100 rounded-[2.5rem] shadow-xl shadow-brand-stone-200/10 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-x-auto">
          <table className="w-full text-left text-[16px] text-brand-stone-600 whitespace-nowrap">
            <thead className="bg-brand-stone-50/50 text-[16px] text-brand-stone-400 font-black uppercase tracking-[0.1em] sticky top-0 z-10">
              <tr>
                <th className="px-10 py-6 border-b border-brand-stone-100">名前</th>
                <th className="px-8 py-6 border-b border-brand-stone-100">学籍番号 & メアド</th>
                <th className="px-8 py-6 border-b border-brand-stone-100">ロール</th>
                <th className="px-8 py-6 border-b border-brand-stone-100">学部・学年</th>
                <th className="px-10 py-6 text-right border-b border-brand-stone-100">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-stone-50">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-10 py-32 text-center">
                    <Loader2 className="w-10 h-10 animate-spin mx-auto text-[#4F5BD5] opacity-20" />
                  </td>
                </tr>
              ) : paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-10 py-32 text-center text-brand-stone-300 font-black uppercase tracking-[0.3em] text-[13px]">
                    No Data Available
                  </td>
                </tr>
              ) : (
                <AnimatePresence mode="popLayout">
                  {paginatedData.map((mem) => (
                    <motion.tr 
                      key={mem.id} 
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="group border-b border-brand-stone-50 hover:bg-brand-stone-50/40 transition-all duration-300"
                    >
                      <td className="px-10 py-8">
                        <div className="flex items-center gap-5">
                           <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-brand-stone-100 to-brand-stone-50 border border-brand-stone-100 flex items-center justify-center text-[16px] font-black text-brand-stone-500 shadow-sm">
                              {mem.users?.full_name?.charAt(0) || 'U'}
                           </div>
                           <span className="font-black text-brand-stone-900 tracking-tight text-[18px]">{mem.users?.full_name || '—'}</span>
                        </div>
                      </td>
                      <td className="px-8 py-8">
                        <div className="font-black text-brand-stone-800 text-[16px] leading-none mb-3">{mem.users?.mssv || '—'}</div>
                        <div className="text-[16px] font-black text-brand-stone-300 tracking-tight opacity-80">{mem.users?.email || '—'}</div>
                      </td>
                      <td className="px-8 py-8">
                        <span className={`px-6 py-3 text-[16px] font-black uppercase tracking-widest rounded-full border shadow-md ${
                          mem.role === 'admin' ? 'bg-[#D62976]/5 text-[#D62976] border-[#D62976]/30' :
                          mem.role === 'executive' ? 'bg-[#4F5BD5]/5 text-[#4F5BD5] border-[#4F5BD5]/30' :
                          mem.role === 'alumni' ? 'bg-brand-stone-50 text-brand-stone-400 border-brand-stone-100' :
                          'bg-[#FEDA75]/5 text-[#CDA01E] border-[#FEDA75]/40'
                        }`}>
                          {mem.role === 'admin' ? '管理者' :
                          mem.role === 'executive' ? '運営' :
                          mem.role === 'alumni' ? '卒業生' :
                          'メンバー'}
                        </span>
                      </td>
                      <td className="px-8 py-8">
                        <div className="font-black text-brand-stone-800 text-[16px] mb-3">{mem.department || '—'}</div>
                        <div className="text-[16px] font-black text-brand-stone-300 uppercase tracking-widest flex items-center gap-3">
                           {mem.class_name || '—'} <div className="w-2 h-2 bg-brand-stone-200 rounded-full" /> {mem.university_year}年生
                        </div>
                      </td>
                      <td className="px-10 py-8 text-right">
                        <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity translate-x-4 group-hover:translate-x-0 transition-transform">
                          <button 
                            onClick={() => openForm(mem)}
                            className="w-11 h-11 flex items-center justify-center bg-white border border-brand-stone-100 text-brand-stone-400 hover:text-[#4F5BD5] hover:border-[#4F5BD5]/40 hover:shadow-xl rounded-xl transition-all"
                          >
                            <Edit2 className="w-5 h-5" />
                          </button>
                          <button 
                            onClick={() => {
                              if (window.confirm('このメンバーを削除してもよろしいですか？')) {
                                deleteMutation.mutate(mem.id);
                              }
                            }}
                            className="w-11 h-11 flex items-center justify-center bg-white border border-brand-stone-100 text-brand-stone-400 hover:text-rose-500 hover:border-rose-200 hover:shadow-xl rounded-xl transition-all"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              )}
            </tbody>
          </table>
        </div>
        
        {/* Compact Pagination */}
        {!isLoading && totalPages > 1 && (
          <div className="px-10 py-8 bg-brand-stone-50/10 border-t border-brand-stone-50 flex items-center justify-between shrink-0">
            <div className="text-[16px] font-black text-brand-stone-300 uppercase tracking-[0.3em]">
               Page <span className="text-brand-stone-900 border-b-2 border-[#4F5BD5]">{currentPage}</span> / {totalPages}
            </div>
            <div className="flex gap-2">
              <button 
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="w-10 h-10 flex items-center justify-center bg-white border border-brand-stone-100 rounded-xl disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[#4F5BD5] hover:text-white transition-all shadow-sm"
              >
                <X className="w-4 h-4 rotate-45" />
              </button>
              <button 
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="w-10 h-10 flex items-center justify-center bg-white border border-brand-stone-100 rounded-xl disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[#4F5BD5] hover:text-white transition-all shadow-sm"
              >
                <Plus className="w-4 h-4 rotate-45" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 4. Refined Modals (Dialog Design) */}
      <Dialog.Root open={modalOpen} onOpenChange={setModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-brand-stone-900/60 backdrop-blur-xl z-50 animate-in fade-in duration-500" />
          <Dialog.Content className="fixed left-[50%] top-[50%] z-50 w-full max-w-xl translate-x-[-50%] translate-y-[-50%] bg-white rounded-[2.5rem] shadow-2xl p-0 overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-300">
            
            <div className="p-10 border-b border-brand-stone-50 flex justify-between items-center shrink-0">
              <div>
                <Dialog.Title className="text-2xl font-black text-brand-stone-900 tracking-tighter">
                  {editingMember ? 'メンバー編集' : '新規登録'}
                </Dialog.Title>
                <p className="text-[10px] font-black uppercase tracking-widest text-brand-stone-300 mt-1">Profile Configuration</p>
              </div>
              <Dialog.Close asChild>
                <button className="w-10 h-10 flex items-center justify-center bg-brand-stone-50 rounded-xl text-brand-stone-400 hover:bg-brand-stone-900 hover:text-white transition-all"><X className="w-5 h-5"/></button>
              </Dialog.Close>
            </div>

            <div className="p-10 overflow-y-auto custom-scrollbar flex-1">
              <form id="member-form" onSubmit={handleSubmit((d) => saveMutation.mutate(d))} className="space-y-10">
                
                <div className="space-y-6">
                  <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-[#4F5BD5] flex items-center gap-3">
                    <Shield className="w-4 h-4" /> Personal Information
                  </h3>
                  <div className="grid grid-cols-1 gap-6">
                    <div className="space-y-2">
                      <label className="text-[11px] font-black uppercase tracking-widest text-brand-stone-400">氏名 *</label>
                      <input {...register('full_name')} className="w-full bg-brand-stone-50 border-none text-brand-stone-900 rounded-2xl px-6 py-4 text-sm font-bold focus:ring-2 focus:ring-[#4F5BD5]/20 outline-none transition-all placeholder:text-brand-stone-200" placeholder="山田 太郎" />
                      {errors.full_name && <p className="text-[#D62976] text-[10px] font-black uppercase ml-2 mt-2 tracking-widest">{errors.full_name.message}</p>}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                       <div className="space-y-2">
                         <label className="text-[11px] font-black uppercase tracking-widest text-brand-stone-400">学籍番号 *</label>
                         <input {...register('mssv')} className="w-full bg-brand-stone-50 border-none text-brand-stone-900 rounded-2xl px-6 py-4 text-sm font-bold focus:ring-2 focus:ring-[#4F5BD5]/20 outline-none transition-all" />
                         {errors.mssv && <p className="text-[#D62976] text-[10px] font-black uppercase ml-2 mt-2 tracking-widest">{errors.mssv.message}</p>}
                       </div>
                       <div className="space-y-2">
                         <label className="text-[11px] font-black uppercase tracking-widest text-brand-stone-400">学年 *</label>
                         <select {...register('university_year', { valueAsNumber: true })} className="w-full bg-brand-stone-50 border-none text-brand-stone-900 rounded-2xl px-6 py-4 text-sm font-bold focus:ring-2 focus:ring-[#4F5BD5]/20 outline-none transition-all appearance-none cursor-pointer">
                           <option value={1}>1年生</option>
                           <option value={2}>2年生</option>
                           <option value={3}>3年生</option>
                           <option value={4}>4年生</option>
                         </select>
                       </div>
                    </div>

                    <div className="space-y-2">
                       <label className="text-[11px] font-black uppercase tracking-widest text-brand-stone-400">メールアドレス *</label>
                       <input 
                         {...register('email')} 
                         readOnly={!!editingMember}
                         className="w-full bg-brand-stone-50 border-none text-brand-stone-900 rounded-2xl px-6 py-4 text-sm font-bold read-only:opacity-50 focus:ring-2 focus:ring-[#4F5BD5]/20 outline-none transition-all" 
                       />
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <h3 className="text-[11px] font-black uppercase tracking-[0.3em] text-[#D62976] flex items-center gap-3">
                    <Shield className="w-4 h-4" /> Club Configuration
                  </h3>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[11px] font-black uppercase tracking-widest text-brand-stone-400">役割 *</label>
                      <select {...register('role')} className="w-full bg-brand-stone-50 border-none text-brand-stone-900 rounded-2xl px-6 py-4 text-sm font-bold focus:ring-2 focus:ring-[#4F5BD5]/20 outline-none transition-all appearance-none cursor-pointer font-black uppercase tracking-widest text-xs">
                        <option value="member">メンバー</option>
                        <option value="executive">運営</option>
                        <option value="admin">管理者</option>
                        <option value="alumni">卒業生</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[11px] font-black uppercase tracking-widest text-brand-stone-400">学部 / 学科</label>
                      <input {...register('department')} className="w-full bg-brand-stone-50 border-none text-brand-stone-900 rounded-2xl px-6 py-4 text-sm font-bold focus:ring-2 focus:ring-[#4F5BD5]/20 outline-none transition-all" />
                    </div>
                  </div>
                </div>
              </form>
            </div>

            <div className="p-10 border-t border-brand-stone-50 shrink-0 flex justify-end gap-4 bg-brand-stone-50/30">
              <Dialog.Close asChild>
                <button type="button" className="px-8 py-4 text-brand-stone-400 text-[13px] font-black tracking-tight rounded-2xl hover:bg-white hover:text-brand-stone-900 transition-all">キャンセル</button>
              </Dialog.Close>
              <button 
                type="submit" 
                form="member-form"
                disabled={saveMutation.isPending}
                className="px-12 py-4 bg-[#4F5BD5] hover:bg-[#4F5BD5]/90 text-white text-[13px] font-black tracking-tight rounded-2xl shadow-xl shadow-[#4F5BD5]/30 transition-all active:scale-95 flex items-center justify-center gap-3 min-w-[160px]"
              >
                {saveMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : '更新を適用'}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* ============ IMPORT EXCEL MODAL ============ */}
      <Dialog.Root open={importModalOpen} onOpenChange={(open) => { setImportModalOpen(open); if (!open) setImportData([]); }}>
        <Dialog.Portal>
           <Dialog.Overlay className="fixed inset-0 bg-brand-stone-900/60 backdrop-blur-xl z-50 animate-in fade-in duration-500" />
           <Dialog.Content className="fixed left-[50%] top-[50%] z-50 w-full max-w-5xl translate-x-[-50%] translate-y-[-50%] bg-white rounded-[3rem] shadow-2xl p-0 overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-300">
            
            <div className="p-10 border-b border-brand-stone-50 flex justify-between items-center shrink-0">
               <div>
                  <Dialog.Title className="text-3xl font-black text-brand-stone-900 tracking-tighter flex items-center gap-5">
                    <div className="p-3 bg-[#FEDA75]/20 rounded-2xl">
                       <FileSpreadsheet className="w-6 h-6 text-brand-stone-900" />
                    </div>
                    一括インポート
                  </Dialog.Title>
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-brand-stone-300 mt-2 ml-[68px]">Batch Data Processing</p>
               </div>
               <Dialog.Close asChild>
                 <button className="w-12 h-12 flex items-center justify-center bg-brand-stone-50 rounded-2xl text-brand-stone-400 hover:bg-brand-stone-900 hover:text-white transition-all"><X className="w-6 h-6"/></button>
               </Dialog.Close>
            </div>

            <div className="p-10 overflow-y-auto flex-1 space-y-10 custom-scrollbar">
              {importData.length === 0 ? (
                <div className="space-y-8">
                  <div
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleFileDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-4 border-dashed rounded-[2.5rem] p-24 text-center cursor-pointer transition-all duration-500 ${
                      isDragging
                        ? 'border-[#4F5BD5] bg-[#4F5BD5]/5 scale-[0.98]'
                        : 'border-brand-stone-100 hover:border-[#4F5BD5]/40 bg-brand-stone-50/30'
                    }`}
                  >
                    <div className={`w-20 h-20 rounded-3xl mx-auto mb-8 flex items-center justify-center shadow-lg transition-all ${isDragging ? 'bg-[#4F5BD5] text-white' : 'bg-white text-brand-stone-200'}`}>
                       <Upload className="w-10 h-10" />
                    </div>
                    <p className="text-2xl font-black text-brand-stone-900 tracking-tight mb-3">
                      {isDragging ? 'その通り、ドロップしてください' : 'エクセルファイルをここに'}
                    </p>
                    <p className="text-brand-stone-400 font-bold text-sm tracking-tight">ドラッグ＆ドロップ、またはクリックしてファイルを選択</p>
                    <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFileSelect} className="hidden" />
                  </div>
                  
                  <div className="flex flex-col items-center gap-4">
                     <button onClick={downloadTemplate} className="group flex items-center gap-3 px-8 py-5 bg-white border border-brand-stone-100 text-[13px] font-black text-brand-stone-600 hover:text-[#4F5BD5] hover:border-[#4F5BD5]/30 rounded-2xl transition-all shadow-sm">
                        <Download className="w-5 h-5 transition-transform group-hover:translate-y-1" />
                        テンプレートをダウンロード (.xlsx)
                     </button>
                     <p className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-stone-200">System supports .xlsx and .xls formats</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-10">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-3 px-6 py-4 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-2xl shadow-sm">
                      <CheckCircle2 className="w-5 h-5" />
                      <span className="text-sm font-black tracking-tight">{validRows.length} 件が有効</span>
                    </div>
                    {invalidRows.length > 0 && (
                      <div className="flex items-center gap-3 px-6 py-4 bg-rose-50 text-rose-600 border border-rose-100 rounded-2xl shadow-sm">
                        <AlertCircle className="w-5 h-5" />
                        <span className="text-sm font-black tracking-tight">{invalidRows.length} 件のエラー</span>
                      </div>
                    )}
                    <button onClick={() => setImportData([])} className="ml-auto text-[11px] font-black uppercase tracking-widest text-brand-stone-300 hover:text-brand-stone-900 flex items-center gap-3 transition-colors">
                      <X className="w-4 h-4" /> 別のファイル
                    </button>
                  </div>

                  <div className="border border-brand-stone-100 rounded-[2rem] overflow-hidden bg-brand-stone-50/10 shadow-inner">
                    <div className="overflow-x-auto max-h-[40vh]">
                      <table className="w-full text-left text-[12px] text-brand-stone-600 whitespace-nowrap">
                        <thead className="bg-brand-stone-50 text-brand-stone-400 font-black uppercase tracking-widest sticky top-0 z-20">
                          <tr>
                            <th className="px-6 py-4">Status</th>
                            <th className="px-6 py-4">名前</th>
                            <th className="px-6 py-4">Email</th>
                            <th className="px-6 py-4 text-center">ロール</th>
                            <th className="px-6 py-4">学年</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-brand-stone-50/50">
                          {importData.map((row, i) => (
                            <tr key={i} className={`transition-colors ${row._valid ? 'bg-white hover:bg-brand-stone-50/30' : 'bg-rose-50/30'}`}>
                              <td className="px-6 py-4">
                                {row._valid 
                                  ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> 
                                  : <span title={row._error}><AlertCircle className="w-4 h-4 text-rose-400" /></span>
                                }
                              </td>
                              <td className="px-6 py-4 font-black text-brand-stone-900">{row.full_name || '—'}</td>
                              <td className="px-6 py-4 font-bold text-brand-stone-400">{row.email || '—'}</td>
                              <td className="px-6 py-4 text-center">
                                <span className={`px-3 py-1 text-[9px] font-black uppercase tracking-widest rounded-full border ${
                                  row.role === 'admin' ? 'bg-rose-50 text-rose-500 border-rose-100' :
                                  row.role === 'executive' ? 'bg-indigo-50 text-indigo-500 border-indigo-100' :
                                  'bg-slate-50 text-slate-500 border-slate-100'
                                }`}>
                                  {row.role}
                                </span>
                              </td>
                              <td className="px-6 py-4 font-black text-brand-stone-900">{row.university_year}年生</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-10 border-t border-brand-stone-50 shrink-0 flex justify-end gap-4 bg-brand-stone-50/30">
               <Dialog.Close asChild>
                  <button type="button" className="px-8 py-5 text-brand-stone-400 text-[13px] font-black rounded-2xl hover:bg-white hover:text-brand-stone-900 transition-all">キャンセル</button>
               </Dialog.Close>
               {importData.length > 0 && (
                  <button 
                    onClick={() => importMutation.mutate()}
                    disabled={importMutation.isPending || validRows.length === 0}
                    className="px-12 py-5 bg-[#4F5BD5] hover:bg-[#4F5BD5]/90 text-white text-[13px] font-black tracking-tight rounded-2xl shadow-xl shadow-[#4F5BD5]/30 transition-all active:scale-95 flex items-center justify-center gap-3 min-w-[200px]"
                  >
                    {importMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : `${validRows.length} 名の登録を実行`}
                  </button>
               )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
