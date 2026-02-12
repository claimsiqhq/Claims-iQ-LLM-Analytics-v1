import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { ContextBar } from "@/components/ContextBar";
import { ChatPanel } from "@/components/ChatPanel";
import { Canvas } from "@/components/Canvas";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { MorningBrief } from "@/components/MorningBrief";
import { KPICards } from "@/components/KPICards";
import { Toaster } from "@/components/ui/toaster";

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

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [questionToSubmit, setQuestionToSubmit] = useState<string | null>(null);

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
  }, []);

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

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-surface-off-white font-body text-brand-deep-purple selection:bg-brand-purple-light overflow-hidden">
        <ContextBar
          clientId={selectedClientId}
          onClientChange={setSelectedClientId}
        />
        <div className="flex h-screen overflow-hidden">
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
            className="fixed top-14 bottom-0 z-50 w-1.5 cursor-col-resize group hover:bg-brand-purple/20 active:bg-brand-purple/30 transition-colors"
            style={{ left: `${chatWidth - 3}px` }}
          >
            <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[2px] bg-transparent group-hover:bg-brand-purple/40 transition-colors" />
          </div>
          <main className="flex-1 h-full overflow-y-auto w-full relative">
            <div className="pt-14 p-6 space-y-6 max-w-[1400px] mx-auto" style={{ marginLeft: `${chatWidth}px` }}>
              <KPICards clientId={selectedClientId} />
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
                />
              </div>
              <MorningBrief clientId={selectedClientId} />
            </div>
          </main>
        </div>
        <Toaster />
      </div>
    </ErrorBoundary>
  );
}

export default App;
