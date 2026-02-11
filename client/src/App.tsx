import React, { useState } from 'react';
import { ContextBar } from "@/components/ContextBar";
import { ChatPanel } from "@/components/ChatPanel";
import { Canvas } from "@/components/Canvas";
import { Toaster } from "@/components/ui/toaster";

function App() {
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-surface-off-white font-body text-brand-deep-purple selection:bg-brand-purple-light overflow-hidden">
      <ContextBar />
      <div className="flex h-screen overflow-hidden">
        <ChatPanel 
          activeThreadId={activeThreadId} 
          onThreadSelect={setActiveThreadId} 
        />
        <main className="flex-1 h-full overflow-y-auto w-full relative">
          <Canvas activeThreadId={activeThreadId} />
        </main>
      </div>
      <Toaster />
    </div>
  );
}

export default App;
