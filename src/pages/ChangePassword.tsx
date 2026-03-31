import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/useAuthStore';
import { Lock, Loader2, PartyPopper } from 'lucide-react';

const changePasswordSchema = z.object({
  password: z.string().min(8, 'パスワードは8文字以上で入力してください'),
  confirmPassword: z.string().min(8, '確認用パスワードを入力してください'),
}).refine((data) => data.password === data.confirmPassword, {
  message: "パスワードが一致しません",
  path: ["confirmPassword"],
});

type ChangePasswordFormData = z.infer<typeof changePasswordSchema>;

export default function ChangePassword() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();

  const { register, handleSubmit, formState: { errors } } = useForm<ChangePasswordFormData>({
    resolver: zodResolver(changePasswordSchema)
  });

  const onSubmit = async (data: ChangePasswordFormData) => {
    setIsSubmitting(true);
    try {
      // Step 1: Update the actual password
      const { error: passwordError } = await supabase.auth.updateUser({
        password: data.password,
      });

      if (passwordError) throw passwordError;

      // Step 2: Remove the temporary password flag from metadata
      const { error: metadataError } = await supabase.auth.updateUser({
        data: { is_temporary_password: false }
      });

      if (metadataError) throw metadataError;

      // Step 3: Refresh auth state
      const { data: { session: newSession } } = await supabase.auth.getSession();
      await setAuth(newSession);

      setIsSuccess(true);
      toast.success('パスワードを更新しました。');
      
      // Wait a moment for the success animation
      setTimeout(() => {
        navigate('/', { replace: true });
      }, 2000);
      
    } catch (error: any) {
      toast.error(error.message || 'パスワードの更新中にエラーが発生しました。');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-brand-stone-900">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center p-8"
        >
          <div className="w-20 h-20 bg-brand-emerald-500/10 rounded-full flex items-center justify-center text-brand-emerald-500 mx-auto mb-6">
            <PartyPopper size={40} />
          </div>
          <h1 className="text-3xl font-serif text-brand-stone-50 mb-2">おめでとうございます！</h1>
          <p className="text-brand-stone-400">パスワードが正常に更新されました。トップページへ移動します...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] bg-brand-stone-900">
      <div className="m-auto w-full max-w-md px-6 py-12">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-brand-stone-900 border border-brand-stone-800 p-8 shadow-2xl rounded-3xl"
        >
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-brand-emerald-500/10 rounded-2xl flex items-center justify-center text-brand-emerald-500 mx-auto mb-4">
              <Lock size={32} />
            </div>
            <h1 className="text-3xl font-serif text-brand-stone-50 mb-2 tracking-tight">パスワードの変更</h1>
            <p className="text-sm text-brand-stone-400">アカウントの安全のため、新しいパスワードを設定してください。</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-medium text-brand-stone-400 uppercase tracking-widest pl-1">新しいパスワード (8文字以上)</label>
              <input 
                {...register('password')}
                type="password"
                disabled={isSubmitting}
                className="w-full bg-brand-stone-800/50 border border-brand-stone-700 text-brand-stone-100 rounded-2xl px-4 py-3.5 focus:outline-none focus:ring-1 focus:ring-brand-emerald-500 focus:border-brand-emerald-500 transition-all placeholder:text-brand-stone-600 shadow-inner"
                placeholder="••••••••"
              />
              {errors.password && <p className="text-red-400 text-xs mt-1 pl-1">{errors.password.message}</p>}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-brand-stone-400 uppercase tracking-widest pl-1">新しいパスワード (確認用)</label>
              <input 
                {...register('confirmPassword')}
                type="password"
                disabled={isSubmitting}
                className="w-full bg-brand-stone-800/50 border border-brand-stone-700 text-brand-stone-100 rounded-2xl px-4 py-3.5 focus:outline-none focus:ring-1 focus:ring-brand-emerald-500 focus:border-brand-emerald-500 transition-all placeholder:text-brand-stone-600 shadow-inner"
                placeholder="••••••••"
              />
              {errors.confirmPassword && <p className="text-red-400 text-xs mt-1 pl-1">{errors.confirmPassword.message}</p>}
            </div>

            <button 
              type="submit" 
              disabled={isSubmitting}
              className="w-full bg-brand-stone-50 hover:bg-white text-brand-stone-900 font-semibold py-4 rounded-2xl transition-all active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center gap-2 mt-4 shadow-lg shadow-black/20"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="animate-spin" size={20} />
                  更新中...
                </>
              ) : (
                'パスワードを更新'
              )}
            </button>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
