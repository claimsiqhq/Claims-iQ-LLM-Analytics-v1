import { Router, Request, Response } from "express";
import { supabase } from "../config/supabase";

const DEFAULT_CLIENT_ID = "00000000-0000-0000-0000-000000000001";

export const dashboardsRouter = Router();

dashboardsRouter.get("/api/dashboards", async (req: Request, res: Response) => {
  try {
    const clientId = (req.query.client_id as string) || DEFAULT_CLIENT_ID;

    const { data, error } = await supabase
      .from("saved_dashboards")
      .select("*")
      .eq("client_id", clientId)
      .order("updated_at", { ascending: false });

    if (error) throw new Error(error.message);

    res.json({
      success: true,
      data: (data || []).map((d: any) => ({
        id: d.id,
        title: d.title,
        layout: d.layout || [],
        createdAt: d.created_at,
        updatedAt: d.updated_at,
      })),
    });
  } catch (error) {
    console.error("Dashboards fetch failed:", error);
    res.status(500).json({
      error: "Failed to load dashboards",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

dashboardsRouter.post("/api/dashboards", async (req: Request, res: Response) => {
  try {
    const clientId = (req.query.client_id as string) || DEFAULT_CLIENT_ID;
    const { title, layout } = req.body;

    if (!title) {
      return res.status(400).json({
        error: "Invalid input",
        message: "title is required",
      });
    }

    const { data, error } = await supabase
      .from("saved_dashboards")
      .insert({
        client_id: clientId,
        title,
        layout: layout || [],
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    res.status(201).json({
      success: true,
      data: {
        id: data.id,
        title: data.title,
        layout: data.layout || [],
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      },
    });
  } catch (error) {
    console.error("Dashboard create failed:", error);
    res.status(500).json({
      error: "Failed to create dashboard",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

dashboardsRouter.patch("/api/dashboards/:id", async (req: Request, res: Response) => {
  try {
    const clientId = (req.query.client_id as string) || DEFAULT_CLIENT_ID;
    const id = req.params.id;
    const updates: Record<string, unknown> = {};
    if (req.body.title !== undefined) updates.title = req.body.title;
    if (req.body.layout !== undefined) updates.layout = req.body.layout;

    const { data, error } = await supabase
      .from("saved_dashboards")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("client_id", clientId)
      .select()
      .single();

    if (error) throw new Error(error.message);

    res.json({
      success: true,
      data: {
        id: data.id,
        title: data.title,
        layout: data.layout || [],
        updatedAt: data.updated_at,
      },
    });
  } catch (error) {
    console.error("Dashboard update failed:", error);
    res.status(500).json({
      error: "Failed to update dashboard",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

dashboardsRouter.delete("/api/dashboards/:id", async (req: Request, res: Response) => {
  try {
    const clientId = (req.query.client_id as string) || DEFAULT_CLIENT_ID;
    const id = req.params.id;

    const { error } = await supabase
      .from("saved_dashboards")
      .delete()
      .eq("id", id)
      .eq("client_id", clientId);

    if (error) throw new Error(error.message);

    res.status(204).send();
  } catch (error) {
    console.error("Dashboard delete failed:", error);
    res.status(500).json({
      error: "Failed to delete dashboard",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});
