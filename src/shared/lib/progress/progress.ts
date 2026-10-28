/**
 * THE single authoritative progress calculation. Admin, trainer and student
 * views must all use this function. See docs/PROGRESS_CALCULATION.md.
 */
export const PROGRESS_WEIGHTS = {
  lessons: 0.3,
  attendance: 0.25,
  assignments: 0.3,
  recordings: 0.15,
} as const;

export type ProgressComponent = keyof typeof PROGRESS_WEIGHTS;

/** A component input is `null` when no data exists for it (not zero). */
export interface ProgressInput {
  lessons: number | null;
  attendance: number | null;
  assignments: number | null;
  recordings: number | null;
}

export interface ProgressBreakdownItem {
  component: ProgressComponent;
  weight: number;
  value: number | null;
  contribution: number | null;
}

export interface ProgressResult {
  /** Null when there is not enough data to calculate progress. */
  overall: number | null;
  breakdown: ProgressBreakdownItem[];
  hasEnoughData: boolean;
}

/**
 * Weights of components with data are re-normalised, so a missing component is
 * never silently treated as zero.
 */
export function calculateProgress(input: ProgressInput): ProgressResult {
  const breakdown: ProgressBreakdownItem[] = (
    Object.keys(PROGRESS_WEIGHTS) as ProgressComponent[]
  ).map((component) => {
    const raw = input[component];
    const value = raw === null ? null : Math.min(1, Math.max(0, raw));
    return {
      component,
      weight: PROGRESS_WEIGHTS[component],
      value,
      contribution: value === null ? null : value * PROGRESS_WEIGHTS[component],
    };
  });

  const available = breakdown.filter((item) => item.value !== null);
  const availableWeight = available.reduce((sum, item) => sum + item.weight, 0);

  if (available.length === 0 || availableWeight === 0) {
    return { overall: null, breakdown, hasEnoughData: false };
  }

  const weighted = available.reduce((sum, item) => sum + (item.contribution ?? 0), 0);
  return { overall: weighted / availableWeight, breakdown, hasEnoughData: true };
}
