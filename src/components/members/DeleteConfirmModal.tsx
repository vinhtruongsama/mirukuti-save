import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  memberName: string;
  variant?: 'soft' | 'hard';
}

export default function DeleteConfirmModal({ isOpen, onClose, onConfirm, memberName, variant = 'hard' }: DeleteConfirmModalProps) {
  if (!isOpen) return null;

  const isHard = variant === 'hard';

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
        {/* Backdrop - Extra Dark for focus */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className={cn(
            "absolute inset-0 backdrop-blur-sm transition-colors",
            isHard ? "bg-stone-950/90" : "bg-stone-900/60"
          )}
        />

        {/* Modal Body */}
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className={cn(
            "relative w-full max-w-sm bg-white rounded-[3rem] overflow-hidden border transition-all",
            isHard
              ? "shadow-[0_60px_120px_rgba(220,38,38,0.25)] border-red-50"
              : "shadow-[0_40px_80px_rgba(0,0,0,0.1)] border-stone-100"
          )}
        >
          {/* Close corner */}
          <button
            onClick={onClose}
            className={cn(
              "absolute top-6 right-6 transition-colors z-10",
              isHard ? "text-white/50 hover:text-white" : "text-stone-300 hover:text-stone-900"
            )}
          >
            <X size={20} />
          </button>

          {/* Intensity Header */}
          <div className={cn(
            "px-8 py-5 flex flex-col items-center text-center transition-colors",
            isHard ? "bg-red-600" : "bg-stone-50"
          )}>
            <h2 className={cn(
              "text-[18px] font-black text-[#4F5BD5] tighter uppercase font-sans",
              isHard ? "text-white" : "text-stone-900"
            )}>
              {isHard ? "緊急警告 (CAUTION)" : "解除の確認"}
            </h2>
          </div>

          {/* Core Message */}
          <div className="px-8 py-10 text-center">
            <div className="space-y-8">
              <h3 className="text-stone-900 text-[14px] font-bold leading-tight font-sans">
                {isHard ? (
                  <>
                    メンバー 「<span className="text-[16px] text-red-600 font-serif">{memberName}</span>」を<br />
                    完全に削除しますか？
                    <span className="block mt-1 text-[14px] text-rose-500 font-black tracking-widest bg-rose-50 py-2 rounded-lg">
                      ※ ログイン不能・復旧不可
                    </span>
                  </>
                ) : (
                  <>
                    メンバー 「<span className="text-[16px] text-[#4F5BD5] font-serif">{memberName}</span>」を<br />
                    解除箱へ移動しますか？
                  </>
                )}
              </h3>

              <div className="flex flex-col gap-2">
                <button
                  onClick={() => { onConfirm(); onClose(); }}
                  className={cn(
                    "w-full py-4 text-white rounded-xl font-black text-[13px] transition-all active:scale-95 font-sans",
                    isHard
                      ? "bg-red-600 hover:bg-red-700 shadow-lg shadow-red-200"
                      : "bg-[#4F5BD5] hover:bg-brand-stone-900 shadow-lg shadow-indigo-100"
                  )}
                >
                  {isHard ? "削除を確定する" : "解除箱へ送る"}
                </button>
                <button
                  onClick={onClose}
                  className="w-full py-4 bg-stone-50 hover:bg-stone-100 text-stone-400 rounded-xl font-black text-[12px] transition-all active:scale-95 font-sans"
                >
                  キャンセル
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

// Simple internal helper for joining classes
function cn(...classes: any[]) {
  return classes.filter(Boolean).join(' ');
}
