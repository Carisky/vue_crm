<script setup lang="ts">
import { toast } from "vue-sonner";

import type { OnboardingOutcome } from "~/lib/product-tour";

type TourStep = {
  title: string;
  description: string;
  icon: string;
  selector?: string;
  mobileSelector?: string;
  demo?: boolean;
};

type HighlightRect = {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

const steps: TourStep[] = [
  {
    title: "Welcome to your workspace",
    description:
      "Take a two-minute tour of the essentials. You can safely try a sample workflow before working with real tasks.",
    icon: "lucide:sparkles",
  },
  {
    title: "Switch between workspaces",
    description:
      "Your teams and clients stay separated in workspaces. Use this switcher to move between them or create another one.",
    icon: "lucide:building-2",
    selector: '[data-tour="workspace-switcher"]',
    mobileSelector: '[data-tour="mobile-navigation"]',
  },
  {
    title: "Everything is one click away",
    description:
      "Home gives you the overview. My Tasks, Messages, Members and Settings keep the daily work organized.",
    icon: "lucide:panel-left",
    selector: '[data-tour="main-navigation"]',
    mobileSelector: '[data-tour="mobile-navigation"]',
  },
  {
    title: "Projects organize the work",
    description:
      "Projects group tasks and documentation. Open a project from here whenever you need its board, docs or settings.",
    icon: "lucide:folder-kanban",
    selector: '[data-tour="project-list"]',
    mobileSelector: '[data-tour="mobile-navigation"]',
  },
  {
    title: "Stay in the loop",
    description:
      "Messages collect conversations and @mentions. The bell shows activity that needs your attention.",
    icon: "lucide:messages-square",
    selector: '[data-tour="collaboration"]',
  },
  {
    title: "Try a task workflow",
    description:
      "This sample exists only inside the guide. Nothing below is written to your workspace.",
    icon: "lucide:mouse-pointer-click",
    demo: true,
  },
  {
    title: "You are ready",
    description:
      "Finish the guide to remember your progress. You can replay it at any time from this help button.",
    icon: "lucide:circle-check-big",
    selector: '[data-tour="restart"]',
  },
];

const route = useRoute();
const {
  currentStep,
  demoPhase,
  initialize,
  isOpen,
  isSaving,
  next,
  previous,
  saveOutcome,
} = useProductTour();

const viewport = reactive({ width: 1280, height: 800 });
const targetRect = ref<HighlightRect | null>(null);
const card = ref<HTMLElement | null>(null);
const step = computed(() => steps[currentStep.value] ?? steps[0]!);
const isLastStep = computed(() => currentStep.value === steps.length - 1);
const progress = computed(() => ((currentStep.value + 1) / steps.length) * 100);

function getSelector() {
  if (viewport.width < 1024 && step.value.mobileSelector) {
    return step.value.mobileSelector;
  }
  return step.value.selector;
}

function updateTarget() {
  viewport.width = window.innerWidth;
  viewport.height = window.innerHeight;

  const selector = getSelector();
  const element = selector
    ? document.querySelector<HTMLElement>(selector)
    : null;
  const rect = element?.getBoundingClientRect();

  if (!rect || rect.width < 1 || rect.height < 1) {
    targetRect.value = null;
    return;
  }

  const padding = 8;
  targetRect.value = {
    top: Math.max(8, rect.top - padding),
    left: Math.max(8, rect.left - padding),
    right: Math.min(viewport.width - 8, rect.right + padding),
    bottom: Math.min(viewport.height - 8, rect.bottom + padding),
    width: Math.min(viewport.width - 16, rect.width + padding * 2),
    height: Math.min(viewport.height - 16, rect.height + padding * 2),
  };
}

const cardStyle = computed(() => {
  const gap = 16;
  const margin = 12;
  const width = Math.min(400, viewport.width - margin * 2);
  const estimatedHeight = step.value.demo ? 500 : 360;
  const rect = targetRect.value;

  if (!rect) {
    return {
      width: `${width}px`,
      left: `${Math.max(margin, (viewport.width - width) / 2)}px`,
      top: `${Math.max(margin, (viewport.height - estimatedHeight) / 2)}px`,
    };
  }

  let left: number;
  let top: number;

  if (viewport.width - rect.right >= width + gap) {
    left = rect.right + gap;
    top = rect.top;
  } else if (rect.left >= width + gap) {
    left = rect.left - width - gap;
    top = rect.top;
  } else {
    left = Math.min(
      Math.max(margin, rect.left),
      viewport.width - width - margin,
    );
    top = rect.bottom + gap;
    if (top + estimatedHeight > viewport.height - margin) {
      top = Math.max(margin, rect.top - estimatedHeight - gap);
    }
  }

  return {
    width: `${width}px`,
    left: `${Math.max(margin, left)}px`,
    top: `${Math.min(Math.max(margin, top), Math.max(margin, viewport.height - estimatedHeight - margin))}px`,
  };
});

const backdropPieces = computed(() => {
  const rect = targetRect.value;
  if (!rect) return [];

  return [
    { left: "0", top: "0", right: "0", height: `${rect.top}px` },
    {
      left: "0",
      top: `${rect.top}px`,
      width: `${rect.left}px`,
      height: `${rect.height}px`,
    },
    {
      left: `${rect.right}px`,
      top: `${rect.top}px`,
      right: "0",
      height: `${rect.height}px`,
    },
    { left: "0", top: `${rect.bottom}px`, right: "0", bottom: "0" },
  ];
});

async function closeWith(status: OnboardingOutcome) {
  try {
    await saveOutcome(status);
  } catch {
    toast.error("Could not save your guide progress. Please try again.");
  }
}

async function advance() {
  if (isLastStep.value) {
    await closeWith("COMPLETED");
    return;
  }
  next();
}

function handleKeydown(event: KeyboardEvent) {
  if (!isOpen.value || isSaving.value) return;
  const target = event.target as HTMLElement | null;
  const isInteractiveTarget = target?.closest(
    "button, a, input, select, textarea",
  );
  if (event.key === "Enter" && isInteractiveTarget) return;
  if (event.key === "ArrowRight" || event.key === "Enter") void advance();
  if (event.key === "ArrowLeft") previous();
  if (event.key === "Escape") void closeWith("SKIPPED");
}

function refreshTargetSoon() {
  nextTick(() => {
    updateTarget();
    window.setTimeout(updateTarget, 120);
  });
}

let autoStartTimer: number | undefined;
let observer: MutationObserver | undefined;

function scheduleInitialize() {
  if (route.meta.layout !== "dashboard" || !route.params["workspaceId"]) return;
  if (autoStartTimer) window.clearTimeout(autoStartTimer);
  autoStartTimer = window.setTimeout(() => {
    initialize().catch(() => {
      // The replay button remains available if preference loading fails.
    });
  }, 650);
}

onMounted(() => {
  viewport.width = window.innerWidth;
  viewport.height = window.innerHeight;
  window.addEventListener("resize", updateTarget);
  window.addEventListener("scroll", updateTarget, true);
  window.addEventListener("keydown", handleKeydown);
  observer = new MutationObserver(() => {
    if (isOpen.value) updateTarget();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  scheduleInitialize();
});

onUnmounted(() => {
  window.removeEventListener("resize", updateTarget);
  window.removeEventListener("scroll", updateTarget, true);
  window.removeEventListener("keydown", handleKeydown);
  if (autoStartTimer) window.clearTimeout(autoStartTimer);
  observer?.disconnect();
});

watch([isOpen, currentStep, () => route.fullPath], ([open]) => {
  if (open) {
    refreshTargetSoon();
    nextTick(() => card.value?.focus());
  }
});

watch(
  () => route.params["workspaceId"],
  () => {
    if (import.meta.client) scheduleInitialize();
  },
);
</script>

<template>
  <Teleport to="body">
    <Transition name="tour-fade">
      <div
        v-if="isOpen"
        class="pointer-events-none fixed inset-0 z-[1000]"
        aria-live="polite"
      >
        <div
          v-if="!targetRect"
          class="pointer-events-auto absolute inset-0 bg-black/65 backdrop-blur-[1px]"
        />
        <template v-else>
          <div
            v-for="(piece, index) in backdropPieces"
            :key="index"
            class="pointer-events-auto absolute bg-black/65 backdrop-blur-[1px]"
            :style="piece"
          />
          <div
            class="pointer-events-none fixed rounded-xl border-2 border-blue-400 shadow-[0_0_0_4px_rgba(96,165,250,0.25),0_0_30px_rgba(59,130,246,0.5)]"
            :style="{
              top: `${targetRect.top}px`,
              left: `${targetRect.left}px`,
              width: `${targetRect.width}px`,
              height: `${targetRect.height}px`,
            }"
          />
        </template>

        <section
          ref="card"
          role="dialog"
          aria-modal="true"
          :aria-label="step.title"
          tabindex="-1"
          class="pointer-events-auto fixed max-h-[calc(100vh-24px)] overflow-y-auto rounded-2xl border border-white/10 bg-card p-5 text-card-foreground shadow-2xl outline-none sm:p-6"
          :style="cardStyle"
        >
          <div class="mb-5 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              class="h-full rounded-full bg-blue-600 transition-[width] duration-300"
              :style="{ width: `${progress}%` }"
            />
          </div>

          <div class="flex items-start gap-3">
            <div
              class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
            >
              <Icon :name="step.icon" size="20px" class="size-5" />
            </div>
            <div class="min-w-0">
              <p
                class="text-xs font-semibold tracking-wide text-blue-600 uppercase"
              >
                Step {{ currentStep + 1 }} of {{ steps.length }}
              </p>
              <h2 class="mt-1 text-xl font-semibold">{{ step.title }}</h2>
            </div>
          </div>

          <p class="mt-3 text-sm leading-6 text-muted-foreground">
            {{ step.description }}
          </p>

          <div
            v-if="step.demo"
            class="mt-4 rounded-xl border border-border bg-muted/45 p-3"
          >
            <div class="mb-3 flex items-center justify-between gap-3">
              <div>
                <p class="text-sm font-semibold">Prepare weekly report</p>
                <p class="text-xs text-muted-foreground">
                  Demo task · not saved
                </p>
              </div>
              <span
                class="rounded-full px-2 py-1 text-[11px] font-semibold"
                :class="
                  demoPhase === 3
                    ? 'bg-green-100 text-green-700'
                    : 'bg-blue-100 text-blue-700'
                "
              >
                {{
                  demoPhase === 3 ? "Done" : demoPhase === 0 ? "Draft" : "To do"
                }}
              </span>
            </div>

            <button
              v-if="demoPhase === 0"
              type="button"
              class="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
              @click="demoPhase = 1"
            >
              <Icon name="lucide:plus" class="size-4" />
              Create sample task
            </button>
            <button
              v-else-if="demoPhase === 1"
              type="button"
              class="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold transition hover:bg-accent"
              @click="demoPhase = 2"
            >
              <Icon name="lucide:user-plus" class="size-4" />
              Assign to me
            </button>
            <button
              v-else-if="demoPhase === 2"
              type="button"
              class="flex w-full items-center justify-center gap-2 rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm font-semibold text-green-700 transition hover:bg-green-100"
              @click="demoPhase = 3"
            >
              <Icon name="lucide:check" class="size-4" />
              Mark as complete
            </button>
            <div
              v-else
              class="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm font-medium text-green-700"
            >
              <Icon name="lucide:party-popper" class="size-4" />
              Workflow complete — nice work!
            </div>
          </div>

          <div class="mt-6 flex items-center justify-between gap-3">
            <button
              type="button"
              class="text-sm font-medium text-muted-foreground transition hover:text-foreground disabled:opacity-50"
              :disabled="isSaving"
              @click="closeWith('SKIPPED')"
            >
              Skip guide
            </button>
            <div class="flex items-center gap-2">
              <Button
                v-if="currentStep > 0"
                type="button"
                variant="secondary"
                size="sm"
                :disabled="isSaving"
                @click="previous"
              >
                Back
              </Button>
              <Button
                type="button"
                size="sm"
                :disabled="isSaving"
                @click="advance"
              >
                <Icon
                  v-if="isSaving"
                  name="svg-spinners:3-dots-fade"
                  class="size-4"
                />
                {{ isLastStep ? "Finish" : "Next" }}
                <Icon
                  v-if="!isSaving && !isLastStep"
                  name="lucide:arrow-right"
                  class="size-4"
                />
              </Button>
            </div>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.tour-fade-enter-active,
.tour-fade-leave-active {
  transition: opacity 180ms ease;
}

.tour-fade-enter-from,
.tour-fade-leave-to {
  opacity: 0;
}
</style>
