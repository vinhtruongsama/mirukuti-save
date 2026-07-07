import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store/useAppStore';
import {
  Search,
  Plus,
  X,
  ChevronDown,
  ChevronUp,
  Calendar,
  ChevronRight,
  Settings2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { Download } from 'lucide-react';
import ExcelExportModal, { type ExcelExportFieldOption } from '../../components/ui/ExcelExportModal';

// Custom CSS to make number input spinners always visible
const spinnerStyle = `
  input[type=number]::-webkit-inner-spin-button,
  input[type=number]::-webkit-outer-spin-button {
    opacity: 1 !important;
    appearance: auto !important;
    cursor: pointer;
  }
`;

// ─── Types ──────────────────────────────────────────────────────────────────
interface ActivityLog {
  id: string;
  title_ja: string;
  location_type: 'internal' | 'external';
  event_date: string;
}

interface MemberStatus {
  id: string;
  full_name: string;
  full_name_kana: string;
  mssv: string | null;
  grade: string | null;
  gender?: string | null;
  nationality?: string | null;
  university_email?: string | null;
  phone?: string | null;
  line_nickname?: string | null;
  internal_count: number;
  external_count: number;
  total_count: number;
  activities: ActivityLog[];
}

interface QualCondition {
  id: string;
  minInternal: number;
  minExternal: number;
}

const DEFAULT_CONDITIONS: QualCondition[] = [
  { id: '1', minInternal: 1, minExternal: 4 },
  { id: '2', minInternal: 2, minExternal: 3 },
  { id: '3', minInternal: 3, minExternal: 2 },
  { id: '4', minInternal: 4, minExternal: 1 },
  { id: '5', minInternal: 0, minExternal: 5 },
];

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function parseCountInput(value: string) {
  if (value === '') return 0;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? 0 : Math.max(parsed, 0);
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function AwardsAdmin() {
  const { selectedYear } = useAppStore();
  const [activeTab, setActiveTab] = useState<'members' | 'ranking'>('members');
  const [isLoading, setIsLoading] = useState(true);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const totalApplyTimerRef = useRef<number | null>(null);
  const [isApplyingTotalFilter, setIsApplyingTotalFilter] = useState(false);

  // Tab 1: Member Activity List
  const [members, setMembers] = useState<MemberStatus[]>([]);
  const [limit, setLimit] = useState(30);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Tab 2: Ranking / Criteria logic with persistence
  const [conditions, setConditions] = useState<QualCondition[]>(() => {
    const saved = localStorage.getItem('award_criteria');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return DEFAULT_CONDITIONS;
      }
    }
    return DEFAULT_CONDITIONS;
  });
  const [requiredTotalCountInput, setRequiredTotalCountInput] = useState<string>(() => {
    const saved = localStorage.getItem('award_total_requirement');
    if (saved === null) return '5';
    return saved;
  });
  const [appliedRequiredTotalCount, setAppliedRequiredTotalCount] = useState<number>(() => {
    const saved = localStorage.getItem('award_total_requirement');
    return saved === null ? 5 : parseCountInput(saved);
  });

  useEffect(() => {
    localStorage.setItem('award_criteria', JSON.stringify(conditions));
  }, [conditions]);
  useEffect(() => {
    localStorage.setItem('award_total_requirement', String(appliedRequiredTotalCount));
  }, [appliedRequiredTotalCount]);
  useEffect(() => {
    return () => {
      if (totalApplyTimerRef.current !== null) {
        window.clearTimeout(totalApplyTimerRef.current);
      }
    };
  }, []);
  const [rankingView, setRankingView] = useState<'qualified' | 'all'>('qualified');

  useEffect(() => {
    if (selectedYear?.id) {
      fetchMemberData();
    }
  }, [selectedYear?.id]);

  const fetchMemberData = async () => {
    try {
      setIsLoading(true);
      // Fetch members and registrations in one flow
      // 1. Fetch academic year memberships
      const { data: membershipData, error: mError } = await supabase
        .from('club_memberships')
        .select('user:users(id, full_name, full_name_kana, mssv, university_year, gender, nationality, university_email, phone, line_nickname)')
        .eq('academic_year_id', selectedYear?.id)
        .is('deleted_at', null);
      if (mError) throw mError;

      // 2. Fetch all 'present' records from session attendance
      // We join through registrations to activities to check academic year and location type
      const { data: attData, error: aError } = await supabase
        .from('attendance_records')
        .select(`
          status,
          registration:registrations (
            user_id,
            activity:activities!inner (
              id,
              title,
              location_type,
              academic_year_id,
              date
            )
          )
        `)
        .eq('status', 'present')
        .eq('registration.activity.academic_year_id', selectedYear?.id);

      if (aError) throw aError;

      const statusMap = new Map<string, MemberStatus>();
      (membershipData as any[]).forEach(m => {
        if (!m.user) return;
        statusMap.set(m.user.id, {
          id: m.user.id,
          full_name: m.user.full_name,
          full_name_kana: m.user.full_name_kana || '',
          mssv: m.user.mssv,
          grade: m.user.university_year ? `${m.user.university_year}年` : '不明',
          gender: m.user.gender || '',
          nationality: m.user.nationality || '',
          university_email: m.user.university_email || '',
          phone: m.user.phone || '',
          line_nickname: m.user.line_nickname || '',
          internal_count: 0,
          external_count: 0,
          total_count: 0,
          activities: []
        });
      });

      (attData as any[] || []).forEach((record) => {
        const reg = record.registration;
        if (!reg || !reg.activity) return;

        const mem = statusMap.get(reg.user_id);
        if (mem) {
          const activityId = reg.activity.id;

          // Check if this activity has already been counted for this member
          const alreadyProcessed = mem.activities.some(a => a.id === activityId);

          if (!alreadyProcessed) {
            const type = reg.activity.location_type || 'internal';
            if (type === 'internal') mem.internal_count++;
            else mem.external_count++;
            mem.total_count++;

            mem.activities.push({
              id: activityId,
              title_ja: reg.activity.title,
              location_type: type as 'internal' | 'external',
              event_date: reg.activity.date
            });
          }
        }
      });

      const allMembers = Array.from(statusMap.values()).sort((a, b) => b.total_count - a.total_count);
      setMembers(allMembers);
    } catch {
      toast.error('データの取得に失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  // ── Tab 1 Search & Filter Logic ───────────────────────────────────────────
  const filteredMembers = useMemo(() => {
    if (!searchQuery.trim()) return members;
    const q = searchQuery.toLowerCase();
    return members.filter(m =>
      m.full_name?.toLowerCase().includes(q) ||
      m.full_name_kana?.toLowerCase().includes(q) ||
      m.mssv?.toLowerCase().includes(q)
    );
  }, [members, searchQuery]);

  const pagedMembers = useMemo(() => {
    return filteredMembers.slice(0, limit);
  }, [filteredMembers, limit]);

  // ── Tab 2 Derivative logic ────────────────────────────────────────────────
  const qualifiedMembers = useMemo(() => {
    const hasManualConditions = conditions.length > 0;
    const hasTotalRequirement = appliedRequiredTotalCount > 0;

    if (!hasManualConditions && !hasTotalRequirement) {
      return [];
    }

    return members.filter((m) => {
      const matchedManualCondition =
        hasManualConditions &&
        conditions.some((c) => m.internal_count >= c.minInternal && m.external_count >= c.minExternal);
      const matchedTotalRequirement = hasTotalRequirement && m.total_count >= appliedRequiredTotalCount;

      return matchedManualCondition || matchedTotalRequirement;
    });
  }, [members, conditions, appliedRequiredTotalCount]);

  const awardsExportFields: ExcelExportFieldOption[] = [
    { key: 'no', label: 'No', description: '書き出し順です。', group: '基本情報' },
    { key: 'full_name', label: '氏名', description: '対象メンバーの氏名です。', group: '基本情報' },
    { key: 'full_name_kana', label: 'フリガナ', description: '対象メンバーのフリガナです。', group: '基本情報' },
    { key: 'mssv', label: '学籍番号', description: '対象メンバーの学籍番号です。', group: '基本情報' },
    { key: 'grade', label: '学年', description: '対象メンバーの学年です。', group: '基本情報' },
    { key: 'gender', label: '性別', description: '対象メンバーの性別です。', group: '基本情報' },
    { key: 'nationality', label: '国籍', description: '対象メンバーの国籍です。', group: '基本情報' },
    { key: 'university_email', label: '大学メール', description: '対象メンバーの大学メールです。', group: '連絡先' },
    { key: 'phone', label: '電話番号', description: '対象メンバーの電話番号です。', group: '連絡先' },
    { key: 'line_nickname', label: 'LINEニックネーム', description: '対象メンバーのLINE名です。', group: '連絡先' },
    { key: 'internal_count', label: '学内活動数', description: '学内活動の参加数です。', group: '活動集計' },
    { key: 'external_count', label: '学外活動数', description: '学外活動の参加数です。', group: '活動集計' },
    { key: 'total_count', label: '合計', description: '対象活動の合計数です。', group: '活動集計' },
    { key: 'activities', label: '活動名', description: '条件を満たした活動一覧です。', group: '活動詳細' },
  ];
  const awardsDefaultExportKeys = awardsExportFields.map((field) => field.key);

  // ── Excel Export ──────────────────────────────────────────────────────────
  const handleConfiguredExportExcel = (selectedKeys: string[]) => {
    if (qualifiedMembers.length === 0) {
      toast.error('å¯¾è±¡è€…ãŒã„ã¾ã›ã‚“');
      return;
    }

    const selectedFields = awardsExportFields.filter((field) => selectedKeys.includes(field.key));
    if (selectedFields.length === 0) {
      toast.error('少なくとも1つの項目を選択してください');
      return;
    }

    const exportRows = qualifiedMembers.map((member, idx) => {
      const valueMap: Record<string, string | number> = {
        no: idx + 1,
        full_name: member.full_name,
        full_name_kana: member.full_name_kana,
        mssv: member.mssv || '',
        grade: member.grade || '',
        gender: member.gender || '',
        nationality: member.nationality || '',
        university_email: member.university_email || '',
        phone: member.phone || '',
        line_nickname: member.line_nickname || '',
        internal_count: member.internal_count,
        external_count: member.external_count,
        total_count: member.total_count,
        activities: member.activities.map((activity) => activity.title_ja).join(', '),
      };

      return selectedFields.map((field) => valueMap[field.key] ?? '');
    });

    const worksheet = XLSX.utils.aoa_to_sheet([
      ['Awards Export'],
      [`Generated at: ${format(new Date(), 'yyyy-MM-dd HH:mm:ss')}`],
      selectedFields.map((field) => field.label),
      ...exportRows,
    ]);
    worksheet['!cols'] = selectedFields.map((field) => ({
      wch:
        field.key === 'activities'
          ? 50
          : field.key.includes('count')
            ? 12
            : field.key === 'grade'
              ? 8
              : field.key === 'university_email'
                ? 35
                : field.key === 'phone'
                  ? 18
                  : field.key === 'line_nickname'
                    ? 20
                    : 20
    }));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'AwardsList');

    const fileName = `Awards_List_${selectedYear?.name || 'export'}_${format(new Date(), 'yyyyMMdd')}.xlsx`;
    XLSX.writeFile(workbook, fileName);
    toast.success('Excelãƒ•ã‚¡ã‚¤ãƒ«ã‚’ãƒ€ã‚¦ãƒ³ãƒ­ãƒ¼ãƒ‰ã—ã¾ã—ãŸ');
    setIsExportModalOpen(false);
  };

  const handleExportExcel = () => {
    if (qualifiedMembers.length === 0) {
      toast.error('対象者がいません');
      return;
    }

    const exportData = qualifiedMembers.map((m, idx) => ({
      'NO': idx + 1,
      '氏名': m.full_name,
      'フリガナ': m.full_name_kana,
      '学籍番号': m.mssv || '',
      '学年': m.grade || '',
      '学内活動数': m.internal_count,
      '学外活動数': m.external_count,
      '合計': m.total_count,
      '活動名': m.activities.map(a => a.title_ja).join(', ')
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'AwardsList');

    // Column widths
    const wscols = [
      { wch: 5 },  // NO
      { wch: 20 }, // Name
      { wch: 20 }, // Kana
      { wch: 15 }, // MSSV
      { wch: 8 },  // Grade
      { wch: 12 }, // Internal
      { wch: 12 }, // External
      { wch: 8 },  // Total
      { wch: 50 }  // Activity List
    ];
    worksheet['!cols'] = wscols;

    const fileName = `Awards_List_${selectedYear?.name || 'export'}_${format(new Date(), 'yyyyMMdd')}.xlsx`;
    XLSX.writeFile(workbook, fileName);
    toast.success('Excelファイルをダウンロードしました');
  };

  void handleExportExcel;

  const rankingList = useMemo(() => {
    return rankingView === 'qualified' ? qualifiedMembers : members;
  }, [rankingView, qualifiedMembers, members]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  function addCondition() {
    setConditions(prev => [...prev, { id: uid(), minInternal: 0, minExternal: 0 }]);
  }
  function removeCondition(id: string) {
    setConditions(prev => prev.filter(c => c.id !== id));
  }
  function updateCondition(id: string, field: 'minInternal' | 'minExternal', valStr: string) {
    const value = parseCountInput(valStr);
    setConditions(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
  }
  function applyTotalRequirement() {
    if (isApplyingTotalFilter) return;

    setIsApplyingTotalFilter(true);
    setAppliedRequiredTotalCount(parseCountInput(requiredTotalCountInput));

    if (totalApplyTimerRef.current !== null) {
      window.clearTimeout(totalApplyTimerRef.current);
    }

    totalApplyTimerRef.current = window.setTimeout(() => {
      setIsApplyingTotalFilter(false);
      totalApplyTimerRef.current = null;
    }, 450);
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 pb-20 sm:space-y-10 sm:pb-24">
      <style>{spinnerStyle}</style>
      {/* ── Header ── */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end sm:gap-6">
        <div className="flex items-start gap-3 sm:gap-5">
          <div className="w-1.5 h-16 rounded-full bg-gradient-to-b from-[#D62976] to-[#4F5BD5] mt-1 hidden sm:block" />
          <div className="flex flex-col gap-1.5 sm:gap-2">
            <h1 className="text-[2.2rem] font-black text-stone-900 tracking-tighter leading-none sm:text-4xl">表彰・資格</h1>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.32em] sm:text-[11px] sm:tracking-[0.4em]">
              <span className="text-stone-400">Management</span>
              <span className="text-[#D62976]">Console</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Tab Selector ── */}
      <div className="grid w-full grid-cols-2 gap-2 rounded-2xl bg-stone-100 p-1.5 sm:flex sm:w-fit sm:items-center">
        <button
          onClick={() => setActiveTab('members')}
          className={`rounded-xl px-3 py-3 text-[14px] font-black transition-all sm:px-6 sm:text-[16px] sm:uppercase sm:tracking-widest ${activeTab === 'members' ? 'bg-white text-[#4F5BD5] shadow-lg' : 'text-stone-600'}`}
        >
          メンバー活動
        </button>
        <button
          onClick={() => setActiveTab('ranking')}
          className={`rounded-xl px-3 py-3 text-[14px] font-black transition-all sm:px-6 sm:text-[16px] sm:uppercase sm:tracking-widest ${activeTab === 'ranking' ? 'bg-white text-[#D62976] shadow-lg' : 'text-stone-600'}`}
        >
          活動表彰
        </button>
      </div>

      {/* ══════════════════════════ TAB 1: MEMBERS LIST ══════════════════════════ */}
      {activeTab === 'members' && (
        <div className="space-y-4 sm:space-y-8">
          {/* Search Bar */}
          <div className="relative max-w-2xl group">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-300 group-focus-within:text-[#4F5BD5] transition-colors" />
            <input
              type="text"
              placeholder="学籍番号、氏名、カタカナで検索..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setLimit(30); }}
              className="w-full h-16 pl-14 pr-6 bg-white border-2 border-stone-400 focus:border-[#4F5BD5] rounded-3xl text-[15px] font-bold text-stone-900 transition-all outline-none"
            />
          </div>

          {isLoading ? (
            <div className="py-24 flex flex-col items-center gap-4 text-stone-300">
              <div className="w-12 h-12 border-4 border-t-[#4F5BD5] border-stone-100 rounded-full animate-spin" />
              <span className="text-[10px] font-black uppercase">Loading Members...</span>
            </div>
          ) : (
            <div className="space-y-4">
              {pagedMembers.map((m) => (
                <div key={m.id} className="bg-white border border-stone-100 rounded-[2rem] overflow-hidden shadow-sm hover:shadow-md transition-all">
                  <button
                    onClick={() => setExpandedId(expandedId === m.id ? null : m.id)}
                    className="w-full px-4 sm:px-8 py-5 sm:py-6 flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-3 sm:gap-5 min-w-0">
                      <div className="w-12 h-12 sm:w-14 sm:h-14 bg-stone-50 rounded-2xl flex items-center justify-center font-black text-stone-400 group-hover:bg-[#4F5BD5] group-hover:text-white transition-all text-lg sm:text-xl shrink-0">
                        {m.full_name?.charAt(0)}
                      </div>
                      <div className="text-left min-w-0 flex-1">
                        <span className="block text-[9px] sm:text-[11px] font-black text-stone-400 uppercase tracking-widest mb-0.5 sm:mb-1 truncate">{m.full_name_kana}</span>
                        <h3 className="text-sm font-black text-stone-900 leading-none truncate">{m.full_name}</h3>
                        <p className="text-[11px] sm:text-[12px] font-medium text-stone-400 mt-1 truncate">{m.mssv || '学籍番号なし'}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 sm:gap-8 shrink-0">
                      <div className="flex items-center gap-2 sm:gap-6">
                        <div className="text-center">
                          <span className="block text-[12px] font-black text-[#4F5BD5] uppercase tracking-widest mb-0.5 sm:mb-1">学内</span>
                          <span className="text-lg sm:text-xl font-black text-[#4F5BD5]">{m.internal_count}</span>
                        </div>
                        <div className="text-center">
                          <span className="block text-[12px] font-black text-[#D62976] uppercase tracking-widest mb-0.5 sm:mb-1">学外</span>
                          <span className="text-lg sm:text-xl font-black text-[#D62976]">{m.external_count}</span>
                        </div>
                      </div>
                      <div className="p-1 sm:p-2 text-stone-300 group-hover:text-stone-600 transition-colors">
                        {expandedId === m.id ? <ChevronUp className="w-5 h-5 sm:w-6 sm:h-6" /> : <ChevronDown className="w-5 h-5 sm:w-6 sm:h-6" />}
                      </div>
                    </div>
                  </button>

                  <AnimatePresence>
                    {expandedId === m.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="border-t border-stone-50 bg-stone-50/50"
                      >
                        <div className="p-5 sm:p-10">
                          <h4 className="text-[10px] sm:text-[12px] font-black text-stone-400 uppercase tracking-[0.2em] mb-4 sm:mb-6 flex items-center gap-2">
                            <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            参加アクティビティ履歴
                          </h4>
                          {m.activities.length === 0 ? (
                            <p className="text-stone-400 text-[12px] sm:text-[13px] italic">参加履歴はありません。</p>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                              {m.activities.sort((a, b) => new Date(b.event_date).getTime() - new Date(a.event_date).getTime()).map((act) => (
                                <div key={act.id} className="bg-white p-4 sm:p-5 rounded-xl sm:rounded-2xl border border-stone-100 flex items-center justify-between group/act">
                                  <div className="space-y-1 min-w-0 pr-2">
                                    <div className={`text-[9px] sm:text-[10px] font-black uppercase px-2 py-0.5 rounded w-fit ${act.location_type === 'internal' ? 'bg-indigo-50 text-[#4F5BD5]' : 'bg-rose-50 text-[#D62976]'}`}>
                                      {act.location_type === 'internal' ? '学内' : '学外'}
                                    </div>
                                    <h5 className="font-bold text-stone-800 text-[13px] sm:text-[14px] truncate">{act.title_ja}</h5>
                                    <p className="text-[10px] sm:text-[11px] text-stone-400 font-medium">{format(new Date(act.event_date), 'yyyy/MM/dd')}</p>
                                  </div>
                                  <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-stone-200 group-hover/act:text-[#4F5BD5] shrink-0" />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}

              {filteredMembers.length > limit && (
                <div className="pt-8 text-center">
                  <button
                    onClick={() => setLimit(prev => prev + 30)}
                    className="px-12 py-5 bg-stone-900 text-white rounded-[1.5rem] font-black text-[13px] uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl"
                  >
                    もっと見る
                  </button>
                </div>
              )}

              {filteredMembers.length === 0 && (
                <div className="py-20 text-center text-stone-400 font-medium">該当するメンバーが見つかりませんでした。</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════ TAB 2: RANKING (CRITERIA) ══════════════════════════ */}
      {activeTab === 'ranking' && (
        <div className="space-y-8">
          {/* Condition Builder (Reuse existing logic) */}
          <div className="flex flex-col overflow-hidden rounded-[1.6rem] border border-stone-200 bg-[#fcfbff] shadow-[0_10px_30px_rgba(15,23,42,0.06)] sm:rounded-[2.5rem] sm:border-stone-100 sm:bg-white sm:shadow-sm">
            <div className="order-2 flex flex-col gap-3 border-b border-stone-200/80 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:border-stone-50 sm:px-8 sm:py-6">
              <div className="flex items-center gap-2.5 sm:gap-3">
                <Settings2 className="h-4 w-4 text-[#4F5BD5] sm:h-5 sm:w-5" />
                <h2 className="font-black text-stone-900 text-[14px] sm:text-[15px]">特別な条件を入力してください</h2>
              </div>
              <button onClick={addCondition} className="flex h-10 items-center justify-center gap-2 rounded-xl border border-[#cdd7ff] bg-[#eef2ff] px-4 text-[#3f5ae0] font-black text-[12px] shadow-sm sm:h-11 sm:px-5 sm:py-2.5">
                <Plus className="h-4 w-4" />
                条件を追加
              </button>
            </div>
            <div className="order-1 border-b border-stone-200/80 bg-[#f7f9ff] px-4 py-3 sm:px-8">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px] sm:items-end">
                <div className="space-y-1">
                  <p className="text-[13px] font-black text-stone-900">総活動数を入力してください</p>
                  <p className="hidden text-[11px] leading-5 text-stone-500">
                    総活動数を設定すると、手動条件とは OR 条件で対象者を判定します。
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex-1">
                    <span className="hidden text-[11px] font-black uppercase tracking-[0.14em] text-stone-400">
                      Total Count
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={requiredTotalCountInput}
                      onChange={(e) => setRequiredTotalCountInput(e.target.value)}
                      className="h-11 w-full rounded-xl border border-[#cdd7ff] bg-white px-4 text-sm font-black text-stone-900 outline-none focus:border-[#4F5BD5]"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={applyTotalRequirement}
                    className="h-11 shrink-0 rounded-xl border border-[#cdd7ff] bg-[#eef2ff] px-4 text-[12px] font-black text-[#3f5ae0] shadow-sm transition hover:bg-[#e4ebff]"
                  >
                    {isApplyingTotalFilter ? '...' : 'OK'}
                  </button>
                </div>
              </div>
            </div>
            <div className="order-3 space-y-2.5 p-3 sm:space-y-3 sm:p-6">
              {conditions.map((c, idx) => (
                <div key={c.id} className="rounded-[1.35rem] border border-stone-200 bg-white p-3 shadow-[0_8px_18px_rgba(15,23,42,0.04)] sm:grid sm:grid-cols-12 sm:items-center sm:gap-3 sm:px-3 sm:py-2 sm:border-stone-100 sm:bg-stone-50/60 sm:shadow-none sm:hover:bg-stone-50">
                  <div className="mb-2.5 flex items-center justify-between sm:col-span-1 sm:mb-0 sm:block">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-stone-200 bg-stone-50 text-[13px] font-black text-stone-600 shadow-sm sm:h-6 sm:w-6 sm:border-0 sm:bg-stone-100 sm:text-[14px]">{idx + 1}</span>
                    <button onClick={() => removeCondition(c.id)} className="flex items-center justify-center gap-1 rounded-lg border border-rose-100 bg-rose-50 px-2.5 py-1.5 text-rose-500 shadow-sm sm:hidden">
                      <X className="h-4 w-4" />
                      <span className="text-[12px] font-bold">削除</span>
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:col-span-10 sm:flex sm:flex-wrap sm:gap-8 sm:mt-0">
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <label className="pl-1 text-[12px] font-black text-[#4F5BD5] sm:text-[14px] sm:uppercase sm:tracking-widest">学内活動</label>
                      <div className="relative">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-[#4F5BD5]" />
                        <input
                          type="number"
                          min={0}
                          value={c.minInternal}
                          onChange={e => updateCondition(c.id, 'minInternal', e.target.value)}
                          className="h-11 w-full rounded-xl border border-stone-200 bg-stone-50 pl-8 pr-3 text-sm font-black text-stone-900 outline-none focus:border-[#4F5BD5] focus:bg-white sm:h-10 sm:w-28 sm:rounded-lg sm:border-transparent sm:pr-4"
                        />
                      </div>
                    </div>
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <label className="pl-1 text-[12px] font-black text-[#D62976] sm:text-[14px] sm:uppercase sm:tracking-widest">学外活動</label>
                      <div className="relative">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-[#D62976]" />
                        <input
                          type="number"
                          min={0}
                          value={c.minExternal}
                          onChange={e => updateCondition(c.id, 'minExternal', e.target.value)}
                          className="h-11 w-full rounded-xl border border-stone-200 bg-stone-50 pl-8 pr-3 text-sm font-black text-stone-900 outline-none focus:border-[#D62976] focus:bg-white sm:h-10 sm:w-28 sm:rounded-lg sm:border-transparent sm:pr-4"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="hidden sm:col-span-1 sm:flex sm:items-end sm:justify-end sm:pb-1.5">
                    <button onClick={() => removeCondition(c.id)} className="rounded-lg border border-rose-100 bg-rose-50 p-2 text-rose-400 transition-colors hover:text-rose-600 sm:border-0 sm:bg-transparent">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="order-4 sticky bottom-0 flex flex-col gap-3 border-t border-stone-200 bg-white px-4 py-3 shadow-[0_-10px_24px_rgba(15,23,42,0.06)] sm:static sm:flex-row sm:items-center sm:justify-between sm:border-stone-100 sm:bg-stone-50 sm:px-8 sm:py-4 sm:shadow-none">
              <span className="text-[13px] font-bold text-stone-700 sm:text-[14px] sm:text-stone-600">条件を満たすメンバー: <span className="text-emerald-600">{qualifiedMembers.length}名</span></span>
              <button
                onClick={() => setIsExportModalOpen(true)}
                className="flex h-11 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-[12px] font-black text-emerald-700 transition-all hover:bg-emerald-600 hover:text-white sm:h-auto sm:py-2"
              >
                <Download className="w-4 h-4" />
                Excel Export
              </button>
            </div>
          </div>

          {/* Ranking Table style */}
          <div className="space-y-4">
            <div className="grid w-full grid-cols-2 gap-2 rounded-xl bg-stone-100 p-1.5 sm:flex sm:w-fit sm:items-center sm:gap-3">
              <button onClick={() => setRankingView('qualified')} className={`px-4 py-2 rounded-lg text-[14px] font-black ${rankingView === 'qualified' ? 'bg-white text-emerald-600 shadow-sm' : 'text-stone-600'}`}>対象者</button>
              <button onClick={() => setRankingView('all')} className={`px-4 py-2 rounded-lg text-[14px] font-black ${rankingView === 'all' ? 'bg-white text-[#4F5BD5] shadow-sm' : 'text-stone-600'}`}>全員</button>
            </div>

            <div className="bg-white rounded-3xl border border-stone-100 shadow-sm">
              <div className="space-y-3 p-3 sm:hidden">
                {rankingList.map((m) => (
                  <div key={m.id} className="rounded-2xl border border-stone-100 bg-stone-50/50 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-black text-stone-900">{m.full_name}</p>
                        <p className="mt-1 truncate text-[11px] font-medium text-stone-400">{m.mssv || '学籍番号なし'}</p>
                      </div>
                      <div className="rounded-xl bg-white px-3 py-2 text-right shadow-sm">
                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-stone-400">合計</p>
                        <p className="text-base font-black text-stone-900">{m.total_count}</p>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div className="rounded-xl bg-white px-3 py-2 shadow-sm">
                        <p className="text-[10px] font-black text-[#4F5BD5]">学内</p>
                        <p className="mt-1 text-[15px] font-black text-[#4F5BD5]">{m.internal_count}</p>
                      </div>
                      <div className="rounded-xl bg-white px-3 py-2 shadow-sm">
                        <p className="text-[10px] font-black text-[#D62976]">学外</p>
                        <p className="mt-1 text-[15px] font-black text-[#D62976]">{m.external_count}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="hidden w-full overflow-hidden sm:block">
                <div className="grid grid-cols-12 px-4 sm:px-8 py-4 bg-stone-50 text-[12px] sm:text-[15px] font-black uppercase tracking-widest">
                  <div className="col-span-5 sm:col-span-6 text-stone-500">メンバー</div>
                  <div className="col-span-2 text-center text-[#4F5BD5]">学内</div>
                  <div className="col-span-2 text-center text-[#D62976]">学外</div>
                  <div className="col-span-3 sm:col-span-2 text-right text-stone-500">合計</div>
                </div>
                <div className="divide-y divide-stone-50">
                  {rankingList.map((m) => (
                    <div key={m.id} className="grid grid-cols-12 px-4 sm:px-8 py-4 sm:py-5 items-center hover:bg-stone-50/50">
                      <div className="col-span-5 sm:col-span-6 flex items-center gap-2 sm:gap-3 min-w-0">
                        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-stone-100 flex items-center justify-center font-black text-stone-400 text-[10px] sm:text-xs shrink-0">{m.full_name?.charAt(0)}</div>
                        <div className="min-w-0">
                          <p className="font-bold text-stone-900 text-[12px] sm:text-sm truncate">{m.full_name}</p>
                          <p className="text-[10px] sm:text-[11px] text-stone-400 truncate">{m.mssv}</p>
                        </div>
                      </div>
                      <div className="col-span-2 text-center font-black text-[#4F5BD5] text-sm sm:text-base">{m.internal_count}</div>
                      <div className="col-span-2 text-center font-black text-[#D62976] text-sm sm:text-base">{m.external_count}</div>
                      <div className="col-span-3 sm:col-span-2 text-right font-black text-stone-900 text-sm sm:text-base">{m.total_count}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <ExcelExportModal
        isOpen={isExportModalOpen}
        title="Excelエクスポート設定"
        description=""
        fields={awardsExportFields}
        defaultSelectedKeys={awardsDefaultExportKeys}
        onClose={() => setIsExportModalOpen(false)}
        onConfirm={handleConfiguredExportExcel}
        confirmLabel="Excelをエクスポート"
      />
    </div>
  );
}
