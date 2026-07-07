-- Align management permissions with the app's current role model.
-- Managers are: president, vice_president, executive
-- We also keep legacy admin for backward compatibility.

CREATE OR REPLACE FUNCTION public.is_current_admin_or_exec(user_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM public.club_memberships cm
        JOIN public.academic_years ay ON cm.academic_year_id = ay.id
        WHERE cm.user_id = user_uuid
          AND ay.is_current = true
          AND cm.role IN ('admin', 'president', 'vice_president', 'executive')
          AND cm.deleted_at IS NULL
          AND cm.is_active = true
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- If attendance_records exists in the target DB, allow the full management group
-- to read and update it as well. This unblocks attendance actions for executive roles.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'attendance_records'
    ) THEN
        EXECUTE 'ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY';

        IF NOT EXISTS (
            SELECT 1
            FROM pg_policies
            WHERE schemaname = 'public'
              AND tablename = 'attendance_records'
              AND policyname = ''Management can read attendance records''
        ) THEN
            EXECUTE '
                CREATE POLICY "Management can read attendance records"
                ON public.attendance_records
                FOR SELECT
                USING (public.is_current_admin_or_exec(auth.uid()))
            ';
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM pg_policies
            WHERE schemaname = 'public'
              AND tablename = 'attendance_records'
              AND policyname = ''Management can manage attendance records''
        ) THEN
            EXECUTE '
                CREATE POLICY "Management can manage attendance records"
                ON public.attendance_records
                FOR ALL
                USING (public.is_current_admin_or_exec(auth.uid()))
                WITH CHECK (public.is_current_admin_or_exec(auth.uid()))
            ';
        END IF;
    END IF;
END $$;
