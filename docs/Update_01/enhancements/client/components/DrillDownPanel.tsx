import React, { useEffect, useState } from 'react';
import { ChevronLeft, X } from 'iconoir-react';
import { getDrilldown } from '../lib/api';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/Table';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from './ui/Pagination';

interface ClaimRecord {
  claimNumber: string;
  status: 'open' | 'closed' | 'pending' | 'in_review';
  adjuster: string;
  stage: string;
  ageInDays: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  issues: string[];
}

interface SummaryStats {
  totalCount: number;
  avgCycleTime: number;
  breachPercentage: number;
}

interface DrillDownPanelProps {
  isOpen: boolean;
  onClose: () => void;
  metric: string;
  filters?: Record<string, string | number>;
  timeRange?: { start: string; end: string };
  clientId: string;
}

const ITEMS_PER_PAGE = 10;

const getSeverityColor = (severity: string): string => {
  const colors: Record<string, string> = {
    critical: 'bg-red-100 text-red-800 border-red-300',
    high: 'bg-orange-100 text-orange-800 border-orange-300',
    medium: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    low: 'bg-green-100 text-green-800 border-green-300',
  };
  return colors[severity] || colors.low;
};

const getStatusColor = (status: string): string => {
  const colors: Record<string, string> = {
    open: 'bg-blue-100 text-blue-800',
    closed: 'bg-green-100 text-green-800',
    pending: 'bg-yellow-100 text-yellow-800',
    in_review: 'bg-purple-100 text-purple-800',
  };
  return colors[status] || colors.open;
};

export const DrillDownPanel: React.FC<DrillDownPanelProps> = ({
  isOpen,
  onClose,
  metric,
  filters = {},
  timeRange,
  clientId,
}) => {
  const [claims, setClaims] = useState<ClaimRecord[]>([]);
  const [summaryStats, setSummaryStats] = useState<SummaryStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<{
    key: keyof ClaimRecord;
    direction: 'asc' | 'desc';
  }>({ key: 'ageInDays', direction: 'desc' });

  useEffect(() => {
    if (isOpen) {
      fetchDrilldownData();
    }
  }, [isOpen, metric, filters, timeRange, clientId]);

  const fetchDrilldownData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getDrilldown(
        clientId,
        metric,
        filters,
        timeRange || { start: '', end: '' }
      );
      setClaims(data.claims || []);
      setSummaryStats(data.summary || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load drill-down data');
      console.error('Drill-down error:', err);
    } finally {
      setLoading(false);
    }
  };

  const sortedClaims = [...claims].sort((a, b) => {
    const aVal = a[sortConfig.key];
    const bVal = b[sortConfig.key];

    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
    }

    const aStr = String(aVal).toLowerCase();
    const bStr = String(bVal).toLowerCase();
    return sortConfig.direction === 'asc'
      ? aStr.localeCompare(bStr)
      : bStr.localeCompare(aStr);
  });

  const paginatedClaims = sortedClaims.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const totalPages = Math.ceil(claims.length / ITEMS_PER_PAGE);

  const handleSort = (key: keyof ClaimRecord) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
    setCurrentPage(1);
  };

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-30 z-40 transition-opacity duration-300"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Slide-in Panel */}
      <div
        className={`fixed right-0 top-0 h-full w-2/5 bg-white shadow-lg z-50 flex flex-col transform transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="hover:bg-gray-100 p-2 rounded-lg transition-colors"
              aria-label="Go back"
            >
              <ChevronLeft width={20} height={20} className="text-gray-700" />
            </button>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                Drill-down: {metric}
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                {Object.entries(filters)
                  .map(([key, value]) => `${key}: ${value}`)
                  .join(' • ') || 'No filters applied'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="hover:bg-gray-100 p-2 rounded-lg transition-colors"
            aria-label="Close panel"
          >
            <X width={20} height={20} className="text-gray-700" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {/* Summary Stats */}
          {summaryStats && (
            <div className="grid grid-cols-3 gap-4 mb-6 p-4 bg-surface-off-white rounded-lg">
              <div>
                <p className="text-xs font-medium text-text-secondary uppercase tracking-wide">
                  Total Claims
                </p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {summaryStats.totalCount}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-text-secondary uppercase tracking-wide">
                  Avg Cycle Time
                </p>
                <p className="text-2xl font-bold text-gray-900 mt-1">
                  {summaryStats.avgCycleTime} days
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-text-secondary uppercase tracking-wide">
                  SLA Breach %
                </p>
                <p className="text-2xl font-bold text-status-alert mt-1">
                  {summaryStats.breachPercentage.toFixed(1)}%
                </p>
              </div>
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <div className="animate-spin mb-4">
                  <div className="w-8 h-8 border-4 border-brand-purple border-t-brand-gold rounded-full" />
                </div>
                <p className="text-gray-600">Loading claim records...</p>
              </div>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-800 font-medium">Error</p>
              <p className="text-red-700 text-sm mt-1">{error}</p>
              <Button
                onClick={fetchDrilldownData}
                variant="outline"
                size="sm"
                className="mt-3"
              >
                Try Again
              </Button>
            </div>
          )}

          {/* Table */}
          {!loading && !error && claims.length > 0 && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <Table>
                <TableHeader className="bg-gray-50">
                  <TableRow className="border-b border-gray-200">
                    <TableHead
                      className="cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleSort('claimNumber')}
                    >
                      <div className="flex items-center gap-2">
                        Claim #
                        <span className="text-xs text-gray-400">
                          {sortConfig.key === 'claimNumber'
                            ? sortConfig.direction === 'asc'
                              ? '↑'
                              : '↓'
                            : '⋮'}
                        </span>
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleSort('status')}
                    >
                      <div className="flex items-center gap-2">
                        Status
                        <span className="text-xs text-gray-400">
                          {sortConfig.key === 'status'
                            ? sortConfig.direction === 'asc'
                              ? '↑'
                              : '↓'
                            : '⋮'}
                        </span>
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleSort('adjuster')}
                    >
                      <div className="flex items-center gap-2">
                        Adjuster
                        <span className="text-xs text-gray-400">
                          {sortConfig.key === 'adjuster'
                            ? sortConfig.direction === 'asc'
                              ? '↑'
                              : '↓'
                            : '⋮'}
                        </span>
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleSort('stage')}
                    >
                      <div className="flex items-center gap-2">
                        Stage
                        <span className="text-xs text-gray-400">
                          {sortConfig.key === 'stage'
                            ? sortConfig.direction === 'asc'
                              ? '↑'
                              : '↓'
                            : '⋮'}
                        </span>
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleSort('ageInDays')}
                    >
                      <div className="flex items-center gap-2">
                        Age (days)
                        <span className="text-xs text-gray-400">
                          {sortConfig.key === 'ageInDays'
                            ? sortConfig.direction === 'asc'
                              ? '↑'
                              : '↓'
                            : '⋮'}
                        </span>
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => handleSort('severity')}
                    >
                      <div className="flex items-center gap-2">
                        Severity
                        <span className="text-xs text-gray-400">
                          {sortConfig.key === 'severity'
                            ? sortConfig.direction === 'asc'
                              ? '↑'
                              : '↓'
                            : '⋮'}
                        </span>
                      </div>
                    </TableHead>
                    <TableHead>Issues</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedClaims.map((claim, idx) => (
                    <TableRow
                      key={claim.claimNumber}
                      className={`border-b border-gray-100 ${
                        idx % 2 === 0 ? 'bg-white' : 'bg-surface-off-white'
                      }`}
                    >
                      <TableCell className="font-semibold text-brand-purple hover:underline cursor-pointer">
                        {claim.claimNumber}
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(claim.status)}>
                          {claim.status.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-gray-700">
                        {claim.adjuster}
                      </TableCell>
                      <TableCell className="text-sm text-gray-700">
                        {claim.stage}
                      </TableCell>
                      <TableCell className="text-sm text-gray-700">
                        {claim.ageInDays}
                      </TableCell>
                      <TableCell>
                        <Badge className={getSeverityColor(claim.severity)}>
                          {claim.severity}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-gray-600">
                        {claim.issues.join(', ')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Empty State */}
          {!loading && !error && claims.length === 0 && (
            <div className="flex flex-col items-center justify-center h-64 text-gray-500">
              <p className="text-lg font-medium">No claims found</p>
              <p className="text-sm mt-1">Try adjusting your filters or time range</p>
            </div>
          )}
        </div>

        {/* Pagination Footer */}
        {!loading && !error && claims.length > ITEMS_PER_PAGE && (
          <div className="border-t border-gray-200 px-6 py-4 bg-gray-50">
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    onClick={() =>
                      setCurrentPage((p) => Math.max(1, p - 1))
                    }
                    className={currentPage === 1 ? 'pointer-events-none opacity-50' : ''}
                  />
                </PaginationItem>

                {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                  (page) => (
                    <PaginationItem key={page}>
                      <PaginationLink
                        onClick={() => setCurrentPage(page)}
                        isActive={page === currentPage}
                      >
                        {page}
                      </PaginationLink>
                    </PaginationItem>
                  )
                )}

                <PaginationItem>
                  <PaginationNext
                    onClick={() =>
                      setCurrentPage((p) => Math.min(totalPages, p + 1))
                    }
                    className={
                      currentPage === totalPages
                        ? 'pointer-events-none opacity-50'
                        : ''
                    }
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
            <p className="text-xs text-gray-500 text-center mt-2">
              Page {currentPage} of {totalPages}
            </p>
          </div>
        )}

        {/* Footer Actions */}
        <div className="border-t border-gray-200 px-6 py-4 bg-gray-50">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-brand-purple text-white rounded-lg font-medium hover:bg-opacity-90 transition-all"
          >
            ← Back to Chart
          </button>
        </div>
      </div>
    </>
  );
};
