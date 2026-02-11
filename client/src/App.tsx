import React, { useState, useCallback, useRef, useEffect } from 'react';
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
  };
  error?: {
    type: string;
    message: string;
    suggestions?: string[];
  };
}

const DEFAULT_CLIENT_ID = "00000000-0000-0000-0000-000000000001";

function App() {
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [currentResponse, setCurrentResponse] = useState<ChartResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string>(DEFAULT_CLIENT_ID);

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [questionToSubmit, setQuestionToSubmit] = useState<string | null>(null);

  const handleNewResponse = useCallback((response: ChartResponse) => {
    setCurrentResponse(response);
    if (response.thread_id) {
      setActiveThreadId(response.thread_id);
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
          />
          <main className="flex-1 h-full overflow-y-auto w-full relative">
            <div className="ml-[360px] pt-14 p-6 space-y-6">
              <KPICards clientId={selectedClientId} />
              {currentResponse?.chart && (
                <div ref={chartContainerRef}>
                  <Canvas
                    activeThreadId={activeThreadId}
                    currentResponse={currentResponse}
                    isLoading={isLoading}
                    clientId={selectedClientId}
                    onFollowUpClick={(q) => setQuestionToSubmit(q)}
                  />
                </div>
              )}
              <MorningBrief clientId={selectedClientId} />
              {!currentResponse?.chart && (
                <Canvas
                  activeThreadId={activeThreadId}
                  currentResponse={currentResponse}
                  isLoading={isLoading}
                  clientId={selectedClientId}
                  onFollowUpClick={(q) => setQuestionToSubmit(q)}
                />
              )}
            </div>
          </main>
        </div>
        <Toaster />
      </div>
    </ErrorBoundary>
  );
}

export default App;
