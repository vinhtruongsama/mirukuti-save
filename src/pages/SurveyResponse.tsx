import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { AlertCircle, ChevronLeft, Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';
import { formatAnswerValue } from '../lib/surveys';
import { useAuthStore } from '../store/useAuthStore';
import type { Survey, SurveyAnswer, SurveyQuestion, SurveyResponse as SurveyResponseType } from '../types/survey';

type AnswerMap = Record<string, unknown>;

const initialValueForQuestion = (question: SurveyQuestion) => {
  if (question.type === 'multiple_choice') return [];
  return '';
};

const isEmptyAnswer = (value: unknown) => {
  if (Array.isArray(value)) return value.length === 0;
  return value === undefined || value === null || value === '';
};

const inputClassName =
  'w-full rounded-[4px] border border-[#f0efed] bg-white px-[15px] py-[10px] text-[14px] leading-[1.45] text-[#202124] outline-none transition focus:border-[#dadce0] disabled:cursor-not-allowed disabled:bg-white disabled:text-[#202124] disabled:opacity-100';

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

  const missingRequired = useMemo(
    () => questions.filter((q) => q.required && isEmptyAnswer(answers[q.id])),
    [questions, answers]
  );

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!survey || !currentUser) throw new Error('Unauthorized');
      if (!canSubmit) throw new Error('このフォームは送信できません');
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
      toast.success('フォームを送信しました');
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
    const current = Array.isArray(answers[questionId]) ? (answers[questionId] as string[]) : [];
    setAnswer(questionId, current.includes(choice) ? current.filter((item) => item !== choice) : [...current, choice]);
  };

  const getLimitForChoice = (question: SurveyQuestion, idx: number) => {
    const raw = question.options?.choice_limits?.[idx];
    return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : null;
  };

  const getCountForChoice = (questionId: string, choice: string) => optionCounts[`${questionId}::${choice}`] || 0;

  const renderChoice = (
    choice: string,
    selected: boolean,
    blocked: boolean,
    onClick: () => void,
    type: 'single' | 'multiple',
    limit: number | null,
    count: number,
  ) => (
    <label
      key={choice}
      className={cn(
        'flex w-full items-center gap-[12px] text-left',
        blocked && !selected ? 'cursor-not-allowed opacity-55' : 'cursor-pointer'
      )}
    >
      <button
        type="button"
        disabled={blocked}
        onClick={onClick}
        className={cn(
          'mt-[1px] shrink-0 border bg-white',
          selected ? 'border-[#d93025]' : 'border-[#b8b8b8]',
          type === 'single' ? 'h-[26px] w-[26px] rounded-full' : 'h-[24px] w-[24px] rounded-[4px]'
        )}
      >
        <span
          className={cn(
            'block mx-auto my-auto',
            type === 'single' ? 'h-[16px] w-[16px] rounded-full' : 'h-[14px] w-[14px] rounded-[2px]',
            selected ? 'bg-[#d93025]' : 'bg-transparent'
          )}
        />
      </button>
      <span className="min-w-0 flex-1 break-words text-[17px] font-normal leading-[1.5] text-[#202124]">
        {choice}
      </span>
      {limit !== null && (
        <span className={cn('shrink-0 text-[12px] font-medium', count >= limit ? 'text-rose-500' : 'text-stone-400')}>
          {count}/{limit}
        </span>
      )}
    </label>
  );

  const renderQuestion = (question: SurveyQuestion, idx: number) => {
    const value = answers[question.id];
    const disabled = !canSubmit || submitMutation.isPending || isLocked;

    return (
      <section key={question.id} className="pb-[58px]">
        <div className="mb-[16px] flex items-start gap-4">
          <div className="min-w-0">
            <h3 className="text-[22px] font-normal leading-[1.55] text-[#202124]">
              <span className="mr-[8px]">{idx + 1}.</span>
              {question.label}
              {question.required && <span className="ml-[8px] text-[#d93025]">*</span>}
            </h3>
            {question.description && (
              <p className="mt-[4px] pl-[34px] whitespace-pre-wrap text-[15px] leading-[1.7] text-[#4e5a68]">
                {question.description}
              </p>
            )}
          </div>
        </div>

        {question.type === 'short_text' && (
          <textarea
            disabled={disabled}
            rows={1}
            value={String(value || '')}
            onChange={(e) => setAnswer(question.id, e.target.value)}
            className={cn(inputClassName, 'min-h-[42px] resize-y')}
          />
        )}

        {question.type === 'number' && (
          <input
            type="number"
            disabled={disabled}
            value={String(value || '')}
            onChange={(e) => setAnswer(question.id, e.target.value)}
            className={cn(inputClassName, 'h-[42px]')}
          />
        )}

        {question.type === 'single_choice' && (
          <div className="space-y-[28px] pt-[6px]">
            {(question.options?.choices || []).map((choice, choiceIdx) => {
              const selected = value === choice;
              const limit = getLimitForChoice(question, choiceIdx);
              const count = getCountForChoice(question.id, choice);
              const full = limit !== null && count >= limit;
              const blocked = disabled || (full && !selected);
              return renderChoice(
                choice,
                selected,
                blocked,
                () => setAnswer(question.id, choice),
                'single',
                limit,
                count,
              );
            })}
          </div>
        )}

        {question.type === 'multiple_choice' && (
          <div className="space-y-[28px] pt-[6px]">
            {(question.options?.choices || []).map((choice, choiceIdx) => {
              const selected = Array.isArray(value) && value.includes(choice);
              const limit = getLimitForChoice(question, choiceIdx);
              const count = getCountForChoice(question.id, choice);
              const full = limit !== null && count >= limit;
              const blocked = disabled || (full && !selected);
              return renderChoice(
                choice,
                selected,
                blocked,
                () => toggleMultiChoice(question.id, choice),
                'multiple',
                limit,
                count,
              );
            })}
          </div>
        )}
      </section>
    );
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(90deg,#ff6a00_0%,#ff9218_64%,#ffbf47_100%)]">
        <Loader2 className="h-10 w-10 animate-spin text-white" />
      </div>
    );
  }

  if (isError || !survey) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[linear-gradient(90deg,#ff6a00_0%,#ff9218_64%,#ffbf47_100%)] p-6 text-center">
        <div className="rounded-[18px] bg-[#f8f2ea] px-8 py-10 shadow-2xl">
          <AlertCircle className="mx-auto mb-5 h-16 w-16 text-rose-500" />
          <h1 className="mb-3 text-2xl font-bold text-stone-900">フォームを表示できません</h1>
          <p className="mb-8 text-sm text-stone-500">回答対象外、またはフォームが終了している可能性があります。</p>
          <Link to="/activities" className="inline-flex rounded-[10px] bg-stone-900 px-6 py-3 font-semibold text-white">
            活動へ戻る
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[linear-gradient(90deg,#ff6a00_0%,#ff9218_64%,#ffbf47_100%)]">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-[220px] top-[210px] h-[700px] w-[420px] rounded-[60px] bg-white/6 rotate-[13deg]" />
        <div className="absolute right-[-120px] top-[180px] h-[900px] w-[310px] rounded-[200px] border-[2px] border-white/14" />
        <div className="absolute right-[135px] top-[210px] h-[670px] w-[320px] rounded-[58px] border border-white/9 rotate-[11deg]" />
        <div className="absolute left-[250px] bottom-[-150px] h-[530px] w-[530px] rounded-full border border-white/12" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-[1360px] items-start justify-center px-[18px] py-[18px] sm:px-[28px] lg:px-[44px] lg:py-[30px]">
        <main className="w-full max-w-[1170px]">
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-[18px] bg-[#f8f2ea] px-[28px] pb-[34px] pt-[28px] shadow-[0_8px_22px_rgba(128,73,16,0.14)] sm:px-[62px] sm:pb-[48px] sm:pt-[92px]"
          >
            <div className="pb-[24px]">
              <Link
                to="/activities"
                className="inline-flex items-center gap-[6px] rounded-full border border-[#ece7df] bg-white px-[15px] py-[9px] text-[13px] font-medium text-[#4a4a4a] shadow-[0_2px_10px_rgba(0,0,0,0.05)]"
              >
                <ChevronLeft className="h-[15px] w-[15px]" />
                活動へ戻る
              </Link>
            </div>

            <header className="pb-[18px]">
              <h1 className="max-w-[1040px] text-[34px] font-bold leading-[1.42] tracking-[-0.02em] text-[#1f2937] sm:text-[38px]">
                {survey.title}
              </h1>
              {survey.description && (
                <p className="mt-[28px] max-w-[760px] whitespace-pre-wrap text-[17px] font-normal leading-[1.6] text-[#202124]">
                  {survey.description}
                </p>
              )}
            </header>

            {latestResponse && (
              <div
                className={cn(
                  'mb-[18px] rounded-[4px] border px-[16px] py-[11px] text-[14px] text-[#202124]',
                  isLocked ? 'border-[#f3d2a2] bg-[#fff5df]' : 'border-[#c8e6f8] bg-[#f1f8fd]'
                )}
              >
                {isLocked
                  ? 'このフォームは送信済みです。現在はロックされており、編集できません。'
                  : 'このフォームは送信済みです。内容を修正して再送信できます。'}
              </div>
            )}

            <div className="space-y-0 pt-[28px]">
              {questions.map(renderQuestion)}
            </div>

            {isLocked ? (
              <div className="border-t border-[#ece4da] pt-[18px]">
                <p className="text-[14px] font-medium text-stone-500">送信済みの回答</p>
                <div className="mt-[12px] space-y-[10px]">
                  {questions.map((question) => (
                    <div key={question.id} className="rounded-[4px] bg-white px-[14px] py-[12px]">
                      <p className="text-[13px] text-stone-500">{question.label}</p>
                      <p className="mt-[4px] text-[15px] text-[#202124]">
                        {formatAnswerValue(answers[question.id])}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="pt-[12px]">
                {missingRequired.length > 0 && (
                  <div className="mb-[18px] rounded-[4px] border border-[#f3d2a2] bg-[#fff5df] px-[16px] py-[11px] text-[14px] text-[#8a4a00]">
                    未入力の必須項目: {missingRequired.map((q) => q.label).join(' / ')}
                  </div>
                )}
                <button
                  onClick={() => submitMutation.mutate()}
                  disabled={!canSubmit || submitMutation.isPending || missingRequired.length > 0}
                  className={cn(
                    'inline-flex h-[42px] min-w-[112px] items-center justify-center gap-[8px] rounded-[4px] px-[18px] text-[14px] font-medium transition',
                    !canSubmit || submitMutation.isPending || missingRequired.length > 0
                      ? 'cursor-not-allowed bg-stone-300 text-stone-500'
                      : 'bg-[#0f9d58] text-white hover:bg-[#0c8a4c]'
                  )}
                >
                  {submitMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  送信
                </button>
              </div>
            )}
          </motion.section>
        </main>

      </div>
    </div>
  );
}
