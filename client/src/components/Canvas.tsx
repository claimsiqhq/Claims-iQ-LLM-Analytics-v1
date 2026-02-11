import React from 'react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend 
} from 'recharts';
import { chartData } from "@/lib/mockData";
import { FilterList, Download, Refresh } from 'iconoir-react';
import { Info } from 'lucide-react';
import emptyStateImg from "@/assets/empty-state.png";

const ChartArea = () => {
  return (
    <div className="w-full h-full min-h-[400px] bg-white rounded-xl border border-surface-grey-lavender p-6 shadow-sm relative overflow-hidden group animate-in zoom-in-95 duration-500">
      {/* Chart Header */}
      <div className="flex justify-between items-start mb-8">
        <div>
          <h2 className="text-xl font-display font-semibold text-brand-deep-purple mb-1">
            SLA Breach Rate by Month
          </h2>
          <p className="text-sm text-text-secondary font-body">
            Showing breach percentage vs baseline target (Last 6 Months)
          </p>
        </div>
        <div className="flex gap-2">
          <button className="p-2 hover:bg-surface-purple-light rounded-lg text-text-secondary hover:text-brand-purple transition-colors">
            <FilterList className="w-5 h-5" />
          </button>
          <button className="p-2 hover:bg-surface-purple-light rounded-lg text-text-secondary hover:text-brand-purple transition-colors">
            <Download className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Chart */}
      <div className="h-[350px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E3DFE8" />
            <XAxis 
              dataKey="name" 
              axisLine={false} 
              tickLine={false} 
              tick={{ fill: '#6B6280', fontSize: 12, fontFamily: 'Source Sans Pro' }} 
              dy={10}
            />
            <YAxis 
              axisLine={false} 
              tickLine={false} 
              tick={{ fill: '#6B6280', fontSize: 12, fontFamily: 'Space Mono' }} 
            />
            <Tooltip 
              cursor={{ fill: '#F0E6FA', opacity: 0.4 }}
              contentStyle={{ 
                backgroundColor: '#342A4F', 
                border: 'none', 
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                color: '#fff'
              }}
              itemStyle={{ fontFamily: 'Source Sans Pro', fontSize: '13px' }}
              labelStyle={{ color: '#9D8BBF', marginBottom: '4px', fontFamily: 'Source Sans Pro', fontWeight: 600 }}
            />
            <Legend 
              wrapperStyle={{ paddingTop: '20px' }} 
              iconType="circle"
              formatter={(value) => <span style={{ color: '#342A4F', fontSize: '14px', fontFamily: 'Source Sans Pro', fontWeight: 500 }}>{value}</span>}
            />
            <Bar 
              dataKey="value" 
              name="Current Vol" 
              fill="#7763B7" 
              radius={[4, 4, 0, 0]} 
              barSize={32}
              animationDuration={1500}
            />
            <Bar 
              dataKey="baseline" 
              name="Target Baseline" 
              fill="#C6A54E" 
              radius={[4, 4, 0, 0]} 
              barSize={32}
              animationDuration={1500}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Metadata Bar */}
      <div className="mt-6 pt-4 border-t border-surface-grey-lavender flex items-center justify-between text-xs text-text-secondary">
        <div className="flex gap-4">
          <span className="flex items-center gap-1.5">
            <Info className="w-4 h-4 text-brand-purple-secondary" />
            Definition: Breach &gt; 48hrs without action
          </span>
          <span className="flex items-center gap-1.5">
            <Refresh className="w-4 h-4 text-brand-gold" />
            Data updated: Live
          </span>
        </div>
        <div className="font-mono bg-surface-purple-light px-2 py-1 rounded text-brand-deep-purple">
          n=4,293 records
        </div>
      </div>
    </div>
  );
};

export const Canvas = ({ activeThreadId }: { activeThreadId: string | null }) => {
  if (!activeThreadId || activeThreadId === 'new') {
    return (
      <div className="ml-[360px] pt-14 min-h-screen bg-surface-off-white flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-500">
        <div className="max-w-md">
           <img src={emptyStateImg} alt="No Data" className="w-64 h-64 object-contain mx-auto opacity-90 mix-blend-multiply mb-6" />
           <h2 className="text-2xl font-display font-bold text-brand-deep-purple mb-3">
             Claims Intelligence Layer
           </h2>
           <p className="text-brand-purple-secondary font-body mb-8 leading-relaxed">
             Select a thread from the history or start a new conversation to analyze claims data, SLAs, and litigation risks.
           </p>
           {/* Chips hints */}
           <div className="flex flex-wrap gap-2 justify-center opacity-60">
             <span className="px-3 py-1 bg-white rounded-full text-xs text-text-secondary border border-surface-grey-lavender">Breach Rate?</span>
             <span className="px-3 py-1 bg-white rounded-full text-xs text-text-secondary border border-surface-grey-lavender">Backlog Analysis</span>
             <span className="px-3 py-1 bg-white rounded-full text-xs text-text-secondary border border-surface-grey-lavender">Cost Drivers</span>
           </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ml-[360px] pt-14 min-h-screen bg-surface-off-white p-8">
      <div className="max-w-[1000px] mx-auto space-y-8">
        
        {/* Insight Summary */}
        <div className="bg-white border-l-4 border-brand-purple p-6 rounded-r-xl shadow-sm animate-in slide-in-from-bottom-4 duration-500">
          <h3 className="text-lg font-display font-bold text-brand-deep-purple mb-2">
            Insight Summary
          </h3>
          <p className="text-brand-deep-purple font-body text-[16px] leading-relaxed">
            Adjuster <span className="font-semibold text-brand-purple">Sarah J.</span> has the highest breach rate at <span className="font-mono font-bold bg-brand-purple-light/30 px-1 rounded">12%</span>, primarily driven by complex liability claims in the Northeast region. Overall breach rate is trending up <span className="text-status-alert font-bold">2.4%</span> compared to last month's baseline.
          </p>
        </div>

        {/* Chart Section */}
        <ChartArea />
      </div>
    </div>
  );
};
