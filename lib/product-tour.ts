export const PRODUCT_TOUR_VERSION = 1;

export const onboardingOutcomes = ["COMPLETED", "SKIPPED"] as const;
export type OnboardingOutcome = (typeof onboardingOutcomes)[number];

export type OnboardingState = {
  status: "NOT_STARTED" | OnboardingOutcome;
  version: number;
  updatedAt: string | null;
};

export function shouldAutoStartTour(state: OnboardingState) {
  return (
    state.version < PRODUCT_TOUR_VERSION ||
    !onboardingOutcomes.includes(state.status as OnboardingOutcome)
  );
}
