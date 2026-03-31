-- ==========================================
-- Supabase Schema for WebQL-CLB (Production)
-- ==========================================

-- Enable pgcrypto for UUIDs (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- --------------------------------------------------------
-- 1. Tables Creation
-- --------------------------------------------------------

-- Academic Years: Defines school years for the club
CREATE TABLE IF NOT EXISTS public.academic_years (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL, -- e.g. '2023-2024'
    is_current BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Users: Core identity information matching Supabase Auth
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    mssv TEXT UNIQUE,
    full_name TEXT NOT NULL,
    phone TEXT,
    line_id TEXT,
    hometown TEXT,
    avatar_url TEXT,
    deleted_at TIMESTAMP WITH TIME ZONE, -- Soft delete
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Club Memberships (Junction Table): Manages roles/departments per academic year
CREATE TABLE IF NOT EXISTS public.club_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('admin', 'executive', 'member', 'alumni')),
    department TEXT,
    class_name TEXT,
    university_year INTEGER CHECK (university_year IN (1, 2, 3, 4)),
    is_active BOOLEAN DEFAULT true,
    deleted_at TIMESTAMP WITH TIME ZONE, -- Soft delete
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id, academic_year_id) -- A user has one membership per academic year
);

-- Activities: Club events and campaigns
CREATE TABLE IF NOT EXISTS public.activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    date TIMESTAMP WITH TIME ZONE NOT NULL,
    location TEXT NOT NULL,
    capacity INTEGER,
    cover_image_url TEXT,
    form_link TEXT,
    registration_deadline TIMESTAMP WITH TIME ZONE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('open', 'closed', 'draft')) DEFAULT 'open',
    deleted_at TIMESTAMP WITH TIME ZONE, -- Soft delete
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Registrations: Event attendance and registration
CREATE TABLE IF NOT EXISTS public.registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    activity_id UUID NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
    attendance_status TEXT CHECK (attendance_status IN ('present', 'excused_absence', 'unexcused_absence', 'pending')) DEFAULT 'pending',
    admin_note TEXT,
    registered_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id, activity_id)
);


-- --------------------------------------------------------
-- 2. Storage Buckets Creation
-- --------------------------------------------------------
INSERT INTO storage.buckets (id, name, public) 
VALUES ('avatars', 'avatars', true) 
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('activity_covers', 'activity_covers', true) 
ON CONFLICT (id) DO NOTHING;


-- --------------------------------------------------------
-- 3. Row Level Security (RLS)
-- --------------------------------------------------------

-- Enable RLS for all tables
ALTER TABLE public.academic_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;

-- Helper Function: Check if auth user is Admin/Executive in the CURRENT academic year
CREATE OR REPLACE FUNCTION public.is_current_admin_or_exec(user_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 
        FROM public.club_memberships cm
        JOIN public.academic_years ay ON cm.academic_year_id = ay.id
        WHERE cm.user_id = user_uuid 
          AND ay.is_current = true
          AND cm.role IN ('admin', 'executive')
          AND cm.deleted_at IS NULL
          AND cm.is_active = true
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ACADEMIC YEARS
CREATE POLICY "Public can read academic years" ON public.academic_years FOR SELECT USING (true);
CREATE POLICY "Admin/Exec can manage academic years" ON public.academic_years FOR ALL USING (public.is_current_admin_or_exec(auth.uid()));

-- USERS
-- Everyone can read active users (but restrict to simple info if needed, here keeping simple)
CREATE POLICY "Public can read active users" ON public.users FOR SELECT USING (deleted_at IS NULL);
-- Users can update their own data
CREATE POLICY "Users can update own data" ON public.users FOR UPDATE USING (id = auth.uid() AND deleted_at IS NULL);
-- Admins can read/manage all (even soft-deleted)
CREATE POLICY "Admin/Exec can manage users" ON public.users FOR ALL USING (public.is_current_admin_or_exec(auth.uid()));

-- CLUB MEMBERSHIPS
-- Public can read active memberships
CREATE POLICY "Public can read active memberships" ON public.club_memberships FOR SELECT USING (deleted_at IS NULL);
-- Admin/Exec can manage all memberships
CREATE POLICY "Admin/Exec can manage memberships" ON public.club_memberships FOR ALL USING (public.is_current_admin_or_exec(auth.uid()));

-- ACTIVITIES
-- Public can read active activities
CREATE POLICY "Public can read active activities" ON public.activities FOR SELECT USING (deleted_at IS NULL);
-- Admin/Exec can manage all activities
CREATE POLICY "Admin/Exec can manage activities" ON public.activities FOR ALL USING (public.is_current_admin_or_exec(auth.uid()));

-- REGISTRATIONS
-- Users can read their own registrations. Admin/Exec can read all.
CREATE POLICY "Users can read own registrations or Admin read all" ON public.registrations FOR SELECT USING (
    user_id = auth.uid() OR public.is_current_admin_or_exec(auth.uid())
);
-- Users can insert their own registration
CREATE POLICY "Users can register themselves" ON public.registrations FOR INSERT WITH CHECK (user_id = auth.uid());
-- Admin/Exec can manage all registrations
CREATE POLICY "Admin/Exec can manage registrations" ON public.registrations FOR ALL USING (public.is_current_admin_or_exec(auth.uid()));


-- --------------------------------------------------------
-- 4. Storage Policies
-- --------------------------------------------------------

-- Avatars Bucket
CREATE POLICY "Avatars are publicly accessible" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY "Users can upload their own avatar" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can update their own avatar" ON storage.objects FOR UPDATE USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can delete their own avatar" ON storage.objects FOR DELETE USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Activity Covers Bucket
CREATE POLICY "Activity covers are publicly accessible" ON storage.objects FOR SELECT USING (bucket_id = 'activity_covers');
CREATE POLICY "Admin/Exec can manage activity covers" ON storage.objects FOR ALL USING (bucket_id = 'activity_covers' AND public.is_current_admin_or_exec(auth.uid()));

-- --------------------------------------------------------
-- 5. RPC Functions (ACID Transactions)
-- --------------------------------------------------------

-- Function to start a new academic year securely
CREATE OR REPLACE FUNCTION public.start_new_academic_year(old_year_id UUID, new_year_name TEXT)
RETURNS UUID AS $$
DECLARE
    new_year_id UUID;
BEGIN
    -- 1. Demote all existing years
    UPDATE public.academic_years SET is_current = false;
    
    -- 2. Create the new year
    INSERT INTO public.academic_years (name, is_current)
    VALUES (new_year_name, true)
    RETURNING id INTO new_year_id;
    
    -- 3. Carry over active memberships
    INSERT INTO public.club_memberships (
        user_id, academic_year_id, role, department, class_name, university_year, is_active
    )
    SELECT 
        user_id,
        new_year_id,
        CASE WHEN university_year >= 4 THEN 'alumni' ELSE role END,
        department,
        class_name,
        CASE WHEN university_year < 4 THEN university_year + 1 ELSE university_year END,
        CASE WHEN university_year >= 4 THEN false ELSE true END
    FROM public.club_memberships
    WHERE academic_year_id = old_year_id
      AND deleted_at IS NULL
      AND is_active = true;

    RETURN new_year_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
