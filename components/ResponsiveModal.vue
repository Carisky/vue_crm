<script setup lang="ts">
import { VisuallyHidden } from 'reka-ui';

import { Dialog, DialogContent, Drawer, DrawerContent } from '#components';

const { open, onOpenUpdate } = defineProps<{
    open: boolean;
    onOpenUpdate: (isOpen: boolean) => void
}>()

const isDesktop = ref<boolean | undefined>(undefined)
let mediaQuery: MediaQueryList | null = null
const updateMode = () => {
    isDesktop.value = mediaQuery?.matches ?? false
}

onMounted(() => {
    mediaQuery = window.matchMedia("(width >= 1024px)");
    updateMode()
    mediaQuery.addEventListener('change', updateMode)
})

onUnmounted(() => mediaQuery?.removeEventListener('change', updateMode))
</script>

<template>
    <Dialog v-if="isDesktop === true" :open="open" @update:open="onOpenUpdate">
        <DialogContent class="hide-scrollbar w-full max-h-[85vh] p-0 border-none overflow-y-auto sm:max-w-lg">
            <VisuallyHidden>
                <DialogTitle></DialogTitle>
                <DialogDescription></DialogDescription>
            </VisuallyHidden>
            <slot></slot>
        </DialogContent>
    </Dialog>
    <Drawer v-else-if="isDesktop === false" :open="open" @update:open="onOpenUpdate">
        <DrawerContent>
            <div class="hide-scrollbar max-h-[85vh] overflow-y-auto">
                <slot></slot>
            </div>
        </DrawerContent>
    </Drawer>
</template>
