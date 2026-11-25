import type { Project, SubProject, ProjectStage } from '@/types';

export type { Project, SubProject, ProjectStage };

export async function fetchProjects(): Promise<Project[]> {
  const res = await fetch('/api/projects');
  const data = await res.json();
  return data.projects || data;
}

export async function fetchProjectById(id: string): Promise<Project> {
  const res = await fetch(`/api/projects/${id}`);
  return res.json();
}

