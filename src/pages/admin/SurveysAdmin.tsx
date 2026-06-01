import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart3,
  Download,
  Eye,
  FileQuestion,
  Loader2,
  Plus,
  Save,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';
import XLSX from 'xlsx-js-style';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store/useAppStore';
import { useAuthStore } from '../../store/useAuthStore';
import { cn } from '../../lib/utils';
import {
  RESPONSE_MODE_LABELS,
  STATUS_LABELS,
  SURVEY_QUESTION_TYPES,
  SURVEY_ROLE_OPTIONS,
  SURVEY_YEAR_OPTIONS,
  formatAnswerValue,
  isChoiceQuestion,
} from '../../lib/surveys';
import type { Survey, SurveyQuestion, SurveyResponse } from '../../types/survey';

type SurveyDraft = {
  id?: string;
  title: string;
  description: string;
  activity_id: string;
  status: Survey['status'];
  response_mode: Survey['response_mode'];
  target_config: {
    require_activity_registration: boolean;
    roles: string[];
    years: number[];
  };
  questions: Array<{
    id?: string;
    type: SurveyQuestion['type'];
    label: string;
    description: string;
    required: boolean;
    choicesText: string;
    choiceLimitsText: string;
    min: number;
    max: number;
  }>;
};

const emptyQuestion = (): SurveyDraft['questions'][number] => ({
  type: 'short_text',
  label: '',
  description: '',
  required: false,
  choicesText: 'はい\nいいえ',
  choiceLimitsText: '\n',
  min: 1,
  max: 5,
});

const emptyDraft = (): SurveyDraft => ({
  title: '',
  description: '',
  activity_id: '',
  status: 'draft',
  response_mode: 'single_editable',
  target_config: {
    require_activity_registration: false,
    roles: [],
    years: [],
  },
  questions: [emptyQuestion()],
});

const normalizeSurvey = (survey: Survey, questions: SurveyQuestion[]): SurveyDraft => ({
  id: survey.id,
  title: survey.title,
  description: survey.description || '',
  activity_id: survey.activity_id || '',
  status: survey.status,
  response_mode: survey.response_mode,
  target_config: {
    require_activity_registration: !!survey.target_config?.require_activity_registration,
    roles: survey.target_config?.roles || [],
    years: survey.target_config?.years || [],
  },
  questions: questions
    .sort((a, b) => a.position - b.position)
    .map((q) => {
      const choices = q.options?.choices || [''];
      const limits = q.options?.choice_limits || [];
      return {
      id: q.id,
      type: q.type,
      label: q.label,
      description: q.description || '',
      required: q.required,
      choicesText: choices.join('\n'),
      choiceLimitsText: choices.map((_, i) => (typeof limits[i] === 'number' && Number.isFinite(limits[i] as number) ? String(limits[i]) : '')).join('\n'),
      min: q.options?.min || 1,
      max: q.options?.max || 5,
      };
    }),
});

export default function SurveysAdmin() {
  const queryClient = useQueryClient();
  const { selectedYear } = useAppStore();
  const { currentUser } = useAuthStore();
  const [draft, setDraft] = useState<SurveyDraft>(emptyDraft());
  const [editorOpen, setEditorOpen] = useState(false);
  const [activeSurveyId, setActiveSurveyId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'builder' | 'responses'>('builder');

  const { data: activities = [] } = useQuery({
    queryKey: ['survey-admin-activities', selectedYear?.id],
    queryFn: async () => {
      if (!selectedYear) return [];
      const { data, error } = await supabase
        .from('activities')
        .select('id, title, date, location')
        .eq('academic_year_id', selectedYear.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedYear,
  });

  const { data: surveys = [], isLoading } = useQuery({
    queryKey: ['admin-surveys', selectedYear?.id],
    queryFn: async () => {
      if (!selectedYear) return [];
      const { data, error } = await supabase
        .from('surveys')
        .select('*, activities(id, title, date, location)')
        .eq('academic_year_id', selectedYear.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as Survey[];
    },
    enabled: !!selectedYear,
  });

  const { data: activeQuestions = [] } = useQuery({
    queryKey: ['admin-survey-questions', activeSurveyId],
    queryFn: async () => {
      if (!activeSurveyId) return [];
      const { data, error } = await supabase
        .from('survey_questions')
        .select('*')
        .eq('survey_id', activeSurveyId)
        .order('position', { ascending: true });
      if (error) throw error;
      return (data || []) as SurveyQuestion[];
    },
    enabled: !!activeSurveyId,
  });

  const { data: responses = [], isLoading: responsesLoading } = useQuery({
    queryKey: ['admin-survey-responses', activeSurveyId],
    queryFn: async () => {
      if (!activeSurveyId) return [];
      const { data, error } = await supabase
        .from('survey_responses')
        .select('*, users(full_name, full_name_kana, mssv, university_email), survey_answers(*)')
        .eq('survey_id', activeSurveyId)
        .order('submitted_at', { ascending: false });
      if (error) throw error;
      return (data || []) as SurveyResponse[];
    },
    enabled: !!activeSurveyId && activeTab === 'responses',
  });

  const activeSurvey = surveys.find((s) => s.id === activeSurveyId) || null;

  useEffect(() => {
    if (!activeSurveyId && surveys.length > 0) {
      setActiveSurveyId(surveys[0].id);
    }
  }, [activeSurveyId, surveys]);

  const openEditor = async (survey?: Survey) => {
    if (!survey) {
      setDraft(emptyDraft());
      setEditorOpen(true);
      setActiveTab('builder');
      return;
    }

    const { data, error } = await supabase
      .from('survey_questions')
      .select('*')
      .eq('survey_id', survey.id)
      .order('position', { ascending: true });

    if (error) {
      toast.error(error.message);
      return;
    }

    setDraft(normalizeSurvey(survey, (data || []) as SurveyQuestion[]));
    setActiveSurveyId(survey.id);
    setEditorOpen(true);
    setActiveTab('builder');
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedYear) throw new Error('Academic year is missing');
      const cleanQuestions = draft.questions.filter((q) => q.label.trim());
      const invalidChoiceQuestion = cleanQuestions.find((q) => isChoiceQuestion(q.type) && q.choicesText.split('\n').map((c) => c.trim()).filter(Boolean).length < 2);
      const invalidChoiceLimit = cleanQuestions.find((q) => {
        if (!isChoiceQuestion(q.type)) return false;
        const choices = q.choicesText.split('\n').map((c) => c.trim()).filter(Boolean);
        const limits = getChoiceLimits(q, choices);
        return limits.some((limit) => limit !== null && limit <= 0);
      });
      const invalidRatingQuestion = cleanQuestions.find((q) => q.type === 'rating' && q.min >= q.max);
      if (!draft.title.trim()) throw new Error('タイトルを入力してください');
      if (cleanQuestions.length === 0) throw new Error('質問を1つ以上作成してください');

      if (invalidChoiceQuestion) throw new Error('選択式の質問には選択肢を2つ以上入力してください');
      if (invalidChoiceLimit) throw new Error('選択肢の上限は1以上の数値で入力してください（空欄は無制限）');
      if (invalidRatingQuestion) throw new Error('評価の最小値は最大値より小さくしてください');

      const surveyPayload = {
        academic_year_id: selectedYear.id,
        activity_id: draft.activity_id || null,
        title: draft.title.trim(),
        description: draft.description.trim() || null,
        status: draft.status,
        response_mode: draft.response_mode,
        target_config: draft.target_config,
        created_by: currentUser?.id || null,
        updated_at: new Date().toISOString(),
      };

      let surveyId = draft.id;
      if (surveyId) {
        const { error } = await supabase.from('surveys').update(surveyPayload).eq('id', surveyId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('surveys').insert(surveyPayload).select('id').single();
        if (error) throw error;
        surveyId = data.id;
      }

      const existingIds = cleanQuestions.map((q) => q.id).filter(Boolean);
      if (surveyId && draft.id) {
        const staleIds = activeQuestions.map((q) => q.id).filter((id) => !existingIds.includes(id));
        if (staleIds.length > 0) {
          const { error } = await supabase.from('survey_questions').delete().in('id', staleIds);
          if (error) throw error;
        }
      }

      for (const [position, q] of cleanQuestions.entries()) {
        const questionPayload = {
          survey_id: surveyId,
          position,
          type: q.type,
          label: q.label.trim(),
          description: q.description.trim() || null,
          required: q.required,
          options: isChoiceQuestion(q.type)
            ? (() => {
              const choices = q.choicesText.split('\n').map((c) => c.trim()).filter(Boolean);
              const choice_limits = getChoiceLimits(q, choices);
              return { choices, choice_limits };
            })()
            : q.type === 'rating'
              ? { min: q.min, max: q.max }
              : {},
        };

        if (q.id) {
          const { error } = await supabase.from('survey_questions').update(questionPayload).eq('id', q.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from('survey_questions').insert(questionPayload);
          if (error) throw error;
        }
      }

      return surveyId;
    },
    onSuccess: (surveyId) => {
      toast.success('アンケートを保存しました');
      setEditorOpen(false);
      setActiveSurveyId(surveyId || null);
      queryClient.invalidateQueries({ queryKey: ['admin-surveys'] });
      queryClient.invalidateQueries({ queryKey: ['admin-survey-questions'] });
      queryClient.invalidateQueries({ queryKey: ['activity-surveys'] });
      queryClient.invalidateQueries({ queryKey: ['activity-detail-surveys'] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (surveyId: string) => {
      const { error } = await supabase.from('surveys').delete().eq('id', surveyId);
      if (error) throw error;
    },
    onSuccess: (_, deletedSurveyId) => {
      toast.success('アンケートを削除しました');
      const nextSurvey = surveys.find((item) => item.id !== deletedSurveyId) || null;
      setActiveSurveyId(nextSurvey?.id || null);
      setActiveTab('builder');
      queryClient.invalidateQueries({ queryKey: ['admin-surveys'] });
      queryClient.invalidateQueries({ queryKey: ['admin-survey-questions'] });
      queryClient.invalidateQueries({ queryKey: ['admin-survey-responses'] });
      queryClient.invalidateQueries({ queryKey: ['activity-surveys'] });
      queryClient.invalidateQueries({ queryKey: ['activity-detail-surveys'] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleDeleteSurvey = (survey: Survey) => {
    if (deleteMutation.isPending) return;
    const confirmed = window.confirm(`「${survey.title}」を削除しますか？\nこの操作は元に戻せません。`);
    if (!confirmed) return;
    deleteMutation.mutate(survey.id);
  };

  const exportResponses = () => {
    if (!activeSurvey) return;
    const answerByResponse = new Map<string, Record<string, unknown>>();
    responses.forEach((response) => {
      const values: Record<string, unknown> = {};
      response.survey_answers?.forEach((answer) => {
        values[answer.question_id] = answer.value;
      });
      answerByResponse.set(response.id, values);
    });

    const headers = ['No', '氏名', 'フリガナ', '学籍番号', '大学メール', '送信日時', ...activeQuestions.map((q) => q.label)];
    const rows = responses.map((response, idx) => {
      const answers = answerByResponse.get(response.id) || {};
      return [
        idx + 1,
        response.users?.full_name || '',
        response.users?.full_name_kana || '',
        response.users?.mssv || '',
        response.users?.university_email || '',
        format(new Date(response.submitted_at), 'yyyy-MM-dd HH:mm'),
        ...activeQuestions.map((q) => formatAnswerValue(answers[q.id])),
      ];
    });

    const ws = XLSX.utils.aoa_to_sheet([
      [`アンケート：${activeSurvey.title}`],
      [`エクスポート日時：${format(new Date(), 'yyyy-MM-dd HH:mm:ss')}`],
      [''],
      headers,
      ...rows,
    ]);
    ws['!cols'] = headers.map(() => ({ wch: 24 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Survey Responses');
    const safeTitle = activeSurvey.title.replace(/[/\\?%*:|"<>]/g, '-').substring(0, 50);
    XLSX.writeFile(wb, `${safeTitle}_responses_${format(new Date(), 'yyyyMMdd')}.xlsx`);
    toast.success('Excelをエクスポートしました');
  };

  const updateQuestion = (idx: number, patch: Partial<SurveyDraft['questions'][number]>) => {
    setDraft((prev) => ({
      ...prev,
      questions: prev.questions.map((q, i) => (i === idx ? { ...q, ...patch } : q)),
    }));
  };

  const toggleRole = (role: string) => {
    setDraft((prev) => {
      const roles = prev.target_config.roles.includes(role)
        ? prev.target_config.roles.filter((r) => r !== role)
        : [...prev.target_config.roles, role];
      return { ...prev, target_config: { ...prev.target_config, roles } };
    });
  };

  const toggleYear = (year: number) => {
    setDraft((prev) => {
      const years = prev.target_config.years.includes(year)
        ? prev.target_config.years.filter((y) => y !== year)
        : [...prev.target_config.years, year];
      return { ...prev, target_config: { ...prev.target_config, years } };
    });
  };

  const responseCountBySurvey = useMemo(() => {
    return new Map<string, number>();
  }, []);

  const getQuestionTypeLabel = (type: SurveyQuestion['type']) => {
    return SURVEY_QUESTION_TYPES.find((item) => item.value === type)?.label || type;
  };

  const getChoices = (question: SurveyDraft['questions'][number]) => {
    return question.choicesText.split('\n').map((choice) => choice.trim()).filter(Boolean);
  };

  const getChoiceLimits = (question: SurveyDraft['questions'][number], choices: string[]) => {
    const source = question.choiceLimitsText.split('\n');
    return choices.map((_, idx) => {
      const raw = (source[idx] || '').trim();
      if (!raw) return null;
      const value = Number(raw);
      if (!Number.isFinite(value) || value <= 0) return null;
      return Math.floor(value);
    });
  };

  const setChoiceAt = (questionIndex: number, choiceIndex: number, value: string) => {
    const source = draft.questions[questionIndex].choicesText.split('\n');
    source[choiceIndex] = value;
    updateQuestion(questionIndex, { choicesText: source.join('\n') });
  };

  const setChoiceLimitAt = (questionIndex: number, choiceIndex: number, value: string) => {
    const source = draft.questions[questionIndex].choiceLimitsText.split('\n');
    source[choiceIndex] = value;
    updateQuestion(questionIndex, { choiceLimitsText: source.join('\n') });
  };

  const addChoice = (questionIndex: number) => {
    const choiceSource = draft.questions[questionIndex].choicesText.split('\n');
    const limitSource = draft.questions[questionIndex].choiceLimitsText.split('\n');
    choiceSource.push('');
    limitSource.push('');
    updateQuestion(questionIndex, { choicesText: choiceSource.join('\n'), choiceLimitsText: limitSource.join('\n') });
  };

  const removeChoice = (questionIndex: number, choiceIndex: number) => {
    const choiceSource = draft.questions[questionIndex].choicesText.split('\n');
    const limitSource = draft.questions[questionIndex].choiceLimitsText.split('\n');
    updateQuestion(questionIndex, {
      choicesText: choiceSource.filter((_, idx) => idx !== choiceIndex).join('\n'),
      choiceLimitsText: limitSource.filter((_, idx) => idx !== choiceIndex).join('\n'),
    });
  };

  const setActivityTarget = (activityId: string) => {
    setDraft((prev) => ({
      ...prev,
      activity_id: activityId,
      target_config: {
        ...prev.target_config,
        require_activity_registration: activityId ? prev.target_config.require_activity_registration : false,
      },
    }));
  };

  const audienceSummary = useMemo(() => {
    const parts: string[] = [];
    const activity = activities.find((item: any) => item.id === draft.activity_id);
    if (activity) parts.push(`活動: ${activity.title}`);
    if (draft.target_config.require_activity_registration) parts.push('活動申込者のみ');
    if (draft.target_config.roles.length) {
      const labels = draft.target_config.roles.map((role) => SURVEY_ROLE_OPTIONS.find((item) => item.value === role)?.label || role);
      parts.push(`役割: ${labels.join('、')}`);
    }
    if (draft.target_config.years.length) {
      const labels = draft.target_config.years.map((year) => SURVEY_YEAR_OPTIONS.find((item) => item.value === year)?.label || `${year}`);
      parts.push(`学年: ${labels.join('、')}`);
    }
    return parts.length ? parts.join(' / ') : '現在の年度のアクティブメンバー全員';
  }, [activities, draft.activity_id, draft.target_config.require_activity_registration, draft.target_config.roles, draft.target_config.years]);

  const renderQuestionPreview = (question: SurveyDraft['questions'][number]) => {
    const choices = getChoices(question);
    if (question.type === 'short_text') {
      return <div className="h-12 px-4 rounded-xl bg-stone-50 border border-stone-200 flex items-center text-stone-300 font-bold">短い回答</div>;
    }
    if (question.type === 'long_text') {
      return <div className="h-24 p-4 rounded-xl bg-stone-50 border border-stone-200 text-stone-300 font-bold">長い回答</div>;
    }
    if (question.type === 'date') {
      return <div className="h-12 px-4 rounded-xl bg-stone-50 border border-stone-200 flex items-center text-stone-400 font-bold">yyyy/mm/dd</div>;
    }
    if (question.type === 'time') {
      return <div className="h-12 px-4 rounded-xl bg-stone-50 border border-stone-200 flex items-center text-stone-400 font-bold">--:--</div>;
    }
    if (question.type === 'rating') {
      const length = Math.max(0, question.max - question.min + 1);
      return (
        <div className="flex flex-wrap gap-2">
          {Array.from({ length }, (_, i) => question.min + i).slice(0, 10).map((num) => (
            <span key={num} className="w-10 h-10 rounded-xl bg-stone-50 border border-stone-200 text-stone-500 font-black flex items-center justify-center">{num}</span>
          ))}
        </div>
      );
    }
    return (
      <div className="space-y-2">
        {(choices.length ? choices : ['選択肢 1', '選択肢 2']).map((choice, idx) => (
          <div key={`${choice}-${idx}`} className="h-11 px-4 rounded-xl bg-stone-50 border border-stone-200 text-stone-600 font-bold flex items-center gap-3">
            <span className={cn("w-4 h-4 border-2 border-stone-300", question.type === 'multiple_choice' ? "rounded" : "rounded-full")} />
            {choice}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-full space-y-8 pb-16">
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-1.5 h-12 rounded-full bg-gradient-to-b from-[#4F5BD5] to-[#D62976]" />
          <div>
            <h1 className="text-[34px] lg:text-[48px] font-black text-stone-900 tracking-tighter leading-none">アンケート</h1>
            <p className="text-[12px] font-black uppercase tracking-[0.3em] text-stone-400 mt-2">Survey Builder</p>
          </div>
        </div>
        <button
          onClick={() => openEditor()}
          className="h-14 px-8 bg-[#4F5BD5] text-white rounded-[1.5rem] font-black text-[13px] tracking-widest shadow-xl shadow-indigo-200 flex items-center gap-3 active:scale-95 transition-all"
        >
          <Plus className="w-5 h-5" />
          新規作成
        </button>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-[390px_1fr] gap-6">
        <section className="bg-white border border-stone-100 rounded-[2rem] shadow-xl shadow-stone-200/20 overflow-hidden">
          <div className="p-5 border-b border-stone-100 flex items-center justify-between">
            <span className="text-[13px] font-black text-stone-800 tracking-widest">フォーム一覧</span>
            <span className="text-[12px] font-black text-[#4F5BD5]">{surveys.length}件</span>
          </div>
          <div className="max-h-[70vh] overflow-y-auto custom-scrollbar p-3 space-y-3">
            {isLoading ? (
              <div className="py-24 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-[#4F5BD5]" /></div>
            ) : surveys.length === 0 ? (
              <div className="py-20 text-center text-stone-300 font-black text-[12px] tracking-widest">まだアンケートがありません</div>
            ) : (
              surveys.map((survey) => (
                <button
                  key={survey.id}
                  onClick={() => { setActiveSurveyId(survey.id); setActiveTab('builder'); }}
                  className={cn(
                    "w-full text-left p-5 rounded-[1.5rem] border transition-all",
                    activeSurveyId === survey.id
                      ? "bg-[#4F5BD5] text-white border-[#4F5BD5] shadow-lg shadow-indigo-200"
                      : "bg-stone-50/60 text-stone-700 border-stone-100 hover:bg-white hover:border-stone-300"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-black text-[15px] leading-tight truncate">{survey.title}</p>
                      <p className={cn("text-[11px] font-bold mt-2 truncate", activeSurveyId === survey.id ? "text-white/70" : "text-stone-400")}>
                        {survey.activities?.title || '独立フォーム'}
                      </p>
                    </div>
                    <span className={cn(
                      "px-2 py-1 rounded-lg text-[10px] font-black shrink-0",
                      survey.status === 'open' ? "bg-emerald-100 text-emerald-600" :
                        survey.status === 'closed' ? "bg-rose-100 text-rose-500" : "bg-stone-200 text-stone-500"
                    )}>
                      {STATUS_LABELS[survey.status]}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="bg-white border border-stone-100 rounded-[2rem] shadow-xl shadow-stone-200/20 min-h-[620px] overflow-hidden">
          {!activeSurvey ? (
            <div className="h-full min-h-[620px] flex flex-col items-center justify-center text-center p-8">
              <FileQuestion className="w-16 h-16 text-stone-100 mb-4" />
              <p className="text-stone-300 font-black tracking-widest">アンケートを選択してください</p>
            </div>
          ) : (
            <>
              <div className="p-6 border-b border-stone-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-black text-stone-900 tracking-tight">{activeSurvey.title}</h2>
                  <p className="text-[12px] font-bold text-stone-400 mt-1">{RESPONSE_MODE_LABELS[activeSurvey.response_mode]}</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button onClick={() => openEditor(activeSurvey)} className="h-11 px-5 rounded-xl bg-stone-900 text-white font-black text-[12px] flex items-center gap-2">
                    <Settings2 className="w-4 h-4" /> 編集
                  </button>
                  <button onClick={() => setActiveTab('responses')} className="h-11 px-5 rounded-xl bg-[#D62976] text-white font-black text-[12px] flex items-center gap-2">
                    <BarChart3 className="w-4 h-4" /> 回答
                  </button>
                  <button
                    onClick={() => handleDeleteSurvey(activeSurvey)}
                    disabled={deleteMutation.isPending}
                    className="h-11 px-5 rounded-xl bg-rose-50 text-rose-600 font-black text-[12px] flex items-center gap-2 disabled:opacity-50"
                  >
                    {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} 削除
                  </button>
                </div>
              </div>

              <div className="px-6 pt-5 flex gap-2">
                {(['builder', 'responses'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={cn(
                      "px-5 py-2 rounded-xl text-[12px] font-black transition-all",
                      activeTab === tab ? "bg-[#4F5BD5] text-white" : "bg-stone-50 text-stone-500"
                    )}
                  >
                    {tab === 'builder' ? 'プレビュー' : `回答 (${responseCountBySurvey.get(activeSurvey.id) || responses.length})`}
                  </button>
                ))}
              </div>

              {activeTab === 'builder' ? (
                <div className="p-6 lg:p-8 space-y-5">
                  <div className="p-6 rounded-[1.5rem] bg-gradient-to-br from-stone-900 to-stone-700 text-white">
                    <p className="text-[11px] font-black tracking-[0.3em] uppercase text-white/50 mb-2">{STATUS_LABELS[activeSurvey.status]}</p>
                    <h3 className="text-3xl font-black tracking-tight">{activeSurvey.title}</h3>
                    {activeSurvey.description && <p className="text-sm text-white/70 mt-3 whitespace-pre-wrap">{activeSurvey.description}</p>}
                  </div>
                  {activeQuestions.map((question, idx) => (
                    <div key={question.id} className="p-6 rounded-[1.5rem] border border-stone-100 bg-stone-50/40">
                      <div className="flex items-start gap-3">
                        <span className="w-8 h-8 rounded-xl bg-white border border-stone-100 flex items-center justify-center text-[12px] font-black text-[#4F5BD5] shrink-0">{idx + 1}</span>
                        <div className="flex-1">
                          <p className="font-black text-stone-900">{question.label} {question.required && <span className="text-[#D62976]">*</span>}</p>
                          {question.description && <p className="text-sm text-stone-400 mt-1">{question.description}</p>}
                          <div className="mt-4 text-sm font-bold text-stone-500">
                            {isChoiceQuestion(question.type) ? (question.options?.choices || []).join(' / ') :
                              question.type === 'rating' ? `${question.options?.min || 1} - ${question.options?.max || 5}` :
                                SURVEY_QUESTION_TYPES.find((t) => t.value === question.type)?.label}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 lg:p-8 space-y-5">
                  <div className="flex justify-end">
                    <button
                      onClick={exportResponses}
                      disabled={responses.length === 0}
                      className="h-11 px-5 rounded-xl bg-emerald-600 text-white font-black text-[12px] flex items-center gap-2 disabled:opacity-30"
                    >
                      <Download className="w-4 h-4" /> Excel
                    </button>
                  </div>
                  {responsesLoading ? (
                    <div className="py-24 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-[#4F5BD5]" /></div>
                  ) : responses.length === 0 ? (
                    <div className="py-24 text-center text-stone-300 font-black tracking-widest">回答はまだありません</div>
                  ) : (
                    <div className="space-y-4">
                      {responses.map((response, idx) => {
                        const answers = new Map(response.survey_answers?.map((answer) => [answer.question_id, answer.value]));
                        return (
                          <div key={response.id} className="p-5 rounded-[1.5rem] border border-stone-100 bg-white shadow-sm">
                            <div className="flex items-center justify-between gap-4 mb-4">
                              <div>
                                <p className="font-black text-stone-900">{idx + 1}. {response.users?.full_name || 'Unknown'}</p>
                                <p className="text-[12px] font-bold text-stone-400">{response.users?.mssv || '-'} / {format(new Date(response.submitted_at), 'yyyy/MM/dd HH:mm')}</p>
                              </div>
                              <Eye className="w-5 h-5 text-stone-300" />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {activeQuestions.map((question) => (
                                <div key={question.id} className="p-3 rounded-xl bg-stone-50">
                                  <p className="text-[11px] font-black text-stone-400 mb-1">{question.label}</p>
                                  <p className="text-[13px] font-bold text-stone-800 break-words">{formatAnswerValue(answers.get(question.id))}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      </div>

      <AnimatePresence>
        {editorOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-stone-900/60 backdrop-blur-xl" />
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 20 }}
              className="relative bg-white w-full max-w-5xl max-h-[92vh] overflow-y-auto rounded-[2.5rem] shadow-2xl p-6 lg:p-8 custom-scrollbar"
            >
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-3xl font-black text-stone-900 tracking-tight">{draft.id ? 'アンケート編集' : 'アンケート作成'}</h2>
                <button onClick={() => setEditorOpen(false)} className="w-11 h-11 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-[1fr_330px] gap-8">
                <div className="space-y-6">
                  <div className="p-6 rounded-[2rem] bg-stone-50 border border-stone-100 space-y-4">
                    <input
                      value={draft.title}
                      onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                      placeholder="アンケートタイトル"
                      className="w-full h-14 px-5 bg-white border border-stone-200 rounded-2xl font-black text-stone-900 outline-none focus:border-[#4F5BD5]"
                    />
                    <textarea
                      value={draft.description}
                      onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                      placeholder="説明文"
                      className="w-full min-h-28 p-5 bg-white border border-stone-200 rounded-2xl font-bold text-stone-800 outline-none focus:border-[#4F5BD5] resize-none"
                    />
                  </div>

                  {draft.questions.map((question, idx) => (
                    <div key={idx} className="p-6 rounded-[2rem] bg-white border border-stone-200 shadow-sm space-y-4">
                      <div className="flex items-center gap-3">
                        <span className="w-9 h-9 rounded-xl bg-[#4F5BD5]/10 text-[#4F5BD5] flex items-center justify-center font-black">{idx + 1}</span>
                        <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {SURVEY_QUESTION_TYPES.map((type) => (
                            <button
                              key={type.value}
                              type="button"
                              onClick={() => updateQuestion(idx, { type: type.value })}
                              className={cn(
                                "h-10 rounded-xl border text-[11px] font-black transition-all",
                                question.type === type.value
                                  ? "bg-[#4F5BD5] border-[#4F5BD5] text-white shadow-lg shadow-indigo-100"
                                  : "bg-stone-50 border-stone-100 text-stone-500 hover:border-[#4F5BD5]/40"
                              )}
                            >
                              {type.label}
                            </button>
                          ))}
                        </div>
                        <button
                          onClick={() => setDraft((prev) => ({ ...prev, questions: prev.questions.filter((_, i) => i !== idx) }))}
                          disabled={draft.questions.length === 1}
                          className="w-10 h-10 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center disabled:opacity-30 shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <input
                        value={question.label}
                        onChange={(e) => updateQuestion(idx, { label: e.target.value })}
                        placeholder="質問タイトル"
                        className="w-full h-12 px-4 bg-stone-50 border border-stone-200 rounded-xl font-black text-stone-900 outline-none focus:border-[#D62976]"
                      />
                      <input
                        value={question.description}
                        onChange={(e) => updateQuestion(idx, { description: e.target.value })}
                        placeholder="補足説明（任意）"
                        className="w-full h-11 px-4 bg-white border border-stone-100 rounded-xl font-bold text-stone-700 outline-none"
                      />
                      {isChoiceQuestion(question.type) && (
                        <div
                          className="space-y-3"
                        >
                          <div className="flex items-center justify-between">
                            <p className="text-[12px] font-black text-stone-500 tracking-widest">選択肢</p>
                            <button type="button" onClick={() => addChoice(idx)} className="px-3 py-2 rounded-xl bg-[#4F5BD5]/10 text-[#4F5BD5] text-[11px] font-black flex items-center gap-1">
                              <Plus className="w-3 h-3" /> 追加
                            </button>
                          </div>
                          {question.choicesText.split('\n').map((choice, choiceIdx) => (
                            <div key={choiceIdx} className="flex items-center gap-2">
                              <span className={cn("w-4 h-4 border-2 border-stone-300 shrink-0", question.type === 'multiple_choice' ? "rounded" : "rounded-full")} />
                              <input
                                value={choice}
                                onChange={(e) => setChoiceAt(idx, choiceIdx, e.target.value)}
                                placeholder={`選択肢 ${choiceIdx + 1}`}
                                className="flex-1 h-11 px-4 bg-stone-50 border border-stone-200 rounded-xl font-bold text-stone-900 placeholder:text-stone-400 outline-none focus:border-[#4F5BD5]"
                              />
                              <input
                                value={question.choiceLimitsText.split('\n')[choiceIdx] || ''}
                                onChange={(e) => setChoiceLimitAt(idx, choiceIdx, e.target.value.replace(/[^\d]/g, ''))}
                                placeholder="上限なし"
                                className="w-24 h-11 px-3 bg-white border border-stone-200 rounded-xl text-[12px] font-black text-stone-700 placeholder:text-stone-400 outline-none focus:border-[#4F5BD5]"
                              />
                              <button type="button" onClick={() => removeChoice(idx, choiceIdx)} disabled={question.choicesText.split('\n').length <= 1} className="w-9 h-9 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center disabled:opacity-30">
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                          <p className="text-[11px] font-bold text-stone-400">上限を空欄にすると無制限（回答側には表示されません）</p>
                        </div>
                      )}
                      {question.type === 'rating' && (
                        <div className="grid grid-cols-2 gap-4">
                          <input type="number" value={question.min} onChange={(e) => updateQuestion(idx, { min: Number(e.target.value) })} className="h-11 px-4 bg-stone-50 border border-stone-200 rounded-xl font-bold" />
                          <input type="number" value={question.max} onChange={(e) => updateQuestion(idx, { max: Number(e.target.value) })} className="h-11 px-4 bg-stone-50 border border-stone-200 rounded-xl font-bold" />
                        </div>
                      )}
                      <label className="inline-flex items-center gap-3 text-[13px] font-black text-stone-600">
                        <input type="checkbox" checked={question.required} onChange={(e) => updateQuestion(idx, { required: e.target.checked })} />
                        必須
                      </label>
                      <div className="p-4 rounded-2xl bg-stone-50/70 border border-stone-100">
                        <p className="text-[11px] font-black text-stone-400 tracking-widest mb-3">プレビュー / {getQuestionTypeLabel(question.type)}</p>
                        {renderQuestionPreview(question)}
                      </div>
                    </div>
                  ))}

                  <button
                    onClick={() => setDraft((prev) => ({ ...prev, questions: [...prev.questions, emptyQuestion()] }))}
                    className="w-full h-14 rounded-[1.5rem] border-2 border-dashed border-stone-300 text-stone-500 font-black flex items-center justify-center gap-2"
                  >
                    <Plus className="w-5 h-5" /> 質問を追加
                  </button>
                </div>

                <aside className="space-y-5">
                  <div className="p-5 rounded-[1.5rem] bg-stone-900 text-white space-y-4">
                    <label className="block text-[11px] font-black tracking-widest text-white/50">ステータス</label>
                    <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as Survey['status'] })} className="w-full h-11 px-3 rounded-xl bg-white text-stone-900 font-bold">
                      <option value="draft">下書き</option>
                      <option value="open">受付中</option>
                      <option value="closed">終了</option>
                    </select>
                    <label className="block text-[11px] font-black tracking-widest text-white/50">回答モード</label>
                    <select value={draft.response_mode} onChange={(e) => setDraft({ ...draft, response_mode: e.target.value as Survey['response_mode'] })} className="w-full h-11 px-3 rounded-xl bg-white text-stone-900 font-bold">
                      <option value="single_editable">1回・編集可</option>
                      <option value="single_locked">1回・ロック</option>
                      <option value="multiple">複数回答可</option>
                    </select>
                  </div>

                  <div className="p-5 rounded-[1.5rem] bg-white border border-stone-100 shadow-sm space-y-4">
                    <div className="p-4 rounded-2xl bg-gradient-to-r from-[#D62976]/10 to-[#4F5BD5]/10 border border-indigo-100">
                      <p className="text-[11px] font-black text-[#4F5BD5] tracking-widest mb-2">回答対象</p>
                      <p className="text-[13px] font-black text-stone-800 leading-relaxed">{audienceSummary}</p>
                    </div>
                    <label className="block text-[12px] font-black text-stone-700">対象活動</label>
                    <select value={draft.activity_id} onChange={(e) => setActivityTarget(e.target.value)} className="w-full h-11 px-3 rounded-xl bg-stone-50 border border-stone-200 font-bold">
                      <option value="">活動に紐づけない</option>
                      {activities.map((activity: any) => <option key={activity.id} value={activity.id}>{activity.title}</option>)}
                    </select>
                    <label className="flex items-center gap-3 text-[12px] font-black text-stone-600">
                      <input
                        type="checkbox"
                        checked={draft.target_config.require_activity_registration}
                        onChange={(e) => setDraft((prev) => ({ ...prev, target_config: { ...prev.target_config, require_activity_registration: e.target.checked } }))}
                        disabled={!draft.activity_id}
                      />
                      活動申込者のみ
                    </label>
                  </div>

                  <div className="p-5 rounded-[1.5rem] bg-white border border-stone-100 shadow-sm space-y-4">
                    <label className="block text-[12px] font-black text-stone-700">役割</label>
                    <div className="flex flex-wrap gap-2">
                      {SURVEY_ROLE_OPTIONS.map((role) => (
                        <button type="button" key={role.value} onClick={() => toggleRole(role.value)} className={cn("px-3 py-2 rounded-xl text-[11px] font-black border transition-all", draft.target_config.roles.includes(role.value) ? "bg-[#4F5BD5] text-white border-[#4F5BD5]" : "bg-stone-50 text-stone-500 border-stone-100")}>{role.label}</button>
                      ))}
                    </div>
                    <label className="block text-[12px] font-black text-stone-700">学年</label>
                    <div className="flex flex-wrap gap-2">
                      {SURVEY_YEAR_OPTIONS.map((year) => (
                        <button type="button" key={year.value} onClick={() => toggleYear(year.value)} className={cn("px-3 py-2 rounded-xl text-[11px] font-black border transition-all", draft.target_config.years.includes(year.value) ? "bg-[#D62976] text-white border-[#D62976]" : "bg-stone-50 text-stone-500 border-stone-100")}>{year.label}</button>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending}
                    className="w-full h-14 rounded-[1.5rem] bg-[#4F5BD5] text-white font-black tracking-widest flex items-center justify-center gap-3 shadow-xl shadow-indigo-200 disabled:opacity-50"
                  >
                    {saveMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                    保存
                  </button>
                </aside>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
