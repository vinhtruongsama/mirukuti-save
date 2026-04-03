import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  Mail, 
  Phone, 
  MapPin, 
  GraduationCap, 
  User, 
  ShieldCheck, 
  Calendar, 
  Hash, 
  MessagesSquare,
  Globe
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface MemberDetailDrawerProps {
  member: any | null; // Full member data object
  isOpen: boolean;
  onClose: () => void;
}

export default function MemberDetailDrawer({ member, isOpen, onClose }: MemberDetailDrawerProps) {
  if (!member) return null;

  const roleLabels: Record<string, { label: string; bg: string; text: string }> = {
    admin: { label: '管理者', bg: 'bg-[#D62976]/10', text: 'text-[#D62976]' },
    executive: { label: '運営', bg: 'bg-[#4F5BD5]/10', text: 'text-[#4F5BD5]' },
    member: { label: 'メンバー', bg: 'bg-[#FEDA75]/10', text: 'text-[#CDA01E]' },
    alumni: { label: '卒業生', bg: 'bg-stone-100', text: 'text-stone-500' },
  };

  const getGradeStyle = (year: number) => {
    switch (year) {
      case 1: return 'bg-[#4F5BD5] text-white'; // Fresh blue
      case 4: return 'bg-[#CDA01E] text-white'; // Gold/Bronze for seniors
      default: return 'bg-stone-200 text-stone-700';
    }
  };

  const detailConfig = [
    { label: '氏名', value: member.users?.full_name, sub: member.users?.full_name_kana, icon: User },
    { label: '学籍番号', value: member.users?.mssv, icon: Hash },
    { label: '役割', value: roleLabels[member.role]?.label || '不明', icon: ShieldCheck, badge: true },
    { label: '学年', value: `${member.university_year}年生`, icon: GraduationCap, yearBadge: true },
    { label: '学部', value: member.department || '未設定', icon: Globe },
    { label: '連絡用メール', value: member.users?.email, icon: Mail, copy: true },
    { label: '大学メール', value: member.users?.university_email || '未設定', icon: GraduationCap },
    { label: '電話番号', value: member.users?.phone || '未設定', icon: Phone },
    { label: 'LINE名', value: member.users?.line_nickname || '未設定', icon: MessagesSquare },
    { label: '出身地', value: member.users?.hometown || '未設定', icon: MapPin },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay - Japanese accessibility focus */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-stone-900/60 backdrop-blur-md z-[100]"
          />

          {/* Drawer - Slide-over Panel (Right) */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 h-full w-full max-w-lg bg-white shadow-[-30px_0_100px_rgba(0,0,0,0.15)] z-[101] flex flex-col overflow-hidden"
          >
            {/* Header Area */}
            <div className="relative px-8 pt-12 pb-8 shrink-0 bg-stone-50/50">
              <button 
                onClick={onClose}
                className="absolute top-6 right-6 p-3 text-stone-400 hover:text-stone-900 transition-all active:scale-90"
              >
                <X size={24} />
              </button>

              <div className="flex items-center gap-6">
                <div className="w-24 h-24 rounded-[2rem] bg-gradient-to-tr from-stone-100 to-white border-2 border-white shadow-xl flex items-center justify-center text-3xl font-black text-stone-500">
                  {member.users?.full_name?.charAt(0) || '?'}
                </div>
                <div>
                  <h2 className="text-3xl font-black text-stone-900 tracking-tight leading-tight">
                    {member.users?.full_name}
                  </h2>
                  <p className="text-[14px] font-black uppercase text-stone-400 tracking-[0.2em] mt-1">
                    MEMBER PROFILE / ID: {member.users?.mssv}
                  </p>
                </div>
              </div>
            </div>

            {/* Scrollable Content Area */}
            <div className="flex-1 overflow-y-auto px-8 py-4 space-y-8 custom-scrollbar">
              
              {/* Profile Details Grid */}
              <div className="grid grid-cols-1 gap-6">
                {detailConfig.map((item, idx) => (
                  <motion.div 
                    key={item.label}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 + idx * 0.05 }}
                    className="group"
                  >
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-xl bg-stone-50 flex items-center justify-center shrink-0 text-stone-300 group-hover:text-[#4F5BD5] transition-colors">
                        <item.icon size={18} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <label className="text-[11px] font-black uppercase text-stone-400 tracking-[0.15em] mb-1 block">
                          {item.label}
                        </label>
                        <div className="flex items-center gap-3">
                          {item.badge ? (
                             <span className={cn("px-4 py-1.5 rounded-full text-[13px] font-black tracking-wider uppercase", roleLabels[member.role]?.bg, roleLabels[member.role]?.text)}>
                               {item.value}
                             </span>
                          ) : item.yearBadge ? (
                             <span className={cn("px-4 py-1.5 rounded-full text-[13px] font-black tracking-wider", getGradeStyle(member.university_year))}>
                               {item.value}
                             </span>
                          ) : (
                             <span className="text-[17px] font-bold text-stone-800 break-words leading-tight">
                               {item.value}
                               {item.sub && <span className="block text-[13px] text-stone-400 font-medium mt-1">({item.sub})</span>}
                             </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Status Section */}
              <div className="pt-6 border-t border-stone-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                   <Calendar size={14} className="text-stone-300" />
                   <span className="text-[11px] font-black uppercase text-stone-400 tracking-widest leading-none">
                     登録日: {new Date(member.created_at).toLocaleDateString('ja-JP')}
                   </span>
                </div>
                <div className={cn(
                  "flex items-center gap-2 px-4 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-widest",
                  member.is_active ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
                )}>
                  {member.is_active ? "Active" : "Inactive"}
                </div>
              </div>
            </div>

            {/* Bottom Actions Area */}
            <div className="p-8 border-t border-stone-100 shrink-0 bg-stone-50/30 flex gap-4">
               <button 
                 onClick={onClose}
                 className="flex-1 h-16 bg-white border border-stone-200 text-stone-900 rounded-[1.5rem] font-black text-[15px] hover:bg-stone-50 active:scale-95 transition-all shadow-sm"
               >
                 閉じる (Close)
               </button>
            </div>

          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
