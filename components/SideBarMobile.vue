<script setup lang="ts">
const open = ref(false)

const router = useRouter()

let removeGuard: () => void
onMounted(() => {
    removeGuard = router.afterEach(() => open.value = false)
})

onUnmounted(() => {
    removeGuard?.()
})
</script>

<template>
    <Sheet :open="open" :modal="false" @update:open="(isOpen) => open = isOpen">
        <SheetTrigger :as-child="true">
            <Button variant="secondary" class="lg:hidden">
                <Icon name="lucide:menu" size="16px" class="size-4 text-card-foreground" />
            </Button>
        </SheetTrigger>
        <SheetContent side="left" class="p-0 bg-sidebar text-sidebar-foreground">
            <SideBar />
        </SheetContent>
    </Sheet>
</template>
