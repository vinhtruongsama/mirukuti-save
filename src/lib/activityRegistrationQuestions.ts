export type ActivityRegistrationQuestionType = 'short_text' | 'single_choice' | 'multiple_choice';

export type ActivityRegistrationQuestion = {
  prompt: string;
  answer_hint?: string;
  type?: ActivityRegistrationQuestionType;
  options?: string[];
};

export const ACTIVITY_REGISTRATION_QUESTION_TYPES: Array<{
  value: ActivityRegistrationQuestionType;
  label: string;
}> = [
  { value: 'short_text', label: '短文回答' },
  { value: 'single_choice', label: '単一選択' },
  { value: 'multiple_choice', label: '複数選択' },
];

export const isActivityChoiceQuestion = (type?: string) =>
  type === 'single_choice' || type === 'multiple_choice';

export const normalizeActivityRegistrationQuestion = (
  question: any,
): ActivityRegistrationQuestion | null => {
  const prompt = question?.prompt?.trim();
  if (!prompt) return null;

  const type: ActivityRegistrationQuestionType = question?.type || 'short_text';
  const options = Array.isArray(question?.options)
    ? question.options.map((option: any) => String(option || '').trim()).filter(Boolean)
    : [];

  return {
    prompt,
    answer_hint: question?.answer_hint?.trim() || '',
    type,
    options: isActivityChoiceQuestion(type) ? options : [],
  };
};

export const getActivityRegistrationQuestions = (activity: any): ActivityRegistrationQuestion[] =>
  Array.isArray(activity?.registration_questions)
    ? activity.registration_questions
        .map((question: any) => normalizeActivityRegistrationQuestion(question))
        .filter(Boolean) as ActivityRegistrationQuestion[]
    : [];

export const isActivityAnswerComplete = (
  question: ActivityRegistrationQuestion,
  answer: unknown,
) => {
  if (question.type === 'multiple_choice') {
    return Array.isArray(answer) && answer.length > 0;
  }

  if (question.type === 'single_choice') {
    return typeof answer === 'string' && answer.trim().length > 0;
  }

  return typeof answer === 'string' && answer.trim().length > 0;
};

export const formatActivityAnswerValue = (value: unknown) => {
  if (Array.isArray(value)) return value.join(' / ');
  if (value === null || value === undefined || value === '') return '-';
  return String(value);
};
