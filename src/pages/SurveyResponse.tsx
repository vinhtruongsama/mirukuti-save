import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { AlertCircle, ArrowLeft, CheckCircle2, ClipboardList, Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/useAuthStore';
import { cn } from '../lib/utils';
import { RESPONSE_MODE_LABELS, formatAnswerValue } from '../lib/surveys';
import type { Survey, SurveyAnswer, SurveyQuestion, SurveyResponse as SurveyResponseType } from '../types/survey';

type AnswerMap = Record<string, unknown>;

const initialValueForQuestion = (question: SurveyQuestion) => {
  if (question.type === 'multiple_choice') return [];
  if (question.type === 'rating') return question.options?.min || 1;
  return '';
};

const isEmptyAnswer = (value: unknown) => {
  if (Array.isArray(value)) return value.length === 0;
  return value === undefined || value === null || value === '';
};

export default function SurveyResponse() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const { currentUser } = useAuthStore();
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [optionCounts, setOptionCounts] = useState<Record<string, number>>({});

  const { data, isLoading, isError } = useQuery({
    queryKey: ['survey-response', id, currentUser?.id],
    queryFn: async () => {
      if (!id || !currentUser) return null;

      const { data: survey, error: surveyError } = await supabase
        .from('surveys')
        .select('*, activities(id, title, date, location)')
        .eq('id', id)
        .single();
      if (surveyError) throw surveyError;

      const { data: questions, error: questionError } = await supabase
        .from('survey_questions')
        .select('*')
        .eq('survey_id', id)
        .order('position', { ascending: true });
      if (questionError) throw questionError;

      const { data: responses, error: responseError } = await supabase
        .from('survey_responses')
        .select('*, survey_answers(*)')
        .eq('survey_id', id)
        .eq('user_id', currentUser.id)
        .order('submitted_at', { ascending: false });
      if (responseError) throw responseError;

      const { data: countRows, error: countError } = await supabase.rpc('get_survey_option_counts', { survey_uuid: id });
      if (countError) throw countError;
      const counts: Record<string, number> = {};
      (countRows || []).forEach((row: any) => {
        counts[`${row.question_id}::${row.option_value}`] = Number(row.selected_count || 0);
      });
      setOptionCounts(counts);

      const latestResponse = (responses || [])[0] as SurveyResponseType | undefined;
      const seededAnswers: AnswerMap = {};
      (questions || []).forEach((q: SurveyQuestion) => {
        seededAnswers[q.id] = initialValueForQuestion(q);
      });
      latestResponse?.survey_answers?.forEach((answer: SurveyAnswer) => {
        seededAnswers[answer.question_id] = answer.value;
      });
      setAnswers(seededAnswers);

      return {
        survey: survey as Survey,
        questions: (questions || []) as SurveyQuestion[],
        responses: (responses || []) as SurveyResponseType[],
        latestResponse,
      };
    },
    enabled: !!id && !!currentUser,
  });

  const survey = data?.survey;
  const questions = data?.questions || [];
  const latestResponse = data?.latestResponse;
  const isLocked = !!latestResponse && survey?.response_mode === 'single_locked';
  const canEditExisting = !!latestResponse && survey?.response_mode === 'single_editable';
  const canSubmit = survey?.status === 'open' && !isLocked;

  const missingRequired = useMemo(() => {
    return questions.filter((q) => q.required && isEmptyAnswer(answers[q.id]));
  }, [questions, answers]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!survey || !currentUser) throw new Error('Unauthorized');
      if (!canSubmit) throw new Error('このアンケートは送信できません');
      if (missingRequired.length > 0) throw new Error('必須項目を入力してください');

      let responseId = latestResponse?.id;

      if (canEditExisting && responseId) {
        const { error } = await supabase
          .from('survey_responses')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', responseId);
        if (error) throw error;
      } else {
        const { data: inserted, error } = await supabase
          .from('survey_responses')
          .insert({
            survey_id: survey.id,
            user_id: currentUser.id,
            submitted_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .select('id')
          .single();
        if (error) throw error;
        responseId = inserted.id;
      }

      for (const question of questions) {
        const payload = {
          response_id: responseId,
          question_id: question.id,
          value: answers[question.id] ?? null,
          updated_at: new Date().toISOString(),
        };

        if (canEditExisting) {
          const { error } = await supabase
            .from('survey_answers')
            .upsert(payload, { onConflict: 'response_id,question_id' });
          if (error) throw error;
        } else {
          const { error } = await supabase.from('survey_answers').insert(payload);
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      toast.success('アンケートを送信しました');
      queryClient.invalidateQueries({ queryKey: ['survey-response', id] });
      queryClient.invalidateQueries({ queryKey: ['activity-surveys'] });
      queryClient.invalidateQueries({ queryKey: ['activity-detail-surveys'] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const setAnswer = (questionId: string, value: unknown) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const toggleMultiChoice = (questionId: string, choice: string) => {
    const current = Array.isArray(answers[questionId]) ? answers[questionId] as string[] : [];
    setAnswer(questionId, current.includes(choice) ? current.filter((item) => item !== choice) : [...current, choice]);
  };

  const getLimitForChoice = (question: SurveyQuestion, idx: number) => {
    const raw = question.options?.choice_limits?.[idx];
    return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : null;
  };

  const getCountForChoice = (questionId: string, choice: string) => optionCounts[`${questionId}::${choice}`] || 0;

  const renderQuestion = (question: SurveyQuestion, idx: number) => {
    const value = answers[question.id];
    const disabled = !canSubmit || submitMutation.isPending;

    return (
      <div key={question.id} className="p-5 sm:p-7 bg-white border border-stone-100 rounded-[2rem] shadow-xl shadow-stone-200/20">
        <div className="flex items-start gap-4 mb-5">
          <span className="w-9 h-9 rounded-xl bg-[#4F5BD5]/10 text-[#4F5BD5] flex items-center justify-center font-black shrink-0">{idx + 1}</span>
          <div className="min-w-0">
            <h3 className="text-lg sm:text-xl font-black text-stone-900 leading-tight">
              {question.label} {question.required && <span className="text-[#D62976]">*</span>}
            </h3>
            {question.description && <p className="text-sm font-bold text-stone-400 mt-2">{question.description}</p>}
          </div>
        </div>

        {question.type === 'short_text' && (
          <input disabled={disabled} value={String(value || '')} onChange={(e) => setAnswer(question.id, e.target.value)} className="w-full h-13 px-5 py-4 bg-stone-50 border border-stone-200 rounded-2xl font-bold outline-none focus:border-[#4F5BD5] disabled:opacity-60" />
        )}
        {question.type === 'long_text' && (
          <textarea disabled={disabled} value={String(value || '')} onChange={(e) => setAnswer(question.id, e.target.value)} className="w-full min-h-36 p-5 bg-stone-50 border border-stone-200 rounded-2xl font-bold outline-none resize-none focus:border-[#4F5BD5] disabled:opacity-60" />
        )}
        {question.type === 'single_choice' && (
          <div className="space-y-3">
            {(question.options?.choices || []).map((choice, choiceIdx) => {
              const selected = value === choice;
              const limit = getLimitForChoice(question, choiceIdx);
              const count = getCountForChoice(question.id, choice);
              const full = limit !== null && count >= limit;
              const blocked = disabled || (full && !selected);
              return (
                <button key={choice} disabled={blocked} onClick={() => setAnswer(question.id, choice)} className={cn("w-full p-4 rounded-2xl border text-left font-black transition-all", selected ? "bg-[#4F5BD5] border-[#4F5BD5] text-white" : "bg-stone-50 border-stone-200 text-stone-700", blocked && !selected ? "opacity-50 cursor-not-allowed" : "")}>
                  <span className="flex items-center justify-between gap-3">
                    <span>{choice}</span>
                    {limit !== null ? <span className={cn("text-[12px] font-black", selected ? "text-white/90" : full ? "text-rose-500" : "text-stone-400")}>{count}/{limit}</span> : null}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {question.type === 'multiple_choice' && (
          <div className="space-y-3">
            {(question.options?.choices || []).map((choice, choiceIdx) => {
              const selected = Array.isArray(value) && value.includes(choice);
              const limit = getLimitForChoice(question, choiceIdx);
              const count = getCountForChoice(question.id, choice);
              const full = limit !== null && count >= limit;
              const blocked = disabled || (full && !selected);
              return (
                <button key={choice} disabled={blocked} onClick={() => toggleMultiChoice(question.id, choice)} className={cn("w-full p-4 rounded-2xl border text-left font-black transition-all flex items-center gap-3", selected ? "bg-[#D62976] border-[#D62976] text-white" : "bg-stone-50 border-stone-200 text-stone-700", blocked && !selected ? "opacity-50 cursor-not-allowed" : "")}>
                  <CheckCircle2 className={cn("w-5 h-5", selected ? "opacity-100" : "opacity-20")} />
                  <span className="flex-1">{choice}</span>
                  {limit !== null ? <span className={cn("text-[12px] font-black", selected ? "text-white/90" : full ? "text-rose-500" : "text-stone-400")}>{count}/{limit}</span> : null}
                </button>
              );
            })}
          </div>
        )}
        {question.type === 'dropdown' && (
          <select disabled={disabled} value={String(value || '')} onChange={(e) => setAnswer(question.id, e.target.value)} className="w-full h-13 px-5 py-4 bg-stone-50 border border-stone-200 rounded-2xl font-black outline-none focus:border-[#4F5BD5]">
            <option value="">選択してください</option>
            {(question.options?.choices || []).map((choice, choiceIdx) => {
              const limit = getLimitForChoice(question, choiceIdx);
              const count = getCountForChoice(question.id, choice);
              const full = limit !== null && count >= limit;
              const selected = value === choice;
              return (
                <option key={choice} value={choice} disabled={full && !selected}>
                  {limit !== null ? `${choice} (${count}/${limit})` : choice}
                </option>
              );
            })}
          </select>
        )}
        {question.type === 'rating' && (
          <div className="flex flex-wrap gap-3">
            {Array.from({ length: (question.options?.max || 5) - (question.options?.min || 1) + 1 }, (_, i) => (question.options?.min || 1) + i).map((num) => (
              <button key={num} disabled={disabled} onClick={() => setAnswer(question.id, num)} className={cn("w-12 h-12 rounded-2xl border font-black transition-all", value === num ? "bg-[#4F5BD5] text-white border-[#4F5BD5] scale-105" : "bg-stone-50 text-stone-500 border-stone-200")}>{num}</button>
            ))}
          </div>
        )}
        {question.type === 'date' && (
          <input type="date" disabled={disabled} value={String(value || '')} onChange={(e) => setAnswer(question.id, e.target.value)} className="w-full h-13 px-5 py-4 bg-stone-50 border border-stone-200 rounded-2xl font-bold outline-none focus:border-[#4F5BD5]" />
        )}
        {question.type === 'time' && (
          <input type="time" disabled={disabled} value={String(value || '')} onChange={(e) => setAnswer(question.id, e.target.value)} className="w-full h-13 px-5 py-4 bg-stone-50 border border-stone-200 rounded-2xl font-bold outline-none focus:border-[#4F5BD5]" />
        )}
      </div>
    );
  };

  if (isLoading) {
    return <div className="min-h-screen bg-[#fafafb] flex items-center justify-center"><Loader2 className="w-9 h-9 animate-spin text-[#4F5BD5]" /></div>;
  }

  if (isError || !survey) {
    return (
      <div className="min-h-screen bg-[#fafafb] flex flex-col items-center justify-center text-center p-6">
        <AlertCircle className="w-16 h-16 text-rose-500 mb-5" />
        <h1 className="text-2xl font-black text-stone-900 mb-3">アンケートを表示できません</h1>
        <p className="text-sm font-bold text-stone-400 mb-8">回答対象外、またはフォームが終了している可能性があります。</p>
        <Link to="/activities" className="px-6 py-3 bg-stone-900 text-white rounded-2xl font-black">活動へ戻る</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fafafb] px-4 sm:px-6 py-8 sm:py-12">
      <div className="max-w-3xl mx-auto">
        <Link to="/activities" className="inline-flex items-center gap-2 px-5 py-3 bg-white border border-stone-100 text-stone-500 rounded-2xl font-black text-[12px] mb-8 shadow-sm">
          <ArrowLeft className="w-4 h-4" />
          活動へ戻る
        </Link>

        <motion.header initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="bg-gradient-to-br from-stone-900 to-stone-700 text-white rounded-[2.5rem] p-7 sm:p-10 mb-7 shadow-2xl shadow-stone-300/40">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center">
              <ClipboardList className="w-6 h-6 text-[#FEDA75]" />
            </div>
            <span className="text-[11px] font-black tracking-[0.3em] uppercase text-white/60">{RESPONSE_MODE_LABELS[survey.response_mode]}</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-black tracking-tight leading-tight">{survey.title}</h1>
          {survey.activities?.title && <p className="mt-4 text-sm font-black text-[#FEDA75]">{survey.activities.title}</p>}
          {survey.description && <p className="mt-5 text-sm sm:text-base text-white/70 font-medium leading-relaxed whitespace-pre-wrap">{survey.description}</p>}
        </motion.header>

        {latestResponse && (
          <div className={cn("mb-7 p-5 rounded-[2rem] border flex items-start gap-4", isLocked ? "bg-amber-50 border-amber-100 text-amber-700" : "bg-emerald-50 border-emerald-100 text-emerald-700")}>
            <CheckCircle2 className="w-6 h-6 shrink-0 mt-0.5" />
            <div>
              <p className="font-black">{isLocked ? '送信済みです' : '送信済み・編集できます'}</p>
              <p className="text-sm font-bold opacity-70 mt-1">{isLocked ? 'このフォームは送信後に編集できません。' : '内容を変更して再送信できます。'}</p>
            </div>
          </div>
        )}

        <div className="space-y-5">
          {questions.map(renderQuestion)}
        </div>

        {isLocked ? (
          <div className="mt-8 p-6 bg-white border border-stone-100 rounded-[2rem] text-center shadow-sm">
            <p className="text-sm font-black text-stone-400">回答内容</p>
            <div className="mt-4 space-y-2">
              {questions.map((question) => (
                <div key={question.id} className="text-left p-4 rounded-xl bg-stone-50">
                  <p className="text-[12px] font-black text-stone-400">{question.label}</p>
                  <p className="font-bold text-stone-800 mt-1">{formatAnswerValue(answers[question.id])}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <button
            onClick={() => submitMutation.mutate()}
            disabled={!canSubmit || submitMutation.isPending || missingRequired.length > 0}
            className="mt-8 w-full h-16 rounded-[2rem] bg-gradient-to-r from-[#D62976] to-[#4F5BD5] text-white font-black tracking-[0.25em] flex items-center justify-center gap-3 shadow-2xl shadow-indigo-200 active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {submitMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            送信
          </button>
        )}
      </div>
    </div>
  );
}
