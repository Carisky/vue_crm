import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { hashPassword } from "../server/lib/password";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const url = new URL(databaseUrl);
const adapter = new PrismaMariaDb({
  host: url.hostname,
  port: Number(url.port || 3306),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.slice(1),
  connectionLimit: 5,
});
const prisma = new PrismaClient({ adapter });

const DEMO_PASSWORD = "Demo123!";
const DEMO_WORKSPACE_ID = "demo-tsl-workspace";

const users = [
  { id: "demo-user-anna", name: "Anna Kowalska", email: "anna.demo@tsl.local" },
  { id: "demo-user-marek", name: "Marek Nowak", email: "marek.demo@tsl.local" },
  { id: "demo-user-kasia", name: "Kasia Zielińska", email: "kasia.demo@tsl.local" },
  { id: "demo-user-piotr", name: "Piotr Wiśniewski", email: "piotr.demo@tsl.local" },
];

const daysFromNow = (days: number, hour = 12) => {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date;
};

async function main() {
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  await prisma.workspace.deleteMany({
    where: { OR: [{ id: DEMO_WORKSPACE_ID }, { inviteCode: "TSL-DEMO-2026" }] },
  });
  await prisma.user.deleteMany({
    where: { email: { in: users.map((user) => user.email) } },
  });

  for (const user of users) {
    await prisma.user.create({
      data: {
        ...user,
        passwordHash,
        emailVerifiedAt: new Date(),
        locale: "pl",
        onboardingStatus: "COMPLETED",
        onboardingVersion: 1,
      },
    });
  }

  const workspace = await prisma.workspace.create({
    data: {
      id: DEMO_WORKSPACE_ID,
      name: "TSL Silesia — Demo",
      inviteCode: "TSL-DEMO-2026",
      ownerId: users[0].id,
      members: {
        create: users.map((user, index) => ({
          userId: user.id,
          role: index === 0 ? "ADMIN" : "MEMBER",
        })),
      },
    },
  });

  const operations = await prisma.workspaceGroup.create({
    data: {
      id: "demo-group-operations",
      workspaceId: workspace.id,
      name: "Operacje",
      description: "Planowanie transportu, dokumenty i kontakt z kierowcami.",
      color: "#2563eb",
      members: { create: users.slice(0, 3).map((user) => ({ userId: user.id })) },
    },
  });
  const sales = await prisma.workspaceGroup.create({
    data: {
      id: "demo-group-sales",
      workspaceId: workspace.id,
      name: "Obsługa klienta",
      description: "Komunikacja z klientami i zamknięcie zleceń.",
      color: "#f59e0b",
      members: { create: [users[0], users[3]].map((user) => ({ userId: user.id })) },
    },
  });

  const mainProject = await prisma.project.create({
    data: {
      id: "demo-project-autumn",
      name: "Szczyt jesienny 2026",
      workspaceId: workspace.id,
    },
  });
  const onboardingProject = await prisma.project.create({
    data: {
      id: "demo-project-client",
      name: "Wdrożenie klienta NordCargo",
      workspaceId: workspace.id,
      parentId: mainProject.id,
    },
  });
  await prisma.project.create({
    data: {
      id: "demo-project-quality",
      name: "Standard jakości dostaw",
      workspaceId: workspace.id,
    },
  });

  const taskRows = [
    ["demo-task-01", "Zebrać prognozy wolumenu od klientów", "DONE", "HIGH", -6, users[3].id, sales.id, null],
    ["demo-task-02", "Potwierdzić dostępność przewoźników", "IN_REVIEW", "REAL_TIME", 1, users[1].id, operations.id, null],
    ["demo-task-03", "Ułożyć grafik dyspozytorów", "IN_PROGRESS", "HIGH", 3, users[2].id, operations.id, null],
    ["demo-task-04", "Zweryfikować komplet dokumentów CMR", "TODO", "MEDIUM", 5, users[2].id, operations.id, null],
    ["demo-task-05", "Przygotować raport SLA dla klienta", "BACKLOG", "LOW", 9, users[3].id, sales.id, null],
    ["demo-task-06", "Wyjaśnić opóźnienie trasy Katowice–Berlin", "IN_PROGRESS", "REAL_TIME", -1, users[1].id, operations.id, null],
    ["demo-task-07", "Uruchomić komunikację statusową", "TODO", "HIGH", 2, users[0].id, sales.id, "demo-task-03"],
    ["demo-task-08", "Przetestować ścieżkę eskalacji", "BACKLOG", "MEDIUM", 6, users[2].id, operations.id, "demo-task-03"],
  ] as const;

  for (const [id, name, status, priority, due, assigneeId, assigneeGroupId, parentId] of taskRows) {
    await prisma.task.create({
      data: {
        id,
        name,
        status,
        priority,
        dueDate: daysFromNow(due),
        startedAt: status === "BACKLOG" || status === "TODO" ? null : daysFromNow(due - 7, 9),
        estimatedHours: status === "DONE" ? 6 : 8,
        actualHours: status === "DONE" ? 5.5 : status === "IN_PROGRESS" ? 3 : null,
        description: `Cel: ${name}.\nKryterium zakończenia: wynik potwierdzony przez właściciela procesu i zapisany w Collab.`,
        position: Number(id.slice(-2)) * 1000,
        workspaceId: workspace.id,
        projectId: id === "demo-task-05" ? onboardingProject.id : mainProject.id,
        parentId,
        assigneeId,
        assigneeGroupId,
      },
    });
  }

  await prisma.taskComment.createMany({
    data: [
      { id: "demo-comment-01", taskId: "demo-task-02", workspaceId: workspace.id, authorId: users[1].id, body: "Otrzymaliśmy potwierdzenie od 8 z 10 przewoźników. Dwa tematy wymagają decyzji do jutra." },
      { id: "demo-comment-02", taskId: "demo-task-02", workspaceId: workspace.id, authorId: users[0].id, body: "Priorytet: zabezpieczyć trasę Katowice–Berlin. Pozostałe możemy zamknąć po południu." },
      { id: "demo-comment-03", taskId: "demo-task-06", workspaceId: workspace.id, authorId: users[2].id, body: "Dokumenty są kompletne. Czekamy na potwierdzenie nowego ETA od przewoźnika." },
    ],
  });

  const section = await prisma.projectDocSection.create({
    data: { id: "demo-doc-section", workspaceId: workspace.id, projectId: mainProject.id, authorId: users[0].id, title: "Standard operacyjny" },
  });
  await prisma.projectDoc.createMany({
    data: [
      { id: "demo-doc-01", workspaceId: workspace.id, projectId: mainProject.id, authorId: users[0].id, sectionId: section.id, title: "Karta projektu", body: "Cel: bezpieczna obsługa zwiększonego wolumenu.\nWłaściciel: Anna Kowalska.\nMiernik: minimum 97% dostaw w SLA.", isLocked: true },
      { id: "demo-doc-02", workspaceId: workspace.id, projectId: mainProject.id, authorId: users[1].id, sectionId: section.id, title: "Ścieżka eskalacji", body: "1. Dyspozytor aktualizuje zadanie.\n2. Lider operacji ocenia wpływ.\n3. Przy ryzyku SLA informujemy klienta i managera.", isLocked: false },
      { id: "demo-doc-03", workspaceId: workspace.id, projectId: mainProject.id, authorId: users[2].id, title: "Checklista zamknięcia zlecenia", body: "CMR, potwierdzenie dostawy, rozliczenie kosztów, informacja dla klienta.", isLocked: false },
    ],
  });

  const groupConversation = await prisma.conversation.create({
    data: {
      id: "demo-conversation-operations",
      workspaceId: workspace.id,
      type: "GROUP",
      name: "Operacje",
      channelKey: "group:demo-operations",
      groupId: operations.id,
      participants: { create: users.slice(0, 3).map((user) => ({ userId: user.id })) },
    },
  });
  await prisma.conversationMessage.createMany({
    data: [
      { id: "demo-message-01", conversationId: groupConversation.id, senderId: users[1].id, body: "Dwie trasy wymagają potwierdzenia przewoźnika." },
      { id: "demo-message-02", conversationId: groupConversation.id, senderId: users[0].id, body: "Skupmy się najpierw na Berlinie. Decyzję zapisuję też w zadaniu." },
      { id: "demo-message-03", conversationId: groupConversation.id, senderId: users[2].id, body: "Jasne, aktualizuję ETA i dokumenty." },
    ],
  });

  await prisma.notification.createMany({
    data: [
      { id: "demo-notification-01", userId: users[0].id, workspaceId: workspace.id, taskId: "demo-task-02", projectId: mainProject.id, actorId: users[1].id, type: "TASK_COMMENT", message: "Nowy komentarz w zadaniu: Potwierdzić dostępność przewoźników" },
      { id: "demo-notification-02", userId: users[0].id, workspaceId: workspace.id, taskId: "demo-task-06", projectId: mainProject.id, actorId: users[2].id, type: "TASK_STATUS_CHANGED", message: "Zadanie wymaga uwagi: opóźniony termin" },
    ],
  });

  console.log(`Demo ready: ${workspace.name}`);
  console.log(`Sign in: ${users[0].email} / ${DEMO_PASSWORD}`);
}

main().finally(() => prisma.$disconnect());
