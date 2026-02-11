import React, { useState } from "react";
import { Download, Copy } from "iconoir-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

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
  threadId?: string;
  turnId?: string;
}

export const ExportMenu: React.FC<ExportMenuProps> = ({
  chartData,
  chartTitle,
}) => {
  const handleExportCSV = () => {
    try {
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
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${chartTitle.replace(/\s+/g, "_")}.csv`;
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
      toast.success("CSV exported successfully");
    } catch (error) {
      console.error("CSV export error:", error);
      toast.error("Failed to export CSV");
    }
  };

  const handleExportPNG = () => {
    toast.info("PNG export coming soon. Use screenshot for now.");
  };

  const handleCopyData = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(chartData, null, 2));
      toast.success("Data copied to clipboard");
    } catch (error) {
      console.error("Copy error:", error);
      toast.error("Failed to copy data");
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2" title="Export chart data">
          <Download width={16} height={16} />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={handleExportCSV} className="cursor-pointer">
          Export as CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleExportPNG} className="cursor-pointer">
          Export as PNG
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleCopyData} className="cursor-pointer flex items-center gap-2">
          <Copy width={16} height={16} />
          Copy Data
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
