import { Router, Request, Response } from "express";
import crypto from "crypto";
import { supabase } from "../config/supabase";
import { storage } from "../storage";
import { getDefaultUserId } from "../config/defaults";

export const sharesRouter = Router();

sharesRouter.post("/api/threads/:id/share", async (req: Request, res: Response) => {
  try {
    const threadId = String(req.params.id || "").split(",")[0];
    if (!threadId) {
      return res.status(400).json({ error: "Thread ID required" });
    }
    const userId = (req.headers["x-user-id"] as string) || DEFAULT_USER_ID;

    const thread = await storage.getThread(threadId);
    if (!thread) {
      return res.status(404).json({ error: "Thread not found" });
    }

    const shareToken = crypto.randomBytes(24).toString("hex");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const { data: share, error } = await supabase
      .from("thread_share_links")
      .insert({
        thread_id: threadId,
        share_token: shareToken,
        created_by: userId,
        expires_at: expiresAt.toISOString(),
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create share: ${error.message}`);
    }

    const baseUrl = process.env.PUBLIC_URL || req.protocol + "://" + req.get("host") || "";
    const shareUrl = `${baseUrl}/share/${shareToken}`;

    res.status(201).json({
      success: true,
      data: {
        id: share.id,
        shareToken,
        shareUrl,
        expiresAt: share.expires_at,
      },
    });
  } catch (error) {
    console.error("Thread share failed:", error);
    res.status(500).json({
      error: "Failed to share thread",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

sharesRouter.get("/api/share/:token", async (req: Request, res: Response) => {
  try {
    const token = req.params.token;

    const { data: share, error } = await supabase
      .from("thread_share_links")
      .select("*, threads(*)")
      .eq("share_token", token)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (error || !share) {
      return res.status(404).json({
        error: "Share not found or expired",
        message: "This link may have expired or is invalid.",
      });
    }

    const turns = await storage.getThreadTurns(share.thread_id);
    const thread = await storage.getThread(share.thread_id);

    res.json({
      success: true,
      data: {
        thread: { ...thread, turns },
        sharedAt: share.created_at,
      },
    });
  } catch (error) {
    console.error("Share fetch failed:", error);
    res.status(500).json({
      error: "Failed to load shared thread",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});
