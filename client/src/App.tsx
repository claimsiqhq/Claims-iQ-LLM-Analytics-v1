import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { ContextBar } from "@/components/ContextBar";
import { ChatPanel } from "@/components/ChatPanel";
import { Canvas } from "@/components/Canvas";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { MorningBrief } from "@/components/MorningBrief";
import { KPICards } from "@/components/KPICards";
import { Toaster } from "@/components/ui/toaster";
import { useIsMobile } from "@/hooks/use-mobile";
import { MessageCircle } from 'lucide-react';
import { VoiceAgent } from "@/components/VoiceAgent";
import { SettingsPage } from "@/pages/SettingsPage";

export interface ChartResponse {
  thread_id: string;
  turn_id: string;
  chart?: {
    type: string;
    data: {
      labels: string[];
      datasets: Array<{ label: string; values: number[]; unit: string }>;
    };
    title: string;
  };
  insight?: string;
  followUpSuggestions?: string[];
  assumptions?: Array<{ key: string; assumed_value?: string; value?: string; label: string; editable?: boolean }>;
  metadata?: {
    metric_definition?: string;
    filters_applied?: any[];
    time_range?: any;
    data_freshness_seconds?: number;
    record_count?: number;
    query_ms?: number;
    llm_ms?: number;
    cache_hit?: boolean;
  };
  error?: {
    type: string;
    message: string;
    suggestions?: string[];
  };
}

const MIN_CHAT_WIDTH = 240;
const MAX_CHAT_WIDTH = 600;
const DEFAULT_CHAT_WIDTH = 360;

function App() {
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [currentResponse, setCurrentResponse] = useState<ChartResponse | null>(null);
  const [chartPanels, setChartPanels] = useState<ChartResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [showSettings, setShowSettings] = useState(false);

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [questionToSubmit, setQuestionToSubmit] = useState<string | null>(null);

  const isMobile = useIsMobile();
  const [mobileChatOpen, setMobileChatOpen] = useState(false);

  const [chatWidth, setChatWidth] = useState(DEFAULT_CHAT_WIDTH);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(DEFAULT_CHAT_WIDTH);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartWidth.current = chatWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [chatWidth]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = e.clientX - dragStartX.current;
      const newWidth = Math.min(MAX_CHAT_WIDTH, Math.max(MIN_CHAT_WIDTH, dragStartWidth.current + delta));
      setChatWidth(newWidth);
    };
    const handleMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const handleNewResponse = useCallback((response: ChartResponse) => {
    setCurrentResponse(response);
    if (response.thread_id) {
      setActiveThreadId(response.thread_id);
    }
    if (response.chart) {
      setChartPanels(prev => {
        const exists = prev.some(p => p.turn_id === response.turn_id);
        if (exists) return prev;
        return [response, ...prev];
      });
    }
    if (isMobile) {
      setMobileChatOpen(false);
    }
  }, [isMobile]);

  const handleRemovePanel = useCallback((turnId: string) => {
    setChartPanels(prev => prev.filter(p => p.turn_id !== turnId));
  }, []);

  const handleClearPanels = useCallback(() => {
    setChartPanels([]);
  }, []);

  const handleLoadDashboard = useCallback((panels: ChartResponse[]) => {
    setChartPanels(panels);
    if (panels.length > 0) {
      setCurrentResponse(panels[0]);
    }
  }, []);

  useEffect(() => {
    if (currentResponse?.chart && chartContainerRef.current) {
      chartContainerRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [currentResponse?.turn_id]);

  if (showSettings) {
    return (
      <ErrorBoundary>
        <div className="min-h-screen bg-surface-off-white dark:bg-gray-900 font-body text-brand-deep-purple dark:text-gray-100 selection:bg-brand-purple-light">
          <SettingsPage onBack={() => setShowSettings(false)} clientId={selectedClientId} />
          <Toaster />
        </div>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-surface-off-white dark:bg-gray-900 font-body text-brand-deep-purple dark:text-gray-100 selection:bg-brand-purple-light overflow-hidden">
        <ContextBar
          clientId={selectedClientId}
          onClientChange={setSelectedClientId}
          onSettingsClick={() => setShowSettings(true)}
        />
        <div className="flex h-screen overflow-hidden">
          {isMobile ? (
            <>
              {mobileChatOpen && (
                <div
                  className="fixed inset-0 bg-black/40 z-40 animate-in fade-in duration-200"
                  onClick={() => setMobileChatOpen(false)}
                />
              )}
              <div
                className={`fixed inset-y-0 left-0 z-50 w-[85vw] max-w-[400px] transform transition-transform duration-300 ease-in-out ${
                  mobileChatOpen ? 'translate-x-0' : '-translate-x-full'
                }`}
              >
                <ChatPanel
                  activeThreadId={activeThreadId}
                  onThreadSelect={setActiveThreadId}
                  onNewResponse={handleNewResponse}
                  isLoading={isLoading}
                  setIsLoading={setIsLoading}
                  clientId={selectedClientId}
                  questionToSubmit={questionToSubmit}
                  onQuestionSubmitted={() => setQuestionToSubmit(null)}
                  width={window.innerWidth * 0.85}
                  onClose={() => setMobileChatOpen(false)}
                />
              </div>
            </>
          ) : (
            <>
              <ChatPanel
                activeThreadId={activeThreadId}
                onThreadSelect={setActiveThreadId}
                onNewResponse={handleNewResponse}
                isLoading={isLoading}
                setIsLoading={setIsLoading}
                clientId={selectedClientId}
                questionToSubmit={questionToSubmit}
                onQuestionSubmitted={() => setQuestionToSubmit(null)}
                width={chatWidth}
              />
              <div
                data-testid="chat-resize-handle"
                onMouseDown={handleResizeStart}
                className="fixed top-14 bottom-0 z-50 w-1.5 cursor-col-resize group hover:bg-brand-purple/20 active:bg-brand-purple/30 dark:hover:bg-brand-purple/30 dark:active:bg-brand-purple/40 transition-colors"
                style={{ left: `${chatWidth - 3}px` }}
              >
                <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[2px] bg-transparent group-hover:bg-brand-purple/40 transition-colors" />
              </div>
            </>
          )}

          <main className="flex-1 h-full overflow-y-auto w-full relative">
            <div
              className="pt-14 p-4 md:p-6 space-y-4 md:space-y-6 max-w-[1400px] mx-auto"
              style={!isMobile ? { marginLeft: `${chatWidth}px` } : undefined}
            >
              <KPICards clientId={selectedClientId} />
              <MorningBrief clientId={selectedClientId} />
              <div ref={chartContainerRef}>
                <Canvas
                  activeThreadId={activeThreadId}
                  currentResponse={currentResponse}
                  chartPanels={chartPanels}
                  isLoading={isLoading}
                  clientId={selectedClientId}
                  onFollowUpClick={(q) => setQuestionToSubmit(q)}
                  onRemovePanel={handleRemovePanel}
                  onClearPanels={handleClearPanels}
                  onLoadDashboard={handleLoadDashboard}
                  isMobile={isMobile}
                />
              </div>
            </div>
          </main>
        </div>

        {isMobile && !mobileChatOpen && (
          <button
            onClick={() => setMobileChatOpen(true)}
            className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-brand-purple text-white rounded-full shadow-lg flex items-center justify-center hover:bg-brand-purple/90 active:scale-95 transition-all"
            data-testid="btn-mobile-chat-toggle"
          >
            <MessageCircle className="w-6 h-6" />
          </button>
        )}

        <VoiceAgent
          clientId={selectedClientId}
          onNewResponse={handleNewResponse}
          isMobile={isMobile}
        />

        <Toaster />
      </div>
    </ErrorBoundary>
  );
}

export default App;
