import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store/useAppStore';
import {
  Trophy,
  Search,
  Plus,
  Trash2,
  Star,
  Medal,
  Calendar,
  Sparkles,
  Loader2,
  ChevronRight,
  X,
  TrendingUp,
  BarChart3,
  Award as AwardIcon,
  Crown,
  Filter,
  Users,
  CheckCircle2,
  Building2,
  Globe2,
  Settings2,
  GripVertical
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { toast } from 'sonner';

// ─── Types ──────────────────────────────────────────────────────────────────
interface Member {
  id: string;
  full_name: string;
  full_name_kana: string;
  mssv: string | null;
  email: string;
}

interface AwardRecord {
  id: string;
  user_id: string;
  academic_year_id: string;
  title_ja: string;
  title_vi: string;
  description_ja: string;
  description_vi: string;
  category: string;
  awarded_at: string;
  user: { full_name: string; full_name_kana: string };
}

interface RankingMember {
  id: string;
  full_name: string;
  full_name_kana: string;
  mssv: string | null;
  internal_count: number;
  external_count: number;
  total_count: number;
}

// Qualification Condition: member qualifies if internal >= minInternal AND external >= minExternal
interface QualCondition {
  id: string;
  minInternal: number;
  minExternal: number;
}

// ─── Default conditions (5 patterns from the spec) ──────────────────────────
const DEFAULT_CONDITIONS: QualCondition[] = [
  { id: '1', minInternal: 1, minExternal: 4 },
  { id: '2', minInternal: 2, minExternal: 3 },
  { id: '3', minInternal: 3, minExternal: 2 },
  { id: '4', minInternal: 4, minExternal: 1 },
  { id: '5', minInternal: 0, minExternal: 5 },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function memberQualifies(m: RankingMember, conditions: QualCondition[]): boolean {
  return conditions.some(c => m.internal_count >= c.minInternal && m.external_count >= c.minExternal);
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function AwardsAdmin() {
  const { selectedYear } = useAppStore();

  const [activeTab, setActiveTab] = useState<'history' | 'ranking'>('history');
  const [awards, setAwards] = useState<AwardRecord[]>([]);
  const [rankingData, setRankingData] = useState<RankingMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddingAward, setIsAddingAward] = useState(false);

  // Qualification conditions (dynamic, editable list)
  const [conditions, setConditions] = useState<QualCondition[]>(DEFAULT_CONDITIONS);

  // View filter for ranking tab
  const [rankingView, setRankingView] = useState<'qualified' | 'all'>('qualified');
  const [searchFilter, setSearchFilter] = useState('');

  // Member search for award form
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Member[]>([]);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // Award form state
  const [formData, setFormData] = useState({
    title_ja: '',
    title_vi: '',
    description_ja: '',
    description_vi: '',
    category: 'excellent',
    awarded_at: format(new Date(), 'yyyy-MM-dd')
  });

  useEffect(() => {
    if (selectedYear?.id) {
      if (activeTab === 'history') fetchAwards();
      else fetchRanking();
    }
  }, [selectedYear?.id, activeTab]);

  // ── Derived: qualified members (deduped by ID) ─────────────────────────────
  const qualifiedMembers = useMemo(() => {
    return rankingData.filter(m => memberQualifies(m, conditions));
  }, [rankingData, conditions]);

  // Which condition(s) each member satisfies (for badge display)
  function matchedConditions(m: RankingMember): QualCondition[] {
    return conditions.filter(c => m.internal_count >= c.minInternal && m.external_count >= c.minExternal);
  }

  // Filtered ranking list
  const displayedRanking = useMemo(() => {
    let list = rankingView === 'qualified' ? qualifiedMembers : rankingData;
    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase();
      list = list.filter(m =>
        m.full_name?.toLowerCase().includes(q) ||
        m.full_name_kana?.toLowerCase().includes(q) ||
        m.mssv?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [rankingView, qualifiedMembers, rankingData, searchFilter]);

  // ── Data Fetchers ──────────────────────────────────────────────────────────
  const fetchAwards = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('awards')
        .select('*, user:users(full_name, full_name_kana)')
        .eq('academic_year_id', selectedYear?.id)
        .is('deleted_at', null)
        .order('awarded_at', { ascending: false });
      if (error) throw error;
      setAwards(data as unknown as AwardRecord[]);
    } catch {
      toast.error('表彰データの取得に失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchRanking = async () => {
    try {
      setIsLoading(true);
      const { data: members, error: mError } = await supabase
        .from('club_memberships')
        .select('user:users(id, full_name, full_name_kana, mssv)')
        .eq('academic_year_id', selectedYear?.id)
        .is('deleted_at', null);
      if (mError) throw mError;

      const { data: regs, error: rError } = await supabase
        .from('registrations')
        .select('user_id, activity:activities(location_type, academic_year_id)')
        .eq('attendance_status', 'present');
      if (rError) throw rError;

      const yearRegs = regs.filter(r => (r.activity as any)?.academic_year_id === selectedYear?.id);

      const map = new Map<string, RankingMember>();
      (members as any[]).forEach(m => {
        if (!m.user) return;
        map.set(m.user.id, {
          id: m.user.id,
          full_name: m.user.full_name,
          full_name_kana: m.user.full_name_kana || '',
          mssv: m.user.mssv,
          internal_count: 0,
          external_count: 0,
          total_count: 0
        });
      });

      yearRegs.forEach((r: any) => {
        const mem = map.get(r.user_id);
        if (mem) {
          const type = r.activity?.location_type || 'internal';
          if (type === 'internal') mem.internal_count++;
          else mem.external_count++;
          mem.total_count++;
        }
      });

      setRankingData(Array.from(map.values()).sort((a, b) => b.total_count - a.total_count));
    } catch {
      toast.error('ランキングデータの取得に失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  // ── Condition Editor Handlers ──────────────────────────────────────────────
  function addCondition() {
    setConditions(prev => [...prev, { id: uid(), minInternal: 0, minExternal: 0 }]);
  }
  function removeCondition(id: string) {
    setConditions(prev => prev.filter(c => c.id !== id));
  }
  function updateCondition(id: string, field: 'minInternal' | 'minExternal', value: number) {
    setConditions(prev => prev.map(c => c.id === id ? { ...c, [field]: Math.max(0, value) } : c));
  }

  // ── Award Form ─────────────────────────────────────────────────────────────
  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) { setSearchResults([]); return; }
    try {
      setIsSearching(true);
      const { data, error } = await supabase
        .from('users')
        .select('id, full_name, full_name_kana, mssv, email')
        .or(`full_name.ilike.%${query}%,full_name_kana.ilike.%${query}%,mssv.ilike.%${query}%`)
        .limit(5);
      if (error) throw error;
      setSearchResults(data || []);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMember || !selectedYear?.id) return;
    try {
      setIsLoading(true);
      const { error } = await supabase.from('awards').insert({
        user_id: selectedMember.id,
        academic_year_id: selectedYear.id,
        ...formData
      });
      if (error) throw error;
      toast.success('表彰を授与しました');
      setIsAddingAward(false);
      setSelectedMember(null);
      setFormData({ title_ja: '', title_vi: '', description_ja: '', description_vi: '', category: 'excellent', awarded_at: format(new Date(), 'yyyy-MM-dd') });
      fetchAwards();
    } catch {
      toast.error('表彰の授与に失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('この表彰データを削除してもよろしいですか？')) return;
    try {
      const { error } = await supabase.from('awards').update({ deleted_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
      toast.success('表彰データを削除しました');
      fetchAwards();
    } catch {
      toast.error('削除に失敗しました');
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-10 pb-24">
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
        <button
          onClick={() => setIsAddingAward(true)}
          className="h-14 px-7 bg-black text-white rounded-2xl flex items-center gap-3 hover:scale-[1.02] active:scale-95 transition-all shadow-xl text-[13px] font-black uppercase tracking-widest group"
        >
          <Plus className="w-4 h-4 group-hover:rotate-90 transition-transform duration-300" />
          <span>新規表彰を授与</span>
        </button>
      </div>

      {/* ── Tab Selector ── */}
      <div className="flex items-center gap-2 p-1.5 bg-stone-100 rounded-2xl w-fit">
        {[
          { key: 'history', icon: AwardIcon, label: '表彰履歴', color: 'text-[#4F5BD5]' },
          { key: 'ranking', icon: TrendingUp, label: '活動表彰', color: 'text-[#D62976]' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key as any)}
            className={`px-6 py-3 rounded-xl text-[12px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === t.key ? `bg-white ${t.color} shadow-lg shadow-black/5` : 'text-stone-400 hover:text-stone-600'}`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════ HISTORY TAB ══════════════════════════ */}
      {activeTab === 'history' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {isLoading && !isAddingAward ? (
            <div className="col-span-full py-32 flex flex-col items-center gap-4 text-stone-300">
              <Loader2 className="w-12 h-12 animate-spin" />
              <span className="text-[10px] font-black uppercase tracking-[0.3em]">Loading...</span>
            </div>
          ) : awards.length === 0 ? (
            <div className="col-span-full py-32 border-4 border-dashed border-stone-100 rounded-[3rem] flex flex-col items-center gap-6 text-center group hover:border-[#4F5BD5]/20 transition-all duration-700">
              <div className="w-24 h-24 rounded-full bg-stone-50 flex items-center justify-center group-hover:scale-110 group-hover:bg-[#4F5BD5]/5 transition-all duration-700">
                <Trophy className="w-10 h-10 text-stone-200 group-hover:text-[#4F5BD5] transition-colors" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-black text-stone-900">まだ表彰データがありません</h3>
                <p className="text-stone-400 font-medium max-w-xs">最初の表彰を授与して、メンバーのモチベーションを高めましょう。</p>
              </div>
            </div>
          ) : awards.map((award, i) => (
            <motion.div key={award.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className="group relative overflow-hidden bg-white p-10 rounded-[3rem] border border-stone-100 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.03)] hover:shadow-[0_48px_96px_-32px_rgba(0,0,0,0.06)] hover:border-[#4F5BD5]/20 transition-all duration-700">
              <div className="absolute top-10 right-10 flex flex-col items-end gap-4">
                <div className="w-14 h-14 rounded-2xl bg-[#4F5BD5]/5 flex items-center justify-center group-hover:scale-110 group-hover:rotate-12 transition-all duration-700">
                  {award.category === 'excellent' && <Star className="w-7 h-7 text-[#D62976]" />}
                  {award.category === 'leadership' && <AwardIcon className="w-7 h-7 text-[#4F5BD5]" />}
                  {award.category === 'qualification' && <Medal className="w-7 h-7 text-amber-500" />}
                  {award.category === 'general' && <Sparkles className="w-7 h-7 text-indigo-400" />}
                </div>
                <button onClick={() => handleDelete(award.id)} className="p-3 text-rose-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 duration-500">
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-6 pr-16">
                <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-stone-400">
                  <Calendar className="w-4 h-4" />
                  <span>{format(new Date(award.awarded_at), 'yyyy.MM.dd')}</span>
                </div>
                <div className="space-y-3">
                  <h3 className="text-2xl font-black text-stone-900 leading-tight group-hover:text-[#4F5BD5] transition-colors duration-500">{award.title_ja}</h3>
                  <p className="text-[14px] font-medium text-stone-500 leading-relaxed italic border-l-2 border-[#D62976]/20 pl-4">{award.title_vi}</p>
                  <p className="text-[15px] font-medium text-stone-600 leading-relaxed max-w-lg">{award.description_ja}</p>
                </div>
                <div className="pt-6 flex items-center gap-4 border-t border-stone-50">
                  <div className="w-11 h-11 rounded-full bg-[#4F5BD5]/10 flex items-center justify-center text-[#4F5BD5] font-black">
                    {award.user.full_name?.charAt(0)}
                  </div>
                  <div>
                    <span className="block text-[10px] font-black text-stone-400 uppercase tracking-widest mb-0.5">授与対象者</span>
                    <span className="block text-[15px] font-black text-stone-900">{award.user.full_name}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* ══════════════════════════ RANKING TAB ══════════════════════════ */}
      {activeTab === 'ranking' && (
        <div className="space-y-8">

          {/* ── Condition Builder Panel ── */}
          <div className="bg-white rounded-[2.5rem] border border-stone-100 shadow-[0_16px_48px_-8px_rgba(0,0,0,0.04)] overflow-hidden">
            <div className="px-8 py-6 border-b border-stone-50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                  <Settings2 className="w-5 h-5 text-[#4F5BD5]" />
                </div>
                <div>
                  <h2 className="font-black text-stone-900 text-[15px]">表彰条件の設定</h2>
                  <p className="text-stone-400 text-[12px] font-medium">いずれかの条件を満たすメンバーが対象となります</p>
                </div>
              </div>
              <button
                onClick={addCondition}
                className="flex items-center gap-2 px-5 py-2.5 bg-indigo-50 text-[#4F5BD5] rounded-xl font-black text-[12px] hover:bg-indigo-100 transition-all active:scale-95"
              >
                <Plus className="w-4 h-4" />
                条件を追加
              </button>
            </div>

            <div className="p-6 space-y-3">
              {/* Header labels */}
              <div className="grid grid-cols-12 px-3 pb-1">
                <div className="col-span-1" />
                <div className="col-span-5 text-[10px] font-black uppercase tracking-widest text-stone-400 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-[#4F5BD5]" />
                  学内イベント (以上)
                </div>
                <div className="col-span-5 text-[10px] font-black uppercase tracking-widest text-stone-400 flex items-center gap-1.5">
                  <Globe2 className="w-3.5 h-3.5 text-[#D62976]" />
                  学外活動 (以上)
                </div>
                <div className="col-span-1" />
              </div>

              <AnimatePresence initial={false}>
                {conditions.map((c, idx) => (
                  <motion.div
                    key={c.id}
                    layout
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="grid grid-cols-12 items-center gap-3 px-3 py-2 rounded-2xl hover:bg-stone-50 transition-colors group">
                      {/* index badge */}
                      <div className="col-span-1 flex items-center gap-2">
                        <GripVertical className="w-4 h-4 text-stone-200 group-hover:text-stone-400 transition-colors" />
                        <span className="w-6 h-6 bg-stone-100 rounded-lg flex items-center justify-center text-[11px] font-black text-stone-500">
                          {idx + 1}
                        </span>
                      </div>

                      {/* Internal input */}
                      <div className="col-span-5">
                        <div className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-[#4F5BD5]" />
                            <input
                              type="number" min={0}
                              value={c.minInternal}
                              onChange={e => updateCondition(c.id, 'minInternal', parseInt(e.target.value) || 0)}
                              className="w-full h-11 pl-8 pr-4 bg-indigo-50/60 border-2 border-transparent focus:border-[#4F5BD5] focus:bg-white rounded-xl text-[15px] font-black text-stone-900 outline-none transition-all"
                            />
                          </div>
                          <span className="text-stone-300 font-black">＋</span>
                        </div>
                      </div>

                      {/* External input */}
                      <div className="col-span-5">
                        <div className="relative">
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-[#D62976]" />
                          <input
                            type="number" min={0}
                            value={c.minExternal}
                            onChange={e => updateCondition(c.id, 'minExternal', parseInt(e.target.value) || 0)}
                            className="w-full h-11 pl-8 pr-4 bg-rose-50/60 border-2 border-transparent focus:border-[#D62976] focus:bg-white rounded-xl text-[15px] font-black text-stone-900 outline-none transition-all"
                          />
                        </div>
                      </div>

                      {/* Delete */}
                      <div className="col-span-1 flex justify-end">
                        <button onClick={() => removeCondition(c.id)} className="p-2 text-stone-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all opacity-0 group-hover:opacity-100">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {conditions.length === 0 && (
                <div className="py-8 text-center text-stone-400 text-[13px] font-medium">
                  条件がありません。上のボタンから追加してください。
                </div>
              )}
            </div>

            {/* Summary bar */}
            <div className="px-8 py-4 bg-gradient-to-r from-indigo-50/60 to-rose-50/40 border-t border-stone-100 flex items-center gap-2 text-[12px] font-black text-stone-500 flex-wrap">
              <Filter className="w-4 h-4 text-[#4F5BD5]" />
              <span>上記</span>
              <span className="px-2 py-0.5 bg-[#4F5BD5] text-white rounded-lg">{conditions.length}</span>
              <span>条件のうち、いずれか1つを満たす場合に対象となります</span>
              <span className="ml-auto flex items-center gap-1.5 text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {isLoading ? '計算中...' : `${qualifiedMembers.length}名が対象`}
              </span>
            </div>
          </div>

          {/* ── View Controls ── */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex items-center gap-2 p-1.5 bg-stone-100 rounded-2xl">
              <button
                onClick={() => setRankingView('qualified')}
                className={`px-5 py-2.5 rounded-xl text-[12px] font-black transition-all flex items-center gap-2 ${rankingView === 'qualified' ? 'bg-white text-emerald-600 shadow-md shadow-black/5' : 'text-stone-400 hover:text-stone-600'}`}
              >
                <CheckCircle2 className="w-4 h-4" />
                対象メンバー
                <span className={`px-2 py-0.5 rounded-full text-[11px] ${rankingView === 'qualified' ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-200 text-stone-500'}`}>
                  {qualifiedMembers.length}
                </span>
              </button>
              <button
                onClick={() => setRankingView('all')}
                className={`px-5 py-2.5 rounded-xl text-[12px] font-black transition-all flex items-center gap-2 ${rankingView === 'all' ? 'bg-white text-[#4F5BD5] shadow-md shadow-black/5' : 'text-stone-400 hover:text-stone-600'}`}
              >
                <Users className="w-4 h-4" />
                全メンバー
                <span className={`px-2 py-0.5 rounded-full text-[11px] ${rankingView === 'all' ? 'bg-indigo-100 text-indigo-700' : 'bg-stone-200 text-stone-500'}`}>
                  {rankingData.length}
                </span>
              </button>
            </div>

            {/* Search */}
            <div className="relative flex-1 max-w-xs ml-auto">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-300" />
              <input
                type="text"
                placeholder="名前・学籍番号で絞り込み..."
                value={searchFilter}
                onChange={e => setSearchFilter(e.target.value)}
                className="w-full h-11 pl-10 pr-4 bg-white border border-stone-100 rounded-2xl text-[13px] font-medium outline-none focus:border-[#4F5BD5] focus:shadow-[0_0_0_4px_rgba(79,91,213,0.06)] transition-all"
              />
              {searchFilter && (
                <button onClick={() => setSearchFilter('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-stone-300 hover:text-stone-500">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <button
              onClick={fetchRanking}
              disabled={isLoading}
              className="h-11 px-5 bg-stone-900 text-white rounded-2xl font-black text-[12px] flex items-center gap-2 hover:bg-stone-700 transition-all active:scale-95 shrink-0"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <BarChart3 className="w-4 h-4" />}
              更新
            </button>
          </div>

          {/* ── Main Table ── */}
          {isLoading ? (
            <div className="py-24 flex flex-col items-center gap-4 text-stone-300">
              <Loader2 className="w-12 h-12 animate-spin" />
              <span className="text-[10px] font-black uppercase tracking-[0.3em]">データを集計中...</span>
            </div>
          ) : displayedRanking.length === 0 ? (
            <div className="py-24 text-center">
              <div className="inline-flex flex-col items-center gap-4">
                <div className="w-20 h-20 rounded-full bg-stone-50 flex items-center justify-center">
                  <Trophy className="w-8 h-8 text-stone-200" />
                </div>
                <p className="text-stone-400 font-medium">
                  {rankingView === 'qualified' ? '条件を満たすメンバーはいません' : '参加データが見つかりませんでした'}
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-[2.5rem] border border-stone-100 shadow-[0_16px_48px_-8px_rgba(0,0,0,0.03)] overflow-hidden">
              {/* Table Header */}
              <div className="grid grid-cols-12 px-8 py-5 bg-stone-50 border-b border-stone-100 text-[10px] font-black uppercase tracking-widest text-stone-400">
                <div className="col-span-1">#</div>
                <div className="col-span-4">メンバー</div>
                <div className="col-span-2 text-center flex items-center justify-center gap-1">
                  <Building2 className="w-3.5 h-3.5 text-[#4F5BD5]" />
                  学内
                </div>
                <div className="col-span-2 text-center flex items-center justify-center gap-1">
                  <Globe2 className="w-3.5 h-3.5 text-[#D62976]" />
                  学外
                </div>
                <div className="col-span-3 text-right">状態</div>
              </div>

              {/* Table Body */}
              <div className="divide-y divide-stone-50">
                <AnimatePresence>
                  {displayedRanking.map((member, i) => {
                    const isQualified = memberQualifies(member, conditions);
                    const matched = matchedConditions(member);
                    return (
                      <motion.div
                        key={member.id}
                        layout
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.02 }}
                        className={`grid grid-cols-12 px-8 py-5 items-center hover:bg-stone-50/70 transition-colors group ${isQualified ? 'bg-emerald-50/20' : ''}`}
                      >
                        {/* Rank */}
                        <div className="col-span-1">
                          {i === 0 && rankingView === 'all' ? (
                            <Crown className="w-5 h-5 text-amber-400" />
                          ) : (
                            <span className="text-[14px] font-black text-stone-300">{String(i + 1).padStart(2, '0')}</span>
                          )}
                        </div>

                        {/* Member Info */}
                        <div className="col-span-4 flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-[13px] transition-all ${isQualified ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-100 text-stone-400 group-hover:bg-[#4F5BD5]/10 group-hover:text-[#4F5BD5]'}`}>
                            {member.full_name?.charAt(0)}
                          </div>
                          <div>
                            <p className="font-black text-stone-900 text-[14px]">{member.full_name}</p>
                            <p className="text-[11px] font-medium text-stone-400">{member.mssv || '—'}</p>
                          </div>
                        </div>

                        {/* Internal count */}
                        <div className="col-span-2 text-center">
                          <span className={`text-[20px] font-black ${member.internal_count > 0 ? 'text-[#4F5BD5]' : 'text-stone-200'}`}>
                            {member.internal_count}
                          </span>
                        </div>

                        {/* External count */}
                        <div className="col-span-2 text-center">
                          <span className={`text-[20px] font-black ${member.external_count > 0 ? 'text-[#D62976]' : 'text-stone-200'}`}>
                            {member.external_count}
                          </span>
                        </div>

                        {/* Status / badges */}
                        <div className="col-span-3 flex items-center justify-end gap-2 flex-wrap">
                          {isQualified ? (
                            <div className="flex flex-col items-end gap-1.5">
                              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-100 rounded-xl text-emerald-700 text-[11px] font-black">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                対象者
                              </div>
                              <div className="flex gap-1">
                                {matched.map((c, _ci) => (
                                  <span key={c.id} className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-black">
                                    {c.minInternal > 0 ? `内${c.minInternal}` : ''}{c.minInternal > 0 && c.minExternal > 0 ? '+' : ''}{c.minExternal > 0 ? `外${c.minExternal}` : ''}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <span className="text-stone-300 text-[12px] font-medium">—</span>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>

              {/* Footer summary */}
              <div className="px-8 py-4 bg-stone-50 border-t border-stone-100 text-[12px] text-stone-400 font-medium flex items-center justify-between">
                <span>{displayedRanking.length}名を表示</span>
                {rankingView === 'all' && (
                  <span className="text-emerald-600 font-black">{qualifiedMembers.length}名が表彰対象</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════ AWARD MODAL ══════════════════════════ */}
      <AnimatePresence>
        {isAddingAward && (
          <div className="fixed inset-0 z-[100] flex items-center justify-end">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsAddingAward(false)}
              className="absolute inset-0 bg-stone-900/60 backdrop-blur-xl" />
            <motion.div
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 200 }}
              className="relative w-full max-w-2xl h-full bg-white shadow-[-40px_0_100px_rgba(0,0,0,0.15)] overflow-y-auto"
            >
              <div className="p-12 md:p-16 space-y-10">
                <button onClick={() => setIsAddingAward(false)}
                  className="absolute top-8 right-8 w-14 h-14 bg-stone-50 hover:bg-stone-100 rounded-full flex items-center justify-center transition-all group active:scale-90">
                  <X className="w-5 h-5 text-stone-900 group-hover:rotate-90 transition-transform duration-300" />
                </button>

                <div className="space-y-3">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 text-[10px] font-black uppercase tracking-widest">
                    Grant Recognition
                  </div>
                  <h2 className="text-3xl font-black text-stone-900 tracking-tighter">新規表彰データの登録</h2>
                </div>

                <form onSubmit={handleSubmit} className="space-y-8">
                  {/* Member selector */}
                  <div className="space-y-4">
                    <label className="text-[12px] font-black uppercase tracking-[0.2em] text-[#4F5BD5] flex items-center gap-3">
                      <span className="w-6 h-6 rounded-lg bg-indigo-100 flex items-center justify-center text-[11px]">1</span>
                      対象メンバーを選択
                    </label>
                    {selectedMember ? (
                      <div className="flex items-center justify-between p-5 rounded-2xl bg-stone-50 border-2 border-[#4F5BD5]">
                        <div className="flex items-center gap-4">
                          <div className="w-11 h-11 rounded-full bg-[#4F5BD5] text-white flex items-center justify-center font-black">{selectedMember.full_name?.charAt(0)}</div>
                          <div>
                            <p className="font-black text-stone-900">{selectedMember.full_name}</p>
                            <p className="text-[12px] text-stone-400">{selectedMember.mssv || '—'}</p>
                          </div>
                        </div>
                        <button type="button" onClick={() => setSelectedMember(null)} className="p-2 text-stone-400 hover:text-rose-500"><X className="w-5 h-5" /></button>
                      </div>
                    ) : (
                      <div className="relative">
                        <div className="absolute left-5 top-1/2 -translate-y-1/2">
                          {isSearching ? <Loader2 className="w-5 h-5 text-[#4F5BD5] animate-spin" /> : <Search className="w-5 h-5 text-stone-300" />}
                        </div>
                        <input type="text" value={searchQuery} onChange={e => handleSearch(e.target.value)}
                          placeholder="名前や学籍番号で検索..."
                          className="w-full h-14 pl-14 pr-5 bg-stone-50 border-2 border-transparent focus:border-[#4F5BD5] focus:bg-white rounded-2xl text-[14px] font-medium outline-none transition-all" />
                        <AnimatePresence>
                          {searchResults.length > 0 && (
                            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                              className="absolute top-full left-0 right-0 mt-3 bg-white border border-stone-100 rounded-2xl shadow-2xl overflow-hidden z-20">
                              {searchResults.map(m => (
                                <button key={m.id} type="button"
                                  onClick={() => { setSelectedMember(m); setSearchResults([]); setSearchQuery(''); }}
                                  className="w-full flex items-center gap-4 p-4 hover:bg-indigo-50 transition-colors text-left border-b border-stone-50 last:border-0">
                                  <div className="w-9 h-9 rounded-full bg-stone-100 flex items-center justify-center text-stone-500 font-bold text-[13px]">{m.full_name?.charAt(0)}</div>
                                  <div>
                                    <p className="font-bold text-stone-900 text-[14px]">{m.full_name}</p>
                                    <p className="text-[11px] text-stone-400">{m.mssv}</p>
                                  </div>
                                  <ChevronRight className="w-4 h-4 ml-auto text-stone-300" />
                                </button>
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}
                  </div>

                  {/* Award details */}
                  <div className="space-y-6">
                    <label className="text-[12px] font-black uppercase tracking-[0.2em] text-[#4F5BD5] flex items-center gap-3">
                      <span className="w-6 h-6 rounded-lg bg-indigo-100 flex items-center justify-center text-[11px]">2</span>
                      表彰の詳細を入力
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-stone-400 tracking-widest uppercase">タイトル (日本語)</label>
                        <input required type="text" value={formData.title_ja} onChange={e => setFormData({ ...formData, title_ja: e.target.value })}
                          className="w-full h-14 px-5 bg-stone-50 border-2 border-transparent focus:border-[#4F5BD5] focus:bg-white rounded-xl text-[14px] font-bold outline-none transition-all" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-stone-400 tracking-widest uppercase">Title (Vietnamese)</label>
                        <input type="text" value={formData.title_vi} onChange={e => setFormData({ ...formData, title_vi: e.target.value })}
                          className="w-full h-14 px-5 bg-stone-50 border-2 border-transparent focus:border-[#4F5BD5] focus:bg-white rounded-xl text-[14px] font-bold outline-none transition-all" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-stone-400 tracking-widest uppercase">説明 (日本語)</label>
                      <textarea required rows={4} value={formData.description_ja} onChange={e => setFormData({ ...formData, description_ja: e.target.value })}
                        className="w-full p-5 bg-stone-50 border-2 border-transparent focus:border-[#4F5BD5] focus:bg-white rounded-xl text-[14px] font-medium outline-none transition-all resize-none" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-stone-400 tracking-widest uppercase">カテゴリー</label>
                        <select value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })}
                          className="w-full h-14 px-5 bg-stone-50 border-2 border-transparent focus:border-[#4F5BD5] focus:bg-white rounded-xl text-[14px] font-black outline-none transition-all">
                          <option value="excellent">優秀賞</option>
                          <option value="leadership">リーダーシップ</option>
                          <option value="qualification">資格・認定</option>
                          <option value="general">一般</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-stone-400 tracking-widest uppercase">授与日</label>
                        <input required type="date" value={formData.awarded_at} onChange={e => setFormData({ ...formData, awarded_at: e.target.value })}
                          className="w-full h-14 px-5 bg-stone-50 border-2 border-transparent focus:border-[#4F5BD5] focus:bg-white rounded-xl text-[14px] font-medium outline-none transition-all" />
                      </div>
                    </div>
                  </div>

                  <div className="pt-6 flex flex-col gap-3">
                    <button type="submit" disabled={isLoading || !selectedMember}
                      className="w-full h-16 bg-gradient-to-r from-[#4F5BD5] to-[#D62976] text-white rounded-2xl font-black text-[14px] uppercase tracking-widest shadow-xl hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                      {isLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : '表彰を授与する'}
                    </button>
                    <button type="button" onClick={() => setIsAddingAward(false)} className="w-full h-12 text-[12px] font-black uppercase tracking-widest text-stone-400 hover:text-stone-600 transition-colors">キャンセル</button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
