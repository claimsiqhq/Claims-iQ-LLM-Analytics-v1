import React, { useState, useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Dataset {
  label: string;
  values: number[];
  unit?: string;
}

interface DataTableProps {
  data: {
    labels: string[];
    datasets: Dataset[];
  };
}

type SortConfig = { key: "label" | number; direction: "asc" | "desc" } | null;

const formatValue = (value: number, unit?: string): string => {
  if (value == null) return "—";
  switch (unit?.toLowerCase()) {
    case "percentage":
    case "%":
      return `${value.toFixed(1)}%`;
    case "currency":
    case "$":
      return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    case "days":
      return `${Math.round(value)} days`;
    case "count":
      return `${Math.round(value)}`;
    default:
      return value % 1 === 0 ? value.toString() : value.toFixed(2);
  }
};

export const DataTable: React.FC<DataTableProps> = ({ data }) => {
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);

  const sortedData = useMemo(() => {
    if (!sortConfig) return { labels: data.labels, datasets: data.datasets };
    const indices = data.labels.map((_, i) => i);
    indices.sort((a, b) => {
      const aVal = sortConfig.key === "label" ? data.labels[a] : data.datasets[sortConfig.key].values[a];
      const bVal = sortConfig.key === "label" ? data.labels[b] : data.datasets[sortConfig.key].values[b];
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortConfig.direction === "asc" ? aVal - bVal : bVal - aVal;
      }
      const cmp = String(aVal).toLowerCase().localeCompare(String(bVal).toLowerCase());
      return sortConfig.direction === "asc" ? cmp : -cmp;
    });
    return {
      labels: indices.map((i) => data.labels[i]),
      datasets: data.datasets.map((ds) => ({
        ...ds,
        values: indices.map((i) => ds.values[i]),
      })),
    };
  }, [data, sortConfig]);

  const handleSort = (key: "label" | number) => {
    setSortConfig((prev) =>
      prev?.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" }
    );
  };

  const getSortIndicator = (key: "label" | number) =>
    sortConfig?.key !== key ? "⋮" : sortConfig.direction === "asc" ? "↑" : "↓";

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
      <Table>
        <TableHeader className="bg-gray-50 sticky top-0">
          <TableRow className="border-b border-gray-200 hover:bg-gray-50">
            <TableHead
              onClick={() => handleSort("label")}
              className="cursor-pointer hover:bg-gray-100 font-semibold"
            >
              <span>Label</span>
              <span className="text-xs text-gray-400 ml-1">{getSortIndicator("label")}</span>
            </TableHead>
            {sortedData.datasets.map((ds, idx) => (
              <TableHead
                key={idx}
                onClick={() => handleSort(idx)}
                className="cursor-pointer hover:bg-gray-100 font-semibold text-right"
              >
                <span>{ds.label}</span>
                {ds.unit && <span className="text-xs text-gray-500"> ({ds.unit})</span>}
                <span className="text-xs text-gray-400 ml-1">{getSortIndicator(idx)}</span>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedData.labels.map((label, rowIdx) => (
            <TableRow
              key={rowIdx}
              className={`border-b border-gray-100 hover:bg-gray-50 ${rowIdx % 2 === 0 ? "bg-white" : "bg-surface-off-white"}`}
            >
              <TableCell className="font-medium text-gray-900 whitespace-nowrap">{label}</TableCell>
              {sortedData.datasets.map((ds, colIdx) => (
                <TableCell
                  key={colIdx}
                  className="text-right text-gray-700 font-medium whitespace-nowrap"
                >
                  {formatValue(ds.values[rowIdx], ds.unit)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {sortedData.labels.length === 0 && (
        <div className="flex items-center justify-center h-64 bg-gray-50">
          <p className="text-gray-500 font-medium">No data to display</p>
        </div>
      )}
    </div>
  );
};
