import React, { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { getSharedThread } from "@/lib/api";
import { BarChartIcon } from "lucide-react";
import ReactMarkdown from "react-markdown";

export function SharePage() {
  const [, params] = useRoute("/share/:token");
  const token = params?.token;
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    getSharedThread(token)
      .then(setData)
      .catch((err) => setError(err.message || "Failed to load"));
  }, [token]);

  if (error) {
    return (
      <div className="min-h-screen bg-surface-off-white flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <h1 className="text-xl font-semibold text-brand-deep-purple mb-2">Share not found</h1>
          <p className="text-text-secondary">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-surface-off-white flex items-center justify-center">
        <div className="animate-pulse text-brand-purple">Loading...</div>
      </div>
    );
  }

  const { thread, sharedAt } = data;
  const turns = thread?.turns || [];

  return (
    <div className="min-h-screen bg-surface-off-white font-body text-brand-deep-purple">
      <header className="bg-surface-purple-light border-b border-surface-grey-lavender px-6 py-4">
        <h1 className="text-lg font-semibold text-brand-deep-purple">
          Shared conversation
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Shared {new Date(sharedAt).toLocaleDateString()}
        </p>
      </header>
      <main className="max-w-2xl mx-auto p-6 space-y-6">
        {turns.map((turn: any) => (
          <div key={turn.id} className="space-y-4">
            <div className="flex justify-end">
              <div className="max-w-[85%] bg-brand-purple text-white px-4 py-3 rounded-tl-xl rounded-tr-xl rounded-bl-xl shadow-sm text-sm">
                {turn.user_message}
              </div>
            </div>
            {turn.insight_summary && (
              <div className="flex justify-start">
                <div className="max-w-[90%] bg-white border border-surface-grey-lavender rounded-xl p-3 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-lg bg-surface-purple-light flex items-center justify-center shrink-0">
                      <BarChartIcon className="w-6 h-6 text-brand-purple" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-brand-deep-purple text-sm mb-1">
                        <ReactMarkdown
                          components={{
                            p: ({ children }) => <p className="mb-1 last:mb-0 leading-snug">{children}</p>,
                            strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                          }}
                        >
                          {turn.insight_summary}
                        </ReactMarkdown>
                      </div>
                      {turn.chart_data && (
                        <p className="text-xs text-text-secondary mt-2">
                          Chart: {turn.chart_type || "bar"} visualization
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </main>
    </div>
  );
}
