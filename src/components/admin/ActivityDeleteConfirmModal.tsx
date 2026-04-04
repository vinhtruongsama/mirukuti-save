import { AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ActivityDeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
}

export default function ActivityDeleteConfirmModal({ isOpen, onClose, onConfirm, title }: ActivityDeleteConfirmModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
          {/* Backdrop - High focus */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-gray-900/80 backdrop-blur-sm"
          />

          {/* Modal Body */}
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            className="relative w-full max-w-sm bg-white rounded-[2.5rem] shadow-[0_40px_100px_rgba(220,38,38,0.2)] overflow-hidden border border-red-100"
          >
            {/* Header */}
            <div className="bg-rose-500 px-8 py-5 flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center mb-2">
                <AlertTriangle className="text-white w-6 h-6" />
              </div>
              <h2 className="text-white text-[14px] font-black tracking-widest uppercase">
                活動を削除しますか？
              </h2>
            </div>

            {/* Content */}
            <div className="px-10 py-12 text-center space-y-10">
              <div className="space-y-4">
                <h3 className="text-gray-900 text-xl font-black leading-tight px-2 font-serif">
                  「<span className="text-[#D62976]">{title}</span>」を<br />
                  完全に削除しますか？
                </h3>
                <p className="text-[11px] font-bold text-gray-700 leading-relaxed max-w-[200px] mx-auto">
                  ※この操作は取り消せません。関連するすべての登録データも失われます。
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 py-3.5 text-[#4F5BD5] hover:bg-[#4F5BD5]/5 rounded-2xl font-black text-[13px] uppercase tracking-widest transition-all active:scale-95"
                >
                  キャンセル
                </button>
                <button
                  onClick={() => { onConfirm(); onClose(); }}
                  className="flex-[1.5] py-3.5 bg-[#D62976] hover:bg-[#c1256a] text-white rounded-2xl font-black text-[13px] shadow-lg shadow-rose-200 transition-all active:scale-95 tracking-widest uppercase"
                >
                  削除
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
