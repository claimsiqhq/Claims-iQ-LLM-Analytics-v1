import React, { useEffect, useState } from "react";
import { NavArrowLeft, X } from "iconoir-react";
import { getDrilldown } from "@/lib/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

interface ClaimRecord {
  claimNumber: string;
  status: string;
  adjuster: string;
  stage: string;
  ageInDays: number;
  severity: string;
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

const getSeverityColor = (severity: string) => {
  const colors: Record<string, string> = {
    critical: "bg-red-100 text-red-800 border-red-300",
    high: "bg-orange-100 text-orange-800 border-orange-300",
    medium: "bg-yellow-100 text-yellow-800 border-yellow-300",
    low: "bg-green-100 text-green-800 border-green-300",
  };
  return colors[severity] || colors.low;
};

const getStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    open: "bg-blue-100 text-blue-800",
    closed: "bg-green-100 text-green-800",
    pending: "bg-yellow-100 text-yellow-800",
    in_review: "bg-purple-100 text-purple-800",
  };
  return colors[status] || colors.open;
};

function mapClaim(c: any): ClaimRecord {
  const fnol = c.fnol_date ? new Date(c.fnol_date) : new Date();
  const ageInDays = Math.floor((Date.now() - fnol.getTime()) / 86400000);
  const adjuster = c.adjusters?.full_name || c.adjuster || "—";
  return {
    claimNumber: c.claim_number || c.claimNumber || "—",
    status: c.status || "open",
    adjuster,
    stage: c.current_stage || c.stage || "—",
    ageInDays,
    severity: c.severity || "low",
    issues: c.issue_types || c.issues || [],
  };
}

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
  const [totalCount, setTotalCount] = useState(0);
  const [loadMoreLoading, setLoadMoreLoading] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: keyof ClaimRecord; direction: "asc" | "desc" }>({
    key: "ageInDays",
    direction: "desc",
  });

  const filtersToSend = {
    ...filters,
    metric,
    start_date: timeRange?.start,
    end_date: timeRange?.end,
  };

  const fetchDrilldownData = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getDrilldown(
        filtersToSend,
        currentPage,
        ITEMS_PER_PAGE,
        clientId
      );
      const data = result.data || [];
      const total = result.total ?? data.length;
      const newClaims = (Array.isArray(data) ? data : []).map(mapClaim);
      setClaims((prev) => (currentPage === 1 ? newClaims : [...prev, ...newClaims]));
      setTotalCount(total);
      if (result.summary) setSummaryStats(result.summary);
      else if (data.length > 0) {
        const cycleTimes = data
          .filter((c: any) => c.closed_at && c.fnol_date)
          .map((c: any) => (new Date(c.closed_at).getTime() - new Date(c.fnol_date).getTime()) / 86400000);
        const breached = data.filter((c: any) => c.sla_breached).length;
        setSummaryStats({
          totalCount: total,
          avgCycleTime: cycleTimes.length ? cycleTimes.reduce((a: number, b: number) => a + b, 0) / cycleTimes.length : 0,
          breachPercentage: data.length ? (breached / data.length) * 100 : 0,
        });
      } else setSummaryStats(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load drill-down data");
      console.error("Drill-down error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) fetchDrilldownData();
  }, [isOpen, metric, JSON.stringify(filters), clientId, currentPage]);

  const sortedClaims = [...claims].sort((a, b) => {
    const aVal = a[sortConfig.key];
    const bVal = b[sortConfig.key];
    if (typeof aVal === "number" && typeof bVal === "number") {
      return sortConfig.direction === "asc" ? aVal - bVal : bVal - aVal;
    }
    const cmp = String(aVal).toLowerCase().localeCompare(String(bVal).toLowerCase());
    return sortConfig.direction === "asc" ? cmp : -cmp;
  });

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  const handleSort = (key: keyof ClaimRecord) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
    setCurrentPage(1);
  };

  const sortIndicator = (key: keyof ClaimRecord) =>
    sortConfig.key === key ? (sortConfig.direction === "asc" ? "↑" : "↓") : "⋮";

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-30 z-40 transition-opacity duration-300"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <div
        className={`fixed right-0 top-0 h-full w-full sm:w-2/5 max-w-xl bg-white shadow-lg z-50 flex flex-col transform transition-transform duration-300 ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="hover:bg-gray-100 p-2 rounded-lg" aria-label="Close">
              <NavArrowLeft width={20} height={20} className="text-gray-700" />
            </button>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Drill-down: {metric}</h2>
              <p className="text-sm text-gray-500 mt-1">
                {Object.entries(filters)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(" • ") || "No filters"}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="hover:bg-gray-100 p-2 rounded-lg">
            <X width={20} height={20} className="text-gray-700" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          {summaryStats && (
            <div className="grid grid-cols-3 gap-4 mb-6 p-4 bg-surface-off-white rounded-lg">
              <div>
                <p className="text-xs font-medium text-text-secondary uppercase">Total Claims</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{summaryStats.totalCount}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-text-secondary uppercase">Avg Cycle Time</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{summaryStats.avgCycleTime.toFixed(1)} days</p>
              </div>
              <div>
                <p className="text-xs font-medium text-text-secondary uppercase">SLA Breach %</p>
                <p className="text-2xl font-bold text-status-alert mt-1">{summaryStats.breachPercentage.toFixed(1)}%</p>
              </div>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin w-8 h-8 border-4 border-brand-purple border-t-brand-gold rounded-full" />
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-800 font-medium">Error</p>
              <p className="text-red-700 text-sm mt-1">{error}</p>
              <Button onClick={fetchDrilldownData} variant="outline" size="sm" className="mt-3">
                Try Again
              </Button>
            </div>
          )}

          {!loading && !error && claims.length > 0 && (
            <div className="border border-gray-200 rounded-lg overflow-x-auto overflow-y-visible">
              <Table>
                <TableHeader className="bg-gray-50">
                  <TableRow className="border-b border-gray-200">
                    {(["claimNumber", "status", "adjuster", "stage", "ageInDays", "severity"] as const).map((key) => (
                      <TableHead
                        key={key}
                        className="cursor-pointer hover:bg-gray-100"
                        onClick={() => handleSort(key)}
                      >
                        {key === "claimNumber" ? "Claim #" : key === "ageInDays" ? "Age (days)" : key}
                        <span className="text-xs text-gray-400 ml-1">{sortIndicator(key)}</span>
                      </TableHead>
                    ))}
                    <TableHead>Issues</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedClaims.map((claim, idx) => (
                    <TableRow
                      key={claim.claimNumber + idx}
                      className={`border-b border-gray-100 ${idx % 2 === 0 ? "bg-white" : "bg-surface-off-white"}`}
                    >
                      <TableCell className="font-semibold text-brand-purple">{claim.claimNumber}</TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(claim.status)}>{claim.status.replace("_", " ")}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-gray-700">{claim.adjuster}</TableCell>
                      <TableCell className="text-sm text-gray-700">{claim.stage}</TableCell>
                      <TableCell className="text-sm text-gray-700">{claim.ageInDays}</TableCell>
                      <TableCell>
                        <Badge className={getSeverityColor(claim.severity)}>{claim.severity}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-gray-600">
                        {Array.isArray(claim.issues) ? claim.issues.join(", ") : ""}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {!loading && !error && claims.length === 0 && (
            <div className="flex flex-col items-center justify-center h-64 text-gray-500">
              <p className="text-lg font-medium">No claims found</p>
              <p className="text-sm mt-1">Try adjusting filters or time range</p>
            </div>
          )}
        </div>

        {!loading && !error && totalPages > 1 && (
          <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 space-y-3">
            {currentPage < totalPages && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setCurrentPage((p) => p + 1)}
                disabled={loading}
              >
                {loading ? "Loading..." : `Load more (${claims.length} of ${totalCount})`}
              </Button>
            )}
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  />
                </PaginationItem>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <PaginationItem key={page}>
                    <PaginationLink
                      onClick={() => setCurrentPage(page)}
                      isActive={page === currentPage}
                      className="cursor-pointer"
                    >
                      {page}
                    </PaginationLink>
                  </PaginationItem>
                ))}
                <PaginationItem>
                  <PaginationNext
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        )}

        <div className="border-t border-gray-200 px-6 py-4 bg-gray-50">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-brand-purple text-white rounded-lg font-medium hover:bg-opacity-90"
          >
            ← Back to Chart
          </button>
        </div>
      </div>
    </>
  );
};
