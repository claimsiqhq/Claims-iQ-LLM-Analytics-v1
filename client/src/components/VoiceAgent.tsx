import React, { useState, useRef, useCallback, useEffect } from "react";
import { Mic, MicOff, Phone, PhoneOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChartResponse } from "@/App";

type VoiceStatus = "idle" | "connecting" | "connected" | "speaking" | "listening" | "error";

interface VoiceAgentProps {
  clientId: string;
  onNewResponse: (response: ChartResponse) => void;
  isMobile: boolean;
}

export const VoiceAgent: React.FC<VoiceAgentProps> = ({ clientId, onNewResponse, isMobile }) => {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [transcript, setTranscript] = useState("");
  const [aiTranscript, setAiTranscript] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [expanded, setExpanded] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const pendingFunctionCalls = useRef<Map<string, { name: string; arguments: string }>>(new Map());

  const cleanup = useCallback(() => {
    if (dcRef.current) {
      dcRef.current.close();
      dcRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.srcObject = null;
    }
    pendingFunctionCalls.current.clear();
    setStatus("idle");
    setTranscript("");
    setAiTranscript("");
  }, []);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  const handleFunctionCall = useCallback(async (callId: string, name: string, args: string) => {
    if (name !== "ask_claims_question") {
      dcRef.current?.send(JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: callId,
          output: JSON.stringify({ error: "Unknown function" }),
        },
      }));
      dcRef.current?.send(JSON.stringify({ type: "response.create" }));
      return;
    }

    try {
      let question: string;
      try {
        const parsed = JSON.parse(args);
        question = parsed.question;
      } catch {
        question = args;
      }

      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: question,
          client_id: clientId,
        }),
      });

      const data: ChartResponse = await res.json();

      if (data.chart) {
        onNewResponse(data);
      }

      const summaryForVoice = data.insight || data.error?.message || "I found the data but couldn't generate a summary.";

      dcRef.current?.send(JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: callId,
          output: JSON.stringify({
            insight: summaryForVoice,
            chart_title: data.chart?.title || "",
            has_chart: !!data.chart,
          }),
        },
      }));
      dcRef.current?.send(JSON.stringify({ type: "response.create" }));
    } catch (err: any) {
      dcRef.current?.send(JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: callId,
          output: JSON.stringify({ error: "Failed to query claims data: " + err.message }),
        },
      }));
      dcRef.current?.send(JSON.stringify({ type: "response.create" }));
    }
  }, [clientId, onNewResponse]);

  const connect = useCallback(async () => {
    try {
      setStatus("connecting");
      setErrorMessage("");

      const tokenRes = await fetch("/api/voice/token", { method: "POST" });
      if (!tokenRes.ok) {
        const err = await tokenRes.json();
        throw new Error(err.error || "Failed to get voice session token");
      }
      const session = await tokenRes.json();
      const ephemeralKey = session.client_secret?.value;
      if (!ephemeralKey) {
        throw new Error("No ephemeral key returned from server");
      }

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      const audioEl = document.createElement("audio");
      audioEl.autoplay = true;
      audioRef.current = audioEl;

      pc.ontrack = (event) => {
        audioEl.srcObject = event.streams[0];
      };

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;

      dc.onopen = () => {
        setStatus("connected");
      };

      dc.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          switch (msg.type) {
            case "input_audio_buffer.speech_started":
              setStatus("listening");
              setTranscript("");
              break;

            case "input_audio_buffer.speech_stopped":
              setStatus("connected");
              break;

            case "conversation.item.input_audio_transcription.completed":
              if (msg.transcript) {
                setTranscript(msg.transcript.trim());
              }
              break;

            case "response.audio_transcript.delta":
              if (msg.delta) {
                setAiTranscript(prev => prev + msg.delta);
                setStatus("speaking");
              }
              break;

            case "response.audio_transcript.done":
              setStatus("connected");
              break;

            case "response.done":
              setStatus("connected");
              setTimeout(() => setAiTranscript(""), 5000);
              break;

            case "response.function_call_arguments.delta": {
              const existing = pendingFunctionCalls.current.get(msg.item_id) || { name: "", arguments: "" };
              existing.arguments += msg.delta || "";
              pendingFunctionCalls.current.set(msg.item_id, existing);
              break;
            }

            case "response.output_item.added": {
              if (msg.item?.type === "function_call") {
                pendingFunctionCalls.current.set(msg.item.id, {
                  name: msg.item.name || "",
                  arguments: "",
                });
              }
              break;
            }

            case "response.function_call_arguments.done": {
              const fc = pendingFunctionCalls.current.get(msg.item_id);
              if (fc) {
                handleFunctionCall(msg.item_id, fc.name || msg.name, fc.arguments || msg.arguments);
                pendingFunctionCalls.current.delete(msg.item_id);
              } else {
                handleFunctionCall(msg.item_id, msg.name, msg.arguments);
              }
              break;
            }

            case "error":
              console.error("Realtime API error:", msg.error);
              setErrorMessage(msg.error?.message || "Voice session error");
              break;
          }
        } catch (e) {
          console.error("Failed to parse data channel message:", e);
        }
      };

      dc.onerror = (e) => {
        console.error("Data channel error:", e);
        setErrorMessage("Connection error");
        setStatus("error");
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      await new Promise<void>((resolve) => {
        if (pc.iceGatheringState === "complete") {
          resolve();
        } else {
          const checkState = () => {
            if (pc.iceGatheringState === "complete") {
              pc.removeEventListener("icegatheringstatechange", checkState);
              resolve();
            }
          };
          pc.addEventListener("icegatheringstatechange", checkState);
          setTimeout(() => {
            pc.removeEventListener("icegatheringstatechange", checkState);
            resolve();
          }, 3000);
        }
      });

      const sdpRes = await fetch("https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${ephemeralKey}`,
          "Content-Type": "application/sdp",
        },
        body: pc.localDescription?.sdp || offer.sdp,
      });

      if (!sdpRes.ok) {
        throw new Error(`WebRTC connection failed: ${sdpRes.statusText}`);
      }

      const answerSdp = await sdpRes.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

    } catch (err: any) {
      console.error("Voice connect error:", err);
      if (dcRef.current) { dcRef.current.close(); dcRef.current = null; }
      if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
      if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
      if (audioRef.current) { audioRef.current.srcObject = null; }
      pendingFunctionCalls.current.clear();
      setErrorMessage(err.message || "Failed to connect");
      setStatus("error");
    }
  }, [cleanup, handleFunctionCall]);

  const disconnect = useCallback(() => {
    cleanup();
    setExpanded(false);
  }, [cleanup]);

  const getStatusInfo = () => {
    switch (status) {
      case "idle": return { label: "Voice Chat", color: "text-text-secondary" };
      case "connecting": return { label: "Connecting...", color: "text-brand-gold" };
      case "connected": return { label: "Ready — speak now", color: "text-green-600" };
      case "listening": return { label: "Listening...", color: "text-brand-purple" };
      case "speaking": return { label: "AI speaking...", color: "text-brand-gold" };
      case "error": return { label: "Error", color: "text-red-500" };
      default: return { label: "Voice Chat", color: "text-text-secondary" };
    }
  };

  const statusInfo = getStatusInfo();
  const isActive = status !== "idle" && status !== "error";

  if (!expanded) {
    return (
      <button
        data-testid="btn-voice-toggle"
        onClick={() => {
          setExpanded(true);
          if (status === "idle") connect();
        }}
        className={cn(
          "fixed z-50 rounded-full shadow-lg flex items-center justify-center transition-all duration-300 group",
          isMobile ? "bottom-6 left-6 w-14 h-14" : "bottom-6 right-6 w-14 h-14",
          isActive
            ? "bg-green-500 text-white animate-pulse"
            : "bg-brand-deep-purple text-white hover:bg-brand-purple"
        )}
      >
        <Mic className="w-6 h-6" />
        {isActive && (
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full border-2 border-white" />
        )}
      </button>
    );
  }

  return (
    <div
      data-testid="voice-agent-panel"
      className={cn(
        "fixed z-50 bg-white rounded-2xl shadow-2xl border border-surface-grey-lavender overflow-hidden transition-all duration-300",
        isMobile
          ? "bottom-4 left-4 right-4"
          : "bottom-6 right-6 w-[380px]"
      )}
    >
      <div className="bg-gradient-to-r from-brand-deep-purple to-brand-purple p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-10 h-10 rounded-full flex items-center justify-center",
            isActive ? "bg-white/20" : "bg-white/10"
          )}>
            {status === "connecting" ? (
              <Loader2 className="w-5 h-5 text-white animate-spin" />
            ) : status === "listening" ? (
              <Mic className="w-5 h-5 text-white animate-pulse" />
            ) : (
              <Mic className="w-5 h-5 text-white" />
            )}
          </div>
          <div>
            <h3 className="text-white font-heading font-semibold text-sm">Claims IQ Voice</h3>
            <p className={cn("text-xs", isActive ? "text-green-300" : "text-white/60")}>
              {statusInfo.label}
            </p>
          </div>
        </div>
        <button
          data-testid="btn-voice-minimize"
          onClick={() => setExpanded(false)}
          className="text-white/70 hover:text-white p-1"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M4 10L8 14L12 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      <div className="p-4 space-y-3">
        {status === "listening" && (
          <div className="flex items-center gap-2 justify-center py-2">
            <div className="flex items-end gap-1 h-8">
              {[1,2,3,4,5].map(i => (
                <div
                  key={i}
                  className="w-1 bg-brand-purple rounded-full animate-pulse"
                  style={{
                    height: `${12 + Math.random() * 20}px`,
                    animationDelay: `${i * 100}ms`,
                    animationDuration: `${400 + Math.random() * 300}ms`,
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {transcript && (
          <div className="bg-surface-purple-light rounded-xl p-3">
            <p className="text-xs text-text-secondary mb-1 font-medium">You said:</p>
            <p className="text-sm text-brand-deep-purple">{transcript}</p>
          </div>
        )}

        {aiTranscript && (
          <div className="bg-brand-gold/10 rounded-xl p-3">
            <p className="text-xs text-text-secondary mb-1 font-medium">Claims IQ:</p>
            <p className="text-sm text-brand-deep-purple">{aiTranscript}</p>
          </div>
        )}

        {errorMessage && (
          <div className="bg-red-50 rounded-xl p-3">
            <p className="text-xs text-red-600">{errorMessage}</p>
          </div>
        )}

        {status === "idle" && !errorMessage && (
          <div className="text-center py-2">
            <p className="text-sm text-text-secondary">Tap the button below to start a voice conversation about your claims data.</p>
          </div>
        )}

        <div className="flex items-center justify-center gap-4 pt-2">
          {isActive ? (
            <button
              data-testid="btn-voice-disconnect"
              onClick={disconnect}
              className="w-14 h-14 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors shadow-lg"
            >
              <PhoneOff className="w-6 h-6" />
            </button>
          ) : (
            <button
              data-testid="btn-voice-connect"
              onClick={connect}
              className="w-14 h-14 rounded-full bg-green-500 text-white flex items-center justify-center hover:bg-green-600 transition-colors shadow-lg"
            >
              <Phone className="w-6 h-6" />
            </button>
          )}
        </div>

        {isActive && (
          <p className="text-center text-xs text-text-secondary">
            Ask about claims data — charts will appear on your dashboard
          </p>
        )}
      </div>
    </div>
  );
};
