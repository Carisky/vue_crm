<script setup lang="ts" generic="TData, TValue">
import type {
    ColumnDef,
    ColumnFiltersState,
    ColumnSizingState,
    SortingState
} from '@tanstack/vue-table'
import {
    FlexRender,
    type VisibilityState,
    getCoreRowModel,
    getPaginationRowModel,
    getFilteredRowModel,
    getSortedRowModel,
    useVueTable,
} from '@tanstack/vue-table'

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { valueUpdater } from '~/lib/utils';

const props = defineProps<{
    columns: ColumnDef<TData, TValue>[]
    data: TData[]
    onRowClick?: (row: TData) => void
    columnVisibilityKey?: string
    columnVisibilityWorkspaceId?: string
    columnSizingKey?: string
    columnSizingWorkspaceId?: string
}>()

const sorting = ref<SortingState>([])
const columnFilters = ref<ColumnFiltersState>([])
const columnVisibility = ref<VisibilityState>({})
const columnSizing = ref<ColumnSizingState>({})
const isLoadingColumnVisibility = ref(false)
const isLoadingColumnSizing = ref(false)
let didLoadColumnVisibilityFromServer = false
let didLoadColumnSizingFromServer = false
let saveColumnVisibilityTimer: ReturnType<typeof setTimeout> | null = null
let saveColumnSizingTimer: ReturnType<typeof setTimeout> | null = null

const shouldIgnoreRowClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement | null
    if (!target) return false
    return Boolean(target.closest('button, a, [role="button"], [data-row-click="ignore"]'))
}

const handleRowClick = (row: TData, event: MouseEvent) => {
    if (!props.onRowClick || shouldIgnoreRowClick(event)) return
    props.onRowClick(row)
}

const table = useVueTable({
    get data() { return props.data },
    get columns() { return props.columns },
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: updaterOrValue => valueUpdater(updaterOrValue, sorting),
    onColumnFiltersChange: updaterOrValue => valueUpdater(updaterOrValue, columnFilters),
    onColumnVisibilityChange: updaterOrValue => valueUpdater(updaterOrValue, columnVisibility),
    onColumnSizingChange: updaterOrValue => valueUpdater(updaterOrValue, columnSizing),
    getFilteredRowModel: getFilteredRowModel(),
    initialState: {
        pagination: {
            pageSize: 30,
        },
    },
    state: {
        get sorting() { return sorting.value },
        get columnFilters() { return columnFilters.value },
        get columnVisibility() { return columnVisibility.value },
        get columnSizing() { return columnSizing.value },
    },
})

const getColumnLabel = (column: ReturnType<typeof table.getAllLeafColumns>[number]) => {
    const meta = column.columnDef.meta as { label?: string } | undefined
    return meta?.label ?? column.id
}

const toggleableColumns = computed(() =>
    table.getAllLeafColumns().filter((column) => column.getCanHide())
)

const canUseColumnVisibilityPreference = computed(() =>
    Boolean(props.columnVisibilityKey && props.columnVisibilityWorkspaceId)
)

const canUseColumnSizingPreference = computed(() =>
    Boolean(props.columnSizingKey && props.columnSizingWorkspaceId)
)

const isColumnVisible = (columnId: string) => {
    const value = columnVisibility.value[columnId]
    return value === undefined ? true : value
}

const fetchColumnVisibilityFromServer = async () => {
    if (!canUseColumnVisibilityPreference.value) return

    isLoadingColumnVisibility.value = true
    try {
        const res = await $fetch<{ value: VisibilityState | null }>('/api/ui/preferences', {
            query: {
                workspace_id: props.columnVisibilityWorkspaceId,
                key: props.columnVisibilityKey,
            },
        })
        columnVisibility.value = res.value ?? {}
        didLoadColumnVisibilityFromServer = true
    } finally {
        isLoadingColumnVisibility.value = false
    }
}

const fetchColumnSizingFromServer = async () => {
    if (!canUseColumnSizingPreference.value) return

    isLoadingColumnSizing.value = true
    try {
        const res = await $fetch<{ value: ColumnSizingState | null }>('/api/ui/preferences', {
            query: {
                workspace_id: props.columnSizingWorkspaceId,
                key: props.columnSizingKey,
            },
        })
        columnSizing.value = res.value ?? {}
        didLoadColumnSizingFromServer = true
    } finally {
        isLoadingColumnSizing.value = false
    }
}

const scheduleSaveColumnVisibilityToServer = (nextValue: VisibilityState) => {
    if (!canUseColumnVisibilityPreference.value) return
    if (!didLoadColumnVisibilityFromServer) return

    if (saveColumnVisibilityTimer) clearTimeout(saveColumnVisibilityTimer)
    saveColumnVisibilityTimer = setTimeout(async () => {
        await $fetch('/api/ui/preferences', {
            method: 'PATCH',
            body: {
                workspace_id: props.columnVisibilityWorkspaceId,
                key: props.columnVisibilityKey,
                value: nextValue,
            },
        }).catch(() => undefined)
    }, 250)
}

const scheduleSaveColumnSizingToServer = (nextValue: ColumnSizingState) => {
    if (!canUseColumnSizingPreference.value) return
    if (!didLoadColumnSizingFromServer) return

    if (saveColumnSizingTimer) clearTimeout(saveColumnSizingTimer)
    saveColumnSizingTimer = setTimeout(async () => {
        await $fetch('/api/ui/preferences', {
            method: 'PATCH',
            body: {
                workspace_id: props.columnSizingWorkspaceId,
                key: props.columnSizingKey,
                value: nextValue,
            },
        }).catch(() => undefined)
    }, 600)
}

watch(
    () => [props.columnVisibilityWorkspaceId, props.columnVisibilityKey],
    () => fetchColumnVisibilityFromServer(),
    { immediate: true },
)

watch(
    () => [props.columnSizingWorkspaceId, props.columnSizingKey],
    () => fetchColumnSizingFromServer(),
    { immediate: true },
)

watch(
    columnVisibility,
    (next) => scheduleSaveColumnVisibilityToServer(next),
    { deep: true },
)

watch(
    columnSizing,
    (next) => scheduleSaveColumnSizingToServer(next),
    { deep: true },
)

onUnmounted(() => {
    if (saveColumnVisibilityTimer) clearTimeout(saveColumnVisibilityTimer)
    if (saveColumnSizingTimer) clearTimeout(saveColumnSizingTimer)
})

const handleToggleColumnVisibility = (columnId: string) => {
    const column = table.getColumn(columnId)
    if (!column?.getCanHide()) return
    column.toggleVisibility(!column.getIsVisible())
}
</script>

<template>
    <div>
        <div class="flex items-center justify-end pb-2">
            <DropdownMenu :modal="false">
                <DropdownMenuTrigger :as-child="true">
                    <Button variant="secondary" size="sm">
                        <Icon name="lucide:columns-2" size="16px" class="size-4 mr-1" />
                        Columns
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" class="w-56">
                    <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuCheckboxItem
                        v-for="column in toggleableColumns"
                        :key="column.id"
                        :model-value="isColumnVisible(column.id)"
                        :disabled="isLoadingColumnVisibility && canUseColumnVisibilityPreference"
                        class="cursor-pointer hover:bg-accent hover:text-accent-foreground"
                        @select="(event) => { event.preventDefault(); handleToggleColumnVisibility(column.id) }"
                    >
                        {{ getColumnLabel(column) }}
                    </DropdownMenuCheckboxItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
        <div class="border rounded-md overflow-x-auto">
            <Table class="table-fixed w-full">
                <TableHeader>
                    <TableRow v-for="headerGroup in table.getHeaderGroups()" :key="headerGroup.id">
                        <TableHead
                            v-for="header in headerGroup.headers"
                            :key="header.id"
                            :class="['relative', (header.column.columnDef.meta as { headerClass?: string } | undefined)?.headerClass]"
                            :style="{ width: `${header.getSize()}px` }"
                        >
                            <FlexRender v-if="!header.isPlaceholder" :render="header.column.columnDef.header"
                                :props="header.getContext()" />
                            <div
                                v-if="header.column.getCanResize()"
                                class="absolute right-0 top-0 h-full w-3 cursor-col-resize select-none touch-none bg-transparent after:absolute after:right-0 after:top-0 after:h-full after:w-px after:bg-border/70 after:content-[''] hover:bg-primary/10 hover:after:bg-border"
                                :class="header.column.getIsResizing() ? 'bg-primary/20 after:bg-primary/50' : undefined"
                                title="Resize column"
                                @mousedown="header.getResizeHandler()($event)"
                                @touchstart.prevent="header.getResizeHandler()($event)"
                            />
                        </TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    <template v-if="table.getRowModel().rows?.length">
                        <TableRow v-for="row in table.getRowModel().rows" :key="row.id"
                            :data-state="row.getIsSelected() ? 'selected' : undefined"
                            :class="props.onRowClick ? 'cursor-pointer transition-colors hover:bg-muted/40' : undefined"
                            @click="handleRowClick(row.original, $event)"
                        >
                            <TableCell
                                v-for="cell in row.getVisibleCells()"
                                :key="cell.id"
                                :class="(cell.column.columnDef.meta as { cellClass?: string } | undefined)?.cellClass"
                                :style="{ width: `${cell.column.getSize()}px` }"
                            >
                                <FlexRender :render="cell.column.columnDef.cell" :props="cell.getContext()" />
                            </TableCell>
                        </TableRow>
                    </template>
                    <template v-else>
                        <TableRow>
                            <TableCell :colspan="table.getVisibleLeafColumns().length" class="h-24 text-center">
                                No results.
                            </TableCell>
                        </TableRow>
                    </template>
                </TableBody>
            </Table>
        </div>
        <div class="flex items-center justify-end py-4 space-x-2">
            <Button variant="secondary" size="sm" :disabled="!table.getCanPreviousPage()" @click="table.previousPage()">
                Previous
            </Button>
            <Button variant="secondary" size="sm" :disabled="!table.getCanNextPage()" @click="table.nextPage()">
                Next
            </Button>
        </div>
    </div>
</template>
