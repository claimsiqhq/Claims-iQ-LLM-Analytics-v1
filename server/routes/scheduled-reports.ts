import { Router, Request, Response } from "express";
import { supabase } from "../config/supabase";
import { getDefaultClientId } from "../config/defaults";

export const scheduledReportsRouter = Router();

scheduledReportsRouter.get("/api/scheduled-reports", async (req: Request, res: Response) => {
  try {
    const clientId = (req.query.client_id as string) || await getDefaultClientId();

    const { data, error } = await supabase
      .from("scheduled_metric_reports")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    res.json({
      success: true,
      data: (data || []).map((r: any) => ({
        id: r.id,
        title: r.title,
        metricSlug: r.metric_slug,
        scheduleCron: r.schedule_cron,
        recipients: r.recipients || [],
        lastRunAt: r.last_run_at,
        nextRunAt: r.next_run_at,
        isActive: r.is_active,
        createdAt: r.created_at,
      })),
    });
  } catch (error) {
    console.error("Scheduled reports fetch failed:", error);
    res.status(500).json({
      error: "Failed to load scheduled reports",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

scheduledReportsRouter.post("/api/scheduled-reports", async (req: Request, res: Response) => {
  try {
    const clientId = (req.query.client_id as string) || await getDefaultClientId();
    const { title, metricSlug, scheduleCron, recipients } = req.body;

    if (!title || !metricSlug || !scheduleCron) {
      return res.status(400).json({
        error: "Invalid input",
        message: "title, metricSlug, and scheduleCron are required",
      });
    }

    const { data, error } = await supabase
      .from("scheduled_metric_reports")
      .insert({
        client_id: clientId,
        title,
        metric_slug: metricSlug,
        schedule_cron: scheduleCron,
        recipients: recipients || [],
        is_active: true,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    res.status(201).json({
      success: true,
      data: {
        id: data.id,
        title: data.title,
        metricSlug: data.metric_slug,
        scheduleCron: data.schedule_cron,
        recipients: data.recipients || [],
        isActive: data.is_active,
        createdAt: data.created_at,
      },
    });
  } catch (error) {
    console.error("Scheduled report create failed:", error);
    res.status(500).json({
      error: "Failed to create scheduled report",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

scheduledReportsRouter.patch("/api/scheduled-reports/:id", async (req: Request, res: Response) => {
  try {
    const clientId = (req.query.client_id as string) || await getDefaultClientId();
    const id = req.params.id;
    const updates: Record<string, unknown> = {};
    if (req.body.title !== undefined) updates.title = req.body.title;
    if (req.body.metricSlug !== undefined) updates.metric_slug = req.body.metricSlug;
    if (req.body.scheduleCron !== undefined) updates.schedule_cron = req.body.scheduleCron;
    if (req.body.recipients !== undefined) updates.recipients = req.body.recipients;
    if (req.body.isActive !== undefined) updates.is_active = req.body.isActive;

    const { data, error } = await supabase
      .from("scheduled_metric_reports")
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
        metricSlug: data.metric_slug,
        scheduleCron: data.schedule_cron,
        recipients: data.recipients || [],
        isActive: data.is_active,
        updatedAt: data.updated_at,
      },
    });
  } catch (error) {
    console.error("Scheduled report update failed:", error);
    res.status(500).json({
      error: "Failed to update scheduled report",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

scheduledReportsRouter.delete("/api/scheduled-reports/:id", async (req: Request, res: Response) => {
  try {
    const clientId = (req.query.client_id as string) || await getDefaultClientId();
    const id = req.params.id;

    const { error } = await supabase
      .from("scheduled_metric_reports")
      .delete()
      .eq("id", id)
      .eq("client_id", clientId);

    if (error) throw new Error(error.message);

    res.status(204).send();
  } catch (error) {
    console.error("Scheduled report delete failed:", error);
    res.status(500).json({
      error: "Failed to delete scheduled report",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});
