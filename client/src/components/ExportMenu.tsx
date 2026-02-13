import React from "react";
import { Download, Copy } from "iconoir-react";
import { ImageIcon, FileText } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface ChartDataset {
  label: string;
  values: number[];
  unit?: string;
}

interface ChartData {
  labels: string[];
  datasets: ChartDataset[];
}

interface ExportMenuProps {
  chartData: ChartData;
  chartTitle: string;
  chartContainerRef?: React.RefObject<HTMLDivElement | null>;
  threadId?: string;
  turnId?: string;
}

export const ExportMenu: React.FC<ExportMenuProps> = ({
  chartData,
  chartTitle,
  chartContainerRef,
}) => {
  const { toast } = useToast();

  const handleExportPNG = async (e: Event) => {
    e.preventDefault();
    if (!chartContainerRef?.current) {
      toast({ title: "Chart not ready for export", variant: "destructive" });
      return;
    }
    try {
      const { default: html2canvas } = await import("html2canvas");
      const canvas = await html2canvas(chartContainerRef.current, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
      });
      const url = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = url;
      link.download = `${chartTitle.replace(/\s+/g, "_")}.png`;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
      }, 100);
      toast({ title: "PNG exported successfully" });
    } catch (error) {
      console.error("PNG export error:", error);
      toast({ title: "Failed to export PNG", variant: "destructive" });
    }
  };

  const handleExportCSV = (e: Event) => {
    e.preventDefault();
    try {
      if (!chartData?.labels?.length || !chartData?.datasets?.length) {
        toast({ title: "No data to export", variant: "destructive" });
        return;
      }

      const headers = ["Label", ...chartData.datasets.map((d) => d.label)];
      const rows = [
        headers.map((h) => `"${h}"`).join(","),
        ...chartData.labels.map((label, idx) => {
          const row = [
            `"${label}"`,
            ...chartData.datasets.map((ds) => {
              const v = ds.values[idx];
              return typeof v === "number" ? v.toString() : "0";
            }),
          ];
          return row.join(",");
        }),
      ];
      const csv = rows.join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${chartTitle.replace(/\s+/g, "_")}.csv`;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 100);
      toast({ title: "CSV exported successfully" });
    } catch (error) {
      console.error("CSV export error:", error);
      toast({ title: "Failed to export CSV", variant: "destructive" });
    }
  };

  const handleExportJSON = (e: Event) => {
    e.preventDefault();
    try {
      if (!chartData?.labels?.length) {
        toast({ title: "No data to export", variant: "destructive" });
        return;
      }

      const jsonStr = JSON.stringify(chartData, null, 2);
      const blob = new Blob([jsonStr], { type: "application/json;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${chartTitle.replace(/\s+/g, "_")}.json`;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 100);
      toast({ title: "JSON exported successfully" });
    } catch (error) {
      console.error("JSON export error:", error);
      toast({ title: "Failed to export JSON", variant: "destructive" });
    }
  };

  const handleCopyData = async (e: Event) => {
    e.preventDefault();
    try {
      const text = chartData.labels
        .map((label, idx) => {
          const vals = chartData.datasets
            .map((ds) => `${ds.label}: ${ds.values[idx]}`)
            .join(", ");
          return `${label} — ${vals}`;
        })
        .join("\n");

      await navigator.clipboard.writeText(text);
      toast({ title: "Data copied to clipboard" });
    } catch (error) {
      console.error("Copy error:", error);
      toast({ title: "Failed to copy data", variant: "destructive" });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2" data-testid="button-export">
          <Download width={16} height={16} />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onSelect={handleExportPNG} className="cursor-pointer flex items-center gap-2" data-testid="button-export-png">
          <ImageIcon width={16} height={16} />
          Export as PNG
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={handleExportCSV} className="cursor-pointer" data-testid="button-export-csv">
          Export as CSV
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={handleExportJSON} className="cursor-pointer" data-testid="button-export-json">
          Export as JSON
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={handleCopyData} className="cursor-pointer flex items-center gap-2" data-testid="button-copy-data">
          <Copy width={16} height={16} />
          Copy Data
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
