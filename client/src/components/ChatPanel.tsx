import React, { useState, useEffect, useRef, useCallback } from 'react';
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
import { PieChart as PieChartIcon, BarChart3 as BarChartIcon, Loader2 } from 'lucide-react';
import { cn } from "@/lib/utils";
import { askQuestion, getThreads, getThread } from "@/lib/api";
import type { ChartResponse } from "@/App";

const promptChips = [
  { label: 'SLA breach rate by adjuster' },
  { label: 'Claims received this month' },
  { label: 'Cycle time by peril' },
  { label: 'Severity distribution' },
  { label: 'Cost per claim by model' },
];

interface ThreadData {
  id: string;
  title: string;
  is_pinned: boolean;
  pin_order: number | null;
  updated_at: string;
  created_at: string;
  thread_turns?: Array<{ chart_type: string }>;
}

interface MessageData {
  id: string;
  role: 'user' | 'system';
  content: string;
  chartType?: string;
  insight?: string;
}

const ThreadItem = ({ thread, isActive, onClick }: { thread: ThreadData, isActive: boolean, onClick: () => void }) => {
  const chartType = thread.thread_turns?.[0]?.chart_type || 'bar';
  const Icon = {
    'bar': GraphUp,
    'line': StatsReport,
    'pie': PieChartIcon,
    'table': TableIcon,
    'stacked_bar': BarChartIcon,
    'area': StatsReport,
  }[chartType] || GraphUp;

  const timeAgo = formatTimeAgo(thread.updated_at);

  return (
    <div
      data-testid={`thread-item-${thread.id}`}
      onClick={onClick}
      className={cn(
        "group relative h-16 w-full flex items-center px-4 cursor-pointer transition-all duration-200 border-b border-surface-grey-lavender/40 hover:bg-surface-purple-light/50",
        isActive ? "bg-brand-purple-light/20" : "bg-white"
      )}
    >
      <div className={cn(
        "absolute left-0 top-0 bottom-0 w-[3px] transition-colors duration-200",
        isActive ? "bg-brand-purple" : "bg-transparent group-hover:bg-brand-purple-light"
      )} />
      <div className="flex-1 min-w-0 pr-2">
        <p className={cn(
          "font-body text-[13px] leading-tight line-clamp-2 transition-colors",
          isActive ? "text-brand-deep-purple font-medium" : "text-brand-deep-purple/90"
        )}>
          {thread.title || 'Untitled'}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-1">
          {thread.is_pinned && <Pin className="w-3.5 h-3.5 text-brand-gold fill-brand-gold" strokeWidth={2} />}
          <Icon className="w-4 h-4 text-brand-purple-secondary" strokeWidth={1.5} />
        </div>
        <span className="text-[11px] text-text-secondary">{timeAgo}</span>
      </div>
    </div>
  );
};

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

const ChatMessage = ({ message }: { message: MessageData }) => {
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

  return (
    <div className="flex justify-start mb-6 animate-in slide-in-from-left-4 duration-500">
      <div className="max-w-[90%] bg-white border border-surface-grey-lavender rounded-xl p-3 shadow-sm hover:shadow-md hover:border-brand-purple-light transition-all cursor-pointer group">
        <div className="flex items-start gap-3">
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
  onNewResponse: (response: ChartResponse) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  clientId?: string;
}

export const ChatPanel = ({ activeThreadId, onThreadSelect, onNewResponse, isLoading, setIsLoading, clientId }: ChatPanelProps) => {
  const [view, setView] = useState<'list' | 'chat'>('list');
  const [inputValue, setInputValue] = useState('');
  const [chatMessages, setChatMessages] = useState<MessageData[]>([]);
  const [threads, setThreads] = useState<{
    pinned: ThreadData[];
    today: ThreadData[];
    this_week: ThreadData[];
    earlier: ThreadData[];
  }>({ pinned: [], today: [], this_week: [], earlier: [] });
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadThreads = useCallback(async () => {
    try {
      const data = await getThreads(clientId);
      setThreads(data);
    } catch (err) {
      console.log('No threads yet');
    }
  }, [clientId]);

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  const loadThreadHistory = useCallback(async (threadId: string) => {
    try {
      const data = await getThread(threadId);
      if (data.turns) {
        const msgs: MessageData[] = [];
        for (const turn of data.turns) {
          msgs.push({ id: `u-${turn.id}`, role: 'user', content: turn.user_message });
          if (turn.insight_summary) {
            msgs.push({
              id: `s-${turn.id}`,
              role: 'system',
              content: turn.chart_data ? `Chart: ${turn.chart_type || 'bar'} visualization ready` : turn.error_message || 'Processing...',
              chartType: turn.chart_type,
              insight: turn.insight_summary,
            });
          } else if (turn.error_message) {
            msgs.push({
              id: `s-${turn.id}`,
              role: 'system',
              content: turn.error_message,
            });
          }
        }
        setChatMessages(msgs);
      }
    } catch (err) {
      console.error('Failed to load thread:', err);
    }
  }, []);

  const handleThreadClick = (id: string) => {
    setCurrentThreadId(id);
    onThreadSelect(id);
    setView('chat');
    loadThreadHistory(id);
  };

  const handleBack = () => {
    setView('list');
    onThreadSelect(null);
    setChatMessages([]);
    setCurrentThreadId(null);
    loadThreads();
  };

  const handleSend = async () => {
    const msg = inputValue.trim();
    if (!msg || isLoading) return;

    setInputValue('');
    setView('chat');
    setIsLoading(true);

    const userMsg: MessageData = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: msg,
    };
    setChatMessages((prev) => [...prev, userMsg]);

    try {
      const response = await askQuestion(msg, currentThreadId, clientId);

      if (response.thread_id && !currentThreadId) {
        setCurrentThreadId(response.thread_id);
        onThreadSelect(response.thread_id);
      }

      if (response.error) {
        setChatMessages((prev) => [
          ...prev,
          {
            id: `s-${Date.now()}`,
            role: 'system',
            content: response.error.message,
          },
        ]);
      } else {
        setChatMessages((prev) => [
          ...prev,
          {
            id: `s-${response.turn_id}`,
            role: 'system',
            content: response.chart?.title || 'Analysis complete',
            chartType: response.chart?.type,
            insight: response.insight,
          },
        ]);
        onNewResponse(response);
      }
    } catch (err: any) {
      setChatMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'system',
          content: err.message || 'Something went wrong. Please try again.',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages]);

  useEffect(() => {
    if (activeThreadId === 'new') {
      setView('chat');
      setChatMessages([]);
      setCurrentThreadId(null);
    } else if (activeThreadId && activeThreadId !== currentThreadId) {
      handleThreadClick(activeThreadId);
    }
  }, [activeThreadId]);

  const allThreads = [
    ...threads.pinned,
    ...threads.today,
    ...threads.this_week,
    ...threads.earlier,
  ];

  return (
    <div className="fixed top-14 bottom-0 left-0 w-[360px] bg-surface-purple-light border-r border-surface-grey-lavender flex flex-col z-40 transition-all duration-300">
      <div className="p-4 bg-surface-purple-light shrink-0 border-b border-surface-grey-lavender/50 flex items-center h-[72px]">
        {view === 'list' ? (
          <button
            data-testid="button-new-conversation"
            onClick={() => { onThreadSelect('new'); setView('chat'); setChatMessages([]); setCurrentThreadId(null); }}
            className="w-full h-10 bg-brand-purple hover:bg-brand-purple/90 text-white rounded-lg flex items-center justify-center gap-2 transition-all shadow-sm active:transform active:scale-[0.98]"
          >
            <Plus className="w-5 h-5" strokeWidth={2} />
            <span className="font-body font-semibold text-sm">New Conversation</span>
          </button>
        ) : (
          <div className="flex items-center gap-2 w-full">
            <button
              data-testid="button-back"
              onClick={handleBack}
              className="p-2 -ml-2 hover:bg-white/50 rounded-lg text-text-secondary hover:text-brand-deep-purple transition-colors"
            >
              <NavArrowLeft className="w-5 h-5" strokeWidth={2} />
            </button>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-brand-deep-purple truncate">
                {!currentThreadId ? 'New Conversation' : allThreads.find(t => t.id === currentThreadId)?.title || 'Conversation'}
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

      <div className="flex-1 overflow-y-auto scrollbar-thin pb-40">
        {view === 'list' ? (
          <div className="pb-4 animate-in slide-in-from-left-8 duration-300">
            {threads.pinned.length > 0 && (
              <>
                <div className="px-4 py-3 pb-2">
                  <h3 className="text-[11px] uppercase tracking-[0.5px] font-medium text-text-secondary">Pinned</h3>
                </div>
                <div>
                  {threads.pinned.map(t => (
                    <ThreadItem key={t.id} thread={t} isActive={activeThreadId === t.id} onClick={() => handleThreadClick(t.id)} />
                  ))}
                </div>
              </>
            )}

            {threads.today.length > 0 && (
              <>
                <div className="px-4 py-3 pb-2 mt-2">
                  <h3 className="text-[11px] uppercase tracking-[0.5px] font-medium text-text-secondary">Today</h3>
                </div>
                <div>
                  {threads.today.map(t => (
                    <ThreadItem key={t.id} thread={t} isActive={activeThreadId === t.id} onClick={() => handleThreadClick(t.id)} />
                  ))}
                </div>
              </>
            )}

            {threads.this_week.length > 0 && (
              <>
                <div className="px-4 py-3 pb-2 mt-2">
                  <h3 className="text-[11px] uppercase tracking-[0.5px] font-medium text-text-secondary">This Week</h3>
                </div>
                <div>
                  {threads.this_week.map(t => (
                    <ThreadItem key={t.id} thread={t} isActive={activeThreadId === t.id} onClick={() => handleThreadClick(t.id)} />
                  ))}
                </div>
              </>
            )}

            {threads.earlier.length > 0 && (
              <>
                <div className="px-4 py-3 pb-2 mt-2">
                  <h3 className="text-[11px] uppercase tracking-[0.5px] font-medium text-text-secondary">Earlier</h3>
                </div>
                <div>
                  {threads.earlier.map(t => (
                    <ThreadItem key={t.id} thread={t} isActive={activeThreadId === t.id} onClick={() => handleThreadClick(t.id)} />
                  ))}
                </div>
              </>
            )}

            {allThreads.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-text-secondary">
                No conversations yet. Start a new one!
              </div>
            )}
          </div>
        ) : (
          <div className="p-4 animate-in slide-in-from-right-8 duration-300">
            {chatMessages.length === 0 && !isLoading ? (
              <div className="text-center mt-10 opacity-60">
                <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm">
                  <Plus className="w-6 h-6 text-brand-purple" />
                </div>
                <p className="text-sm text-text-secondary">Ask a question about your claims data</p>
              </div>
            ) : (
              chatMessages.map(m => <ChatMessage key={m.id} message={m} />)
            )}
            {isLoading && (
              <div className="flex justify-start mb-6">
                <div className="bg-white border border-surface-grey-lavender rounded-xl p-4 shadow-sm flex items-center gap-3">
                  <Loader2 className="w-5 h-5 text-brand-purple animate-spin" />
                  <span className="text-sm text-text-secondary">Analyzing your question...</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className="absolute bottom-0 left-0 right-0 bg-surface-purple-light/95 backdrop-blur-sm p-4 border-t border-surface-grey-lavender z-50">
        <div className="flex gap-2 overflow-x-auto pb-3 no-scrollbar mask-gradient-right">
          {promptChips.map((chip, idx) => (
            <button
              key={idx}
              data-testid={`chip-${idx}`}
              onClick={() => {
                setInputValue(chip.label);
                setView('chat');
                if (!activeThreadId || activeThreadId === 'new') onThreadSelect('new');
              }}
              className="whitespace-nowrap px-3 py-1.5 bg-white border border-surface-grey-lavender rounded-full text-xs text-brand-deep-purple hover:bg-surface-purple-light hover:border-brand-purple-light transition-colors shadow-sm"
            >
              {chip.label}
            </button>
          ))}
        </div>

        <div className="relative group">
          <textarea
            data-testid="input-message"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask about claims data..."
            disabled={isLoading}
            className="w-full min-h-[50px] max-h-[120px] bg-white border border-surface-grey-lavender rounded-xl p-3 pr-12 text-sm font-body text-brand-deep-purple placeholder:text-brand-purple-secondary/70 focus:outline-none focus:ring-2 focus:ring-brand-purple-light focus:border-transparent resize-none shadow-sm disabled:opacity-50"
          />
          <button
            data-testid="button-send"
            onClick={handleSend}
            disabled={isLoading || inputValue.trim().length === 0}
            className={cn(
              "absolute right-2 bottom-2.5 p-1.5 rounded-full transition-all duration-200",
              inputValue.length > 0 && !isLoading
                ? "bg-brand-purple text-white shadow-md transform scale-100"
                : "bg-surface-grey-lavender text-text-secondary pointer-events-none opacity-50 transform scale-90"
            )}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <SendDiagonal className="w-4 h-4" strokeWidth={2} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
