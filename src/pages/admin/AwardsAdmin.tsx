import { useState, useEffect, useMemo } from 'react';
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

// ─── Component ───────────────────────────────────────────────────────────────
export default function AwardsAdmin() {
  const { selectedYear } = useAppStore();
  const [activeTab, setActiveTab] = useState<'members' | 'ranking'>('members');
  const [isLoading, setIsLoading] = useState(true);

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

  useEffect(() => {
    localStorage.setItem('award_criteria', JSON.stringify(conditions));
  }, [conditions]);
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
        .select('user:users(id, full_name, full_name_kana, mssv)')
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
    return members.filter(m =>
      conditions.some(c => m.internal_count >= c.minInternal && m.external_count >= c.minExternal)
    );
  }, [members, conditions]);

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
    const value = valStr === '' ? 0 : parseInt(valStr);
    setConditions(prev => prev.map(c => c.id === id ? { ...c, [field]: isNaN(value) ? 0 : value } : c));
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-10 pb-24">
      <style>{spinnerStyle}</style>
      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="flex items-start gap-5">
          <div className="w-1.5 h-16 rounded-full bg-gradient-to-b from-[#D62976] to-[#4F5BD5] mt-1 hidden sm:block" />
          <div className="flex flex-col gap-2">
            <h1 className="text-4xl font-black text-stone-900 tracking-tighter leading-none">表彰・資格</h1>
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.4em]">
              <span className="text-stone-400">Management</span>
              <span className="text-[#D62976]">Console</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Tab Selector ── */}
      <div className="flex items-center gap-2 p-1.5 bg-stone-100 rounded-2xl w-fit">
        <button
          onClick={() => setActiveTab('members')}
          className={`px-6 py-3 rounded-xl text-[16px] font-black uppercase tracking-widest transition-all ${activeTab === 'members' ? 'bg-white text-[#4F5BD5] shadow-lg' : 'text-stone-600'}`}
        >
          メンバー活動
        </button>
        <button
          onClick={() => setActiveTab('ranking')}
          className={`px-6 py-3 rounded-xl text-[16px] font-black uppercase tracking-widest transition-all ${activeTab === 'ranking' ? 'bg-white text-[#D62976] shadow-lg' : 'text-stone-600'}`}
        >
          活動表彰
        </button>
      </div>

      {/* ══════════════════════════ TAB 1: MEMBERS LIST ══════════════════════════ */}
      {activeTab === 'members' && (
        <div className="space-y-8">
          {/* Search Bar */}
          <div className="relative max-w-2xl group">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-300 group-focus-within:text-[#4F5BD5] transition-colors" />
            <input
              type="text"
              placeholder="学籍番号、氏名、カタカナで検索..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setLimit(30); }}
              className="w-full h-16 pl-14 pr-6 bg-white border-2 border-stone-100 focus:border-[#4F5BD5] rounded-3xl text-[15px] font-medium transition-all outline-none"
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
                      <div className="text-left min-w-0">
                        <span className="block text-[9px] sm:text-[11px] font-black text-stone-400 uppercase tracking-widest mb-0.5 sm:mb-1 truncate">{m.full_name_kana}</span>
                        <h3 className="text-base sm:text-xl font-black text-stone-900 leading-none truncate">{m.full_name}</h3>
                        <p className="text-[11px] sm:text-[12px] font-medium text-stone-400 mt-1 truncate">{m.mssv || '学籍番号なし'}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 sm:gap-8 shrink-0">
                      <div className="flex items-center gap-3 sm:gap-6">
                        <div className="text-center">
                          <span className="block text-[9px] sm:text-[10px] font-black text-[#4F5BD5] uppercase tracking-widest mb-0.5 sm:mb-1">学内</span>
                          <span className="text-lg sm:text-2xl font-black text-[#4F5BD5]">{m.internal_count}</span>
                        </div>
                        <div className="text-center">
                          <span className="block text-[9px] sm:text-[10px] font-black text-[#D62976] uppercase tracking-widest mb-0.5 sm:mb-1">学外</span>
                          <span className="text-lg sm:text-2xl font-black text-[#D62976]">{m.external_count}</span>
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
          <div className="bg-white rounded-[2.5rem] border border-stone-100 shadow-sm overflow-hidden">
            <div className="px-8 py-6 border-b border-stone-50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Settings2 className="w-5 h-5 text-[#4F5BD5]" />
                <h2 className="font-black text-stone-900 text-[15px]">表彰条件の設定</h2>
              </div>
              <button onClick={addCondition} className="flex items-center gap-2 px-5 py-2.5 bg-indigo-50 text-[#4F5BD5] rounded-xl font-black text-[12px]">
                <Plus className="w-4 h-4" />
                条件を追加
              </button>
            </div>
            <div className="p-6 space-y-3">
              {conditions.map((c, idx) => (
                <div key={c.id} className="grid grid-cols-12 items-center gap-3 px-3 py-2 rounded-2xl hover:bg-stone-50 transition-colors group">
                  <div className="col-span-1 flex items-center gap-2">
                    <span className="w-6 h-6 bg-stone-100 rounded-lg flex items-center justify-center text-[14px] font-black text-stone-500">{idx + 1}</span>
                  </div>
                  <div className="col-span-12 sm:col-span-10 flex flex-wrap gap-4 sm:gap-8 mt-4 sm:mt-0">
                    <div className="flex flex-col gap-1.5 min-w-[120px]">
                      <label className="text-[14px] font-black text-[#4F5BD5] uppercase tracking-widest pl-1">学内活動</label>
                      <div className="relative">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-[#4F5BD5]" />
                        <input
                          type="number"
                          min={0}
                          value={c.minInternal}
                          onChange={e => updateCondition(c.id, 'minInternal', e.target.value)}
                          className="w-full sm:w-28 h-10 pl-8 pr-4 bg-stone-50 border-2 border-transparent focus:border-[#4F5BD5] rounded-lg text-sm font-black text-stone-900"
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5 min-w-[120px]">
                      <label className="text-[14px] font-black text-[#D62976] uppercase tracking-widest pl-1">学外活動</label>
                      <div className="relative">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-[#D62976]" />
                        <input
                          type="number"
                          min={0}
                          value={c.minExternal}
                          onChange={e => updateCondition(c.id, 'minExternal', e.target.value)}
                          className="w-full sm:w-28 h-10 pl-8 pr-4 bg-stone-50 border-2 border-transparent focus:border-[#D62976] rounded-lg text-sm font-black text-stone-900"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="col-span-12 sm:col-span-1 flex items-end justify-end pb-1.5">
                    <button onClick={() => removeCondition(c.id)} className="p-2 text-rose-400 hover:text-rose-600 bg-rose-50/50 sm:bg-transparent rounded-lg sm:rounded-none w-full sm:w-auto flex items-center justify-center gap-2 sm:block transition-colors">
                      <X className="w-5 h-5 sm:w-4 h-4" />
                      <span className="sm:hidden text-[15px] font-bold">条件を削除</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-8 py-4 bg-stone-50 border-t border-stone-100 flex items-center justify-between">
              <span className="text-[12px] font-bold text-stone-500">条件を満たすメンバー: <span className="text-emerald-600">{qualifiedMembers.length}名</span></span>
            </div>
          </div>

          {/* Ranking Table style */}
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-1.5 bg-stone-100 rounded-xl w-fit">
              <button onClick={() => setRankingView('qualified')} className={`px-4 py-2 rounded-lg text-[12px] font-black ${rankingView === 'qualified' ? 'bg-white text-emerald-600 shadow-sm' : 'text-stone-400'}`}>対象者</button>
              <button onClick={() => setRankingView('all')} className={`px-4 py-2 rounded-lg text-[12px] font-black ${rankingView === 'all' ? 'bg-white text-[#4F5BD5] shadow-sm' : 'text-stone-400'}`}>全員</button>
            </div>

            <div className="bg-white rounded-3xl border border-stone-100 overflow-hidden shadow-sm overflow-x-auto">
              <div className="min-w-[600px]">
                <div className="grid grid-cols-12 px-8 py-4 bg-stone-50 text-[10px] font-black uppercase tracking-widest">
                  <div className="col-span-6 text-stone-400">メンバー</div>
                  <div className="col-span-2 text-center text-[#4F5BD5]">学内</div>
                  <div className="col-span-2 text-center text-[#D62976]">学外</div>
                  <div className="col-span-2 text-right text-stone-400">合計</div>
                </div>
                <div className="divide-y divide-stone-50">
                  {rankingList.map((m) => (
                    <div key={m.id} className="grid grid-cols-12 px-8 py-5 items-center hover:bg-stone-50/50">
                      <div className="col-span-6 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-stone-100 flex items-center justify-center font-black text-stone-400 text-xs">{m.full_name?.charAt(0)}</div>
                        <div>
                          <p className="font-bold text-stone-900 text-sm">{m.full_name}</p>
                          <p className="text-[11px] text-stone-400">{m.mssv}</p>
                        </div>
                      </div>
                      <div className="col-span-2 text-center font-black text-[#4F5BD5]">{m.internal_count}</div>
                      <div className="col-span-2 text-center font-black text-[#D62976]">{m.external_count}</div>
                      <div className="col-span-2 text-right font-black text-stone-900">{m.total_count}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
