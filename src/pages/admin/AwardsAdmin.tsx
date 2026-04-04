import { useState, useEffect } from 'react';
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
  Filter
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

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
  user: {
    full_name: string;
    full_name_kana: string;
  };
}

interface RankingMember {
  id: string;
  full_name: string;
  mssv: string | null;
  internal_count: number;
  external_count: number;
  total_count: number;
}

export default function AwardsAdmin() {
  const { selectedYear } = useAppStore();

  const [activeTab, setActiveTab] = useState<'history' | 'ranking'>('history');
  const [awards, setAwards] = useState<AwardRecord[]>([]);
  const [rankingData, setRankingData] = useState<RankingMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddingAward, setIsAddingAward] = useState(false);

  // Criteria state
  const [criteria, setCriteria] = useState({
    internal: 5,
    external: 3
  });

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Member[]>([]);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // Form state
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
      if (activeTab === 'history') {
        fetchAwards();
      } else {
        fetchRanking();
      }
    }
  }, [selectedYear?.id, activeTab]);

  const fetchAwards = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('awards')
        .select(`
          *,
          user:users(full_name, full_name_kana)
        `)
        .eq('academic_year_id', selectedYear?.id)
        .is('deleted_at', null)
        .order('awarded_at', { ascending: false });

      if (error) throw error;
      setAwards(data as unknown as AwardRecord[]);
    } catch (error) {
      console.error('Error fetching awards:', error);
      toast.error('表彰データの取得に失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchRanking = async () => {
    try {
      setIsLoading(true);

      // Get all members for the academic year
      const { data: members, error: mError } = await supabase
        .from('club_memberships')
        .select(`
          user:users(id, full_name, mssv)
        `)
        .eq('academic_year_id', selectedYear?.id)
        .is('deleted_at', null);

      if (mError) throw mError;

      // Get all present registrations for the academic year
      const { data: regs, error: rError } = await supabase
        .from('registrations')
        .select(`
          user_id,
          activity:activities(location_type, academic_year_id)
        `)
        .eq('attendance_status', 'present');

      if (rError) throw rError;

      // Filter registrations for current year and process data
      const yearRegs = regs.filter(r => (r.activity as any)?.academic_year_id === selectedYear?.id);

      const rankingMap = new Map<string, RankingMember>();

      // Initialize with all members
      members.forEach((m: any) => {
        if (!m.user) return;
        rankingMap.set(m.user.id, {
          id: m.user.id,
          full_name: m.user.full_name,
          mssv: m.user.mssv,
          internal_count: 0,
          external_count: 0,
          total_count: 0
        });
      });

      // Count attendances
      yearRegs.forEach((r: any) => {
        const member = rankingMap.get(r.user_id);
        if (member) {
          const type = r.activity?.location_type || 'internal';
          if (type === 'internal') member.internal_count++;
          else member.external_count++;
          member.total_count++;
        }
      });

      const sortedData = Array.from(rankingMap.values())
        .sort((a, b) => b.total_count - a.total_count);

      setRankingData(sortedData);
    } catch (error) {
      console.error('Error fetching ranking:', error);
      toast.error('ランキングデータの取得に失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    try {
      setIsSearching(true);
      const { data, error } = await supabase
        .from('users')
        .select('id, full_name, full_name_kana, mssv, email')
        .or(`full_name.ilike.%${query}%,full_name_kana.ilike.%${query}%,mssv.ilike.%${query}%`)
        .limit(5);

      if (error) throw error;
      setSearchResults(data || []);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMember || !selectedYear?.id) return;

    try {
      setIsLoading(true);
      const { error } = await supabase
        .from('awards')
        .insert({
          user_id: selectedMember.id,
          academic_year_id: selectedYear?.id,
          ...formData
        });

      if (error) throw error;

      toast.success('表彰を授与しました');
      setIsAddingAward(false);
      setSelectedMember(null);
      setFormData({
        title_ja: '',
        title_vi: '',
        description_ja: '',
        description_vi: '',
        category: 'excellent',
        awarded_at: format(new Date(), 'yyyy-MM-dd')
      });
      fetchAwards();
    } catch (error) {
      console.error('Error adding award:', error);
      toast.error('表彰の授与に失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('この表彰データを削除してもよろしいですか？')) return;

    try {
      const { error } = await supabase
        .from('awards')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
      toast.success('表彰データを削除しました');
      fetchAwards();
    } catch (error) {
      console.error('Error deleting award:', error);
      toast.error('削除に失敗しました');
    }
  };

  return (
    <div className="space-y-12 pb-20">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="flex items-start gap-6">
          {/* Vertical Gradient Bar */}
          <div className="w-1.5 h-16 rounded-full bg-gradient-to-b from-[#D62976] to-[#4F5BD5] mt-1 hidden sm:block" />

          <div className="flex flex-col gap-3">
            <h1 className="text-4xl md:text-4xl font-black text-brand-stone-900 tracking-tighter leading-none">
              表彰
            </h1>
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.4em] leading-none">
              <span className="text-brand-stone-400">Management</span>
              <span className="text-[#D62976]">Console</span>
            </div>
          </div>
        </div>

        <button
          onClick={() => setIsAddingAward(true)}
          className="h-16 px-8 bg-black text-white rounded-[1.5rem] flex items-center gap-3 hover:scale-[1.02] active:scale-95 transition-all shadow-2xl shadow-black/10 text-[14px] font-black uppercase tracking-widest group"
        >
          <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform duration-500" />
          <span>新規表彰を授与</span>
        </button>
      </div>

      {/* View Toggle Tabs */}
      <div className="flex items-center gap-2 p-1.5 bg-brand-stone-50 rounded-2xl w-fit">
        <button
          onClick={() => setActiveTab('history')}
          className={cn(
            "px-6 py-3 rounded-xl text-[12px] font-black uppercase tracking-widest transition-all flex items-center gap-2",
            activeTab === 'history'
              ? "bg-white text-[#4F5BD5] shadow-lg shadow-black/5"
              : "text-brand-stone-400 hover:text-brand-stone-600"
          )}
        >
          <AwardIcon className="w-4 h-4" />
          <span>表彰履歴</span>
        </button>
        <button
          onClick={() => setActiveTab('ranking')}
          className={cn(
            "px-6 py-3 rounded-xl text-[12px] font-black uppercase tracking-widest transition-all flex items-center gap-2",
            activeTab === 'ranking'
              ? "bg-white text-[#D62976] shadow-lg shadow-black/5"
              : "text-brand-stone-400 hover:text-brand-stone-600"
          )}
        >
          <TrendingUp className="w-4 h-4" />
          <span>活動ランキング</span>
        </button>
      </div>

      {activeTab === 'history' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {isLoading && !isAddingAward ? (
            <div className="col-span-full py-32 flex flex-col items-center justify-center gap-4 text-brand-stone-300">
              <Loader2 className="w-12 h-12 animate-spin" />
              <span className="text-[10px] font-black uppercase tracking-[0.3em]">Loading Recognition Data...</span>
            </div>
          ) : awards.length === 0 ? (
            <div className="col-span-full py-32 border-4 border-dashed border-brand-stone-50 rounded-[3rem] flex flex-col items-center justify-center text-center gap-6 group hover:border-[#4F5BD5]/20 transition-all duration-700">
              <div className="w-24 h-24 rounded-full bg-brand-stone-50 flex items-center justify-center group-hover:scale-110 group-hover:bg-[#4F5BD5]/5 transition-all duration-700">
                <Trophy className="w-10 h-10 text-brand-stone-200 group-hover:text-[#4F5BD5] transition-colors" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-black text-brand-stone-900">まだ表彰データがありません</h3>
                <p className="text-brand-stone-400 font-medium max-w-xs">最初の表彰を授与して、メンバーのモチベーションを高めましょう。</p>
              </div>
            </div>
          ) : (
            awards.map((award, index) => (
              <motion.div
                key={award.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className={cn(
                  "group relative overflow-hidden bg-white p-10 rounded-[3rem] border border-brand-stone-100 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.03)] hover:shadow-[0_48px_96px_-32px_rgba(0,0,0,0.06)] hover:border-[#4F5BD5]/20 transition-all duration-700"
                )}
              >
                <div className="absolute top-10 right-10 flex flex-col items-end gap-4">
                  <div className="w-16 h-16 rounded-[1.25rem] bg-[#4F5BD5]/5 flex items-center justify-center group-hover:scale-110 group-hover:rotate-12 transition-all duration-700">
                    {award.category === 'excellent' && <Star className="w-8 h-8 text-[#D62976]" />}
                    {award.category === 'leadership' && <AwardIcon className="w-8 h-8 text-[#4F5BD5]" />}
                    {award.category === 'qualification' && <Medal className="w-8 h-8 text-amber-500" />}
                    {award.category === 'general' && <Sparkles className="w-8 h-8 text-indigo-400" />}
                  </div>
                  <button
                    onClick={() => handleDelete(award.id)}
                    className="p-3 text-rose-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 duration-500"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-8 pr-16">
                  <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-brand-stone-400">
                    <Calendar className="w-4 h-4" />
                    <span>{format(new Date(award.awarded_at), 'yyyy.MM.dd')}</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-stone-200" />
                    <span className="text-[#4F5BD5]">Achievement Record</span>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-3xl font-black text-brand-stone-900 leading-tight group-hover:text-[#4F5BD5] transition-colors duration-500">
                      {award.title_ja}
                    </h3>
                    <p className="text-[14px] font-medium text-brand-stone-500 leading-relaxed italic border-l-2 border-[#D62976]/20 pl-4">
                      {award.title_vi}
                    </p>
                    <p className="text-[15px] font-medium text-brand-stone-600 leading-relaxed max-w-lg mt-6">
                      {award.description_ja}
                    </p>
                  </div>

                  <div className="pt-8 flex items-center gap-4 border-t border-brand-stone-50">
                    <div className="w-12 h-12 rounded-full bg-brand-stone-50 border border-brand-stone-100 flex items-center justify-center overflow-hidden">
                      <span className="text-xs font-black text-[#4F5BD5]">
                        {award.user.full_name?.charAt(0)}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[11px] font-black text-brand-stone-400 uppercase tracking-widest mb-0.5">授与対象者</span>
                      <span className="block text-[16px] font-black text-brand-stone-900 group-hover:translate-x-1 transition-transform duration-500">
                        {award.user.full_name}
                      </span>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </div>
      ) : (
        <div className="space-y-12">
          {/* Criteria Thresholds Section */}
          <div className="bg-white p-8 md:p-12 rounded-[3.5rem] border border-brand-stone-100 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.02)]">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
              <div className="space-y-2">
                <div className="flex items-center gap-3 text-[#4F5BD5]">
                  <Filter className="w-5 h-5" />
                  <span className="text-[11px] font-black uppercase tracking-[0.2em]">Recognition Criteria</span>
                </div>
                <h2 className="text-2xl md:text-4xl font-black text-brand-stone-900 tracking-tighter">表彰対象の選定基準</h2>
                <p className="text-brand-stone-500 font-medium text-[15px]">参加回数に基づいて候補者を自動的に識別します。</p>
              </div>

              <div className="flex flex-wrap items-center gap-6">
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-brand-stone-400 uppercase tracking-widest">学内活動 (目標)</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={criteria.internal}
                      onChange={(e) => setCriteria({ ...criteria, internal: parseInt(e.target.value) || 0 })}
                      className="w-24 h-14 pl-10 bg-brand-stone-50 rounded-2xl text-[15px] font-black border-2 border-transparent focus:border-[#4F5BD5] outline-none transition-all"
                    />
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-[#4F5BD5]" />
                  </div>
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-brand-stone-400 uppercase tracking-widest">学外活動 (目標)</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={criteria.external}
                      onChange={(e) => setCriteria({ ...criteria, external: parseInt(e.target.value) || 0 })}
                      className="w-24 h-14 pl-10 bg-brand-stone-50 rounded-2xl text-[15px] font-black border-2 border-transparent focus:border-[#D62976] outline-none transition-all"
                    />
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-[#D62976]" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Ranking Board */}
          <div className="space-y-8">
            <h3 className="text-xl font-black text-brand-stone-900 uppercase tracking-widest flex items-center gap-3">
              <BarChart3 className="w-6 h-6 text-[#4F5BD5]" />
              活動参加ランキング
            </h3>

            {isLoading ? (
              <div className="py-20 flex flex-col items-center justify-center gap-4 text-brand-stone-300">
                <Loader2 className="w-12 h-12 animate-spin" />
                <span className="text-[10px] font-black uppercase tracking-[0.3em]">Calculating Ranking...</span>
              </div>
            ) : rankingData.length === 0 ? (
              <div className="py-20 text-center text-brand-stone-400 font-medium">参加データが見つかりませんでした</div>
            ) : (
              <div className="space-y-6">
                {/* Podium for Top 3 */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end mb-12">
                  {[1, 0, 2].map((idx) => {
                    const member = rankingData[idx];
                    if (!member) return null;
                    const isGold = idx === 0;
                    const isSilver = idx === 1;

                    return (
                      <motion.div
                        key={member.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.1 }}
                        className={cn(
                          "relative p-8 rounded-[2.5rem] border text-center flex flex-col items-center gap-4 group hover:scale-[1.02] transition-all duration-500",
                          isGold ? "bg-brand-stone-900 text-white border-brand-stone-800 order-2 md:h-80 shadow-2xl shadow-black/20" :
                            isSilver ? "bg-white text-brand-stone-900 border-brand-stone-100 order-1 md:h-72" :
                              "bg-white text-brand-stone-900 border-brand-stone-100 order-3 md:h-64"
                        )}
                      >
                        <div className={cn(
                          "w-16 h-16 rounded-2xl flex items-center justify-center mb-2",
                          isGold ? "bg-amber-400/20 text-amber-400" :
                            isSilver ? "bg-brand-stone-100 text-brand-stone-400" :
                              "bg-orange-400/20 text-orange-400"
                        )}>
                          <Crown className={cn("w-8 h-8", isGold && "animate-bounce")} />
                        </div>
                        <div className="space-y-1">
                          <p className="text-[11px] font-black uppercase tracking-widest opacity-60">Rank {idx + 1}</p>
                          <h4 className="text-xl font-black tracking-tight">{member.full_name}</h4>
                          <p className={cn("text-xs font-medium", isGold ? "text-brand-stone-400" : "text-brand-stone-400")}>{member.mssv}</p>
                        </div>
                        <div className="mt-auto">
                          <p className={cn("text-4xl font-black", isGold ? "text-amber-400" : "text-[#4F5BD5]")}>{member.total_count}</p>
                          <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-50">Points / Activity</p>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>

                {/* Table for the rest */}
                <div className="bg-white rounded-[2.5rem] border border-brand-stone-100 overflow-hidden">
                  <div className="grid grid-cols-12 px-10 py-6 bg-brand-stone-50 border-b border-brand-stone-100">
                    <div className="col-span-1 text-[10px] font-black uppercase tracking-widest text-brand-stone-400">#</div>
                    <div className="col-span-5 text-[10px] font-black uppercase tracking-widest text-brand-stone-400">Member</div>
                    <div className="col-span-2 text-[10px] font-black uppercase tracking-widest text-brand-stone-400 text-center">Internal</div>
                    <div className="col-span-2 text-[10px] font-black uppercase tracking-widest text-brand-stone-400 text-center">External</div>
                    <div className="col-span-2 text-[10px] font-black uppercase tracking-widest text-brand-stone-400 text-right">Total</div>
                  </div>
                  <div className="divide-y divide-brand-stone-50">
                    {rankingData.map((member, i) => (
                      <div key={member.id} className="grid grid-cols-12 px-10 py-6 items-center hover:bg-brand-stone-50/50 transition-colors group">
                        <div className="col-span-1 text-[15px] font-black text-brand-stone-300">
                          {String(i + 1).padStart(2, '0')}
                        </div>
                        <div className="col-span-5 flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-brand-stone-50 flex items-center justify-center font-black text-brand-stone-400 group-hover:bg-[#4F5BD5] group-hover:text-white transition-all">
                            {member.full_name?.charAt(0)}
                          </div>
                          <div>
                            <p className="font-black text-brand-stone-900">{member.full_name}</p>
                            <p className="text-[11px] font-medium text-brand-stone-400">{member.mssv}</p>
                          </div>
                        </div>
                        <div className={cn(
                          "col-span-2 text-center text-[15px] font-bold",
                          member.internal_count >= criteria.internal ? "text-[#4F5BD5]" : "text-brand-stone-400"
                        )}>
                          {member.internal_count}
                        </div>
                        <div className={cn(
                          "col-span-2 text-center text-[15px] font-bold",
                          member.external_count >= criteria.external ? "text-[#D62976]" : "text-brand-stone-400"
                        )}>
                          {member.external_count}
                        </div>
                        <div className="col-span-2 text-right">
                          <div className={cn(
                            "inline-flex items-center gap-2 px-4 py-2 rounded-full font-black text-[14px]",
                            (member.internal_count >= criteria.internal && member.external_count >= criteria.external)
                              ? "bg-emerald-50 text-emerald-600 border border-emerald-100"
                              : "bg-brand-stone-50 text-brand-stone-900"
                          )}>
                            {member.total_count}
                            {(member.internal_count >= criteria.internal && member.external_count >= criteria.external) && (
                              <AwardIcon className="w-4 h-4" />
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Slide-over Award Modal */}
      <AnimatePresence>
        {isAddingAward && (
          <div className="fixed inset-0 z-[100] flex items-center justify-end">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddingAward(false)}
              className="absolute inset-0 bg-brand-stone-900/60 backdrop-blur-xl"
            />

            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: "spring", damping: 30, stiffness: 200 }}
              className="relative w-full max-w-2xl h-full bg-white shadow-[-40px_0_100px_rgba(0,0,0,0.15)] overflow-y-auto"
            >
              <div className="p-12 md:p-20 space-y-12">
                <button
                  onClick={() => setIsAddingAward(false)}
                  className="absolute top-10 right-10 w-16 h-16 bg-brand-stone-50 hover:bg-brand-stone-100 rounded-full flex items-center justify-center transition-all group active:scale-90"
                >
                  <X className="w-6 h-6 text-brand-stone-900 group-hover:rotate-90 transition-transform duration-500" />
                </button>

                <div className="space-y-4">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 text-[10px] font-black uppercase tracking-widest">
                    Grant New Recognition
                  </div>
                  <h2 className="text-4xl font-black text-brand-stone-900 tracking-tighter">新規表彰データの登録</h2>
                </div>

                <form onSubmit={handleSubmit} className="space-y-10">
                  <div className="space-y-6">
                    <label className="text-[12px] font-black uppercase tracking-[0.2em] text-[#4F5BD5] flex items-center gap-3">
                      <span className="w-6 h-6 rounded-lg bg-indigo-100 flex items-center justify-center">1</span>
                      対象メンバーを選択
                    </label>

                    {selectedMember ? (
                      <div className="flex items-center justify-between p-6 rounded-[2rem] bg-brand-stone-50 border-2 border-[#4F5BD5] transition-all">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-full bg-[#4F5BD5] text-white flex items-center justify-center font-black">
                            {selectedMember.full_name?.charAt(0)}
                          </div>
                          <div>
                            <p className="font-black text-brand-stone-900">{selectedMember.full_name}</p>
                            <p className="text-[12px] font-medium text-brand-stone-400">{selectedMember.mssv || 'No Student ID'}</p>
                          </div>
                        </div>
                        <button type="button" onClick={() => setSelectedMember(null)} className="p-2 text-brand-stone-400 hover:text-rose-500"><X className="w-5 h-5" /></button>
                      </div>
                    ) : (
                      <div className="relative group">
                        <div className="absolute left-6 top-1/2 -translate-y-1/2 flex items-center gap-2">
                          {isSearching ? <Loader2 className="w-5 h-5 text-[#4F5BD5] animate-spin" /> : <Search className="w-5 h-5 text-brand-stone-300 group-focus-within:text-[#4F5BD5] transition-colors" />}
                        </div>
                        <input
                          type="text" value={searchQuery} onChange={(e) => handleSearch(e.target.value)}
                          placeholder="名前や学籍番号で search..."
                          className="w-full h-16 pl-16 pr-6 bg-brand-stone-50 border-2 border-transparent focus:border-[#4F5BD5] focus:bg-white rounded-[1.5rem] text-[15px] font-medium outline-none transition-all"
                        />
                        <AnimatePresence>
                          {searchResults.length > 0 && (
                            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
                              className="absolute top-full left-0 right-0 mt-4 bg-white border border-brand-stone-100 rounded-[2rem] shadow-2xl overflow-hidden z-20">
                              {searchResults.map((member) => (
                                <button key={member.id} type="button"
                                  onClick={() => { setSelectedMember(member); setSearchResults([]); setSearchQuery(''); }}
                                  className="w-full flex items-center gap-4 p-5 hover:bg-indigo-50 transition-colors text-left border-b border-brand-stone-50 last:border-0">
                                  <div className="w-10 h-10 rounded-full bg-brand-stone-100 flex items-center justify-center text-brand-stone-500 font-bold">{member.full_name?.charAt(0)}</div>
                                  <div><p className="font-bold text-brand-stone-900">{member.full_name}</p><p className="text-[12px] text-brand-stone-400">{member.mssv}</p></div>
                                  <ChevronRight className="w-4 h-4 ml-auto text-brand-stone-300" />
                                </button>
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}
                  </div>

                  <div className="space-y-8">
                    <label className="text-[12px] font-black uppercase tracking-[0.2em] text-[#4F5BD5] flex items-center gap-3">
                      <span className="w-6 h-6 rounded-lg bg-indigo-100 flex items-center justify-center">2</span>
                      表彰の詳細を入力
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-4">
                        <label className="text-[10px] font-black text-brand-stone-400 tracking-[0.1em] uppercase">タイトル (日本語)</label>
                        <input required type="text" value={formData.title_ja} onChange={(e) => setFormData({ ...formData, title_ja: e.target.value })}
                          className="w-full h-16 px-6 bg-brand-stone-50 border-2 border-transparent focus:border-[#4F5BD5] focus:bg-white rounded-[1.25rem] text-[15px] font-bold outline-none transition-all" />
                      </div>
                      <div className="space-y-4">
                        <label className="text-[10px] font-black text-brand-stone-400 tracking-[0.1em] uppercase">Title (Vietnamese)</label>
                        <input type="text" value={formData.title_vi} onChange={(e) => setFormData({ ...formData, title_vi: e.target.value })}
                          className="w-full h-16 px-6 bg-brand-stone-50 border-2 border-transparent focus:border-[#4F5BD5] focus:bg-white rounded-[1.25rem] text-[15px] font-bold outline-none transition-all" />
                      </div>
                    </div>
                    <div className="space-y-4">
                      <label className="text-[10px] font-black text-brand-stone-400 tracking-[0.1em] uppercase">説明 (日本語)</label>
                      <textarea required rows={4} value={formData.description_ja} onChange={(e) => setFormData({ ...formData, description_ja: e.target.value })}
                        className="w-full p-6 bg-brand-stone-50 border-2 border-transparent focus:border-[#4F5BD5] focus:bg-white rounded-[1.5rem] text-[15px] font-medium outline-none transition-all resize-none" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-4">
                        <label className="text-[10px] font-black text-brand-stone-400 tracking-[0.1em] uppercase">カテゴリー</label>
                        <select value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                          className="w-full h-16 px-6 bg-brand-stone-50 border-2 border-transparent focus:border-[#4F5BD5] focus:bg-white rounded-[1.25rem] text-[15px] font-black outline-none transition-all">
                          <option value="excellent">優秀賞 (Excellent)</option>
                          <option value="leadership">リーダーシップ (Leadership)</option>
                          <option value="qualification">資格・認定 (Qualification)</option>
                          <option value="general">一般 (General)</option>
                        </select>
                      </div>
                      <div className="space-y-4">
                        <label className="text-[10px] font-black text-brand-stone-400 tracking-[0.1em] uppercase">授与日</label>
                        <input required type="date" value={formData.awarded_at} onChange={(e) => setFormData({ ...formData, awarded_at: e.target.value })}
                          className="w-full h-16 px-6 bg-brand-stone-50 border-2 border-transparent focus:border-[#4F5BD5] focus:bg-white rounded-[1.25rem] text-[15px] font-medium outline-none transition-all" />
                      </div>
                    </div>
                  </div>

                  <div className="pt-10 flex flex-col gap-4">
                    <button type="submit" disabled={isLoading || !selectedMember}
                      className="w-full h-20 bg-gradient-to-r from-[#4F5BD5] to-[#D62976] text-white rounded-[2rem] font-black text-[15px] uppercase tracking-[0.3em] shadow-2xl hover:scale-[1.02] active:scale-95 transition-all">
                      {isLoading ? <Loader2 className="w-6 h-6 animate-spin mx-auto" /> : "表彰を授与する"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsAddingAward(false)}
                      className="w-full h-16 text-[12px] font-black uppercase tracking-widest text-brand-stone-400 hover:text-brand-stone-600 transition-colors"
                    >
                      キャンセル
                    </button>
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
