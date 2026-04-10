import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MessageCircle, Send, CheckCircle2, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/useAuthStore';

interface InquiryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function InquiryModal({ isOpen, onClose }: InquiryModalProps) {
  const { currentUser } = useAuthStore();
  const [message, setMessage] = useState('');
  const [name, setName] = useState(currentUser?.full_name || '');
  const [email, setEmail] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isDone, setIsDone] = useState(false);

  const handleSubmit = async () => {
    const isUnauthenticated = !currentUser;
    if (!message.trim() || !name.trim() || (isUnauthenticated && !email.trim())) return;
    setIsSending(true);

    try {
      const { error } = await supabase.from('inquiries').insert({
        user_id: currentUser?.id || null,
        full_name: name.trim(),
        contact_email: isUnauthenticated ? email.trim() : currentUser?.email || null,
        message: message.trim(),
      });

      if (error) throw error;
      setIsDone(true);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSending(false);
    }
  };

  const handleClose = () => {
    // Reset state after close animation
    setTimeout(() => {
      setMessage('');
      setName(currentUser?.full_name || '');
      setEmail('');
      setIsDone(false);
    }, 300);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-md"
            onClick={handleClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, y: 60, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 60, scale: 0.95 }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="relative z-10 w-full max-w-lg bg-white rounded-[2.5rem] shadow-[0_40px_100px_rgba(0,0,0,0.15)] overflow-hidden"
          >
            {/* Gradient Header Bar */}
            <div className="h-1.5 w-full bg-gradient-to-r from-[#D62976] via-[#4F5BD5] to-[#FEDA75]" />

            {/* Close Button */}
            <button
              onClick={handleClose}
              className="absolute top-5 right-5 w-10 h-10 bg-stone-100 hover:bg-rose-50 hover:text-rose-500 rounded-2xl flex items-center justify-center transition-all"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="p-8 pt-7">
              {/* Title */}
              <div className="flex items-center gap-3 mb-7">
                <div className="w-11 h-11 bg-[#4F5BD5]/10 rounded-2xl flex items-center justify-center">
                  <MessageCircle className="w-5 h-5 text-[#4F5BD5]" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-stone-900 tracking-tight">問い合わせ</h2>
                  <p className="text-[11px] font-bold text-stone-400 uppercase tracking-widest">Contact Us</p>
                </div>
              </div>

              <AnimatePresence mode="wait">
                {!isDone ? (
                  <motion.div
                    key="form"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="space-y-5"
                  >
                    {/* Name & Email Fields for Guests */}
                    {!currentUser && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-[12px] font-black text-stone-500 uppercase tracking-widest">お名前</label>
                          <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="お名前"
                            className="w-full bg-stone-50 border border-stone-200 rounded-2xl px-5 py-3.5 text-sm font-bold text-stone-900 focus:outline-none focus:border-[#4F5BD5]/50 focus:bg-white transition-all placeholder:text-stone-300"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[12px] font-black text-stone-500 uppercase tracking-widest">連絡先メール</label>
                          <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="example@mail.com"
                            className="w-full bg-stone-50 border border-stone-200 rounded-2xl px-5 py-3.5 text-sm font-bold text-stone-900 focus:outline-none focus:border-[#4F5BD5]/50 focus:bg-white transition-all placeholder:text-stone-300"
                          />
                        </div>
                      </div>
                    )}

                    {/* Message Field */}
                    <div className="space-y-2">
                      <label className="text-[12px] font-black text-stone-500 uppercase tracking-widest">メッセージ</label>
                      <textarea
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        rows={5}
                        placeholder="ご質問・ご要望をご記入ください..."
                        className="w-full bg-stone-50 border border-stone-200 rounded-2xl px-5 py-4 text-sm font-medium text-stone-900 focus:outline-none focus:border-[#4F5BD5]/50 focus:bg-white transition-all resize-none placeholder:text-stone-300 leading-relaxed"
                      />
                    </div>

                    <p className="text-[11px] text-stone-400 font-medium leading-relaxed px-1">
                      ✦ ご回答はLINEにてお送りします。しばらくお待ちください。
                    </p>

                    {/* Submit Button */}
                    <button
                      onClick={handleSubmit}
                      disabled={isSending || !message.trim() || !name.trim() || (!currentUser && !email.trim())}
                      className="w-full py-4 bg-gradient-to-r from-[#D62976] to-[#4F5BD5] text-white font-black text-sm uppercase tracking-widest rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-[#D62976]/20 hover:brightness-110 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {isSending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          送信する
                        </>
                      )}
                    </button>
                  </motion.div>
                ) : (
                  <motion.div
                    key="done"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center text-center gap-5 py-6"
                  >
                    <div className="w-20 h-20 bg-emerald-50 rounded-3xl flex items-center justify-center">
                      <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-stone-900 mb-2">送信完了！</h3>
                      <p className="text-stone-500 font-medium leading-relaxed text-sm">
                        お問い合わせいただきありがとうございます。<br />
                        LINEにてご回答いたしますので、<br />
                        しばらくお待ちください 🍵
                      </p>
                    </div>
                    <button
                      onClick={handleClose}
                      className="px-8 py-3 bg-stone-100 hover:bg-stone-200 text-stone-700 font-black text-sm rounded-2xl transition-all"
                    >
                      閉じる
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
