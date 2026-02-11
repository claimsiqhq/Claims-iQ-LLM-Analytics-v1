import React, { useState } from 'react';
import { Download, Copy } from 'iconoir-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from './ui/DropdownMenu';
import { Button } from './ui/Button';
import { Toast } from './ui/Toast';

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

interface ToastState {
  isVisible: boolean;
  message: string;
  type: 'success' | 'error' | 'info';
}

export const ExportMenu: React.FC<ExportMenuProps> = ({
  chartData,
  chartTitle,
  threadId,
  turnId,
}) => {
  const [toast, setToast] = useState<ToastState>({
    isVisible: false,
    message: '',
    type: 'info',
  });
  const [isLoading, setIsLoading] = useState(false);

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    setToast({ isVisible: true, message, type });
    setTimeout(() => setToast({ ...toast, isVisible: false }), 3000);
  };

  /**
   * Converts chart data to CSV format and triggers download
   * Format: Header row with labels, data rows for each dataset
   */
  const handleExportCSV = () => {
    try {
      const rows: string[] = [];

      // Header row: Label column + dataset labels
      const headers = ['Label', ...chartData.datasets.map((d) => d.label)];
      rows.push(headers.map((h) => `"${h}"`).join(','));

      // Data rows
      chartData.labels.forEach((label, idx) => {
        const row = [
          `"${label}"`,
          ...chartData.datasets.map((dataset) => {
            const value = dataset.values[idx];
            return typeof value === 'number' ? value.toString() : '0';
          }),
        ];
        rows.push(row.join(','));
      });

      const csv = rows.join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);

      link.setAttribute('href', url);
      link.setAttribute('download', `${chartTitle.replace(/\s+/g, '_')}.csv`);
      link.style.visibility = 'hidden';

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      showToast('CSV exported successfully', 'success');
    } catch (error) {
      console.error('CSV export error:', error);
      showToast('Failed to export CSV', 'error');
    }
  };

  /**
   * Placeholder for PNG export
   * In a real implementation, this would use html2canvas or similar
   */
  const handleExportPNG = () => {
    showToast(
      'PNG export is coming soon. Use screenshot functionality for now.',
      'info'
    );
  };

  /**
   * Copies chart data to clipboard as JSON
   */
  const handleCopyData = async () => {
    try {
      const dataString = JSON.stringify(chartData, null, 2);
      await navigator.clipboard.writeText(dataString);
      showToast('Data copied to clipboard', 'success');
    } catch (error) {
      console.error('Copy error:', error);
      showToast('Failed to copy data', 'error');
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            title="Export chart data"
          >
            <Download width={16} height={16} />
            Export
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem
            onClick={handleExportCSV}
            className="cursor-pointer flex items-center gap-2"
          >
            <span className="text-sm">Export as CSV</span>
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={handleExportPNG}
            disabled={isLoading}
            className="cursor-pointer flex items-center gap-2"
          >
            <span className="text-sm">Export as PNG</span>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={handleCopyData}
            className="cursor-pointer flex items-center gap-2"
          >
            <Copy width={16} height={16} />
            <span className="text-sm">Copy Data</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Toast Notification */}
      {toast.isVisible && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast({ ...toast, isVisible: false })}
        />
      )}
    </>
  );
};
