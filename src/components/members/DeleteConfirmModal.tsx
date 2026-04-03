import { AlertTriangle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  memberName: string;
}

export default function DeleteConfirmModal({ isOpen, onClose, onConfirm, memberName }: DeleteConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
        {/* Backdrop - Extra Dark for focus */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-stone-950/90 backdrop-blur-sm"
        />

        {/* Modal Body */}
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="relative w-full max-w-sm bg-white rounded-[3rem] shadow-[0_60px_120px_rgba(220,38,38,0.25)] overflow-hidden border border-red-50"
        >
          {/* Close corner */}
          <button
            onClick={onClose}
            className="absolute top-6 right-6 text-white/50 hover:text-white transition-colors z-10"
          >
            <X size={20} />
          </button>

          {/* Intensity Header */}
          <div className="bg-red-600 px-8 py-5 flex flex-col items-center text-center">
            <h2 className="text-white text-[16px] font-black tracking-tighter uppercase font-serif">
              緊急警告 (CAUTION)
            </h2>
          </div>

          {/* Core Message */}
          <div className="px-8 py-10 text-center">
            <div className="space-y-8">
              <h3 className="text-stone-900 text-[14px] font-bold leading-tight font-sans">
                メンバー 「<span className="text-[16px] text-red-600 font-serif">{memberName}</span>」<br />
                をリストから除外しますか？
              </h3>

              <div className="flex flex-col gap-2">
                <button
                  onClick={() => { onConfirm(); onClose(); }}
                  className="w-full py-4 bg-red-600 hover:bg-red-700 text-white rounded-xl font-black text-[13px] shadow-lg shadow-red-200 transition-all active:scale-95 font-sans"
                >
                  削除を確定する
                </button>
                <button
                  onClick={onClose}
                  className="w-full py-4 bg-stone-50 hover:bg-stone-100 text-stone-400 rounded-xl font-black text-[12px] transition-all active:scale-95 font-sans"
                >
                  キャンセル (Cancel)
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
