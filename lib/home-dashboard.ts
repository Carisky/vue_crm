export function buildHomeDashboardPreview<TTask, TProject, TMember>(input: {
  tasks: TTask[];
  projects: TProject[];
  members: TMember[];
}) {
  const tasks = input.tasks.slice(0, 6);
  const projects = input.projects.slice(0, 8);
  const members = input.members.slice(0, 7);
  return {
    tasks,
    projects,
    members,
    remaining: {
      tasks: input.tasks.length - tasks.length,
      projects: input.projects.length - projects.length,
      members: input.members.length - members.length,
    },
  };
}
