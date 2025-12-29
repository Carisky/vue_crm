import { TaskStatus } from "@prisma/client";
import {
  endOfMonth,
  format,
  startOfDay,
  startOfMonth,
  subDays,
  subMonths,
} from "date-fns";

import prisma from "~/server/lib/prisma";
import { ensureWorkspaceAccess } from "~/server/lib/workspace";
import { serializeMember } from "~/server/lib/serializers";

export default defineEventHandler(async (event) => {
  const { workspaceId } = getRouterParams(event);
  const { period_days } = getQuery(event);

  const periodDaysInput = Number(period_days ?? NaN);
  const periodDays =
    !Number.isNaN(periodDaysInput) && periodDaysInput > 0
      ? Math.min(Math.max(periodDaysInput, 1), 365)
      : 30;
  const periodStart = startOfDay(
    subDays(new Date(), Math.max(periodDays - 1, 0)),
  );

  const { workspace } = await ensureWorkspaceAccess(event, workspaceId);

  const memberships = await prisma.member.findMany({
    where: { workspaceId },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });

  const assigneeIds = memberships.map((membership) => membership.userId);
  const actualHoursTotals =
    assigneeIds.length > 0
      ? await prisma.task.groupBy({
          by: ["assigneeId", "status"],
          where: {
            workspaceId,
            assigneeId: { in: assigneeIds },
            startedAt: { gte: periodStart },
            actualHours: { not: null },
            status: { in: [TaskStatus.DONE, TaskStatus.IN_REVIEW] },
          },
          _sum: {
            actualHours: true,
          },
        })
      : [];

  const actualHoursMap = actualHoursTotals.reduce<Record<string, number>>(
    (acc, entry) => {
      if (entry.assigneeId) {
        acc[entry.assigneeId] =
          (acc[entry.assigneeId] ?? 0) + (entry._sum.actualHours ?? 0);
      }
      return acc;
    },
    {},
  );

  const now = new Date();
  const monthOffsets = [2, 1, 0];
  const monthRanges = monthOffsets.map((offset) => {
    const monthDate = subMonths(now, offset);
    return {
      start: startOfMonth(monthDate),
      end: endOfMonth(monthDate),
      label: format(monthDate, "MMM yyyy"),
      key: format(monthDate, "yyyy-MM"),
    };
  });

  const monthlyTotals = await Promise.all(
    monthRanges.map((range) =>
      prisma.task.groupBy({
        by: ["assigneeId", "status"],
        where: {
          workspaceId,
          assigneeId: { not: null },
          startedAt: { gte: range.start, lte: range.end },
          actualHours: { not: null },
          status: { in: [TaskStatus.DONE, TaskStatus.IN_REVIEW] },
        },
        _sum: {
          actualHours: true,
        },
      }),
    ),
  );

  const monthlyTotalsMap = monthlyTotals.map((totals) =>
    totals.reduce<Record<string, { done: number; review: number }>>(
      (acc, entry) => {
        if (entry.assigneeId) {
          const current = acc[entry.assigneeId] ?? { done: 0, review: 0 };
          if (entry.status === TaskStatus.DONE) {
            current.done = entry._sum.actualHours ?? 0;
          } else if (entry.status === TaskStatus.IN_REVIEW) {
            current.review = entry._sum.actualHours ?? 0;
          }
          acc[entry.assigneeId] = current;
        }
        return acc;
      },
      {},
    ),
  );

  const members = memberships.map((membership) => ({
    ...serializeMember(
      membership,
      workspace.ownerId,
      actualHoursMap[membership.userId] ?? 0,
    ),
    monthly_hours: monthRanges.map((range, index) => {
      const totals = monthlyTotalsMap[index][membership.userId] ?? {
        done: 0,
        review: 0,
      };
      return {
        month: range.key,
        label: range.label,
        hours: totals.done + totals.review,
        done_hours: totals.done,
        review_hours: totals.review,
      };
    }),
  }));

  return {
    members,
    period_days: periodDays,
  };
});
