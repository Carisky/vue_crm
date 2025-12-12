<script setup lang="ts">
import { Calendar } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import { format } from 'date-fns';

import type { CreateTaskInject, FilteredTask, Project } from '~/lib/types';
import useComponentToString from '~/composables/useComponentToString';
import CalendarToolbar from './CalendarToolbar.vue';
import EventCard from './EventCard.vue';

interface Event {
    id: string;
    title: string;
    start: string;
    extendedProps: {
        status: string;
        project: Project | null;
        assignee: FilteredTask['assignee'];
    };
}

const { data = [] } = defineProps<{
    data?: FilteredTask[];
}>();

const route = useRoute();
const { componentToString } = useComponentToString();

const tasksWithDueDates = data.filter(
    (task): task is FilteredTask & { due_date: string } => Boolean(task.due_date),
);

const events: Event[] = tasksWithDueDates.map(
    ({ $id, name, status, due_date, project, assignee }) => ({
        id: $id,
        title: name,
        start: due_date,
        extendedProps: {
            status,
            project,
            assignee,
        },
    }),
);

const initialCalendarDate = events[0]?.start ? new Date(events[0].start) : new Date();
const currentMonth = ref(format(initialCalendarDate, 'MMMM yyyy'));
let calendar: Calendar | undefined = undefined;

onMounted(() => {
    const elm = document.getElementById('calendar');
    if (!elm) return;

    new Promise((resolve) => {
        calendar = new Calendar(elm as HTMLElement, {
            plugins: [dayGridPlugin],
            initialView: 'dayGridMonth',
            initialDate: initialCalendarDate,
            events,
            headerToolbar: {
                start: '',
                center: '',
                end: '',
            },
            dayCellContent: function (arg) {
                return {
                    html: arg.dayNumberText.padStart(2, '0'),
                };
            },
            eventContent: function (arg) {
                const { id, title, start, extendedProps } = arg.event as unknown as Event;
                return {
                    html: componentToString(EventCard, {
                        id,
                        title,
                        start,
                        status: extendedProps.status,
                        project: extendedProps.project,
                        assignee: extendedProps.assignee,
                    }),
                };
            },
            eventClick: function (eventClickInfo) {
                navigateTo(`/workspaces/${route.params['workspaceId']}/tasks/${eventClickInfo.event.id}`);
            },
            datesSet: function (e) {
                currentMonth.value = format(e.view.calendar.getDate(), 'MMMM yyyy');
            },
        });
        calendar.render();

        resolve(true);
    });
});

const prev = () => calendar?.prev();
const next = () => calendar?.next();
const today = () => calendar?.today();

const onCreateTask: CreateTaskInject | undefined = inject('create-task-inject');

const unsubscribeCreateSuccess = onCreateTask?.subscribeToCreateTaskSuccess((task: FilteredTask) => {
    const { $id, name, status, due_date, project, assignee } = task;
    if (!due_date) return;

    calendar?.addEvent({
        id: $id,
        title: name,
        start: due_date,
        extendedProps: {
            status,
            project,
            assignee,
        },
    });
});

onUnmounted(() => {
    calendar?.destroy();
    unsubscribeCreateSuccess?.();
});
</script>

<template>
    <CalendarToolbar :month="currentMonth" :prev="prev" :next="next" :today="today" />
    <div id="calendar"></div>
</template>
