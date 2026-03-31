import { useQuery } from '@tanstack/react-query';
import { Users, CalendarDays, Loader2, BarChart3 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { motion } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import { useAppStore } from '../../store/useAppStore';

export default function Dashboard() {
  const { selectedYear } = useAppStore();

  // 1. Fetch Current Year Stats
  const { data: stats, isLoading: isStatsLoading } = useQuery({
    queryKey: ['admin-stats', selectedYear?.id],
    queryFn: async () => {
      if (!selectedYear) return null;
      const yearId = selectedYear.id;

      const [membersRes, upcomingRes, activitiesRes] = await Promise.all([
        supabase.from('club_memberships').select('id', { count: 'exact', head: true }).eq('academic_year_id', yearId).is('deleted_at', null).eq('is_active', true),
        supabase.from('activities').select('id', { count: 'exact', head: true }).eq('academic_year_id', yearId).is('deleted_at', null).gte('date', new Date().toISOString()),
        supabase.from('activities').select('id, registrations(count)').eq('academic_year_id', yearId).is('deleted_at', null)
      ]);

      const totalActivities = (activitiesRes.data as any[])?.length || 0;
      const totalRegistrations = ((activitiesRes.data as any[]) || []).reduce((sum, act: any) => sum + (act.registrations?.[0]?.count || 0), 0);

      return {
        members: membersRes.count || 0,
        activities: totalActivities,
        upcoming: upcomingRes.count || 0,
        registrations: totalRegistrations
      };
    },
    enabled: !!selectedYear,
  });

  // 2. Fetch Historical Data for Charts
  const { data: chartData, isLoading: isChartLoading } = useQuery({
    queryKey: ['admin-chart-data'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('academic_years')
        .select(`
          id, name,
          club_memberships (count),
          activities (count)
        `)
        .order('name', { ascending: true });
        
      if (error) throw error;

      return (data || []).map((year: any) => ({
        name: year.name,
        '会員数': year.club_memberships?.[0]?.count || 0,
        '活動数': year.activities?.[0]?.count || 0
      }));
    }
  });

  return (
    <div className="h-full flex flex-col space-y-6 md:space-y-8 overflow-hidden">
      {/* 1. Compact Metric Cards (Top Section) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6 shrink-0">
        {[
          { label: '会員総数', value: stats?.members, icon: Users, color: 'text-[#4F5BD5]', bg: 'bg-[#4F5BD5]/5', borderColor: 'border-[#4F5BD5]/10', delay: 0.1 },
          { label: '活動総数', value: stats?.activities, icon: CalendarDays, color: 'text-[#D62976]', bg: 'bg-[#D62976]/5', borderColor: 'border-[#D62976]/10', delay: 0.2 },
        ].map((stat, i) => (
          <motion.div 
            key={i} 
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: stat.delay }}
            className={`relative bg-white border ${stat.borderColor} p-4 md:p-5 rounded-2xl flex items-center justify-between group hover:shadow-lg hover:shadow-[#4F5BD5]/5 transition-all duration-500 overflow-hidden shadow-sm`}
          >
            <div className="flex items-center gap-4">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${stat.bg} ${stat.color} border ${stat.borderColor}`}>
                 <stat.icon className="w-5 h-5" />
              </div>
              <p className="text-lg font-black text-brand-stone-900 tracking-tighter leading-none">{stat.label}</p>
            </div>
            <div className="text-right">
              {isStatsLoading ? (
                <div className="h-6 w-10 bg-brand-stone-50 animate-pulse rounded-md"></div>
              ) : (
                <h3 className="text-2xl font-black text-brand-stone-900 tracking-tighter leading-none">{stat.value || 0}</h3>
              )}
            </div>
            <div className={`absolute bottom-0 right-0 w-12 h-12 ${stat.bg} blur-[25px] translate-x-1/2 translate-y-1/2`} />
          </motion.div>
        ))}
      </div>

      {/* 2. Fluid Analytics Chart Container (Center Section) */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="flex-1 min-h-0 bg-white border border-brand-stone-100 rounded-[2rem] p-6 md:p-10 shadow-xl shadow-brand-stone-200/10 flex flex-col relative overflow-hidden"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#FEDA75]/10 rounded-xl">
               <BarChart3 className="w-5 h-5 text-brand-stone-900" />
            </div>
            <h3 className="text-lg font-black text-brand-stone-900 tracking-tight">年度別の成長推移</h3>
          </div>
          
          <div className="hidden md:flex items-center gap-3 px-4 py-2 bg-brand-stone-50 rounded-xl border border-brand-stone-100">
             <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
             <span className="text-[10px] font-black text-brand-stone-500 tracking-widest uppercase">Real-Time Sync</span>
          </div>
        </div>

        <div className="flex-1 w-full min-h-0">
          {isChartLoading ? (
            <div className="w-full h-full flex items-center justify-center">
               <Loader2 className="w-10 h-10 text-[#D62976] animate-spin opacity-20" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 0, right: 10, left: -20, bottom: 0 }} barGap={10}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f8fafc" vertical={false} />
                <XAxis 
                  dataKey="name" 
                  stroke="#cbd5e1" 
                  fontSize={10} 
                  fontWeight={900}
                  tickLine={false} 
                  axisLine={false} 
                  dy={10}
                />
                <YAxis 
                  stroke="#cbd5e1" 
                  fontSize={10} 
                  fontWeight={900}
                  tickLine={false} 
                  axisLine={false} 
                />
                <Tooltip 
                  cursor={{ fill: '#f8fafc', radius: 8 }}
                  contentStyle={{ 
                    backgroundColor: 'white', 
                    border: '1px solid #f1f5f9', 
                    borderRadius: '1.5rem', 
                    padding: '16px',
                    boxShadow: '0 20px 50px -12px rgba(0,0,0,0.08)'
                  }}
                  itemStyle={{ fontWeight: 900, fontSize: '12px' }}
                />
                <Legend 
                  iconType="circle" 
                  wrapperStyle={{ 
                    fontSize: '10px', 
                    fontWeight: 900, 
                    paddingTop: '30px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    color: '#94a3b8'
                  }} 
                />
                <Bar name="会員数" dataKey="会員数" fill="#4F5BD5" radius={[8, 8, 0, 0]} maxBarSize={30} />
                <Bar name="活動数" dataKey="活動数" fill="#D62976" radius={[8, 8, 0, 0]} maxBarSize={30} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </motion.div>
      
      {/* 3. Compact Support Footer (Bottom Section) */}
      <div className="pt-4 flex items-center justify-between border-t border-brand-stone-50 shrink-0 opacity-40 hover:opacity-100 transition-opacity">
        <span className="text-[10px] font-black tracking-widest text-brand-stone-400 uppercase">Administrator Panel v2.0</span>
        <div className="flex items-center gap-6">
           <button className="text-[10px] font-black tracking-widest text-[#4F5BD5] hover:underline uppercase">Export Data</button>
           <button className="text-[10px] font-black tracking-widest text-[#D62976] hover:underline uppercase">System Log</button>
        </div>
      </div>
    </div>
  );
}
