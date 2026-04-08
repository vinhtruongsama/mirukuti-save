import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ChevronLeft, RotateCcw, Search, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store/useAppStore';
import { useState, useMemo } from 'react';

export default function ArchivedMembers() {
  const queryClient = useQueryClient();
  const { selectedYear } = useAppStore();
  const [searchTerm, setSearchTerm] = useState('');

  const { data: archivedMembers = [], isLoading } = useQuery({
    queryKey: ['archived-members', selectedYear?.id],
    queryFn: async () => {
      if (!selectedYear) return [];
      const { data, error } = await supabase
        .from('club_memberships')
        .select(`
          *,
          users!inner(*)
        `)
        .eq('academic_year_id', selectedYear.id)
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedYear
  });

  const filteredMembers = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    if (!q) return archivedMembers;
    return archivedMembers.filter(m =>
      m.users?.full_name?.toLowerCase().includes(q) ||
      m.users?.mssv?.toLowerCase().includes(q)
    );
  }, [archivedMembers, searchTerm]);

  const restoreMutation = useMutation({
    mutationFn: async ({ userUuid, yearId }: { userUuid: string; yearId: string }) => {
      const { error } = await supabase.rpc('restore_member', { 
        user_uuid: userUuid,
        year_uuid: yearId,
        p_role: 'member'
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('メンバーを復元しました');
      queryClient.invalidateQueries({ queryKey: ['admin-members'] });
      queryClient.invalidateQueries({ queryKey: ['archived-members'] });
    },
    onError: (err: any) => toast.error(`Error: ${err.message}`)
  });

  const hardDeleteMutation = useMutation({
    mutationFn: async (userUuid: string) => {
      if (!window.confirm('このメンバーを完全に削除してもよろしいですか？\n\n・ログインアクセスも完全に削除されます\n・この操作は取り消せません')) {
        throw new Error('キャンセルされました');
      }

      // Step 1: Delete auth account (removes login access permanently)
      const { error: authError } = await supabase.rpc('admin_delete_auth_user', {
        p_user_uuid: userUuid
      });
      if (authError) console.warn('Auth delete warning:', authError.message);

      // Step 2: Delete from club_memberships
      const { error: memError } = await supabase.from('club_memberships').delete().eq('user_id', userUuid);
      if (memError) throw memError;

      // Step 3: Delete from public.users
      const { error: userError } = await supabase.from('users').delete().eq('id', userUuid);
      if (userError) throw userError;
    },
    onSuccess: () => {
      toast.success('メンバーを完全に削除しました（ログインアカウントも削除済み）');
      queryClient.invalidateQueries({ queryKey: ['archived-members'] });
    },
    onError: (err: any) => {
      if (err.message !== 'キャンセルされました') {
        toast.error(`Error: ${err.message}`);
      }
    }
  });

  return (
    <div className="min-h-full space-y-12 pb-20">
      {/* Editorial Header */}
      <header className="flex items-center justify-between">
        <div className="space-y-4">
          <Link
            to="/admin/members"
            className="flex items-center gap-2 text-stone-400 hover:text-stone-900 transition-colors group text-sm font-black uppercase tracking-widest"
          >
            <ChevronLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> メンバー名簿へ戻る
          </Link>
          <h1 className="text-[38px] font-black text-stone-900 font-mincho leading-tight">
            削除された部員
          </h1>
        </div>
      </header>

      {/* Modern Filter */}
      <div className="relative max-w-md group">
        <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-300 group-focus-within:text-stone-900 transition-colors" />
        <input
          type="text"
          placeholder="アーカイブ内を検索..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-14 pr-6 py-4 bg-stone-100 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-stone-200 transition-all placeholder:text-stone-300"
        />
      </div>

      {/* Archived Table - Editorial Style */}
      <div className="bg-white border border-stone-100 rounded-[2.5rem] overflow-hidden shadow-2xl shadow-stone-200/20">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-stone-50/50">
              <th className="px-10 py-6 text-[16px] font-black text-stone-900 uppercase tracking-[0.2em] border-b border-stone-100">氏名 / 識別情報</th>
              <th className="px-10 py-6 text-[16px] font-black text-stone-900 uppercase tracking-[0.2em] border-b border-stone-100">削除日</th>
              <th className="px-10 py-6 text-right text-[16px] font-black text-stone-900 uppercase tracking-[0.2em] border-b border-stone-100">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-50">
            {isLoading ? (
              [...Array(3)].map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td colSpan={3} className="px-10 py-12"><div className="h-4 bg-stone-100 rounded-full w-48" /></td>
                </tr>
              ))
            ) : filteredMembers.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-10 py-32 text-center">
                  <Trash2 className="w-12 h-12 text-stone-100 mx-auto mb-4" />
                  <p className="text-stone-300 font-serif italic">記録はありません</p>
                </td>
              </tr>
            ) : (
              filteredMembers.map((mem) => (
                <motion.tr
                  key={mem.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="hover:bg-stone-50/40 transition-colors group"
                >
                  <td className="px-10 py-8">
                    <div className="flex flex-col">
                      <span className="text-[15px] font-black text-stone-900 font-mincho">{mem.users?.full_name}</span>
                      <span className="text-[12px] font-bold text-stone-400 tracking-tight">{mem.users?.mssv} • {mem.users?.email}</span>
                    </div>
                  </td>
                  <td className="px-10 py-8">
                    <span className="text-[13px] font-medium text-stone-500 font-serif">
                      {new Date(mem.deleted_at).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })}
                    </span>
                  </td>
                  <td className="px-10 py-8 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button
                        onClick={() => restoreMutation.mutate({ userUuid: mem.user_id, yearId: selectedYear?.id || '' })}
                        className="inline-flex items-center gap-2 px-6 py-2.5 bg-stone-900 text-white rounded-xl text-[12px] font-black uppercase tracking-widest hover:bg-[#4F5BD5] transition-all active:scale-95 shadow-lg shadow-stone-200"
                        title="リストに復元する"
                      >
                        <RotateCcw className="w-3 h-3" /> 復元
                      </button>
                      <button
                        onClick={() => hardDeleteMutation.mutate(mem.user_id)}
                        className="inline-flex items-center gap-2 px-4 py-2.5 bg-rose-50 text-rose-500 rounded-xl text-[12px] font-black uppercase tracking-widest hover:bg-rose-500 hover:text-white transition-all active:scale-95 shadow-sm"
                        title="完全に削除する"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </motion.tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
