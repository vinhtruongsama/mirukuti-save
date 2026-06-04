-- Adds per-activity registration questions and per-registration answers.
-- Safe to run multiple times. Existing rows are preserved.

ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS registration_questions JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS registration_answers JSONB NOT NULL DEFAULT '[]'::jsonb;
