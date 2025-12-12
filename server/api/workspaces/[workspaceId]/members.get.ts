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
          by: ["assigneeId"],
          where: {
            workspaceId,
            assigneeId: { in: assigneeIds },
            startedAt: { gte: periodStart },
            actualHours: { not: null },
          },
          _sum: {
            actualHours: true,
          },
        })
      : [];

  const actualHoursMap = actualHoursTotals.reduce<Record<string, number>>(
    (acc, entry) => {
      if (entry.assigneeId) {
        acc[entry.assigneeId] = entry._sum.actualHours ?? 0;
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
        by: ["assigneeId"],
        where: {
          workspaceId,
          assigneeId: { not: null },
          startedAt: { gte: range.start, lte: range.end },
          actualHours: { not: null },
        },
        _sum: {
          actualHours: true,
        },
      }),
    ),
  );

  const monthlyTotalsMap = monthlyTotals.map((totals) =>
    totals.reduce<Record<string, number>>((acc, entry) => {
      if (entry.assigneeId) {
        acc[entry.assigneeId] = entry._sum.actualHours ?? 0;
      }
      return acc;
    }, {}),
  );

  const members = memberships.map((membership) => ({
    ...serializeMember(
      membership,
      workspace.ownerId,
      actualHoursMap[membership.userId] ?? 0,
    ),
    monthly_hours: monthRanges.map((range, index) => ({
      month: range.key,
      label: range.label,
      hours: monthlyTotalsMap[index][membership.userId] ?? 0,
    })),
  }));

  return {
    members,
    period_days: periodDays,
  };
});
