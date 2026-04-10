import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { MessageCircle, Trash2, Loader2, CheckCircle2, Clock, User } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';

export default function InquiriesAdmin() {
  const queryClient = useQueryClient();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: inquiries, isLoading } = useQuery({
    queryKey: ['admin-inquiries'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inquiries')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 30000,
  });

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('inquiries')
        .update({ is_read: true })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-inquiries'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('inquiries')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('問い合わせを削除しました');
      queryClient.invalidateQueries({ queryKey: ['admin-inquiries'] });
      setDeletingId(null);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const unreadCount = inquiries?.filter((i) => !i.is_read).length || 0;

  return (
    <div className="space-y-10 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4">
        <div className="relative">
          <div className="absolute -left-5 top-0 w-1.5 h-full bg-gradient-to-b from-[#4F5BD5] to-[#D62976] rounded-full" />
          <h1 className="text-4xl font-black text-stone-900 tracking-tighter">問い合わせ管理</h1>
          <p className="text-stone-400 font-medium mt-1 text-sm">メンバーからのご質問・ご要望一覧</p>
        </div>

        {unreadCount > 0 && (
          <div className="flex items-center gap-2 px-5 py-3 bg-[#4F5BD5]/10 rounded-2xl border border-[#4F5BD5]/20">
            <div className="w-2 h-2 bg-[#4F5BD5] rounded-full animate-pulse" />
            <span className="text-[13px] font-black text-[#4F5BD5] uppercase tracking-widest">
              未読 {unreadCount}件
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-white border border-stone-100 rounded-[2.5rem] p-8 md:p-12 shadow-xl shadow-stone-200/10"
      >
        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-10 h-10 text-[#4F5BD5] animate-spin opacity-20" />
          </div>
        ) : !inquiries || inquiries.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-20 opacity-30">
            <MessageCircle className="w-12 h-12 text-stone-300" />
            <p className="text-sm font-black text-stone-400 uppercase tracking-widest">問い合わせはまだありません</p>
          </div>
        ) : (
          <div className="space-y-4">
            {inquiries.map((inquiry: any) => (
              <motion.div
                key={inquiry.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => {
                  if (!inquiry.is_read) markReadMutation.mutate(inquiry.id);
                }}
                className={`relative group p-6 rounded-[2rem] border-2 transition-all duration-300 cursor-pointer ${
                  inquiry.is_read
                    ? 'border-stone-100 bg-stone-50/50 hover:bg-white hover:border-stone-200'
                    : 'border-[#4F5BD5]/20 bg-[#4F5BD5]/5 hover:bg-white hover:border-[#4F5BD5]/30'
                }`}
              >
                {/* Unread badge */}
                {!inquiry.is_read && (
                  <div className="absolute top-5 right-5 w-2.5 h-2.5 bg-[#4F5BD5] rounded-full animate-pulse" />
                )}

                <div className="flex items-start gap-4">
                  {/* Avatar icon */}
                  <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                    inquiry.is_read ? 'bg-stone-100' : 'bg-[#4F5BD5]/15'
                  }`}>
                    <User className={`w-5 h-5 ${inquiry.is_read ? 'text-stone-400' : 'text-[#4F5BD5]'}`} />
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Name + time */}
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <span className="font-black text-[15px] text-stone-900 truncate">
                        {inquiry.full_name}
                      </span>
                      {inquiry.is_read ? (
                        <span className="flex items-center gap-1 text-[10px] font-black text-stone-300 uppercase tracking-widest">
                          <CheckCircle2 className="w-3 h-3" /> 既読
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] font-black text-[#4F5BD5] uppercase tracking-widest">
                          <Clock className="w-3 h-3" /> 未読
                        </span>
                      )}
                    </div>

                    {/* Message */}
                    <p className="text-[14px] text-stone-600 font-medium leading-relaxed whitespace-pre-wrap">
                      {inquiry.message}
                    </p>

                    {/* Timestamp */}
                    <p className="mt-3 text-[11px] font-bold text-stone-300 uppercase tracking-widest">
                      {format(new Date(inquiry.created_at), 'yyyy年M月d日 HH:mm', { locale: ja })}
                    </p>
                  </div>
                </div>

                {/* Delete confirmation */}
                <div className="mt-5 flex justify-end">
                  {deletingId === inquiry.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-black text-rose-600">本当に削除しますか？</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteMutation.mutate(inquiry.id);
                        }}
                        disabled={deleteMutation.isPending}
                        className="px-4 py-2 bg-rose-500 text-white text-[12px] font-black rounded-xl hover:bg-rose-600 transition-all active:scale-95"
                      >
                        {deleteMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : '削除'}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingId(null);
                        }}
                        className="px-4 py-2 bg-stone-100 text-stone-600 text-[12px] font-black rounded-xl hover:bg-stone-200 transition-all"
                      >
                        キャンセル
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeletingId(inquiry.id);
                      }}
                      className="flex items-center gap-1.5 px-4 py-2 bg-rose-50 text-rose-500 text-[12px] font-black rounded-xl opacity-0 group-hover:opacity-100 hover:bg-rose-100 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      削除
                    </button>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
