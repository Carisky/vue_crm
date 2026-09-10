<script setup lang="ts">
import { useQueryClient } from "@tanstack/vue-query";

import useAuthStore from "~/stores/auth";

const queryClient = useQueryClient();
const authStore = useAuthStore();
const { t } = useAppI18n();
const isSigningOut = ref(false);

const signOut = () => {
  if (isSigningOut.value) return;
  isSigningOut.value = true;

  const revokeSession = fetch("/api/auth/sign-out", {
    method: "POST",
    keepalive: true,
  });

  // Update the UI immediately. The keepalive request can finish while the
  // browser is already rendering the sign-in page.
  authStore.clear();
  queryClient.clear();
  void navigateTo("/sign-in", { replace: true });
  void revokeSession.catch(() => undefined);
};
</script>

<template>
  <div
    v-if="isSigningOut"
    class="flex size-10 items-center justify-center rounded-full border border-border bg-muted"
  >
    <Icon
      name="svg-spinners:8-dots-rotate"
      size="16px"
      class="size-4 text-muted-foreground"
    />
  </div>
  <DropdownMenu v-else :modal="false">
    <DropdownMenuTrigger class="relative outline-none">
      <Avatar
        class="size-10 border border-border bg-muted transition hover:opacity-75"
      >
        <AvatarFallback
          class="flex items-center justify-center bg-muted font-medium text-foreground"
        >
          {{
            (authStore.user?.name ||
              authStore.user?.email ||
              "U")[0].toUpperCase()
          }}
        </AvatarFallback>
      </Avatar>
    </DropdownMenuTrigger>
    <DropdownMenuContent
      align="end"
      side="bottom"
      :side-offset="10"
      class="w-60"
    >
      <div class="flex flex-col items-center justify-center gap-2 px-2.5 py-4">
        <Avatar class="size-[52px] border border-border bg-muted">
          <AvatarFallback
            class="flex items-center justify-center bg-muted text-xl font-medium text-foreground"
          >
            {{
              (authStore.user?.name ||
                authStore.user?.email ||
                "U")[0].toUpperCase()
            }}
          </AvatarFallback>
        </Avatar>
        <div class="flex flex-col items-center justify-center">
          <p class="text-sm font-medium text-foreground">
            {{ authStore.user?.name ?? t("common.user") }}
          </p>
          <p class="text-xs text-muted-foreground">
            {{ authStore.user?.email }}
          </p>
        </div>
      </div>
      <DottedSeparator class="mb-1" />
      <DropdownMenuItem
        class="flex h-10 cursor-pointer items-center justify-between font-medium text-destructive"
        @select="signOut"
      >
        <Icon name="lucide:log-out" size="16px" class="mr-1 size-4" />
        {{ t("nav.signOut") }}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
