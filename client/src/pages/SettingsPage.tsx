import React, { useState, useEffect, useCallback, useRef } from "react";
import { useTheme } from "next-themes";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Upload,
  Database,
  Settings,
  Users,
  Bot,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Plus,
  ArrowLeft,
  RefreshCw,
  Shield,
  Mic,
  Brain,
  BarChart3,
  Clock,
  Bell,
  Palette,
  ChevronRight,
} from "lucide-react";

interface DataSummary {
  claims: number;
  adjusters: number;
  policies: number;
  estimates: number;
  billing: number;
  threads: number;
  stageHistory: number;
}

interface AIConfig {
  providers: {
    anthropic: { configured: boolean; baseUrl: string; model: string; usage: string };
    openai: { configured: boolean; model: string; usage: string };
  };
  features: { intentParsing: boolean; insightGeneration: boolean; voiceAgent: boolean };
}

interface Client {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

interface Adjuster {
  id: string;
  full_name: string;
  email: string;
  team: string;
}

export function SettingsPage({ onBack, clientId }: { onBack: () => void; clientId?: string }) {
  const [activeTab, setActiveTab] = useState("data-import");

  return (
    <div className="min-h-screen bg-surface-off-white dark:bg-gray-900">
      <div className="h-14 w-full bg-brand-deep-purple flex items-center px-3 md:px-6 fixed top-0 left-0 right-0 z-50 shadow-md">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-white/80 hover:text-white transition-colors mr-4"
          data-testid="btn-settings-back"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="text-sm font-medium hidden sm:inline">Dashboard</span>
        </button>
        <div className="flex items-center gap-3">
          <Settings className="w-5 h-5 text-brand-gold" />
          <h1 className="text-white font-display font-semibold text-lg">Settings</h1>
        </div>
      </div>

      <div className="pt-14 max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-white dark:bg-gray-800 border border-border p-1 rounded-xl grid grid-cols-2 md:grid-cols-4 gap-1 h-auto">
            <TabsTrigger
              value="data-import"
              className="gap-2 data-[state=active]:bg-brand-purple data-[state=active]:text-white rounded-lg py-2.5 text-sm"
              data-testid="tab-data-import"
            >
              <Database className="w-4 h-4" />
              <span className="hidden sm:inline">Data Import</span>
              <span className="sm:hidden">Data</span>
            </TabsTrigger>
            <TabsTrigger
              value="preferences"
              className="gap-2 data-[state=active]:bg-brand-purple data-[state=active]:text-white rounded-lg py-2.5 text-sm"
              data-testid="tab-preferences"
            >
              <Palette className="w-4 h-4" />
              <span className="hidden sm:inline">Preferences</span>
              <span className="sm:hidden">Prefs</span>
            </TabsTrigger>
            <TabsTrigger
              value="clients"
              className="gap-2 data-[state=active]:bg-brand-purple data-[state=active]:text-white rounded-lg py-2.5 text-sm"
              data-testid="tab-clients"
            >
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline">Clients & Users</span>
              <span className="sm:hidden">Clients</span>
            </TabsTrigger>
            <TabsTrigger
              value="ai-config"
              className="gap-2 data-[state=active]:bg-brand-purple data-[state=active]:text-white rounded-lg py-2.5 text-sm"
              data-testid="tab-ai-config"
            >
              <Bot className="w-4 h-4" />
              <span className="hidden sm:inline">AI Models</span>
              <span className="sm:hidden">AI</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="data-import">
            <DataImportSection clientId={clientId} />
          </TabsContent>
          <TabsContent value="preferences">
            <PreferencesSection clientId={clientId} />
          </TabsContent>
          <TabsContent value="clients">
            <ClientsSection clientId={clientId} />
          </TabsContent>
          <TabsContent value="ai-config">
            <AIConfigSection />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function DataImportSection({ clientId }: { clientId?: string }) {
  const [dataSummary, setDataSummary] = useState<DataSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [importMode, setImportMode] = useState<"append" | "replace">("append");
  const [importResult, setImportResult] = useState<any>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [summaryError, setSummaryError] = useState(false);

  const loadSummary = useCallback(async () => {
    try {
      setLoading(true);
      setSummaryError(false);
      const params = clientId ? `?client_id=${clientId}` : "";
      const res = await fetch(`/api/settings/data-summary${params}`);
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setDataSummary(data);
    } catch {
      setSummaryError(true);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setImportResult(null);
    setImportError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("mode", importMode);
      if (clientId) formData.append("client_id", clientId);

      const res = await fetch("/api/settings/import-spreadsheet", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        setImportError(data.error || "Import failed");
      } else {
        setImportResult(data);
        loadSummary();
      }
    } catch (err: any) {
      setImportError(err.message || "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [importMode, loadSummary]);

  const summaryItems = dataSummary ? [
    { label: "Claims", value: dataSummary.claims, icon: FileSpreadsheet },
    { label: "Adjusters", value: dataSummary.adjusters, icon: Users },
    { label: "Policies", value: dataSummary.policies, icon: Shield },
    { label: "Estimates", value: dataSummary.estimates, icon: BarChart3 },
    { label: "Billing Records", value: dataSummary.billing, icon: Database },
    { label: "Stage History", value: dataSummary.stageHistory, icon: Clock },
  ] : [];

  return (
    <div className="space-y-6">
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-brand-deep-purple dark:text-white">
            <Database className="w-5 h-5 text-brand-purple" />
            Current Data Overview
          </CardTitle>
          <CardDescription>Records currently loaded in the database for your active client</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <RefreshCw className="w-4 h-4 animate-spin" />
              Loading data summary...
            </div>
          ) : summaryError ? (
            <div className="flex items-start gap-2 p-3 bg-status-alert/10 border border-status-alert/20 rounded-lg">
              <AlertCircle className="w-4 h-4 text-status-alert mt-0.5 shrink-0" />
              <p className="text-sm text-status-alert">Failed to load data summary. Click Refresh to try again.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {summaryItems.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center gap-3 p-3 rounded-lg bg-surface-purple-light/30 dark:bg-gray-800"
                  data-testid={`data-count-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <item.icon className="w-4 h-4 text-brand-purple" />
                  <div>
                    <p className="text-2xl font-mono font-bold text-brand-deep-purple dark:text-white">
                      {item.value.toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">{item.label}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={loadSummary}
              disabled={loading}
              data-testid="btn-refresh-summary"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-brand-deep-purple dark:text-white">
            <Upload className="w-5 h-5 text-brand-gold" />
            Import Spreadsheet
          </CardTitle>
          <CardDescription>
            Upload an Excel file (.xlsx) with claims data. The file should have tabs named: claims, adjusters, claim_policies, claim_estimates, claim_billing
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 space-y-2">
              <Label htmlFor="import-mode">Import Mode</Label>
              <Select value={importMode} onValueChange={(v) => setImportMode(v as "append" | "replace")}>
                <SelectTrigger id="import-mode" data-testid="select-import-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="append">Append (add new records only)</SelectItem>
                  <SelectItem value="replace">Replace (delete all existing, then import)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {importMode === "replace" && (
            <div className="flex items-start gap-2 p-3 bg-status-alert/10 border border-status-alert/20 rounded-lg">
              <AlertCircle className="w-4 h-4 text-status-alert mt-0.5 shrink-0" />
              <p className="text-sm text-status-alert">
                Replace mode will delete ALL existing claims, adjusters, and related data for the current client before importing. This cannot be undone.
              </p>
            </div>
          )}

          <div
            className="border-2 border-dashed border-brand-purple/30 dark:border-brand-purple/50 rounded-xl p-8 text-center hover:border-brand-purple/60 transition-colors cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
            data-testid="dropzone-upload"
          >
            <Upload className="w-10 h-10 text-brand-purple/50 mx-auto mb-3" />
            <p className="text-sm font-medium text-brand-deep-purple dark:text-white mb-1">
              {uploading ? "Uploading and processing..." : "Click to upload spreadsheet"}
            </p>
            <p className="text-xs text-muted-foreground">
              Supports .xlsx, .xls, and .csv files up to 50MB
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleUpload}
              disabled={uploading}
              data-testid="input-file-upload"
            />
          </div>

          {uploading && (
            <div className="flex items-center gap-2 p-3 bg-brand-purple/10 rounded-lg">
              <RefreshCw className="w-4 h-4 animate-spin text-brand-purple" />
              <span className="text-sm text-brand-purple font-medium">Processing spreadsheet...</span>
            </div>
          )}

          {importError && (
            <div className="flex items-start gap-2 p-3 bg-status-alert/10 border border-status-alert/20 rounded-lg">
              <AlertCircle className="w-4 h-4 text-status-alert mt-0.5 shrink-0" />
              <p className="text-sm text-status-alert">{importError}</p>
            </div>
          )}

          {importResult && (
            <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                <span className="font-medium text-green-800 dark:text-green-300">{importResult.message}</span>
              </div>
              {importResult.imported && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                  {Object.entries(importResult.imported).map(([key, val]) => (
                    <div key={key} className="flex justify-between p-2 bg-white/50 dark:bg-gray-800/50 rounded">
                      <span className="text-muted-foreground capitalize">{key.replace(/([A-Z])/g, " $1")}</span>
                      <span className="font-mono font-medium">{String(val)}</span>
                    </div>
                  ))}
                </div>
              )}
              {importResult.sheetsFound && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <span className="text-xs text-muted-foreground mr-1">Sheets found:</span>
                  {importResult.sheetsFound.map((s: string) => (
                    <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-brand-deep-purple dark:text-white">
            <FileSpreadsheet className="w-5 h-5 text-brand-purple" />
            Spreadsheet Format
          </CardTitle>
          <CardDescription>Your spreadsheet must follow this format for successful import</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              { tab: "claims", fields: "claim_number, claimant_name, peril, severity, region, state_code, status, current_stage, fnol_date, date_of_loss, reserve_amount, paid_amount" },
              { tab: "adjusters", fields: "full_name, email, team" },
              { tab: "claim_policies", fields: "claim_id (=claim_number), policy_number, policy_type, coverage_type, coverage_amount, deductible" },
              { tab: "claim_estimates", fields: "claim_id (=claim_number), estimate_number, estimated_amount, depreciation_amount, replacement_cost" },
              { tab: "claim_billing", fields: "claim_id (=claim_number), expense_category, amount, vendor_name, description" },
            ].map((s) => (
              <div key={s.tab} className="p-3 bg-surface-purple-light/20 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <Badge className="bg-brand-purple text-white text-xs">{s.tab}</Badge>
                </div>
                <p className="text-xs text-muted-foreground font-mono">{s.fields}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PreferencesSection({ clientId }: { clientId?: string }) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [defaultChart, setDefaultChart] = useState("bar");
  const [defaultTimeRange, setDefaultTimeRange] = useState("30d");
  const [notifications, setNotifications] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(300);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const params = clientId ? `?client_id=${clientId}` : "";
    fetch(`/api/settings/preferences${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.data) {
          setDefaultChart(d.data.default_chart_type || "bar");
          setDefaultTimeRange(d.data.default_time_range || "30d");
          setNotifications(d.data.notifications_enabled ?? true);
          setAutoRefresh(d.data.auto_refresh_interval || 300);
        }
      })
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    await fetch("/api/settings/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        preferences: {
          default_chart_type: defaultChart,
          default_time_range: defaultTimeRange,
          theme: theme || "system",
          notifications_enabled: notifications,
          auto_refresh_interval: autoRefresh,
        },
      }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-6">
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-brand-deep-purple dark:text-white">
            <Palette className="w-5 h-5 text-brand-purple" />
            Appearance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Theme</Label>
            <div className="grid grid-cols-3 gap-3">
              {[
                { value: "light", label: "Light", icon: "☀️" },
                { value: "dark", label: "Dark", icon: "🌙" },
                { value: "system", label: "System", icon: "💻" },
              ].map((t) => (
                <button
                  key={t.value}
                  onClick={() => setTheme(t.value)}
                  className={`p-3 rounded-lg border-2 transition-all text-center ${
                    (theme || "system") === t.value
                      ? "border-brand-purple bg-brand-purple/10"
                      : "border-border hover:border-brand-purple/30"
                  }`}
                  data-testid={`theme-${t.value}`}
                >
                  <span className="text-2xl block mb-1">{t.icon}</span>
                  <span className="text-sm font-medium">{t.label}</span>
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-brand-deep-purple dark:text-white">
            <BarChart3 className="w-5 h-5 text-brand-purple" />
            Chart Defaults
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="default-chart">Default Chart Type</Label>
              <Select value={defaultChart} onValueChange={setDefaultChart}>
                <SelectTrigger id="default-chart" data-testid="select-default-chart">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bar">Bar Chart</SelectItem>
                  <SelectItem value="line">Line Chart</SelectItem>
                  <SelectItem value="area">Area Chart</SelectItem>
                  <SelectItem value="pie">Pie Chart</SelectItem>
                  <SelectItem value="stacked_bar">Stacked Bar</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="default-time-range">Default Time Range</Label>
              <Select value={defaultTimeRange} onValueChange={setDefaultTimeRange}>
                <SelectTrigger id="default-time-range" data-testid="select-default-time-range">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">Last 7 Days</SelectItem>
                  <SelectItem value="30d">Last 30 Days</SelectItem>
                  <SelectItem value="90d">Last 90 Days</SelectItem>
                  <SelectItem value="ytd">Year to Date</SelectItem>
                  <SelectItem value="all">All Time</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-brand-deep-purple dark:text-white">
            <Bell className="w-5 h-5 text-brand-purple" />
            Notifications & Refresh
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Anomaly Notifications</p>
              <p className="text-xs text-muted-foreground">Get notified when anomalies are detected</p>
            </div>
            <Switch
              checked={notifications}
              onCheckedChange={setNotifications}
              data-testid="switch-notifications"
            />
          </div>
          <Separator />
          <div className="space-y-2">
            <Label htmlFor="auto-refresh">Auto-Refresh Interval</Label>
            <Select value={String(autoRefresh)} onValueChange={(v) => setAutoRefresh(Number(v))}>
              <SelectTrigger id="auto-refresh" data-testid="select-auto-refresh">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="60">Every minute</SelectItem>
                <SelectItem value="300">Every 5 minutes</SelectItem>
                <SelectItem value="600">Every 10 minutes</SelectItem>
                <SelectItem value="1800">Every 30 minutes</SelectItem>
                <SelectItem value="0">Disabled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          className="bg-brand-purple hover:bg-brand-purple/90 text-white"
          data-testid="btn-save-preferences"
        >
          {saved ? (
            <>
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Saved!
            </>
          ) : (
            "Save Preferences"
          )}
        </Button>
      </div>
    </div>
  );
}

function ClientsSection({ clientId }: { clientId?: string }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [adjusters, setAdjusters] = useState<Adjuster[]>([]);
  const [loading, setLoading] = useState(true);
  const [newClientName, setNewClientName] = useState("");
  const [addingClient, setAddingClient] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const adjParams = clientId ? `?client_id=${clientId}` : "";
      const [clientsRes, adjustersRes] = await Promise.all([
        fetch("/api/settings/clients").then((r) => r.json()),
        fetch(`/api/settings/adjusters${adjParams}`).then((r) => r.json()),
      ]);
      setClients(clientsRes.data || []);
      setAdjusters(adjustersRes.data || []);
    } catch {
      console.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleAddClient = async () => {
    if (!newClientName.trim()) return;
    setAddingClient(true);
    try {
      const res = await fetch("/api/settings/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newClientName.trim() }),
      });
      if (res.ok) {
        setNewClientName("");
        setShowAddForm(false);
        loadData();
      }
    } finally {
      setAddingClient(false);
    }
  };

  const handleDeleteClient = async (id: string) => {
    if (!confirm("Are you sure you want to delete this client? This will remove all associated data.")) return;
    await fetch(`/api/settings/clients/${id}`, { method: "DELETE" });
    loadData();
  };

  return (
    <div className="space-y-6">
      <Card className="border-border">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-brand-deep-purple dark:text-white">
                <Users className="w-5 h-5 text-brand-purple" />
                Client Organizations
              </CardTitle>
              <CardDescription>Manage client organizations and their access</CardDescription>
            </div>
            <Button
              size="sm"
              onClick={() => setShowAddForm(!showAddForm)}
              className="bg-brand-purple hover:bg-brand-purple/90 text-white"
              data-testid="btn-add-client"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Client
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {showAddForm && (
            <div className="flex gap-2 mb-4 p-3 bg-surface-purple-light/30 dark:bg-gray-800 rounded-lg">
              <Input
                placeholder="Client name"
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddClient()}
                data-testid="input-new-client-name"
              />
              <Button
                onClick={handleAddClient}
                disabled={addingClient || !newClientName.trim()}
                className="bg-brand-gold hover:bg-brand-gold/90 text-brand-deep-purple shrink-0"
                data-testid="btn-confirm-add-client"
              >
                {addingClient ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Add"}
              </Button>
            </div>
          )}

          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-4">
              <RefreshCw className="w-4 h-4 animate-spin" />
              Loading clients...
            </div>
          ) : clients.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4">No clients found</p>
          ) : (
            <div className="space-y-2">
              {clients.map((client) => (
                <div
                  key={client.id}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-surface-purple-light/20 dark:hover:bg-gray-800 transition-colors"
                  data-testid={`client-row-${client.id}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-brand-purple/10 flex items-center justify-center">
                      <span className="text-brand-purple font-bold text-sm">
                        {client.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium text-sm">{client.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{client.slug}</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteClient(client.id)}
                    className="text-muted-foreground hover:text-status-alert"
                    data-testid={`btn-delete-client-${client.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-brand-deep-purple dark:text-white">
            <Shield className="w-5 h-5 text-brand-purple" />
            Adjusters
          </CardTitle>
          <CardDescription>Adjusters are imported from your spreadsheet data</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-4">
              <RefreshCw className="w-4 h-4 animate-spin" />
              Loading adjusters...
            </div>
          ) : adjusters.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4">No adjusters found. Import a spreadsheet to add adjusters.</p>
          ) : (
            <div className="space-y-2">
              {adjusters.map((adj) => (
                <div
                  key={adj.id}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-surface-purple-light/20 dark:hover:bg-gray-800"
                  data-testid={`adjuster-row-${adj.id}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-brand-gold/10 flex items-center justify-center">
                      <span className="text-brand-gold font-bold text-sm">
                        {adj.full_name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium text-sm">{adj.full_name}</p>
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-muted-foreground">{adj.email}</p>
                        {adj.team && <Badge variant="secondary" className="text-xs">{adj.team}</Badge>}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AIConfigSection() {
  const [config, setConfig] = useState<AIConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/settings/ai-config")
      .then((r) => r.json())
      .then((data) => {
        setConfig(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-8">
        <RefreshCw className="w-4 h-4 animate-spin" />
        Loading AI configuration...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-brand-deep-purple dark:text-white">
            <Brain className="w-5 h-5 text-brand-purple" />
            AI Provider Status
          </CardTitle>
          <CardDescription>Overview of configured AI providers and their capabilities</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 rounded-lg border border-border bg-surface-purple-light/20 dark:bg-gray-800">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-brand-purple/10 flex items-center justify-center">
                  <Brain className="w-5 h-5 text-brand-purple" />
                </div>
                <div>
                  <p className="font-medium text-sm">Anthropic Claude</p>
                  <p className="text-xs text-muted-foreground">{config?.providers.anthropic.model}</p>
                </div>
              </div>
              <Badge
                className={config?.providers.anthropic.configured
                  ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                  : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                }
              >
                {config?.providers.anthropic.configured ? "Connected" : "Not Configured"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mb-2">{config?.providers.anthropic.usage}</p>
            <div className="flex flex-wrap gap-2">
              <FeatureBadge label="Intent Parsing" enabled={config?.features.intentParsing} />
              <FeatureBadge label="Insight Generation" enabled={config?.features.insightGeneration} />
            </div>
          </div>

          <div className="p-4 rounded-lg border border-border bg-surface-purple-light/20 dark:bg-gray-800">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-brand-gold/10 flex items-center justify-center">
                  <Mic className="w-5 h-5 text-brand-gold" />
                </div>
                <div>
                  <p className="font-medium text-sm">OpenAI</p>
                  <p className="text-xs text-muted-foreground">{config?.providers.openai.model}</p>
                </div>
              </div>
              <Badge
                className={config?.providers.openai.configured
                  ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                  : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                }
              >
                {config?.providers.openai.configured ? "Connected" : "Not Configured"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mb-2">{config?.providers.openai.usage}</p>
            <div className="flex flex-wrap gap-2">
              <FeatureBadge label="Voice Agent" enabled={config?.features.voiceAgent} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-brand-deep-purple dark:text-white">
            <Settings className="w-5 h-5 text-brand-purple" />
            Architecture Overview
          </CardTitle>
          <CardDescription>How AI is used in Claims IQ Analytics</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              {
                title: "Intent Translation",
                desc: "Natural language questions are translated into structured JSON intents. The LLM never generates SQL directly — it produces a validated specification.",
                icon: Brain,
              },
              {
                title: "Query Compilation",
                desc: "Validated intents are compiled into parameterized Supabase queries by the query engine. All data access is controlled and auditable.",
                icon: Database,
              },
              {
                title: "Insight Generation",
                desc: "After data is retrieved, the LLM generates concise analytical summaries explaining trends, outliers, and actionable findings.",
                icon: BarChart3,
              },
              {
                title: "Voice Interaction",
                desc: "OpenAI's Realtime API enables two-way voice chat. Speech is transcribed, processed, and responses are streamed back as audio.",
                icon: Mic,
              },
            ].map((item) => (
              <div key={item.title} className="flex gap-3 p-3 rounded-lg bg-surface-purple-light/20 dark:bg-gray-800">
                <item.icon className="w-5 h-5 text-brand-purple mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-sm">{item.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function FeatureBadge({ label, enabled }: { label: string; enabled?: boolean }) {
  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
      enabled
        ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
        : "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
    }`}>
      {enabled ? (
        <CheckCircle2 className="w-3 h-3" />
      ) : (
        <AlertCircle className="w-3 h-3" />
      )}
      {label}
    </div>
  );
}
