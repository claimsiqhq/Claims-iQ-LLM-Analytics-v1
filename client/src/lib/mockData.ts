
import { 
  BarChart, 
  LineChart, 
  Table, 
  PieChart 
} from "lucide-react"; // Fallback for data types if needed, but we will use iconoir for UI

export interface Thread {
  id: string;
  label: string;
  timestamp: string;
  type: 'bar' | 'line' | 'table' | 'pie';
  pinned?: boolean;
  group: 'Pinned' | 'Today' | 'Earlier';
}

export const threads: Thread[] = [
  { id: '1', label: 'SLA Breach Rate by Adjuster', timestamp: '2h ago', type: 'bar', pinned: true, group: 'Pinned' },
  { id: '2', label: 'Claims Backlog vs Capacity', timestamp: '5h ago', type: 'line', pinned: true, group: 'Pinned' },
  { id: '3', label: 'Denied Claims Analysis Q3', timestamp: '14m ago', type: 'pie', group: 'Today' },
  { id: '4', label: 'Top 10 High Value Claims', timestamp: '1h ago', type: 'table', group: 'Today' },
  { id: '5', label: 'Average Settlement Time', timestamp: 'Yesterday', type: 'line', group: 'Earlier' },
  { id: '6', label: 'Litigation Ratio by Region', timestamp: '2d ago', type: 'bar', group: 'Earlier' },
];

export const chartData = [
  { name: 'Jan', value: 400, baseline: 300 },
  { name: 'Feb', value: 300, baseline: 320 },
  { name: 'Mar', value: 550, baseline: 350 },
  { name: 'Apr', value: 450, baseline: 380 },
  { name: 'May', value: 600, baseline: 400 },
  { name: 'Jun', value: 700, baseline: 420 },
];

export const promptChips = [
  { label: 'Throughput', color: 'brand-purple' },
  { label: 'SLA Breach', color: 'status-alert' },
  { label: 'Cost Analysis', color: 'brand-gold' },
  { label: 'Risk Factors', color: 'brand-deep-purple' },
  { label: 'Quality Score', color: 'brand-purple-secondary' },
];

export const messages = [
  {
    id: 'm1',
    role: 'user',
    content: "Show me the SLA breach rate for the last 30 days grouped by adjuster."
  },
  {
    id: 'm2',
    role: 'system',
    content: "Here is the SLA breach rate analysis. Overall breach rate is up 2.4% compared to last month.",
    chartType: 'bar',
    insight: "Adjuster Sarah J. has the highest breach rate at 12%, primarily driven by complex liability claims."
  }
];
