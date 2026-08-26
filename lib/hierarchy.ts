export type HierarchyNode = {
  id: string;
  parentId: string | null;
};

export type Progress = {
  completed: number;
  total: number;
  percent: number;
};

export function collectDescendantIds(
  nodes: HierarchyNode[],
  rootId: string,
): string[] {
  const children = new Map<string, string[]>();

  for (const node of nodes) {
    if (!node.parentId) continue;
    const siblings = children.get(node.parentId) ?? [];
    siblings.push(node.id);
    children.set(node.parentId, siblings);
  }

  const result: string[] = [];
  const visited = new Set<string>();
  const queue = [rootId];

  while (queue.length) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    result.push(id);
    queue.push(...(children.get(id) ?? []));
  }

  return result;
}

export function buildLeafProgressMap<
  T extends HierarchyNode & { done: boolean },
>(nodes: T[]): Map<string, Progress> {
  const children = new Map<string, T[]>();
  const byId = new Map(nodes.map((node) => [node.id, node]));

  for (const node of nodes) {
    if (!node.parentId || !byId.has(node.parentId)) continue;
    const siblings = children.get(node.parentId) ?? [];
    siblings.push(node);
    children.set(node.parentId, siblings);
  }

  const cache = new Map<string, Progress>();
  const calculate = (node: T, visiting = new Set<string>()): Progress => {
    const cached = cache.get(node.id);
    if (cached) return cached;
    if (visiting.has(node.id)) return { completed: 0, total: 0, percent: 0 };

    const nextVisiting = new Set(visiting).add(node.id);
    const descendants = children.get(node.id) ?? [];
    const progress = descendants.length
      ? descendants.reduce<Progress>(
          (sum, child) => {
            const childProgress = calculate(child, nextVisiting);
            sum.completed += childProgress.completed;
            sum.total += childProgress.total;
            return sum;
          },
          { completed: 0, total: 0, percent: 0 },
        )
      : { completed: node.done ? 1 : 0, total: 1, percent: 0 };

    progress.percent = progress.total
      ? Math.round((progress.completed / progress.total) * 100)
      : 0;
    cache.set(node.id, progress);
    return progress;
  };

  for (const node of nodes) calculate(node);
  return cache;
}

export function buildProjectProgressMap(
  projects: HierarchyNode[],
  tasks: Array<HierarchyNode & { projectId: string; done: boolean }>,
): Map<string, Progress> {
  const projectIds = new Set(projects.map((project) => project.id));
  const projectChildren = new Map<string, string[]>();
  const directProgress = new Map<string, { completed: number; total: number }>();
  const taskIdsWithChildren = new Set(
    tasks.flatMap((task) => (task.parentId ? [task.parentId] : [])),
  );

  for (const project of projects) {
    directProgress.set(project.id, { completed: 0, total: 0 });
    if (!project.parentId || !projectIds.has(project.parentId)) continue;
    const siblings = projectChildren.get(project.parentId) ?? [];
    siblings.push(project.id);
    projectChildren.set(project.parentId, siblings);
  }

  for (const task of tasks) {
    if (taskIdsWithChildren.has(task.id)) continue;
    const direct = directProgress.get(task.projectId);
    if (!direct) continue;
    direct.total += 1;
    if (task.done) direct.completed += 1;
  }

  const result = new Map<string, Progress>();
  const calculate = (
    projectId: string,
    visiting = new Set<string>(),
  ): Progress => {
    const cached = result.get(projectId);
    if (cached) return cached;
    if (visiting.has(projectId)) return { completed: 0, total: 0, percent: 0 };

    const nextVisiting = new Set(visiting).add(projectId);
    const direct = directProgress.get(projectId) ?? { completed: 0, total: 0 };
    let completed = direct.completed;
    let total = direct.total;

    for (const childId of projectChildren.get(projectId) ?? []) {
      const child = calculate(childId, nextVisiting);
      completed += child.completed;
      total += child.total;
    }

    const progress = {
      completed,
      total,
      percent: total ? Math.round((completed / total) * 100) : 0,
    };
    result.set(projectId, progress);
    return progress;
  };

  for (const project of projects) {
    calculate(project.id);
  }

  return result;
}
