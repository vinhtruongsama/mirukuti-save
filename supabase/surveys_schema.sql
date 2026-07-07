-- ==========================================
-- Surveys module schema
-- Adds new survey-only tables and policies.
-- This migration does not update or delete existing application data.
-- ==========================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.surveys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
    activity_id UUID REFERENCES public.activities(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL CHECK (status IN ('draft', 'open', 'closed')) DEFAULT 'draft',
    response_mode TEXT NOT NULL CHECK (response_mode IN ('single_editable', 'single_locked', 'multiple')) DEFAULT 'single_editable',
    target_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.survey_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    survey_id UUID NOT NULL REFERENCES public.surveys(id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 0,
    type TEXT NOT NULL CHECK (type IN ('short_text', 'long_text', 'single_choice', 'multiple_choice', 'dropdown', 'rating', 'date', 'time')),
    label TEXT NOT NULL,
    description TEXT,
    required BOOLEAN NOT NULL DEFAULT false,
    options JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.survey_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    survey_id UUID NOT NULL REFERENCES public.surveys(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.survey_answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    response_id UUID NOT NULL REFERENCES public.survey_responses(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES public.survey_questions(id) ON DELETE CASCADE,
    value JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(response_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_surveys_year ON public.surveys(academic_year_id);
CREATE INDEX IF NOT EXISTS idx_surveys_activity ON public.surveys(activity_id);
CREATE INDEX IF NOT EXISTS idx_surveys_status ON public.surveys(status);
CREATE INDEX IF NOT EXISTS idx_survey_questions_survey_position ON public.survey_questions(survey_id, position);
CREATE INDEX IF NOT EXISTS idx_survey_responses_survey_user ON public.survey_responses(survey_id, user_id);
CREATE INDEX IF NOT EXISTS idx_survey_answers_response ON public.survey_answers(response_id);

ALTER TABLE public.surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_answers ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_current_survey_admin(user_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM public.club_memberships cm
        JOIN public.academic_years ay ON ay.id = cm.academic_year_id
        WHERE cm.user_id = user_uuid
          AND ay.is_current = true
          AND cm.role IN ('president', 'vice_president', 'executive', 'admin')
          AND cm.deleted_at IS NULL
          AND cm.is_active = true
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.can_answer_survey(survey_uuid UUID, user_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
    s public.surveys%ROWTYPE;
    target_roles TEXT[];
    target_years INTEGER[];
BEGIN
    SELECT * INTO s FROM public.surveys WHERE id = survey_uuid;
    IF NOT FOUND OR s.status <> 'open' THEN
        RETURN false;
    END IF;

    IF COALESCE((s.target_config->>'require_activity_registration')::boolean, false) THEN
        IF s.activity_id IS NULL OR NOT EXISTS (
            SELECT 1 FROM public.registrations r
            WHERE r.activity_id = s.activity_id AND r.user_id = user_uuid
        ) THEN
            RETURN false;
        END IF;
    END IF;

    SELECT COALESCE(array_agg(value), ARRAY[]::TEXT[])
    INTO target_roles
    FROM jsonb_array_elements_text(COALESCE(s.target_config->'roles', '[]'::jsonb));

    SELECT COALESCE(array_agg(value::INTEGER), ARRAY[]::INTEGER[])
    INTO target_years
    FROM jsonb_array_elements_text(COALESCE(s.target_config->'years', '[]'::jsonb));

    RETURN EXISTS (
        SELECT 1
        FROM public.club_memberships cm
        LEFT JOIN public.users u ON u.id = cm.user_id
        WHERE cm.user_id = user_uuid
          AND cm.academic_year_id = s.academic_year_id
          AND cm.deleted_at IS NULL
          AND cm.is_active = true
          AND (array_length(target_roles, 1) IS NULL OR cm.role = ANY(target_roles))
          AND (array_length(target_years, 1) IS NULL OR u.university_year = ANY(target_years))
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.get_survey_option_counts(survey_uuid UUID)
RETURNS TABLE (
    question_id UUID,
    option_value TEXT,
    selected_count BIGINT
) AS $$
    SELECT
        sq.id AS question_id,
        choice_value.option_value,
        COUNT(*)::BIGINT AS selected_count
    FROM public.survey_questions sq
    JOIN public.survey_answers sa ON sa.question_id = sq.id
    JOIN public.survey_responses sr ON sr.id = sa.response_id
    JOIN LATERAL (
        SELECT sa.value #>> '{}' AS option_value
        WHERE jsonb_typeof(sa.value) = 'string'
        UNION ALL
        SELECT elem #>> '{}'
        FROM jsonb_array_elements(sa.value) AS elem
        WHERE jsonb_typeof(sa.value) = 'array'
    ) AS choice_value ON true
    WHERE sq.survey_id = survey_uuid
      AND sr.survey_id = survey_uuid
      AND (
          public.is_current_survey_admin(auth.uid())
          OR public.can_answer_survey(survey_uuid, auth.uid())
      )
      AND choice_value.option_value IS NOT NULL
      AND choice_value.option_value <> ''
    GROUP BY sq.id, choice_value.option_value;
$$ LANGUAGE sql SECURITY DEFINER;

CREATE POLICY "Survey admins can manage surveys"
ON public.surveys FOR ALL
USING (public.is_current_survey_admin(auth.uid()))
WITH CHECK (public.is_current_survey_admin(auth.uid()));

CREATE POLICY "Eligible members can read open surveys"
ON public.surveys FOR SELECT
USING (public.is_current_survey_admin(auth.uid()) OR public.can_answer_survey(id, auth.uid()));

CREATE POLICY "Survey admins can manage questions"
ON public.survey_questions FOR ALL
USING (public.is_current_survey_admin(auth.uid()))
WITH CHECK (public.is_current_survey_admin(auth.uid()));

CREATE POLICY "Eligible members can read survey questions"
ON public.survey_questions FOR SELECT
USING (
    public.is_current_survey_admin(auth.uid())
    OR EXISTS (
        SELECT 1 FROM public.surveys s
        WHERE s.id = survey_id AND public.can_answer_survey(s.id, auth.uid())
    )
);

CREATE POLICY "Survey admins can read responses"
ON public.survey_responses FOR SELECT
USING (public.is_current_survey_admin(auth.uid()) OR user_id = auth.uid());

CREATE POLICY "Eligible members can create responses"
ON public.survey_responses FOR INSERT
WITH CHECK (user_id = auth.uid() AND public.can_answer_survey(survey_id, auth.uid()));

CREATE POLICY "Eligible members can update editable responses"
ON public.survey_responses FOR UPDATE
USING (
    user_id = auth.uid()
    AND EXISTS (
        SELECT 1 FROM public.surveys s
        WHERE s.id = survey_id
          AND s.response_mode = 'single_editable'
          AND public.can_answer_survey(s.id, auth.uid())
    )
)
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Survey admins can read answers"
ON public.survey_answers FOR SELECT
USING (
    public.is_current_survey_admin(auth.uid())
    OR EXISTS (
        SELECT 1 FROM public.survey_responses sr
        WHERE sr.id = response_id AND sr.user_id = auth.uid()
    )
);

CREATE POLICY "Members can create answers for own response"
ON public.survey_answers FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.survey_responses sr
        WHERE sr.id = response_id
          AND sr.user_id = auth.uid()
          AND public.can_answer_survey(sr.survey_id, auth.uid())
    )
);

CREATE POLICY "Members can update answers for editable own response"
ON public.survey_answers FOR UPDATE
USING (
    EXISTS (
        SELECT 1
        FROM public.survey_responses sr
        JOIN public.surveys s ON s.id = sr.survey_id
        WHERE sr.id = response_id
          AND sr.user_id = auth.uid()
          AND s.response_mode = 'single_editable'
          AND public.can_answer_survey(s.id, auth.uid())
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.survey_responses sr
        WHERE sr.id = response_id AND sr.user_id = auth.uid()
    )
);
