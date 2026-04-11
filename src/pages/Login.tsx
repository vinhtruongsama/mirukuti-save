import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, Navigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff, Home, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/useAuthStore';
import { useAppStore } from '../store/useAppStore';
import { ForgotPasswordModal } from '../components/auth/ForgotPasswordModal';

const loginSchema = z.object({
  studentId: z.string()
    .min(1, '学籍番号を入力してください')
    .max(10, '学籍番号は10文字以内で入力してください')
    .regex(/^\d+$/, '数字のみを入力してください'),
  password: z.string().optional().or(z.literal('')),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function Login() {
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const { 
    session,
    setAuth
  } = useAuthStore();
  const { academicYears, fetchAcademicYears } = useAppStore();
  const navigate = useNavigate();

  const { register, handleSubmit, formState: { errors } } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema)
  });

  // If already logged in, redirect to Home
  if (session) {
    return <Navigate to="/" replace />;
  }

  const onSubmit = async (data: LoginFormData) => {
    setIsSubmitting(true);
    setLoginError(null);
    try {
      // 1. Dùng MSSV để tìm Member trong Database trước
      const studentId = data.studentId.trim();
      const { data: userRecord, error: lookupError } = await supabase
        .from('users')
        .select('*, club_memberships(*)')
        .eq('mssv', studentId)
        .is('deleted_at', null)
        .maybeSingle();

      if (lookupError) throw lookupError;
      
      // Trường hợp không tìm thấy MSSV trong CLB
      if (!userRecord) {
        throw new Error('学籍番号が正しくありません。部員登録がお済みでない場合は、部長までお問い合わせください。');
      }

      // 2. Kích hoạt tài khoản Đăng nhập (Auth) tự động nếu chưa có
      // Điều này đảm bảo những người trong Database (mới import) có thể đăng nhập ngay lập tức
      const { error: provisionError } = await supabase.rpc('admin_ensure_member_auth', { 
        p_mssv: studentId 
      });

      if (provisionError) {
        console.error('Provisioning failed:', provisionError);
        throw new Error('ログイン準備中にエラーが発生しました。しばらくしてから再度お試しください。');
      }

      // 3. Kiểm tra vai trò của họ trong 학년 (năm học hiện tại)
      const currentYear = useAppStore.getState().selectedYear || academicYears[0];
      const membership = (userRecord.club_memberships || []).find((m: any) => m.academic_year_id === currentYear?.id && !m.deleted_at);
      const userRole = membership?.role;
      const isLeaderRole = ['president', 'vice_president', 'treasurer', 'executive'].includes(userRole || '');

      // Logic chuyển đổi chế độ Admin/Student
      if (!isAdminMode) {
        if (isLeaderRole) {
          throw new Error('管理者権限をお持ちの方は「管理ログイン」に切り替えて、専用パスワードでログインしてください。');
        }
        if (!userRole) {
          throw new Error('この学年度の部員登録が見つかりません。');
        }
      }

      if (isAdminMode && !isLeaderRole) {
        throw new Error('このアカウントには管理権限がありません。「学生ログイン」をご利用ください。');
      }

      // 4. Lấy thông tin University Email làm khóa đăng nhập chính
      const { data: updatedRecord } = await supabase.from('users').select('university_email').eq('id', userRecord.id).single();
      const loginEmail = updatedRecord?.university_email || userRecord.university_email;
      const loginPassword = isAdminMode ? (data.password || '') : studentId;

      // 5. Thực hiện đăng nhập thực sự với Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: loginPassword,
      });

      if (authError) {
        if (authError.message.includes('Invalid login credentials')) {
          throw new Error(isAdminMode ? 'パスワードが正しくありません。' : 'ログインに失敗しました。再試行してください。');
        }
        throw authError;
      }

      if (!authData.session) throw new Error('セッションの作成に失敗しました。');

      if (academicYears.length === 0) await fetchAcademicYears();
      await setAuth(authData.session);

      toast.success(isAdminMode ? '管理者としてログインしました' : 'ログインしました。');
      navigate('/', { replace: true });

    } catch (error: any) {
      console.error('Login Error:', error);
      setLoginError(error.message?.includes('invalid_credentials') ? '番号またはパスワードが正しくありません。' : (error.message || 'ログインに失敗しました。'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-dvh w-screen overflow-hidden flex flex-col bg-[#F8F9FA] select-none">
      {/* Background Layer */}
      <div className="fixed inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-tr from-white to-stone-100/50" />
        
        {/* Sky image with safe loading */}
        <img
          src="/sky-login.jpg"
          alt=""
          className="w-full h-full object-cover opacity-40 blur-[2px]"
          onError={(e) => (e.currentTarget.style.display = 'none')}
        />

        {/* Ambient Blobs */}
        <div className="absolute inset-0 z-1 overflow-hidden pointer-events-none opacity-20">
          <div className="absolute -top-[10%] -right-[10%] w-[60%] h-[60%] bg-[#4F5BD5] rounded-full blur-[140px] animate-pulse" style={{ animationDuration: '8s' }} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[45%] h-[45%] bg-[#D62976] rounded-full blur-[120px]" />
          <div className="absolute -bottom-[10%] -left-[10%] w-[60%] h-[60%] bg-[#FEDA75] rounded-full blur-[140px] animate-pulse" style={{ animationDuration: '10s' }} />
        </div>
      </div>

      <div className="absolute top-6 lg:top-10 left-0 right-0 z-50 flex justify-center lg:justify-start lg:pl-12">
        <Link to="/" className="flex items-center gap-4 group active:scale-95 transition-all">
          <div className="flex items-center gap-3 bg-white/60 backdrop-blur-3xl px-6 lg:px-8 h-14 lg:h-16 rounded-[24px] border border-white/60 shadow-xl hover:bg-white/80 transition-all group/logo cursor-pointer">
            <Home className="w-5 h-5 text-black/60 group-hover/logo:text-indigo-600 transition-colors" />
            <div className="w-[1px] h-5 bg-black/10" />
            <img src="/ミルクティ-text.png" alt="Logo" className="h-4 lg:h-6 w-auto object-contain" />
          </div>
        </Link>
      </div>

      <main className="relative z-10 flex-1 flex flex-col items-center justify-center p-6 h-full overflow-y-auto">
        <div className="w-full max-w-[400px] bg-white/95 backdrop-blur-3xl rounded-[3rem] shadow-[0_32px_120px_rgba(0,0,0,0.1)] flex flex-col p-8 sm:p-10 border border-white/50">
          <div className="mb-6 flex flex-col items-center">
             <img src="/chao.png" alt="Welcome" className="h-[100px] w-auto object-contain drop-shadow-xl" />
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <label className="text-[12px] font-black text-stone-400 uppercase tracking-widest pl-1">学籍番号</label>
              <input
                {...register('studentId')}
                type="text"
                inputMode="numeric"
                className="w-full h-14 bg-stone-50 border border-stone-200 rounded-2xl px-6 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500/30 transition-all font-black text-stone-900"
                placeholder="例：32xxxx25"
              />
              {errors.studentId && <p className="text-rose-500 text-[11px] font-bold mt-1 pl-1">{errors.studentId.message}</p>}
            </div>

              {isAdminMode && (
                <div className="space-y-2">
                  <label className="text-[12px] font-black text-stone-400 uppercase tracking-widest pl-1">パスワード</label>
                  <div className="relative">
                    <input
                      {...register('password')}
                      type={showPassword ? 'text' : 'password'}
                      className="w-full h-14 bg-stone-50 border border-stone-200 rounded-2xl px-6 pr-14 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500/30 transition-all font-black text-stone-900"
                      placeholder="******"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-400 hover:text-indigo-600 transition-colors">
                      {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                </div>
              )}

            {loginError && (
              <div className="p-4 bg-rose-50 border border-rose-100 rounded-xl flex items-center gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                <p className="text-[12px] font-black text-rose-600 tracking-tight">{loginError}</p>
              </div>
            )}

            <div className="pt-4 flex flex-col gap-4">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full h-14 bg-gradient-to-r from-indigo-600 to-rose-500 text-white font-black rounded-2xl transition-all shadow-xl hover:scale-[1.02] active:scale-95 disabled:opacity-50"
              >
                {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'ログイン'}
              </button>

              <div className="flex flex-col items-center gap-2">
                <button type="button" onClick={() => setIsAdminMode(!isAdminMode)} className="text-[13px] font-black text-indigo-600 hover:text-rose-500 transition-colors tracking-tight">
                  {isAdminMode ? '学生ログインに戻る' : 'リーダー・管理者の方はこちら'}
                </button>
                {isAdminMode && (
                  <button type="button" onClick={() => setIsForgotModalOpen(true)} className="text-[11px] font-bold text-stone-400 hover:text-stone-900 transition-colors">
                    パスワードをお忘れですか？
                  </button>
                )}
              </div>
            </div>
          </form>
        </motion.div>
      </main>

      <footer className="relative z-50 w-full py-6 flex items-center justify-center">
        <span className="text-[11px] font-bold text-stone-400 uppercase tracking-widest text-center">
          © 2026 流通科学大学 福祉ボランティア部『ミルクティ』
        </span>
      </footer>

      <ForgotPasswordModal isOpen={isForgotModalOpen} onClose={() => setIsForgotModalOpen(false)} />
    </div>
  );
}

