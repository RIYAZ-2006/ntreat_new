// All data fetching and SSE is handled by ScanProvider in ScandetailsLayout.
// Pages just call useScanData() to read from the shared context.
export { useScanContext as useScanData } from './ScanContext';
export type { ScanData, ScanSummary, ScoreDoc, ServiceScoreBreakdown } from './ScanContext';