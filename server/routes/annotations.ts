import { Router, Request, Response } from "express";
import { supabase } from "../config/supabase";
import { getDefaultUserId } from "../config/defaults";

export const annotationsRouter = Router();

annotationsRouter.get("/api/threads/:threadId/annotations", async (req: Request, res: Response) => {
  try {
    const threadId = req.params.threadId;

    const { data: annotations, error } = await supabase
      .from("thread_notes")
      .select("*")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch annotations: ${error.message}`);
    }

    res.json({
      success: true,
      data: (annotations || []).map((a: any) => ({
        id: a.id,
        turnId: a.turn_id,
        note: a.note,
        createdAt: a.created_at,
      })),
    });
  } catch (error) {
    console.error("Annotations fetch failed:", error);
    res.status(500).json({
      error: "Failed to fetch annotations",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

annotationsRouter.post("/api/threads/:threadId/annotations", async (req: Request, res: Response) => {
  try {
    const threadId = req.params.threadId;
    const { turnId, note } = req.body;
    const userId = (req.headers["x-user-id"] as string) || DEFAULT_USER_ID;

    if (!note?.trim()) {
      return res.status(400).json({
        error: "Invalid input",
        message: "note is required",
      });
    }

    const { data: annotation, error } = await supabase
      .from("thread_notes")
      .insert({
        thread_id: threadId,
        turn_id: turnId || null,
        user_id: userId,
        note: note.trim(),
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create annotation: ${error.message}`);
    }

    res.status(201).json({
      success: true,
      data: {
        id: annotation.id,
        turnId: annotation.turn_id,
        note: annotation.note,
        createdAt: annotation.created_at,
      },
    });
  } catch (error) {
    console.error("Annotation create failed:", error);
    res.status(500).json({
      error: "Failed to create annotation",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

annotationsRouter.patch("/api/threads/:threadId/annotations/:id", async (req: Request, res: Response) => {
  try {
    const { threadId, id } = req.params;
    const { note } = req.body;

    if (!note?.trim()) {
      return res.status(400).json({
        error: "Invalid input",
        message: "note is required",
      });
    }

    const { data: annotation, error } = await supabase
      .from("thread_notes")
      .update({ note: note.trim() })
      .eq("id", id)
      .eq("thread_id", threadId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update annotation: ${error.message}`);
    }

    res.json({
      success: true,
      data: {
        id: annotation.id,
        turnId: annotation.turn_id,
        note: annotation.note,
        createdAt: annotation.created_at,
      },
    });
  } catch (error) {
    console.error("Annotation update failed:", error);
    res.status(500).json({
      error: "Failed to update annotation",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

annotationsRouter.delete("/api/threads/:threadId/annotations/:id", async (req: Request, res: Response) => {
  try {
    const { threadId, id } = req.params;

    const { error } = await supabase
      .from("thread_notes")
      .delete()
      .eq("id", id)
      .eq("thread_id", threadId);

    if (error) {
      throw new Error(`Failed to delete annotation: ${error.message}`);
    }

    res.status(204).send();
  } catch (error) {
    console.error("Annotation delete failed:", error);
    res.status(500).json({
      error: "Failed to delete annotation",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});
