import * as Select from '@radix-ui/react-select';
import { ChevronDown, Calendar, Check } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

export const YearSelector = ({ variant = 'light' }: { variant?: 'light' | 'dark' }) => {
  const { academicYears, selectedYear, setSelectedYear } = useAppStore();

  if (!academicYears || academicYears.length === 0) return null;

  const isDark = variant === 'dark';

  return (
    <Select.Root
      value={selectedYear?.id}
      onValueChange={(id: string) => {
        const year = academicYears.find((y) => y.id === id);
        if (year) setSelectedYear(year);
      }}
    >
      <Select.Trigger
        className={`
          flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-all outline-none border
          ${isDark 
            ? 'bg-brand-stone-900/50 border-brand-stone-800 text-brand-stone-200 hover:bg-brand-stone-800 hover:border-brand-stone-700 shadow-xl shadow-black/20' 
            : 'bg-white/80 backdrop-blur-md border-brand-stone-200 text-brand-stone-700 hover:bg-white hover:border-brand-emerald-200 shadow-sm'
          }
        `}
      >
        <Calendar className={`w-4 h-4 ${isDark ? 'text-brand-stone-500' : 'text-brand-emerald-600'}`} />
        <Select.Value placeholder="学年度を選択">
          {selectedYear?.name}
        </Select.Value>
        <Select.Icon>
          <ChevronDown className={`w-4 h-4 ${isDark ? 'text-brand-stone-600' : 'text-brand-stone-400'}`} />
        </Select.Icon>
      </Select.Trigger>

      <Select.Portal>
        <Select.Content
          className={`
            z-[100] overflow-hidden rounded-xl border shadow-2xl animate-in fade-in zoom-in-95 duration-200
            ${isDark 
              ? 'bg-brand-stone-900 border-brand-stone-800' 
              : 'bg-white border-brand-stone-100'
            }
          `}
        >
          <Select.Viewport className="p-1">
            {academicYears.map((year) => (
              <Select.Item
                key={year.id}
                value={year.id}
                className={`
                  relative flex items-center gap-2 px-8 py-2.5 rounded-lg text-sm font-medium outline-none cursor-pointer transition-colors
                  ${isDark 
                    ? 'text-brand-stone-400 focus:bg-brand-stone-800 focus:text-brand-stone-100' 
                    : 'text-brand-stone-600 focus:bg-brand-emerald-50 focus:text-brand-emerald-700'
                  }
                  data-[state=checked]:font-bold
                `}
              >
                <Select.ItemText>{year.name}</Select.ItemText>
                <Select.ItemIndicator className="absolute left-2 flex items-center">
                  <Check className={`w-4 h-4 ${isDark ? 'text-brand-emerald-500' : 'text-brand-emerald-600'}`} />
                </Select.ItemIndicator>
                {year.is_current && (
                  <span className={`ml-auto text-[10px] uppercase tracking-tighter px-1.5 py-0.5 rounded-sm font-bold ${isDark ? 'bg-brand-emerald-950/30 text-brand-emerald-500' : 'bg-brand-emerald-100 text-brand-emerald-600'}`}>
                    現在
                  </span>
                )}
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
};
