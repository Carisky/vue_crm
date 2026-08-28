<script setup lang="ts">
import { onUnmounted, ref, watch } from "vue";
import { toast } from "vue-sonner";

type TelegramConnectionStatus = {
  configured: boolean;
  botUsername: string | null;
  connected: boolean;
  connection: {
    username: string | null;
    firstName: string | null;
    lastName: string | null;
    linkedAt: string;
  } | null;
};

type TelegramLink = {
  deepLink: string;
  qrDataUrl: string;
  expiresAt: string;
};

const { t } = useAppI18n();
const open = ref(false);
const status = ref<TelegramConnectionStatus | null>(null);
const link = ref<TelegramLink | null>(null);
const loading = ref(false);
const disconnecting = ref(false);
let pollTimer: ReturnType<typeof setInterval> | null = null;

const stopPolling = () => {
  if (!pollTimer) return;
  clearInterval(pollTimer);
  pollTimer = null;
};

const refreshStatus = async () => {
  status.value = await $fetch<TelegramConnectionStatus>(
    "/api/telegram/connection",
  );
  if (status.value.connected) {
    link.value = null;
    stopPolling();
  }
};

const generateLink = async () => {
  if (!status.value?.configured || status.value.connected) return;
  loading.value = true;
  try {
    link.value = await $fetch<TelegramLink>("/api/telegram/link", {
      method: "POST",
    });
  } catch {
    toast.error(t("telegram.linkFailed"));
  } finally {
    loading.value = false;
  }
};

const startPolling = () => {
  stopPolling();
  pollTimer = setInterval(() => {
    refreshStatus().catch(() => {});
  }, 2000);
};

const openDialog = async () => {
  loading.value = true;
  try {
    await refreshStatus();
    if (status.value?.configured && !status.value.connected) {
      await generateLink();
      startPolling();
    }
  } catch {
    toast.error(t("telegram.statusFailed"));
  } finally {
    loading.value = false;
  }
};

const disconnect = async () => {
  disconnecting.value = true;
  try {
    await $fetch("/api/telegram/connection", { method: "DELETE" });
    await refreshStatus();
    await generateLink();
    startPolling();
    toast.success(t("telegram.disconnected"));
  } catch {
    toast.error(t("telegram.disconnectFailed"));
  } finally {
    disconnecting.value = false;
  }
};

const accountName = () => {
  const connection = status.value?.connection;
  if (!connection) return "";
  const fullName = [connection.firstName, connection.lastName]
    .filter(Boolean)
    .join(" ");
  return connection.username ? `@${connection.username}` : fullName;
};

watch(open, (isOpen) => {
  if (isOpen) void openDialog();
  else stopPolling();
});
onUnmounted(stopPolling);
</script>

<template>
  <Dialog v-model:open="open">
    <DialogTrigger as-child>
      <Button
        variant="outline"
        size="icon"
        class="relative text-[#229ED9]"
        :title="t('telegram.link')"
      >
        <Icon name="lucide:send" size="15px" class="size-4" />
        <span class="sr-only">{{ t("telegram.link") }}</span>
        <span
          v-if="status?.connected"
          class="absolute -top-1 -right-1 size-2 rounded-full bg-emerald-500 ring-2 ring-background"
        />
      </Button>
    </DialogTrigger>

    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ t("telegram.linkTitle") }}</DialogTitle>
        <DialogDescription>
          {{ t("telegram.linkDescription") }}
        </DialogDescription>
      </DialogHeader>

      <div v-if="loading && !status" class="py-10">
        <Loader class="h-24" />
      </div>

      <div
        v-else-if="status && !status.configured"
        class="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm"
      >
        {{ t("telegram.notConfigured") }}
      </div>

      <div
        v-else-if="status?.connected"
        class="space-y-4 rounded-lg border p-4"
      >
        <div class="flex items-center gap-3">
          <span
            class="flex size-10 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600"
          >
            <Icon name="heroicons:check" size="22px" />
          </span>
          <div class="min-w-0">
            <p class="font-semibold">{{ t("telegram.connected") }}</p>
            <p class="truncate text-sm text-muted-foreground">
              {{ accountName() }}
            </p>
          </div>
        </div>
        <p class="text-sm text-muted-foreground">
          {{ t("telegram.connectedDescription") }}
        </p>
        <Button
          variant="outline"
          size="sm"
          :disabled="disconnecting"
          @click="disconnect"
        >
          <Icon
            v-if="disconnecting"
            name="svg-spinners:8-dots-rotate"
            size="16px"
          />
          <template v-else>{{ t("telegram.disconnect") }}</template>
        </Button>
      </div>

      <div v-else-if="link" class="space-y-4 text-center">
        <div class="mx-auto w-fit rounded-xl border bg-white p-3 shadow-sm">
          <img
            :src="link.qrDataUrl"
            :alt="t('telegram.qrAlt')"
            class="size-56"
          />
        </div>
        <div class="space-y-1 text-sm text-muted-foreground">
          <p>{{ t("telegram.scanInstruction") }}</p>
          <p>{{ t("telegram.startInstruction") }}</p>
        </div>
        <Button as-child>
          <a :href="link.deepLink" target="_blank" rel="noopener noreferrer">
            <Icon name="lucide:send" size="16px" />
            {{ t("telegram.open") }}
          </a>
        </Button>
        <p class="text-xs text-muted-foreground">
          {{ t("telegram.linkExpires") }}
        </p>
      </div>

      <div v-else class="flex justify-center py-8">
        <Button :disabled="loading" @click="generateLink">
          {{ t("telegram.generate") }}
        </Button>
      </div>
    </DialogContent>
  </Dialog>
</template>
