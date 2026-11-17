import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createTask, getTasks, type Task } from "../api.ts";

export type TasksState =
  | { status: "loading" }
  | { status: "error"; reason: string }
  | { status: "ready"; tasks: Task[] };

export function useTasks() {
  const client = useQueryClient();
  const { status, data, error, refetch } = useQuery({
    queryKey: ["tasks"],
    queryFn: getTasks,
  });
  const { mutateAsync } = useMutation({
    mutationFn: createTask,
    onSuccess: async (task) => {
      await client.refetchQueries(
        { queryKey: ["tasks"], fetchStatus: "fetching" },
        { cancelRefetch: false },
      );
      const { status, data } = client.getQueryState<Task[]>(["tasks"])!;
      if (status === "success" && !data!.some(({ id }) => id === task.id))
        client.setQueryData<Task[]>(["tasks"], [...data!, task]);
    },
  });
  const state: TasksState =
    status === "pending"
      ? { status: "loading" }
      : status === "error"
        ? { status: "error", reason: error.message }
        : { status: "ready", tasks: data };
  return { state, reload: refetch, add: mutateAsync };
}
