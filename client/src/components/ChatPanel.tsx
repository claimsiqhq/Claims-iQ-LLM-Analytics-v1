import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, 
  Pin, 
  GraphUp, 
  StatsReport, 
  Table as TableIcon,
  SendDiagonal,
  NavArrowLeft,
  MoreHoriz
} from 'iconoir-react';
import { PieChart as PieChartIcon, BarChart3 as BarChartIcon } from 'lucide-react';
import { cn } from "@/lib/utils";
import { threads, promptChips, messages } from "@/lib/mockData";

const ThreadItem = ({ thread, isActive, onClick }: { thread: any, isActive: boolean, onClick: () => void }) => {
  const Icon = {
    'bar': GraphUp,
    'line': StatsReport,
    'pie': PieChartIcon,
    'table': TableIcon
  }[thread.type as string] || GraphUp;

  return (
    <div 
      onClick={onClick}
      className={cn(
        "group relative h-16 w-full flex items-center px-4 cursor-pointer transition-all duration-200 border-b border-surface-grey-lavender/40 hover:bg-surface-purple-light/50",
        isActive ? "bg-brand-purple-light/20" : "bg-white"
      )}
    >
      {/* Active Indicator Bar */}
      <div className={cn(
        "absolute left-0 top-0 bottom-0 w-[3px] transition-colors duration-200",
        isActive ? "bg-brand-purple" : "bg-transparent group-hover:bg-brand-purple-light"
      )} />

      <div className="flex-1 min-w-0 pr-2">
        <p className={cn(
          "font-body text-[13px] leading-tight line-clamp-2 transition-colors",
          isActive ? "text-brand-deep-purple font-medium" : "text-brand-deep-purple/90"
        )}>
          {thread.label}
        </p>
      </div>

      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-1">
          {thread.pinned && <Pin className="w-3.5 h-3.5 text-brand-gold fill-brand-gold" strokeWidth={2} />}
          <Icon className="w-4 h-4 text-brand-purple-secondary" strokeWidth={1.5} />
        </div>
        <span className="text-[11px] text-text-secondary">{thread.timestamp}</span>
      </div>
    </div>
  );
};

const ChatMessage = ({ message }: { message: any }) => {
  const isUser = message.role === 'user';
  
  if (isUser) {
    return (
      <div className="flex justify-end mb-6 animate-in slide-in-from-right-4 duration-500">
        <div className="max-w-[85%] bg-brand-purple text-white px-4 py-3 rounded-tl-xl rounded-tr-xl rounded-bl-xl shadow-sm text-sm font-body leading-relaxed">
          {message.content}
        </div>
      </div>
    );
  }

  // System Message Card
  return (
    <div className="flex justify-start mb-6 animate-in slide-in-from-left-4 duration-500">
      <div className="max-w-[90%] bg-white border border-surface-grey-lavender rounded-xl p-3 shadow-sm hover:shadow-md hover:border-brand-purple-light transition-all cursor-pointer group">
        <div className="flex items-start gap-3">
          {/* Thumbnail / Icon */}
          <div className="w-12 h-12 rounded-lg bg-surface-purple-light flex items-center justify-center shrink-0 group-hover:bg-brand-purple-light transition-colors">
            <BarChartIcon className="w-6 h-6 text-brand-purple" />
          </div>
          
          <div className="flex-1 min-w-0">
            <p className="text-brand-deep-purple text-sm font-body leading-snug mb-1">
              {message.content}
            </p>
            {message.insight && (
               <p className="text-xs text-text-secondary border-t border-surface-grey-lavender pt-2 mt-2 font-medium">
                 Insight: {message.insight}
               </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

interface ChatPanelProps {
  activeThreadId: string | null;
  onThreadSelect: (id: string | null) => void;
}

export const ChatPanel = ({ activeThreadId, onThreadSelect }: ChatPanelProps) => {
  const [view, setView] = useState<'list' | 'chat'>('list');
  const [inputValue, setInputValue] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const pinnedThreads = threads.filter(t => t.group === 'Pinned');
  const todayThreads = threads.filter(t => t.group === 'Today');
  const earlierThreads = threads.filter(t => t.group === 'Earlier');

  const handleThreadClick = (id: string) => {
    onThreadSelect(id);
    setView('chat');
  };

  const handleBack = () => {
    setView('list');
    onThreadSelect(null);
  };

  useEffect(() => {
    if (view === 'chat' && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [view]);

  // Sync external activeThreadId changes (if any) to view
  useEffect(() => {
    if (activeThreadId && view === 'list') {
      setView('chat');
    }
  }, [activeThreadId]);

  return (
    <div className="fixed top-14 bottom-0 left-0 w-[360px] bg-surface-purple-light border-r border-surface-grey-lavender flex flex-col z-40 transition-all duration-300">
      
      {/* Top Header */}
      <div className="p-4 bg-surface-purple-light shrink-0 border-b border-surface-grey-lavender/50 flex items-center h-[72px]">
        {view === 'list' ? (
          <button 
            onClick={() => { onThreadSelect('new'); setView('chat'); }}
            className="w-full h-10 bg-brand-purple hover:bg-brand-purple/90 text-white rounded-lg flex items-center justify-center gap-2 transition-all shadow-sm active:transform active:scale-[0.98]"
          >
            <Plus className="w-5 h-5" strokeWidth={2} />
            <span className="font-body font-semibold text-sm">New Conversation</span>
          </button>
        ) : (
          <div className="flex items-center gap-2 w-full">
            <button 
              onClick={handleBack}
              className="p-2 -ml-2 hover:bg-white/50 rounded-lg text-text-secondary hover:text-brand-deep-purple transition-colors"
            >
              <NavArrowLeft className="w-5 h-5" strokeWidth={2} />
            </button>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-brand-deep-purple truncate">
                {activeThreadId === 'new' ? 'New Conversation' : threads.find(t => t.id === activeThreadId)?.label || 'Conversation'}
              </h3>
              <p className="text-[11px] text-text-secondary flex items-center gap-1">
                 <span className="w-1.5 h-1.5 rounded-full bg-brand-gold animate-pulse"></span>
                 Online
              </p>
            </div>
            <button className="p-2 hover:bg-white/50 rounded-lg text-text-secondary">
              <MoreHoriz className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto scrollbar-thin pb-40">
        {view === 'list' ? (
          <div className="pb-4 animate-in slide-in-from-left-8 duration-300">
             {/* Pinned */}
            <div className="px-4 py-3 pb-2">
              <h3 className="text-[11px] uppercase tracking-[0.5px] font-medium text-text-secondary">Pinned</h3>
            </div>
            <div>
              {pinnedThreads.map(t => (
                <ThreadItem key={t.id} thread={t} isActive={activeThreadId === t.id} onClick={() => handleThreadClick(t.id)} />
              ))}
            </div>

            {/* Today */}
            <div className="px-4 py-3 pb-2 mt-2">
              <h3 className="text-[11px] uppercase tracking-[0.5px] font-medium text-text-secondary">Today</h3>
            </div>
            <div>
              {todayThreads.map(t => (
                <ThreadItem key={t.id} thread={t} isActive={activeThreadId === t.id} onClick={() => handleThreadClick(t.id)} />
              ))}
            </div>

            {/* Earlier */}
            <div className="px-4 py-3 pb-2 mt-2">
              <h3 className="text-[11px] uppercase tracking-[0.5px] font-medium text-text-secondary">Earlier</h3>
            </div>
            <div>
              {earlierThreads.map(t => (
                <ThreadItem key={t.id} thread={t} isActive={activeThreadId === t.id} onClick={() => handleThreadClick(t.id)} />
              ))}
            </div>
          </div>
        ) : (
          <div className="p-4 animate-in slide-in-from-right-8 duration-300">
            {activeThreadId === 'new' ? (
              <div className="text-center mt-10 opacity-60">
                <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm">
                  <Plus className="w-6 h-6 text-brand-purple" />
                </div>
                <p className="text-sm text-text-secondary">Start a new analysis session</p>
              </div>
            ) : (
              messages.map(m => <ChatMessage key={m.id} message={m} />)
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Bottom: Input Area (Persistent) */}
      <div className="absolute bottom-0 left-0 right-0 bg-surface-purple-light/95 backdrop-blur-sm p-4 border-t border-surface-grey-lavender z-50">
        
        {/* Chips */}
        <div className="flex gap-2 overflow-x-auto pb-3 no-scrollbar mask-gradient-right">
          {promptChips.map((chip, idx) => (
            <button 
              key={idx}
              onClick={() => {
                setInputValue(chip.label);
                setView('chat'); 
                if (!activeThreadId) onThreadSelect('new');
              }}
              className="whitespace-nowrap px-3 py-1.5 bg-white border border-surface-grey-lavender rounded-full text-xs text-brand-deep-purple hover:bg-surface-purple-light hover:border-brand-purple-light transition-colors shadow-sm"
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* Input */}
        <div className="relative group">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if(e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                // Mock send logic would go here
                setView('chat');
                if(!activeThreadId) onThreadSelect('new');
              }
            }}
            placeholder="Ask about SLA breach rate..."
            className="w-full min-h-[50px] max-h-[120px] bg-white border border-surface-grey-lavender rounded-xl p-3 pr-12 text-sm font-body text-brand-deep-purple placeholder:text-brand-purple-secondary/70 focus:outline-none focus:ring-2 focus:ring-brand-purple-light focus:border-transparent resize-none shadow-sm"
          />
          <button 
            className={cn(
              "absolute right-2 bottom-2.5 p-1.5 rounded-full transition-all duration-200",
              inputValue.length > 0 
                ? "bg-brand-purple text-white shadow-md transform scale-100" 
                : "bg-surface-grey-lavender text-text-secondary pointer-events-none opacity-50 transform scale-90"
            )}
          >
            <SendDiagonal className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>
      </div>
    </div>
  );
};
