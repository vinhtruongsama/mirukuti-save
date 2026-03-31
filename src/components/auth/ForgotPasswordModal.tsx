import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mail, Fingerprint, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';

const forgotPasswordSchema = z.object({
  email: z.string().min(1, 'メールアドレスを入力してください').email('有効なメールアドレスを入力してください'),
  user_id: z.string().min(1, '会員IDを入力してください'),
});

type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;

interface ForgotPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ForgotPasswordModal: React.FC<ForgotPasswordModalProps> = ({ isOpen, onClose }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isShake, setIsShake] = useState(false);

  const { register, handleSubmit, formState: { errors }, reset } = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema)
  });

  const onSubmit = async (data: ForgotPasswordFormData) => {
    setIsSubmitting(true);
    try {
      const { data: response, error } = await supabase.functions.invoke('reset-password-flow', {
        body: { 
          email: data.email, 
          user_id: data.user_id 
        }
      });

      if (error) throw error;
      if (response?.error) throw new Error(response.error);

      toast.success('メールを確認して臨時パスワードを受け取ってください。');
      reset();
      onClose();
    } catch (error: any) {
      setIsShake(true);
      setTimeout(() => setIsShake(false), 500);
      toast.error(error.message || '情報が正しくないか、エラーが発生しました。');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
          />

          {/* Modal */}
          <div className="fixed inset-0 flex items-center justify-center z-[101] pointer-events-none p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ 
                opacity: 1, 
                scale: 1, 
                y: 0,
                x: isShake ? [0, -10, 10, -10, 10, 0] : 0
              }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ 
                type: 'spring', 
                damping: 25, 
                stiffness: 300,
                x: { duration: 0.4 } 
              }}
              className="bg-white/95 backdrop-blur-[32px] border border-white/50 w-full max-w-md rounded-[40px] p-10 shadow-[0_32px_120px_rgba(0,0,0,0.15)] pointer-events-auto relative overflow-hidden"
            >
              {/* Decorative top accent using user palette */}
              <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-[#4F5BD5] via-[#D62976] to-[#FEDA75] opacity-80" />

              <button 
                onClick={onClose}
                className="absolute top-8 right-8 p-2 rounded-full hover:bg-stone-100 text-stone-400 hover:text-black transition-all active:scale-90"
              >
                <X size={22} />
              </button>

              <div className="mb-10">
                <div className="w-14 h-14 bg-gradient-to-tr from-[#4F5BD5] to-[#D62976] rounded-[22px] flex items-center justify-center text-white mb-6 shadow-lg shadow-indigo-500/20">
                  <Fingerprint size={28} />
                </div>
                <h2 className="text-[1.6rem] font-black text-black tracking-tight">パスワードの再設定</h2>
                <p className="text-black/60 text-[0.9rem] mt-2 font-medium">
                  登録情報を入力して臨時パスワードを受信してください。
                </p>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[0.85rem] font-black text-black uppercase tracking-[0.2em] pl-1">メールアドレス</label>
                  <div className="relative group">
                    <Mail size={20} className="absolute left-4 top-[1.1rem] text-stone-400 group-focus-within:text-[#4F5BD5] transition-colors" />
                    <input 
                      {...register('email')}
                      type="email"
                      placeholder="email@example.com"
                      className="w-full bg-stone-50/60 border border-stone-200 text-black font-bold rounded-2xl pl-12 pr-4 py-4 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:bg-white focus:border-indigo-500/30 transition-all placeholder:text-stone-400 shadow-inner"
                      disabled={isSubmitting}
                    />
                  </div>
                  {errors.email && <p className="text-red-600 text-[0.75rem] font-bold pl-1 mt-1">{errors.email.message}</p>}
                </div>

                <div className="space-y-2">
                  <label className="text-[0.85rem] font-black text-black uppercase tracking-[0.2em] pl-1">学籍番号</label>
                  <div className="relative group">
                    <Fingerprint size={20} className="absolute left-4 top-[1.1rem] text-stone-400 group-focus-within:text-[#4F5BD5] transition-colors" />
                    <input 
                      {...register('user_id')}
                      type="text"
                      placeholder="学籍番号 (Student ID)"
                      className="w-full bg-stone-50/60 border border-stone-200 text-black font-bold rounded-2xl pl-12 pr-4 py-4 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:bg-white focus:border-indigo-500/30 transition-all placeholder:text-stone-400 shadow-inner"
                      disabled={isSubmitting}
                    />
                  </div>
                  {errors.user_id && <p className="text-red-600 text-[0.75rem] font-bold pl-1 mt-1">{errors.user_id.message}</p>}
                </div>

                <button 
                  type="submit" 
                  disabled={isSubmitting}
                  className="w-full bg-gradient-to-r from-[#4F5BD5] to-[#D62976] hover:brightness-110 text-white font-black text-[1.05rem] py-4.5 rounded-[22px] transition-all active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center gap-2 mt-6 shadow-xl shadow-indigo-500/20 tracking-wider h-14"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="animate-spin" size={22} />
                      <span>送信中...</span>
                    </>
                  ) : (
                    '送信する'
                  )}
                </button>
              </form>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
};
