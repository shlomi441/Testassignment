export type Health = { status: string; uptime: number };
export type Task = { id: string; title: string; createdAt: string };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const body = await response.json();
  if (!response.ok) throw new Error(body.message);
  return body;
}

export const getHealth = () => request<Health>("/health");

export const getTasks = () => request<Task[]>("/tasks");

export const createTask = (title: string) =>
  request<Task>("/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
