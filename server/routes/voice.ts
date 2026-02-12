import { Router, Request } from "express";
import { getSupabaseClient } from "../config/supabase.js";

export const voiceRouter = Router();

voiceRouter.post("/api/voice/token", async (req: Request, res) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "OpenAI API key not configured" });
    }

    const clientId = req.body?.client_id as string | undefined;
    let voice = "ash";
    let turnThreshold = 0.8;
    let silenceDurationMs = 800;

    if (clientId) {
      try {
        const sb = getSupabaseClient();
        const { data } = await sb.from("client_preferences").select("voice_voice, voice_turn_sensitivity, voice_silence_duration").eq("client_id", clientId).single();
        if (data) {
          voice = data.voice_voice || "ash";
          turnThreshold = data.voice_turn_sensitivity ?? 0.8;
          silenceDurationMs = data.voice_silence_duration ?? 800;
        }
      } catch {}
    }

    const response = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-realtime-preview-2024-12-17",
        voice,
        instructions: `You are Claims IQ, an intelligent claims analytics assistant. You help insurance claims managers understand their data by answering questions about claims metrics, trends, and performance.

When a user asks a question about their claims data (like "show me SLA breach rate" or "what's the average cycle time"), you MUST call the ask_claims_question function to get the real data. Then summarize the insight from the response conversationally.

If the user asks a general question not about claims data, answer it normally without calling any function.

Be concise, professional, and conversational. When reporting data, mention key numbers and trends. Keep responses under 30 seconds of speech.`,
        tools: [
          {
            type: "function",
            name: "ask_claims_question",
            description: "Query the claims analytics database with a natural language question about claims data, metrics, SLA performance, adjuster performance, cycle times, costs, or any other claims-related analytics. Call this whenever the user asks about their claims data.",
            parameters: {
              type: "object",
              properties: {
                question: {
                  type: "string",
                  description: "The natural language question about claims data, exactly as the user asked it or rephrased for clarity",
                },
              },
              required: ["question"],
            },
          },
        ],
        input_audio_transcription: {
          model: "whisper-1",
        },
        turn_detection: {
          type: "server_vad",
          threshold: turnThreshold,
          prefix_padding_ms: 400,
          silence_duration_ms: silenceDurationMs,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI session error:", response.status, errorText);
      return res.status(response.status).json({
        error: `Failed to create voice session: ${response.statusText}`,
        details: errorText,
      });
    }

    const data = await response.json();
    res.json(data);
  } catch (err: any) {
    console.error("Voice token error:", err);
    res.status(500).json({ error: err.message || "Failed to create voice session" });
  }
});
