import {
  PRODUCT_TOUR_VERSION,
  shouldAutoStartTour,
  type OnboardingOutcome,
  type OnboardingState,
} from "~/lib/product-tour";
import useAuthStore from "~/stores/auth";

export const PRODUCT_TOUR_STEP_COUNT = 7;

export default function useProductTour() {
  const authStore = useAuthStore();
  const isOpen = useState("product-tour:open", () => false);
  const currentStep = useState("product-tour:step", () => 0);
  const demoPhase = useState("product-tour:demo-phase", () => 0);
  const isLoading = useState("product-tour:loading", () => false);
  const isSaving = useState("product-tour:saving", () => false);
  const loadedForUser = useState<string | null>(
    "product-tour:loaded-for-user",
    () => null,
  );
  const hasLoaded = computed(() => loadedForUser.value === authStore.user?.id);

  function start() {
    currentStep.value = 0;
    demoPhase.value = 0;
    isOpen.value = true;
  }

  function next() {
    if (currentStep.value < PRODUCT_TOUR_STEP_COUNT - 1) {
      currentStep.value += 1;
    }
  }

  function previous() {
    currentStep.value = Math.max(0, currentStep.value - 1);
  }

  async function saveOutcome(status: OnboardingOutcome) {
    if (isSaving.value) return;
    isSaving.value = true;

    try {
      await $fetch<OnboardingState>("/api/onboarding", {
        method: "PATCH",
        body: { status, version: PRODUCT_TOUR_VERSION },
      });
      isOpen.value = false;
    } finally {
      isSaving.value = false;
    }
  }

  async function initialize() {
    const userId = authStore.user?.id;
    if (!userId || loadedForUser.value === userId || isLoading.value) return;
    isLoading.value = true;

    try {
      const state = await $fetch<OnboardingState>("/api/onboarding");
      loadedForUser.value = userId;
      if (shouldAutoStartTour(state) && !isOpen.value) start();
    } finally {
      isLoading.value = false;
    }
  }

  return {
    currentStep,
    demoPhase,
    hasLoaded,
    isLoading,
    isOpen,
    isSaving,
    initialize,
    next,
    previous,
    saveOutcome,
    start,
  };
}
