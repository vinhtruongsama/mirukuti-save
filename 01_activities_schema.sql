-- Task 1: Thiết lập cấu trúc Database (Supabase SQL) cho bảng Activities

-- 1. Xóa bảng cũ nếu cần thiết (Cảnh báo: Sẽ mất dữ liệu)
-- DROP TABLE IF EXISTS public.activities CASCADE;

-- 2. Tạo bảng activities
CREATE TABLE IF NOT EXISTS public.activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    location TEXT NOT NULL,
    activity_date TIMESTAMP WITH TIME ZONE NOT NULL,
    registration_deadline TIMESTAMP WITH TIME ZONE NOT NULL,
    capacity INTEGER, -- NULL nếu không giới hạn số lượng
    cover_image_url TEXT,
    status TEXT NOT NULL CHECK (status IN ('open', 'closed', 'upcoming')) DEFAULT 'upcoming',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- 3. Tạo Index để truy vấn nhanh theo năm học và thời gian
CREATE INDEX idx_activities_academic_year ON public.activities(academic_year_id);
CREATE INDEX idx_activities_date ON public.activities(activity_date DESC);
CREATE INDEX idx_activities_status ON public.activities(status);

-- 4. Kích hoạt Row Level Security (RLS)
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

-- 5. Policies
-- Tất cả mọi người (kể cả khách) đều có thể xem danh sách hoạt động
CREATE POLICY "Activities are viewable by everyone" 
ON public.activities FOR SELECT 
USING (true);

-- Chỉ Admin/Manager (Ban Chủ Nhiệm/Quản lý) mới được quyền Thêm/Sửa/Xóa
CREATE POLICY "Only admins can insert activities" 
ON public.activities FOR INSERT 
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.club_memberships 
        WHERE user_id = auth.uid() AND role IN ('admin', 'manager') AND is_active = true
    )
);

CREATE POLICY "Only admins can update activities" 
ON public.activities FOR UPDATE 
USING (
    EXISTS (
        SELECT 1 FROM public.club_memberships 
        WHERE user_id = auth.uid() AND role IN ('admin', 'manager') AND is_active = true
    )
);

CREATE POLICY "Only admins can delete activities" 
ON public.activities FOR DELETE 
USING (
    EXISTS (
        SELECT 1 FROM public.club_memberships 
        WHERE user_id = auth.uid() AND role IN ('admin', 'manager') AND is_active = true
    )
);

-- Tạo Trigger tự động cập nhật trường updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_activities_updated_at
    BEFORE UPDATE ON public.activities
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
