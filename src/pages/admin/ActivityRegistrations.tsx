import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import XLSX from 'xlsx-js-style';
import { format } from 'date-fns';
import { ja as jaLocale } from 'date-fns/locale';
import * as Select from '@radix-ui/react-select';
import { ArrowLeft, ChevronDown, Download, Loader2, Search, CheckCircle2, UserX, Sparkles, MessageSquare, Check, Calendar, Trash2, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  formatActivityAnswerValue,
  getActivityRegistrationQuestions,
} from '../../lib/activityRegistrationQuestions';
import { supabase } from '../../lib/supabase';
import { useDebounce } from '../../hooks/useDebounce';
import ExcelExportModal, { type ExcelExportFieldOption } from '../../components/ui/ExcelExportModal';

// Helper Map for Status
const STATUS_JA = {
  'applied': '確認中',
  'present': '出席',
  'unexcused_absence': '欠席'
};


const STATUS_COLOR_THEME = {
  'applied': { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200', active: 'bg-amber-500 text-white border-amber-500' },
  'present': { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200', active: 'bg-emerald-500 text-white border-emerald-500' },
  'unexcused_absence': { bg: 'bg-rose-50', text: 'text-rose-600', border: 'border-rose-200', active: 'bg-rose-500 text-white border-rose-500' }
};

function RegistrationCancelConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  memberName,
  isSubmitting
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  memberName: string;
  isSubmitting: boolean;
}) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[220] flex items-center justify-center p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-stone-950/75 backdrop-blur-sm"
          />
          <motion.div
            initial={{ scale: 0.96, opacity: 0, y: 18 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 18 }}
            className="relative w-full max-w-md overflow-hidden rounded-[2.5rem] border border-rose-100 bg-white shadow-[0_40px_100px_rgba(214,41,118,0.18)]"
          >
            <div className="bg-gradient-to-r from-rose-500 to-[#D62976] px-8 py-6 text-white">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <h2 className="text-[14px] font-black uppercase tracking-[0.22em]">Registration Update</h2>
            </div>

            <div className="space-y-8 px-8 py-9 text-center">
              <div className="space-y-3">
                <h3 className="text-xl font-black leading-tight text-stone-900">
                  「{memberName}」を
                  <br />
                  参加者一覧から削除しますか？
                </h3>
                <p className="mx-auto max-w-[280px] text-sm font-bold leading-relaxed text-stone-500">
                  この操作を実行すると、対象メンバーの参加申込はキャンセルとして処理されます。
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="flex-1 rounded-2xl bg-stone-50 py-3.5 text-[13px] font-black uppercase tracking-widest text-stone-500 transition-all hover:bg-stone-100 active:scale-95 disabled:opacity-60"
                >
                  閉じる
                </button>
                <button
                  type="button"
                  onClick={onConfirm}
                  disabled={isSubmitting}
                  className="flex-[1.25] rounded-2xl bg-[#D62976] py-3.5 text-[13px] font-black uppercase tracking-widest text-white shadow-lg shadow-rose-200 transition-all hover:brightness-110 active:scale-95 disabled:opacity-60"
                >
                  {isSubmitting ? '処理中...' : '削除を実行'}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// -------------------------------------------------------------
// CHILD COMPONENT: Simple Registration Item
// -------------------------------------------------------------
function RegistrationItem({ reg, activityId, currentSessionIdx, sessions }: { reg: any, activityId: string, currentSessionIdx: number | null, sessions: any[] }) {
  const queryClient = useQueryClient();
  const [showNote, setShowNote] = useState(false);
  const [showAnswers, setShowAnswers] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [note, setNote] = useState(reg.admin_note || '');
  const [isSavingNote, setIsSavingNote] = useState(false);
  const debouncedNote = useDebounce(note, 800);
  const isFirstRender = useRef(true);
  const answerCount = Array.isArray(reg.registration_answers) ? reg.registration_answers.length : 0;

  // Note Mutation
  const updateNoteMutation = useMutation({
    mutationFn: async (newNote: string) => {
      const { error } = await supabase
        .from('registrations')
        .update({ admin_note: newNote })
        .eq('id', reg.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setIsSavingNote(false);
      queryClient.invalidateQueries({ queryKey: ['admin-registrations', activityId] });
    },
    onError: (err: any) => {
      toast.error('Error saving note: ' + err.message);
      setIsSavingNote(false);
    }
  });

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (debouncedNote !== (reg.admin_note || '')) {
      setIsSavingNote(true);
      updateNoteMutation.mutate(debouncedNote);
    }
  }, [debouncedNote]);

  // Find existing session status if available
  const sessionStatus = reg.attendance_records?.find((ar: any) => ar.session_index === currentSessionIdx)?.status;
  const displayStatus = currentSessionIdx !== null ? (sessionStatus || 'applied') : reg.attendance_status;

  // Status Mutation (Now specialized for session-level)
  const updateStatusMutation = useMutation({
    mutationFn: async (newStatus: string) => {

      if (currentSessionIdx !== null) {
        // Upsert into attendance_records
        const { error } = await supabase
          .from('attendance_records')
          .upsert({
            registration_id: reg.id,
            session_index: currentSessionIdx,
            status: newStatus
          }, { onConflict: 'registration_id,session_index' });
        if (error) throw error;
      } else {
        // Fallback to legacy behavior for "All Updates" view
        const { error } = await supabase
          .from('registrations')
          .update({ attendance_status: newStatus })
          .eq('id', reg.id);
        if (error) throw error;
      }
    },
    onMutate: async (newStatus) => {
      await queryClient.cancelQueries({ queryKey: ['admin-registrations', activityId] });
      const previousRegs = queryClient.getQueryData(['admin-registrations', activityId]);
      queryClient.setQueryData(['admin-registrations', activityId], (old: any) => {
        if (!old) return old;
        return old.map((r: any) => {
          if (r.id !== reg.id) return r;
          if (currentSessionIdx !== null) {
            const existingRecords = r.attendance_records || [];
            const otherRecords = existingRecords.filter((ar: any) => ar.session_index !== currentSessionIdx);
            return { ...r, attendance_records: [...otherRecords, { session_index: currentSessionIdx, status: newStatus }] };
          }
          return { ...r, attendance_status: newStatus };
        });
      });
      return { previousRegs };
    },
    onError: (err: any, _newStatus, context) => {
      queryClient.setQueryData(['admin-registrations', activityId], context?.previousRegs);
      toast.error('Update error: ' + err.message);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-registrations', activityId] });
    }
  });

  const removeRegistrationMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('registrations')
        .delete()
        .eq('id', reg.id);
      if (error) throw error;
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['admin-registrations', activityId] });
      const previousRegs = queryClient.getQueryData(['admin-registrations', activityId]);
      queryClient.setQueryData(['admin-registrations', activityId], (old: any) => {
        if (!old) return old;
        return old.filter((item: any) => item.id !== reg.id);
      });
      return { previousRegs };
    },
    onError: (err: any, _vars, context) => {
      queryClient.setQueryData(['admin-registrations', activityId], context?.previousRegs);
      toast.error('キャンセル処理に失敗しました: ' + err.message);
    },
    onSuccess: () => {
      setShowRemoveConfirm(false);
      const memberName = reg.users?.full_name_kana || reg.users?.full_name || '対象メンバー';
      toast.success(`${memberName}を参加登録一覧から削除しました。`);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-registrations', activityId] });
      queryClient.invalidateQueries({ queryKey: ['admin-activity-detail', activityId] });
      queryClient.invalidateQueries({ queryKey: ['admin-activities'] });
      queryClient.invalidateQueries({ queryKey: ['activity', activityId] });
      queryClient.invalidateQueries({ queryKey: ['activities'] });
    }
  });

  const handleRemoveRegistration = () => {
    setShowRemoveConfirm(true);
  };

  const confirmRemoveRegistration = () => {
    removeRegistrationMutation.mutate();
  };

  return (
    <>
      <RegistrationCancelConfirmModal
        isOpen={showRemoveConfirm}
        onClose={() => setShowRemoveConfirm(false)}
        onConfirm={confirmRemoveRegistration}
        memberName={reg.users?.full_name_kana || reg.users?.full_name || '対象メンバー'}
        isSubmitting={removeRegistrationMutation.isPending}
      />

      <div className="bg-white border border-stone-100 rounded-[2rem] p-5 sm:p-6 shadow-[0_8px_30px_rgb(0,0,0,0.02)] hover:shadow-[0_20px_50px_rgba(79,91,213,0.08)] hover:border-indigo-100 transition-all duration-500 group relative overflow-hidden">
      <div className="absolute top-0 left-0 w-1 h-full bg-[#4F5BD5] opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">

        {/* User Info Section */}
        <div className="flex items-center gap-2 flex-1 min-w-0">

          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <h3 className="text-base sm:text-lg font-black text-[#0f172a] tracking-tight uppercase leading-none">
                {reg.users ? (reg.users.full_name_kana || reg.users.full_name) : '退会済みユーザー'}
              </h3>

              <div className="flex items-center gap-2">
                {reg.users?.mssv && (
                  <span className="text-[10px] font-bold tracking-wider text-indigo-500 bg-indigo-50/50 px-2.5 py-1 rounded-lg border border-indigo-100">
                    {reg.users.mssv}
                  </span>
                )}
                {reg.users?.line_nickname && (
                  <span className="flex items-center gap-1 text-[11px] font-bold text-[#06C755] bg-[#06C755]/5 px-2 py-1 rounded-lg border border-[#06C755]/10 lowercase">
                    @{reg.users.line_nickname}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-gray-400">
              {/* Sessions */}
              {Array.isArray(reg.selected_sessions) && reg.selected_sessions.length > 0 && (
                <div className="flex items-center gap-1.5 bg-indigo-50/30 px-3 py-1.5 rounded-xl border border-[#4F5BD5]/20">
                  <div className="flex items-center gap-1 flex-wrap">
                    {Array.from(new Set(reg.selected_sessions.map((sIdx: number) => {
                      const s = sessions?.[sIdx];
                      if (!s) return 'N/A';
                      const dateStr = format(new Date(s.date), 'M/d');
                      const timeStr = s.end_time ? `${s.start_time}-${s.end_time}` : `${s.start_time} ~`;
                      return `${dateStr} ${timeStr}`;
                    }))).map((sessionStr: any, idx, arr) => (
                      <span key={idx} className="text-[10px] font-black text-[#4F5BD5] uppercase tracking-tighter">
                        {sessionStr}{idx < arr.length - 1 ? ' • ' : ''}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Registration Date */}
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-stone-500">
                <span className="w-1 h-1 rounded-full bg-stone-200" />
                <span>申込: {format(new Date(reg.registered_at), 'MM/dd')}</span>
              </div>

              {/* Memo Button */}
              <button
                onClick={() => setShowNote(!showNote)}
                className={`flex items-center gap-2 px-0 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${reg.admin_note
                  ? 'bg-rose-50/50 text-rose-500 border-rose-100 shadow-sm'
                  : 'bg-stone-50/30 text-stone-500 border-stone-100 hover:text-stone-600 hover:bg-stone-50'
                  }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                {reg.admin_note ? 'メモを確認' : 'メモを追加'}
              </button>
            </div>

            {answerCount > 0 && (
              <button
                type="button"
                onClick={() => setShowAnswers((prev) => !prev)}
                className={`mt-3 inline-flex items-center gap-1 text-left transition-all ${showAnswers
                  ? 'text-[#4F5BD5]'
                  : 'text-stone-500 hover:text-[#4F5BD5]'
                  }`}
              >
                <div className="min-w-0">
                  <p className="text-[14px] font-black uppercase tracking-widest">回答を表示</p>
                </div>
                <ChevronDown className={`w-5 h-5 shrink-0 transition-transform ${showAnswers ? 'rotate-180' : ''}`} />
              </button>
            )}
          </div>
        </div>

        {/* Action Buttons Section - Show when a specific session is selected OR when the activity has NO sessions at all */}
        {(currentSessionIdx !== null || !sessions?.length) && (
          <div className="flex flex-row items-center gap-1.5 w-full lg:w-auto">
            {[
              { id: 'present', label: '出席', color: 'present', icon: CheckCircle2 },
              { id: 'unexcused_absence', label: '欠席', color: 'unexcused_absence', icon: UserX },
              { id: 'applied', label: '確認中', color: 'applied', icon: Sparkles },
            ].map((item) => {
              const theme = STATUS_COLOR_THEME[item.color as keyof typeof STATUS_COLOR_THEME];
              const isActive = displayStatus === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => updateStatusMutation.mutate(item.id)}
                  className={`flex-1 lg:flex-none flex items-center justify-center gap-1.5 sm:gap-2 px-1 sm:px-3 py-3 rounded-xl border-2 text-[10px] sm:text-[12px] font-black uppercase tracking-widest transition-all active:scale-95 ${isActive ? theme.active : `bg-white border-gray-100 text-gray-400 hover:border-gray-200 hover:text-gray-700 shadow-sm`
                    }`}
                >
                  <item.icon className="w-3.5 h-3.5 sm:w-4 h-4" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={handleRemoveRegistration}
              disabled={removeRegistrationMutation.isPending}
              className="flex-1 lg:flex-none flex items-center justify-center gap-1.5 sm:gap-2 px-3 py-3 rounded-xl border-2 border-rose-100 bg-rose-50 text-rose-600 hover:bg-rose-100 hover:border-rose-200 disabled:opacity-60 disabled:cursor-not-allowed text-[10px] sm:text-[12px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-sm"
            >
              {removeRegistrationMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 sm:w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-3.5 h-3.5 sm:w-4 h-4" />
              )}
              <span className="truncate">削除</span>
            </button>
          </div>
        )}
      </div>

      {/* Expandable Note Section */}
      <AnimatePresence>
        {showAnswers && answerCount > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-4 pt-4 border-t border-indigo-50">
              <div className="space-y-2 rounded-2xl border border-indigo-100 bg-indigo-50/30 p-3">
                {reg.registration_answers.map((item: any, idx: number) => (
                  <div key={idx} className="space-y-1">
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#4F5BD5]">{item.question || `Question ${idx + 1}`}</p>
                    <p className="whitespace-pre-wrap text-[12px] font-bold leading-relaxed text-stone-700">{formatActivityAnswerValue(item.answer)}</p>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {showNote && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-4 pt-4 border-t border-gray-50 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">メモ</span>
                {isSavingNote && <Loader2 className="w-3 h-3 animate-spin text-[#4F5BD5]" />}
              </div>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="メモを記入!"
                className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl p-4 text-sm font-bold text-[#0f172a] focus:bg-white focus:border-[#4F5BD5]/20 outline-none transition-all placeholder:text-gray-300 resize-none h-20"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    </>
  );
}

// -------------------------------------------------------------
// MAIN COMPONENT
// -------------------------------------------------------------

export default function ActivityRegistrations() {
  const { id: activityId } = useParams();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSessionIdx, setSelectedSessionIdx] = useState<number | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  const debouncedSearch = useDebounce(searchTerm, 400);

  // Activitiy registrations are for admins only, so we always show full info to them.
  const isFullDisclosure = true;

  const { data: activity, isLoading: actLoading } = useQuery({
    queryKey: ['admin-activity-detail', activityId],
    queryFn: async () => {
      const { data, error } = await supabase.from('activities').select('*').eq('id', activityId).single();
      if (error) throw error;
      return data;
    },
    enabled: !!activityId
  });

  useEffect(() => {
    if (activity?.sessions?.length === 1 && selectedSessionIdx === null) {
      setSelectedSessionIdx(0);
    }
  }, [activity, selectedSessionIdx]);

  const { data: registrations, isLoading: regLoading } = useQuery({
    queryKey: ['admin-registrations', activityId],
    queryFn: async () => {

      const { data, error } = await supabase
        .from('registrations')
        .select(`
          id, attendance_status, admin_note, registered_at, selected_sessions, registration_answers,
          users:user_id (id, mssv, full_name, full_name_kana, email, phone, line_nickname, university_email, gender, nationality),
          attendance_records (session_index, status)
        `)
        .eq('activity_id', activityId)
        .order('registered_at', { ascending: true })
        .not('user_id', 'is', null);

      if (error) {
        console.error('Supabase fetch error details:', error);
        throw error;
      }


      return data;
    },
    enabled: !!activityId
  });

  // Calculate session counts
  const sessionCounts = useMemo(() => {
    if (!registrations) return {};
    const counts: Record<number, number> = {};
    registrations.forEach(reg => {
      if (Array.isArray(reg.selected_sessions)) {
        reg.selected_sessions.forEach((sIdx: number) => {
          counts[sIdx] = (counts[sIdx] || 0) + 1;
        });
      }
    });
    return counts;
  }, [registrations]);


  const filteredRegs = useMemo(() => {
    if (!registrations) return [];
    let result = registrations;

    if (selectedSessionIdx !== null) {
      result = result.filter((r: any) => {
        // If sessions field is missing, it's effectively registered for everything
        if (!r.selected_sessions) return true;
        // Check if the current session index exists in the member's selected_sessions array
        return Array.isArray(r.selected_sessions) && r.selected_sessions.includes(selectedSessionIdx);
      });
    }

    // Filter by Search (Case insensitive searching of name and student ID)
    if (debouncedSearch.trim()) {
      const lower = debouncedSearch.toLowerCase();
      result = result.filter((r: any) =>
        (r.users?.full_name?.toLowerCase().includes(lower)) ||
        (r.users?.full_name_kana?.toLowerCase().includes(lower)) ||
        (r.users?.mssv?.toLowerCase().includes(lower))
      );
    }

    // Final filter: Keep all registrations to preserve historical "results"
    // (We no longer filter out registrations from deleted users)
    return result;
  }, [registrations, debouncedSearch, selectedSessionIdx]);

  const registrationQuestionPrompts = useMemo<string[]>(() => {
    let prompts = getActivityRegistrationQuestions(activity)
      .map((q: any) => q?.prompt?.trim())
      .filter((prompt: string) => prompt);

    if (prompts.length === 0 && registrations) {
      const uniqueQuestions = new Set<string>();
      registrations.forEach((r: any) => {
        if (Array.isArray(r.registration_answers)) {
          r.registration_answers.forEach((ans: any) => {
            if (ans?.question?.trim()) {
              uniqueQuestions.add(ans.question.trim());
            }
          });
        }
      });
      prompts = Array.from(uniqueQuestions);
    }

    return prompts;
  }, [activity, registrations]);

  const activityExportFields = useMemo<ExcelExportFieldOption[]>(() => {
    const fields: ExcelExportFieldOption[] = [
      { key: 'no', label: 'No', description: 'So thu tu trong danh sach da loc.' },
      { key: 'registered_at', label: '登録日時', description: 'Thoi gian dang ky.' },
      { key: 'mssv', label: '学籍番号', description: 'Ma sinh vien.' },
      { key: 'full_name', label: '氏名', description: 'Ho va ten.' },
      { key: 'full_name_kana', label: 'フリガナ', description: 'Ten kana.' },
      { key: 'line_nickname', label: 'LINEニックネーム', description: 'Biet danh LINE.' },
      { key: 'gender', label: '性別', description: 'Gioi tinh.' },
      { key: 'nationality', label: '国籍', description: 'Quoc tich.' },
      { key: 'email', label: '連絡メール', description: 'Email lien he.' },
      { key: 'university_email', label: '大学メール', description: 'Email truong.' },
      { key: 'phone', label: '電話番号', description: 'So dien thoai.' },
      { key: 'selected_sessions', label: '選択セッション', description: 'Tong hop session da chon.' },
      { key: 'admin_note', label: '備考', description: 'Ghi chu admin.' },
    ];

    if (selectedSessionIdx !== null && activity?.sessions?.[selectedSessionIdx]) {
      const session = activity.sessions[selectedSessionIdx];
      fields.push({
        key: `attendance_session_${selectedSessionIdx}`,
        label: `${format(new Date(session.date), 'M月d日')} (${session.start_time}${session.end_time ? `-${session.end_time}` : ''})`,
        description: 'Trang thai diem danh cua session dang xem.',
      });
    } else if (activity?.sessions?.length) {
      activity.sessions.forEach((session: any, index: number) => {
        fields.push({
          key: `attendance_session_${index}`,
          label: `${format(new Date(session.date), 'M月d日')} (${session.start_time}${session.end_time ? `-${session.end_time}` : ''})`,
          description: `Trang thai diem danh session ${index + 1}.`,
        });
      });
    } else {
      fields.push({ key: 'attendance_status', label: '出欠', description: 'Trang thai tham gia.' });
    }

    registrationQuestionPrompts.forEach((prompt: string, index: number) => {
      fields.push({
        key: `question_${index}`,
        label: prompt,
        description: 'Cau tra loi cau hoi dang ky.',
      });
    });

    return fields;
  }, [activity, registrationQuestionPrompts, selectedSessionIdx]);

  const activityDefaultExportKeys = useMemo(
    () => activityExportFields.map((field) => field.key),
    [activityExportFields]
  );

  const exportConfiguredExcel = (selectedKeys: string[]) => {
    if (!filteredRegs || !activity) return;

    try {
      const selectedFields = activityExportFields.filter((field) => selectedKeys.includes(field.key));
      if (selectedFields.length === 0) {
        toast.error('少なくとも1つの項目を選択してください');
        return;
      }

      const ws = XLSX.utils.aoa_to_sheet([]);
      const sessionInfo = selectedSessionIdx !== null
        ? ` (${activity.sessions[selectedSessionIdx].start_time})`
        : ' (å…¨æ—¥ç¨‹ä¸€æ‹¬)';

      const headers = [
        [`æ´»å‹•åï¼š${activity.title}${sessionInfo}`],
        [`ã‚¨ã‚¯ã‚¹ãƒãƒ¼ãƒˆæ—¥æ™‚ï¼š${format(new Date(), 'yyyy-MM-dd HH:mm:ss')}`],
        [`é …ç›®æ•°ï¼š${selectedFields.length}`],
        [''],
        selectedFields.map((field) => field.label),
      ];

      XLSX.utils.sheet_add_aoa(ws, headers, { origin: 'A1' });

      const rowData = filteredRegs.map((r: any, idx) => {
        const attendanceBySession = new Map<number, string>();
        if (activity.sessions?.length) {
          activity.sessions.forEach((_: any, sessionIndex: number) => {
            const isSelected = !r.selected_sessions || (Array.isArray(r.selected_sessions) && r.selected_sessions.includes(sessionIndex));
            if (!isSelected) {
              attendanceBySession.set(sessionIndex, '-');
              return;
            }
            const status = r.attendance_records?.find((ar: any) => ar.session_index === sessionIndex)?.status;
            attendanceBySession.set(sessionIndex, STATUS_JA[status as keyof typeof STATUS_JA] || 'ç¢ºèªä¸­');
          });
        }

        const selectedSessionsLabel = Array.isArray(r.selected_sessions) && activity.sessions?.length
          ? r.selected_sessions
              .map((sessionIndex: number) => {
                const session = activity.sessions[sessionIndex];
                if (!session) return null;
                return `${format(new Date(session.date), 'M月d日')} ${session.start_time}`;
              })
              .filter(Boolean)
              .join(', ')
          : '';

        const valueMap: Record<string, string | number> = {
          no: idx + 1,
          registered_at: r.registered_at ? format(new Date(r.registered_at), 'yyyy-MM-dd HH:mm:ss') : '',
          mssv: r.users?.mssv || 'N/A',
          full_name: r.users?.full_name || 'N/A',
          full_name_kana: r.users?.full_name_kana || '-',
          line_nickname: r.users?.line_nickname || 'æœªè¨­å®š',
          gender: r.users?.gender || '-',
          nationality: r.users?.nationality || '-',
          email: r.users?.email || '-',
          university_email: r.users?.university_email || '-',
          phone: r.users?.phone || '-',
          selected_sessions: selectedSessionsLabel || '-',
          admin_note: r.admin_note || '',
          attendance_status: STATUS_JA[r.attendance_status as keyof typeof STATUS_JA] || 'ç¢ºèªä¸­',
        };

        registrationQuestionPrompts.forEach((prompt: string, questionIndex: number) => {
          const answerObject = Array.isArray(r.registration_answers)
            ? r.registration_answers.find((answer: any) => answer.question?.trim() === prompt)
            : null;
          valueMap[`question_${questionIndex}`] = formatActivityAnswerValue(answerObject?.answer);
        });

        if (activity.sessions?.length) {
          activity.sessions.forEach((_: any, sessionIndex: number) => {
            valueMap[`attendance_session_${sessionIndex}`] = attendanceBySession.get(sessionIndex) || 'ç¢ºèªä¸­';
          });
        }

        return selectedFields.map((field) => valueMap[field.key] ?? '');
      });

      XLSX.utils.sheet_add_aoa(ws, rowData, { origin: 'A6' });

      for (let column = 0; column < selectedFields.length; column++) {
        const address = XLSX.utils.encode_cell({ r: 4, c: column });
        if (!ws[address]) continue;
        ws[address].s = {
          fill: { fgColor: { rgb: "4472C4" } },
          font: { bold: true, color: { rgb: "FFFFFF" }, sz: 12 },
          alignment: { horizontal: "center", vertical: "center" },
          border: {
            top: { style: "thin", color: { rgb: "000000" } },
            bottom: { style: "thin", color: { rgb: "000000" } },
            left: { style: "thin", color: { rgb: "000000" } },
            right: { style: "thin", color: { rgb: "000000" } }
          }
        };
      }

      const widthMap: Record<string, number> = {
        no: 6,
        registered_at: 22,
        mssv: 15,
        full_name: 25,
        full_name_kana: 25,
        line_nickname: 20,
        gender: 10,
        nationality: 15,
        email: 30,
        university_email: 35,
        phone: 15,
        selected_sessions: 32,
        admin_note: 40,
        attendance_status: 18,
      };
      ws['!cols'] = selectedFields.map((field) => ({
        wch: field.key.startsWith('question_') ? 40 : field.key.startsWith('attendance_session_') ? 24 : (widthMap[field.key] || 18)
      }));

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Attendance List');

      const safeTitle = activity.title.replace(/[/\\?%*:|"<>]/g, '-').substring(0, 50);
      const datePart = format(new Date(), 'yyyyMMdd');
      const sessionFilePart = selectedSessionIdx !== null ? `_S${selectedSessionIdx + 1}` : '';
      XLSX.writeFile(wb, `${safeTitle}ã®å‡ºæ¬ ï¼ˆ${datePart}ï¼‰${sessionFilePart}.xlsx`);

      toast.success('Excel Report Exported Successfully');
      setIsExportModalOpen(false);
    } catch (err: any) {
      console.error('Export error:', err);
      toast.error('Failed to export Excel report: ' + err.message);
    }
  };

  const exportToExcel = () => {
    if (!registrations || !activity) return;
    try {
      const ws = XLSX.utils.aoa_to_sheet([]);

      // Meta Information & Headers
      const sessionInfo = selectedSessionIdx !== null
        ? ` (${activity.sessions[selectedSessionIdx].start_time})`
        : ' (全日程一括)';

      const headersRow = ['No', '学籍番号', '氏名', 'フリガナ', 'LINEニックネーム'];

      if (selectedSessionIdx !== null && activity.sessions?.[selectedSessionIdx]) {
        const s = activity.sessions[selectedSessionIdx];
        const datePart = format(new Date(s.date), 'M月d日');
        const timePart = s.end_time ? `${s.start_time}-${s.end_time}` : s.start_time;
        headersRow.push(`${datePart} (${timePart})`);
      } else if (activity.sessions?.length === 1) {
        const s = activity.sessions[0];
        const datePart = format(new Date(s.date), 'M月d日');
        const timePart = s.end_time ? `${s.start_time}-${s.end_time}` : s.start_time;
        headersRow.push(`${datePart} (${timePart})`);
      } else if (activity.sessions?.length > 1) {
        activity.sessions.forEach((s: any) => {
          const datePart = format(new Date(s.date), 'M月d日');
          const timePart = s.end_time ? `${s.start_time}-${s.end_time}` : s.start_time;
          headersRow.push(`${datePart} (${timePart})`);
        });
      } else {
        // NO SESSIONS CASE
        try {
          const d = new Date(activity.date);
          const datePart = format(d, 'M月d日');
          const timePart = format(d, 'HH:mm');
          headersRow.push(`${datePart} (${timePart})`);
        } catch {
          headersRow.push('出欠');
        }
      }

      // Retrieve questions from activity, or extract from registrations as fallback
      let questions: string[] = [];
      if (activity) {
        questions = getActivityRegistrationQuestions(activity)
          .map((q: any) => q?.prompt?.trim())
          .filter((prompt: string) => prompt);
      }

      if (questions.length === 0 && registrations) {
        const uniqueQuestions = new Set<string>();
        registrations.forEach((r: any) => {
          if (Array.isArray(r.registration_answers)) {
            r.registration_answers.forEach((ans: any) => {
              if (ans?.question?.trim()) {
                uniqueQuestions.add(ans.question.trim());
              }
            });
          }
        });
        questions = Array.from(uniqueQuestions);
      }

      if (isFullDisclosure) {
        headersRow.push('大学メール', '電話番号');
      }

      // Add additional questions to Excel headers
      questions.forEach((qPrompt: string) => {
        headersRow.push(qPrompt);
      });

      headersRow.push('備考');

      const headers = [
        [`活動名：${activity.title}${sessionInfo}`],
        [`エクスポート日時：${format(new Date(), 'yyyy-MM-dd HH:mm:ss')}`],
        [isFullDisclosure ? '全ての情報を開示' : '制限された情報の開示（氏名・学籍番号のみ）'],
        [''],
        headersRow
      ];

      XLSX.utils.sheet_add_aoa(ws, headers, { origin: 'A1' });

      // Apply styling to the header row (Row 5 - index 4)
      const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const address = XLSX.utils.encode_cell({ r: 4, c: C });
        if (!ws[address]) continue;
        ws[address].s = {
          fill: { fgColor: { rgb: "4472C4" } }, // Professional Blue
          font: { bold: true, color: { rgb: "FFFFFF" }, sz: 12 },
          alignment: { horizontal: "center", vertical: "center" },
          border: {
            top: { style: "thin", color: { rgb: "000000" } },
            bottom: { style: "thin", color: { rgb: "000000" } },
            left: { style: "thin", color: { rgb: "000000" } },
            right: { style: "thin", color: { rgb: "000000" } }
          }
        };
      }

      // Member Data
      const rowData = filteredRegs.map((r: any, idx) => {
        const row: any[] = [
          idx + 1,
          r.users?.mssv || 'N/A',
          r.users?.full_name || 'N/A',
          r.users?.full_name_kana || '-',
          r.users?.line_nickname ? `${r.users.line_nickname}` : '未設定'
        ];

        if (selectedSessionIdx !== null) {
          const sStatus = r.attendance_records?.find((ar: any) => ar.session_index === selectedSessionIdx)?.status;
          row.push(STATUS_JA[sStatus as keyof typeof STATUS_JA] || STATUS_JA[r.attendance_status as keyof typeof STATUS_JA] || '確認中');
        } else if (activity.sessions?.length > 0) {
          activity.sessions.forEach((_: any, i: number) => {
            const isSelected = !r.selected_sessions || (Array.isArray(r.selected_sessions) && r.selected_sessions.includes(i));
            if (!isSelected) {
              row.push('-'); // Not registered for this session
            } else {
              const sStatus = r.attendance_records?.find((ar: any) => ar.session_index === i)?.status;
              row.push(STATUS_JA[sStatus as keyof typeof STATUS_JA] || '確認中');
            }
          });
        } else {
          row.push(STATUS_JA[r.attendance_status as keyof typeof STATUS_JA] || '確認中');
        }

        if (isFullDisclosure) {
          row.push(r.users?.university_email || '-');
          row.push(r.users?.phone || '-');
        }

        // Add additional question answers
        questions.forEach((qPrompt: string) => {
          const ansObj = Array.isArray(r.registration_answers)
            ? r.registration_answers.find((ans: any) => ans.question?.trim() === qPrompt)
            : null;
          row.push(formatActivityAnswerValue(ansObj?.answer));
        });

        row.push(r.admin_note || '');
        return row;
      });

      XLSX.utils.sheet_add_aoa(ws, rowData, { origin: 'A6' });

      // Column Widths for better readability
      const colWidths = [
        { wch: 6 },  // No
        { wch: 15 }, // 学籍番号
        { wch: 25 }, // 氏名
        { wch: 25 }, // フリガナ
        { wch: 20 }, // LINE
      ];

      // Add widths for attendance columns (only width for the columns that actually exist)
      const numAttendanceCols = (selectedSessionIdx !== null)
        ? 1
        : (activity.sessions?.length || 1);

      for (let i = 0; i < numAttendanceCols; i++) {
        colWidths.push({ wch: 30 });
      }

      if (isFullDisclosure) {
        colWidths.push({ wch: 35 }); // Email
        colWidths.push({ wch: 15 }); // Phone
      }

      // Add widths for additional questions
      questions.forEach(() => {
        colWidths.push({ wch: 40 }); // Large width for question answers
      });

      colWidths.push({ wch: 40 }); // 備考

      ws['!cols'] = colWidths;

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Attendance List');

      // Filename construction: [ActivityTitle]の出欠（年月日）
      const safeTitle = activity.title.replace(/[/\\?%*:|"<>]/g, '-').substring(0, 50);
      const datePart = format(new Date(), 'yyyyMMdd');
      const sessionFilePart = selectedSessionIdx !== null ? `_S${selectedSessionIdx + 1}` : '';

      XLSX.writeFile(wb, `${safeTitle}の出欠（${datePart}）${sessionFilePart}.xlsx`);

      if (!isFullDisclosure) {
        toast.info('プライバシー設定により、氏名と学籍番号のみエクスポートされました。');
      } else {
        toast.success('Excel Report Exported Successfully');
      }
    } catch (err: any) {
      console.error('Export error:', err);
      toast.error('Failed to export Excel report: ' + err.message);
    }
  };
  void exportToExcel;

  if (actLoading || regLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-40 gap-4">
        <Loader2 className="w-10 h-10 text-[#4F5BD5] animate-spin" />
        <p className="text-[9px] font-black text-gray-400 uppercase tracking-[0.3em]">データを同期中...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Navigation Row */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <Link
          to="/admin/activities"
          className="w-full sm:w-auto inline-flex items-center justify-center gap-3 px-8 py-3 bg-gradient-to-r from-[#4F5BD5] to-[#7B61FF] text-white rounded-full text-[14px] font-black shadow-lg shadow-indigo-200 transition-all hover:scale-[1.02] active:scale-95 no-underline group"
        >
          <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
          <span>一覧に戻る</span>
        </Link>

        <button
          onClick={() => setIsExportModalOpen(true)}
          className="w-full sm:w-auto flex items-center justify-center gap-2.5 px-6 py-3.5 bg-gray-900 hover:bg-[#4F5BD5] text-white rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all shadow-xl active:scale-95"
        >
          <Download className="w-4 h-4" /> Excelエクスポート
        </button>
      </div>

      {/* Standalone Activity Heading */}
      <div className="relative pt-2 pb-2">
        <div className="absolute -left-10 top-0 w-64 h-64 bg-gradient-to-br from-[#D62976]/5 to-[#4F5BD5]/5 blur-3xl rounded-full -z-10" />
        <h1 className="text-2xl sm:text-4xl md:text-5xl font-black text-[#0f172a] tracking-tight transition-all duration-500">
          {activity?.title}
        </h1>
        <div className="mt-2 flex items-center gap-3">
          <div className="h-1 w-12 sm:w-20 bg-gradient-to-r from-[#D62976] to-transparent rounded-full" />
          <p className="text-[9px] font-black text-gray-300 uppercase tracking-[0.3em] sm:tracking-[0.5em]">Activity Management</p>
        </div>
      </div>

      {/* Control Bar with Gradient Border */}
      <div className="space-y-4">
        <div className="p-[1px] bg-gradient-to-r from-[#D62976] to-[#4F5BD5] rounded-3xl shadow-lg shadow-[#4F5BD5]/10">
          <div className="bg-white/95 backdrop-blur-2xl p-2.5 sm:p-3.5 rounded-[1.4rem] sm:rounded-[1.95rem] overflow-hidden">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4F5BD5]" />
              <input
                type="text"
                placeholder="氏名や学籍番号でクイック検索..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-6 py-3 bg-transparent text-[#0f172a] text-sm font-black uppercase tracking-widest outline-none transition-all placeholder:text-gray-400"
              />
            </div>
          </div>
        </div>

        {/* Navigation Dropdown Select List */}
        {activity?.sessions?.length > 0 && (
          <div className="flex flex-col gap-2 max-w-md">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">
              日程・時間帯を選択
            </label>
            <Select.Root
              value={selectedSessionIdx === null ? 'all' : String(selectedSessionIdx)}
              onValueChange={(val) => {
                setSelectedSessionIdx(val === 'all' ? null : Number(val));
              }}
              disabled={activity.sessions.length <= 1}
            >
              <Select.Trigger
                className="flex items-center justify-between w-full px-5 py-3.5 bg-white border-2 border-stone-100 hover:border-indigo-100 rounded-2xl text-sm font-bold text-stone-900 shadow-sm transition-all outline-none"
              >
                <div className="flex items-center gap-2.5">
                  <Calendar className="w-4 h-4 text-[#4F5BD5]" />
                  <Select.Value>
                    {selectedSessionIdx === null
                      ? `すべて (${registrations?.length || 0}人)`
                      : (() => {
                          const session = activity.sessions[selectedSessionIdx];
                          if (!session) return '';
                          const dateStr = format(new Date(session.date), 'MM/dd (E)', { locale: jaLocale });
                          const timeStr = `${session.start_time}${session.end_time ? ` - ${session.end_time}` : ' ~'}`;
                          const countStr = `(${sessionCounts[selectedSessionIdx] || 0}${session.capacity ? `/${session.capacity}` : ''}人)`;
                          return `${dateStr} ${timeStr} ${countStr}`;
                        })()
                    }
                  </Select.Value>
                </div>
                {activity.sessions.length > 1 && (
                  <Select.Icon>
                    <ChevronDown className="w-4 h-4 text-stone-400" />
                  </Select.Icon>
                )}
              </Select.Trigger>

              <Select.Portal>
                <Select.Content
                  className="z-[100] overflow-hidden rounded-2xl bg-white border border-stone-100 shadow-2xl animate-in fade-in zoom-in-95 duration-200 min-w-[320px] max-h-[300px]"
                >
                  <Select.Viewport className="p-2">
                    {activity.sessions.length > 1 && (
                      <Select.Item
                        value="all"
                        className="relative flex items-center pl-10 pr-4 py-3 rounded-xl text-sm font-medium text-stone-700 outline-none cursor-pointer hover:bg-indigo-50 hover:text-[#4F5BD5] focus:bg-indigo-50 data-[state=checked]:font-bold data-[state=checked]:text-[#4F5BD5] data-[state=checked]:bg-indigo-50/50 transition-colors"
                      >
                        <Select.ItemText>
                          すべて ({registrations?.length || 0}人)
                        </Select.ItemText>
                        <Select.ItemIndicator className="absolute left-3.5 flex items-center">
                          <Check className="w-4 h-4 text-[#4F5BD5]" />
                        </Select.ItemIndicator>
                      </Select.Item>
                    )}

                    {activity.sessions.map((session: any, idx: number) => {
                      const dateStr = format(new Date(session.date), 'MM/dd (E)', { locale: jaLocale });
                      const timeStr = `${session.start_time}${session.end_time ? ` - ${session.end_time}` : ' ~'}`;
                      const countStr = `(${sessionCounts[idx] || 0}${session.capacity ? `/${session.capacity}` : ''}人)`;
                      const isFull = session.capacity && (sessionCounts[idx] || 0) >= session.capacity;

                      return (
                        <Select.Item
                          key={idx}
                          value={String(idx)}
                          className={`relative flex items-center pl-10 pr-4 py-3 rounded-xl text-sm font-medium outline-none cursor-pointer transition-colors ${
                            isFull 
                              ? 'text-rose-500 hover:bg-rose-50 hover:text-rose-600 focus:bg-rose-50 data-[state=checked]:bg-rose-50 data-[state=checked]:text-rose-600' 
                              : 'text-stone-700 hover:bg-indigo-50 hover:text-[#4F5BD5] focus:bg-indigo-50 data-[state=checked]:bg-indigo-50/50 data-[state=checked]:text-[#4F5BD5]'
                          } data-[state=checked]:font-bold`}
                        >
                          <Select.ItemText>
                            <span className="inline-flex items-center gap-2">
                              <span className="text-gray-900">{dateStr}</span>
                              <span className="font-bold text-gray-800">{timeStr}</span>
                              <span className="text-xs text-gray-400 font-normal">{countStr}</span>
                              {isFull && (
                                <span className="ml-1.5 text-[9px] uppercase tracking-tighter px-1.5 py-0.5 rounded bg-rose-100 text-rose-600 font-bold">
                                  満員
                                </span>
                              )}
                            </span>
                          </Select.ItemText>
                          <Select.ItemIndicator className="absolute left-3.5 flex items-center">
                            <Check className="w-4 h-4 text-[#4F5BD5]" />
                          </Select.ItemIndicator>
                        </Select.Item>
                      );
                    })}
                  </Select.Viewport>
                </Select.Content>
              </Select.Portal>
            </Select.Root>
          </div>
        )}
      </div>

      {/* Registration List */}
      <div className="space-y-4">
        {filteredRegs.length === 0 ? (
          <div className="text-center py-20 bg-white border border-gray-100 rounded-3xl">
            <UserX className="w-8 h-8 text-gray-100 mx-auto mb-4" />
            <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest">登録メンバーがいません</p>
          </div>
        ) : (
          filteredRegs.map((reg) => (
            <RegistrationItem
              key={reg.id}
              reg={reg}
              activityId={activityId!}
              currentSessionIdx={selectedSessionIdx}
              sessions={activity?.sessions || []}
            />
          ))
        )}
      </div>

      <div className="pt-8 text-center pb-10">
        <p className="text-[9px] font-black text-gray-200 uppercase tracking-[0.8em]">End of Records</p>
      </div>

      <ExcelExportModal
        isOpen={isExportModalOpen}
        title="Activity Export"
        description="Chon cac truong thong tin dang ky, thong tin thanh vien, session va cau tra loi can dua vao file Excel."
        fields={activityExportFields}
        defaultSelectedKeys={activityDefaultExportKeys}
        onClose={() => setIsExportModalOpen(false)}
        onConfirm={exportConfiguredExcel}
        confirmLabel="Export dang ky"
      />
    </div>
  );
}
