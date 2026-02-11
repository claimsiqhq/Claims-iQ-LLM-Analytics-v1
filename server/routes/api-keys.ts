import { Router, Request, Response } from "express";
import crypto from "crypto";
import { supabase } from "../config/supabase";
import { getDefaultClientId } from "../config/defaults";

export const apiKeysRouter = Router();

function hashKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

apiKeysRouter.get("/api/api-keys", async (req: Request, res: Response) => {
  try {
    const clientId = (req.query.client_id as string) || DEFAULT_CLIENT_ID;

    const { data, error } = await supabase
      .from("api_keys")
      .select("id, key_prefix, name, last_used_at, created_at")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    res.json({
      success: true,
      data: (data || []).map((k: any) => ({
        id: k.id,
        keyPrefix: k.key_prefix,
        name: k.name,
        lastUsedAt: k.last_used_at,
        createdAt: k.created_at,
      })),
    });
  } catch (error) {
    console.error("API keys fetch failed:", error);
    res.status(500).json({
      error: "Failed to load API keys",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

apiKeysRouter.post("/api/api-keys", async (req: Request, res: Response) => {
  try {
    const clientId = (req.query.client_id as string) || DEFAULT_CLIENT_ID;
    const { name } = req.body;

    const rawKey = `claims_${crypto.randomBytes(24).toString("hex")}`;
    const keyHash = hashKey(rawKey);
    const keyPrefix = rawKey.slice(0, 12) + "...";

    const { data, error } = await supabase
      .from("api_keys")
      .insert({
        client_id: clientId,
        key_hash: keyHash,
        key_prefix: keyPrefix,
        name: name || null,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    res.status(201).json({
      success: true,
      data: {
        id: data.id,
        key: rawKey,
        keyPrefix: data.key_prefix,
        name: data.name,
        createdAt: data.created_at,
      },
    });
  } catch (error) {
    console.error("API key create failed:", error);
    res.status(500).json({
      error: "Failed to create API key",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

apiKeysRouter.delete("/api/api-keys/:id", async (req: Request, res: Response) => {
  try {
    const clientId = (req.query.client_id as string) || DEFAULT_CLIENT_ID;
    const id = req.params.id;

    const { error } = await supabase
      .from("api_keys")
      .delete()
      .eq("id", id)
      .eq("client_id", clientId);

    if (error) throw new Error(error.message);

    res.status(204).send();
  } catch (error) {
    console.error("API key delete failed:", error);
    res.status(500).json({
      error: "Failed to delete API key",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});
