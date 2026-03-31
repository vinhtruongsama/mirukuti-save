import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useLocation, Navigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Home } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/useAuthStore';
import { ForgotPasswordModal } from '../components/auth/ForgotPasswordModal';

const loginSchema = z.object({
  email: z.string().min(1, '学籍番号を入力してください').email('有効な学籍番号（メール形式）を入力してください'),
  password: z.string()
    .min(6, 'パスワードは6文字以上20文字以内で入力してください')
    .max(20, 'パスワードは6文字以上20文字以内で入力してください'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function Login() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { session, setAuth, signOut } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname || '/profile';

  const { register, handleSubmit, formState: { errors } } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema)
  });

  // If already logged in, redirect
  if (session) {
    return <Navigate to={from} replace />;
  }

  const onSubmit = async (data: LoginFormData) => {
    setIsSubmitting(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

      if (authError) throw authError;
      if (!authData.session) throw new Error('セッションの作成に失敗しました。');

      await setAuth(authData.session);

      const { currentRole, isTemporaryPassword: needsChange } = useAuthStore.getState();

      if (needsChange) {
        toast.info('ウェブサイトを継続するにはパスワードを変更する必要があります。');
        navigate('/change-password', { replace: true });
        return;
      }

      if (!currentRole) {
        await signOut();
        toast.error('この学年度のアクセス権限がありません。管理者にお問い合わせください。');
        return;
      }

      toast.success('ログインに成功しました！');

      if (from === '/profile' && ['admin', 'executive'].includes(currentRole)) {
        navigate('/admin/dashboard', { replace: true });
      } else {
        navigate(from, { replace: true });
      }

    } catch (error: any) {
      toast.error(error.message || 'ログインに失敗しました。');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-dvh w-screen overflow-hidden flex flex-col bg-brand-stone-900 border-none select-none">
      {/* 1. Viewport Mastery: Artistic Background Layer */}
      <div className="fixed inset-0 z-0 bg-[#F8F9FA]">
        <img
          src="/sky-login.jpg"
          alt="Artful Sky"
          className="w-full h-full object-cover opacity-60"
        />

        {/* Artful Ambient Blobs using user's palette */}
        <div className="absolute inset-0 z-1 overflow-hidden pointer-events-none">
          {/* Xanh Blue (#4F5BD5) - Top Right */}
          <div className="absolute -top-[10%] -right-[10%] w-[60%] h-[60%] bg-[#4F5BD5] rounded-full blur-[140px] opacity-30 animate-pulse" style={{ animationDuration: '8s' }} />

          {/* Hồng Cánh Sen (#D62976) - Center */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[45%] h-[45%] bg-[#D62976] rounded-full blur-[120px] opacity-25" />

          {/* Vàng Nắng (#FEDA75) - Bottom Left */}
          <div className="absolute -bottom-[10%] -left-[10%] w-[60%] h-[60%] bg-[#FEDA75] rounded-full blur-[140px] opacity-40 animate-pulse" style={{ animationDuration: '10s' }} />
        </div>
      </div>

      {/* 2. Dynamic Floating Navigation Pill */}
      <div className="absolute top-6 lg:top-10 left-0 right-0 z-50 flex justify-center lg:justify-start lg:pl-12 pointer-events-none">
        <Link to="/" className="pointer-events-auto flex items-center gap-4 group active:scale-95 transition-all">
          <div className="flex items-center gap-3 bg-white/50 backdrop-blur-3xl px-6 lg:px-10 h-14 lg:h-20 rounded-[24px] lg:rounded-[32px] border border-white/60 shadow-[0_20px_50px_rgba(0,0,0,0.1)] overflow-hidden hover:bg-white/70 hover:border-indigo-500/30 hover:scale-[1.03] transition-all duration-300 group/logo cursor-pointer">
            <Home className="w-5 h-5 lg:w-7 lg:h-7 text-black/60 group-hover/logo:text-[#4F5BD5] group-hover/logo:scale-110 transition-all duration-300 shrink-0" />
            <div className="w-[1px] h-5 lg:h-7 bg-black/10 group-hover/logo:bg-[#4F5BD5]/20 transition-colors shrink-0" />
            <img
              src="/ミルクティ-text.png"
              alt="Milk Tea Logo"
              className="h-full w-auto object-contain drop-shadow-md brightness-110 group-hover/logo:scale-105 transition-transform duration-300 py-2.5 lg:py-3.5"
            />
          </div>
        </Link>
      </div>

      {/* 3. Flexible Main Content (Centered Layout) */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center pt-20 lg:pt-0 pb-8 h-full overflow-y-auto lg:overflow-hidden">

        {/* Left Side: Editorial Art (Floating in Corner on Desktop) */}
        <div className="hidden lg:flex absolute bottom-12 left-12 pointer-events-none z-0">
          <motion.div
            initial={{ opacity: 0, scale: 0.9, rotate: 0 }}
            animate={{ opacity: 1, scale: 1, rotate: 12 }}
            transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
            className="relative"
          >
            {/* Artistic Frame */}
            <div className="max-w-[160px] bg-white/10 backdrop-blur-3xl border border-white/20 p-2 rounded-[32px] shadow-[0_32px_80px_rgba(0,0,0,0.1)]">
              <img
                src="/hoa.jpg"
                alt="Editorial Flower Art"
                className="w-full h-auto rounded-[24px] object-cover"
              />
            </div>
          </motion.div>
        </div>

        {/* Center: Touch-Optimized Login Card */}
        <div className="flex flex-col items-center justify-center w-full relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
            className="w-[92%] sm:max-w-[400px] lg:max-w-[420px] bg-white/95 backdrop-blur-[32px] rounded-[32px] sm:rounded-[36px] lg:rounded-[44px] shadow-[0_32px_120px_rgba(0,0,0,0.12)] flex flex-col p-6 sm:p-8 lg:p-10 relative overflow-hidden border border-white/50"
          >
            {/* Glossy Overlay */}
            <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent pointer-events-none" />

            <div className="relative z-10">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2, duration: 0.8 }}
                className="mb-4 flex flex-col items-center"
              >
                <img
                  src="/chao-.png"
                  alt="ミルクティへようこそ"
                  className="h-[110px] w-auto object-contain drop-shadow-2xl hover:scale-110 transition-transform duration-500 cursor-pointer"
                />
              </motion.div>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3, duration: 0.6 }}
                  className="space-y-2"
                >
                  <label className="text-[0.85rem] lg:text-[0.92rem] font-black text-black uppercase tracking-[0.2em] pl-1">
                    学籍番号
                  </label>
                  <input
                    {...register('email')}
                    type="email"
                    className="w-full h-[52px] bg-stone-50/60 border border-stone-200 text-black rounded-2xl px-6 py-3 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:bg-white focus:border-indigo-500/30 transition-all placeholder:text-stone-400 font-bold text-base shadow-inner"
                    placeholder="例：32xxxx25"
                  />
                  {errors.email && <p className="text-red-600 text-[0.7rem] font-bold mt-0.5 pl-2">{errors.email.message}</p>}
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4, duration: 0.6 }}
                  className="space-y-2"
                >
                  <label className="text-[0.85rem] lg:text-[0.92rem] font-black text-black uppercase tracking-[0.2em] pl-1">
                    パスワード
                  </label>
                  <div className="relative">
                    <input
                      {...register('password')}
                      type={showPassword ? 'text' : 'password'}
                      className="w-full h-[52px] bg-stone-50/60 border border-stone-200 text-black rounded-2xl px-6 py-3 pr-14 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:bg-white focus:border-indigo-500/30 transition-all placeholder:text-stone-400 font-bold text-base shadow-inner"
                      placeholder="******"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 inset-y-0 flex items-center p-2 text-stone-500 hover:text-indigo-600 transition-all active:scale-90"
                    >
                      {showPassword ? <EyeOff size={22} /> : <Eye size={22} />}
                    </button>
                  </div>
                  {errors.password && <p className="text-red-600 text-[0.7rem] font-bold mt-0.5 pl-2 leading-tight">{errors.password.message}</p>}
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5, duration: 0.6 }}
                  className="pt-0 flex flex-col items-center gap-2.5"
                >
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full h-[52px] bg-gradient-to-r from-[#4F5BD5] to-[#D62976] hover:brightness-110 text-white font-black text-[1.05rem] rounded-2xl transition-all shadow-[0_12px_40px_rgba(79,91,213,0.3)] active:scale-[0.97] hover:-translate-y-0.5 disabled:opacity-50 disabled:active:scale-100 flex justify-center items-center gap-3 tracking-[0.1em]"
                  >
                    {isSubmitting ? (
                      <div className="w-5 h-5 border-3 border-white/20 border-t-white rounded-full animate-spin" />
                    ) : (
                      <span>ログイン</span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsForgotModalOpen(true)}
                    className="text-[0.85rem] font-black text-black/60 hover:text-black transition-colors tracking-tight hover:underline py-1"
                  >
                    パスワードを忘れた場合
                  </button>
                </motion.div>
              </form>
            </div>
          </motion.div>
        </div>
      </main>

      {/* 4. Minimalist Footer */}
      <footer className="relative z-50 w-full px-6 lg:px-12 py-4 flex items-center justify-center shrink-0 h-auto lg:h-16 border-none">
        <span className="text-[0.6rem] sm:text-[0.72rem] font-bold text-black/40 uppercase tracking-[0.2em] lg:tracking-[0.25em] text-center max-w-[80%] leading-relaxed">
          © 2026 流通科学大学 福祉ボランティア部<br className="sm:hidden" />『ミルクティ』
        </span>
      </footer>

      <ForgotPasswordModal
        isOpen={isForgotModalOpen}
        onClose={() => setIsForgotModalOpen(false)}
      />
    </div>
  );
}
