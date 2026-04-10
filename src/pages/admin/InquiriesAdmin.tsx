import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { MessageCircle, Trash2, Loader2, CheckCircle2, Clock, User, Mail } from 'lucide-react';
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
        .select(`
          *,
          user:users (
            full_name_kana,
            university_email,
            line_nickname
          )
        `)
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

  const handleCopy = (e: React.MouseEvent, text: string, label: string) => {
    e.stopPropagation();
    if (!text) return;
    navigator.clipboard.writeText(text);
    toast.success(`${label}をコピーしました。`, {
      icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" />
    });
  };

  const unreadCount = inquiries?.filter((i) => !i.is_read).length || 0;

  return (
    <div className="space-y-6 sm:space-y-10 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 px-4 sm:px-0">
        <div className="relative">
          <div className="absolute -left-4 sm: -left-5 top-0 w-1.5 h-full bg-gradient-to-b from-[#4F5BD5] to-[#D62976] rounded-full" />
          <h1 className="text-xl sm:text-4xl font-black text-stone-900 tracking-tighter uppercase leading-none">問い合わせ管理</h1>
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
        className="bg-white border border-stone-100 rounded-[1.2rem] sm:rounded-[2.5rem] p-3 sm:p-8 md:p-12 shadow-xl shadow-stone-200/5 sm:shadow-stone-200/10"
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
                className={`relative group p-3.5 sm:p-6 rounded-[1.2rem] sm:rounded-[2rem] border-2 transition-all duration-300 cursor-pointer ${inquiry.is_read
                  ? 'border-stone-100 bg-stone-50/50 hover:bg-white hover:border-stone-200'
                  : 'border-rose-200 bg-rose-50/50 hover:bg-white hover:border-rose-300'
                  }`}
              >
                {/* Unread badge */}
                {!inquiry.is_read && (
                  <div className="absolute top-4 right-4 sm:top-5 sm:right-5 w-2 h-2 sm:w-2.5 sm:h-2.5 bg-rose-500 rounded-full animate-pulse" />
                )}

                <div className="flex items-start gap-2.5 sm:gap-4">
                  {/* Avatar icon */}
                  <div className={`w-8 h-8 sm:w-11 sm:h-11 rounded-lg sm:rounded-2xl flex items-center justify-center shrink-0 bg-stone-50`}>
                    <User className={`w-3.5 h-3.5 sm:w-5 sm:h-5 text-stone-600`} />
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Name + time */}
                    <div className="flex items-center gap-2 sm:gap-3 mb-1.5 sm:mb-2 flex-wrap">
                      <span className={`font-black text-[14px] sm:text-[15px] truncate text-stone-700`}>
                        {inquiry.user?.full_name_kana || inquiry.full_name}
                      </span>
                      {inquiry.is_read ? (
                        <span className="flex items-center gap-1 text-[12px] sm:text-[14px] font-black text-emerald-500 uppercase tracking-widest">
                          <CheckCircle2 className="w-3 h-3" /> 既読
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[12px] sm:text-[14px] font-black text-rose-500 uppercase tracking-widest">
                          <Clock className="w-3 h-3" /> 未読
                        </span>
                      )}
                    </div>

                    {/* Message */}
                    <p className="text-[13px] sm:text-[14px] text-stone-600 font-medium leading-relaxed whitespace-pre-wrap break-words mb-3 sm:mb-4">
                      {inquiry.message}
                    </p>

                    <div className="flex flex-col gap-1.5 sm:gap-2 mb-3 sm:mb-4">
                      {/* Member Info vs Guest Info */}
                      {inquiry.user ? (
                        <>
                          <div
                            onClick={(e) => handleCopy(e, inquiry.user.university_email, '大学メール')}
                            className="flex flex-col xs:flex-row xs:items-center gap-2 px-3 py-2 sm:py-1.5 bg-indigo-50 border border-indigo-100 rounded-xl shadow-sm w-fit hover:bg-indigo-100/50 hover:border-indigo-200 transition-all active:scale-95 group/info cursor-pointer"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <Mail className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                              <span className="text-[12px] font-black text-indigo-700 truncate">{inquiry.user.university_email}</span>
                            </div>
                          </div>
                          {inquiry.user.line_nickname ? (
                            <div
                              onClick={(e) => handleCopy(e, inquiry.user.line_nickname, 'LINE')}
                              className="flex items-center gap-2 px-3 py-1.5 bg-[#06C755]/10 border border-[#06C755]/20 rounded-xl shadow-sm w-fit hover:bg-[#06C755]/20 transition-all active:scale-95 group/info cursor-pointer"
                            >
                              <MessageCircle className="w-3.5 h-3.5 text-[#06C755] shrink-0" />
                              <span className="text-[12px] font-black text-[#06C755]">@{inquiry.user.line_nickname}</span>
                              <span className="text-[9px] sm:text-[10px] font-black bg-[#06C755] text-white px-1.5 py-0.5 rounded-md uppercase tracking-tighter whitespace-nowrap">LINE</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-stone-50 border border-stone-100 rounded-xl shadow-sm w-fit opacity-50">
                              <MessageCircle className="w-3.5 h-3.5 text-stone-400" />
                              <span className="text-[12px] font-black text-stone-500">LINE: 無</span>
                              <span className="text-[10px] font-black bg-stone-300 text-white px-1.5 py-0.5 rounded-md uppercase tracking-tighter">LINE</span>
                            </div>
                          )}
                        </>
                      ) : inquiry.contact_email && (
                        <div
                          onClick={(e) => handleCopy(e, inquiry.contact_email, 'ゲストメール')}
                          className={`flex flex-col xs:flex-row xs:items-center gap-2 px-3 py-2 sm:py-1.5 border rounded-xl shadow-sm w-fit hover:bg-white transition-all active:scale-95 group/info cursor-pointer ${inquiry.is_read ? 'bg-emerald-50/50 border-emerald-100' : 'bg-rose-50 border-rose-100'
                            }`}
                        >
                          <span className={`text-[9px] sm:text-[10px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-tighter whitespace-nowrap self-start xs:self-center ${inquiry.is_read ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`}>ゲスト</span>
                          <div className="flex items-center gap-2 min-w-0">
                            <Mail className={`w-3.5 h-3.5 shrink-0 ${inquiry.is_read ? 'text-emerald-500' : 'text-rose-500'}`} />
                            <span className={`text-[12px] text-stone-600 font-black truncate`}>{inquiry.contact_email}</span>
                          </div>
                        </div>
                      )}
                    </div>
                    {/* Timestamp */}
                    <p className="mt-3 text-[11px] font-bold text-stone-400 uppercase tracking-widest">
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
                      className="flex items-center gap-1.5 px-4 py-2 bg-rose-50 text-rose-500 text-[12px] font-black rounded-xl sm:opacity-0 sm:group-hover:opacity-100 hover:bg-rose-100 transition-all"
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
