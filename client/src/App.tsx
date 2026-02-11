import React, { useState, useCallback } from 'react';
import { ContextBar } from "@/components/ContextBar";
import { ChatPanel } from "@/components/ChatPanel";
import { Canvas } from "@/components/Canvas";
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

function App() {
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [currentResponse, setCurrentResponse] = useState<ChartResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleNewResponse = useCallback((response: ChartResponse) => {
    setCurrentResponse(response);
    if (response.thread_id) {
      setActiveThreadId(response.thread_id);
    }
  }, []);

  return (
    <div className="min-h-screen bg-surface-off-white font-body text-brand-deep-purple selection:bg-brand-purple-light overflow-hidden">
      <ContextBar />
      <div className="flex h-screen overflow-hidden">
        <ChatPanel
          activeThreadId={activeThreadId}
          onThreadSelect={setActiveThreadId}
          onNewResponse={handleNewResponse}
          isLoading={isLoading}
          setIsLoading={setIsLoading}
        />
        <main className="flex-1 h-full overflow-y-auto w-full relative">
          <Canvas
            activeThreadId={activeThreadId}
            currentResponse={currentResponse}
            isLoading={isLoading}
          />
        </main>
      </div>
      <Toaster />
    </div>
  );
}

export default App;
