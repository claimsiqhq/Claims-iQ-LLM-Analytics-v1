import React, { useState, useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/Table';

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

type SortConfig = {
  key: 'label' | number; // label for first column, number for dataset index
  direction: 'asc' | 'desc';
} | null;

/**
 * Formats a value based on its unit type
 * Supports: percentage, currency, count, days, etc.
 */
const formatValue = (value: number, unit?: string): string => {
  if (value === null || value === undefined) {
    return '—';
  }

  switch (unit?.toLowerCase()) {
    case 'percentage':
    case '%':
      return `${value.toFixed(1)}%`;
    case 'currency':
    case '$':
      return `$${value.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    case 'days':
      return `${Math.round(value)} days`;
    case 'count':
      return `${Math.round(value)}`;
    default:
      // Default: show up to 2 decimal places
      return value % 1 === 0
        ? value.toString()
        : value.toFixed(2);
  }
};

export const DataTable: React.FC<DataTableProps> = ({ data }) => {
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);

  // Sort data based on current sort configuration
  const sortedData = useMemo(() => {
    if (!sortConfig) {
      return { labels: data.labels, datasets: data.datasets };
    }

    const indices = data.labels.map((_, i) => i);

    indices.sort((a, b) => {
      let aVal: string | number;
      let bVal: string | number;

      if (sortConfig.key === 'label') {
        aVal = data.labels[a];
        bVal = data.labels[b];
      } else {
        aVal = data.datasets[sortConfig.key].values[a];
        bVal = data.datasets[sortConfig.key].values[b];
      }

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
      }

      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();

      return sortConfig.direction === 'asc'
        ? aStr.localeCompare(bStr)
        : bStr.localeCompare(aStr);
    });

    return {
      labels: indices.map((i) => data.labels[i]),
      datasets: data.datasets.map((dataset) => ({
        ...dataset,
        values: indices.map((i) => dataset.values[i]),
      })),
    };
  }, [data, sortConfig]);

  const handleSort = (key: 'label' | number) => {
    setSortConfig((prev) => {
      if (prev?.key === key) {
        return {
          key,
          direction: prev.direction === 'asc' ? 'desc' : 'asc',
        };
      }
      return { key, direction: 'asc' };
    });
  };

  const getSortIndicator = (key: 'label' | number): string => {
    if (sortConfig?.key !== key) return '⋮';
    return sortConfig.direction === 'asc' ? '↑' : '↓';
  };

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
      <Table>
        <TableHeader className="bg-gray-50 sticky top-0">
          <TableRow className="border-b border-gray-200 hover:bg-gray-50">
            {/* Label Column Header */}
            <TableHead
              onClick={() => handleSort('label')}
              className="cursor-pointer hover:bg-gray-100 transition-colors font-semibold"
            >
              <div className="flex items-center justify-between gap-2">
                <span>Label</span>
                <span className="text-xs text-gray-400 font-normal">
                  {getSortIndicator('label')}
                </span>
              </div>
            </TableHead>

            {/* Dataset Column Headers */}
            {sortedData.datasets.map((dataset, idx) => (
              <TableHead
                key={idx}
                onClick={() => handleSort(idx)}
                className="cursor-pointer hover:bg-gray-100 transition-colors font-semibold text-right"
              >
                <div className="flex items-center justify-end gap-2">
                  <div>
                    <p>{dataset.label}</p>
                    {dataset.unit && (
                      <p className="text-xs font-normal text-gray-500">
                        {dataset.unit}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 font-normal">
                    {getSortIndicator(idx)}
                  </span>
                </div>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>

        <TableBody>
          {sortedData.labels.map((label, rowIdx) => (
            <TableRow
              key={rowIdx}
              className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                rowIdx % 2 === 0 ? 'bg-white' : 'bg-surface-off-white'
              }`}
            >
              {/* Label Cell */}
              <TableCell className="font-medium text-gray-900 whitespace-nowrap">
                {label}
              </TableCell>

              {/* Data Cells */}
              {sortedData.datasets.map((dataset, colIdx) => {
                const value = dataset.values[rowIdx];
                const formattedValue = formatValue(value, dataset.unit);

                return (
                  <TableCell
                    key={colIdx}
                    className="text-right text-gray-700 font-medium whitespace-nowrap"
                  >
                    {formattedValue}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Empty State */}
      {sortedData.labels.length === 0 && (
        <div className="flex items-center justify-center h-64 bg-gray-50">
          <p className="text-gray-500 font-medium">No data to display</p>
        </div>
      )}
    </div>
  );
};
