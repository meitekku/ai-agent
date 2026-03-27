import { createNotification } from "./db";

export async function notifySuccess(
  taskId: number,
  executionId: number,
  taskName: string,
  resultSummary: string,
): Promise<void> {
  await createNotification({
    task_id: taskId,
    execution_id: executionId,
    type: "success",
    title: `Task "${taskName}" completed successfully`,
    summary: resultSummary.slice(0, 500),
  });
}

export async function notifyFailure(
  taskId: number,
  executionId: number,
  taskName: string,
  error: string,
): Promise<void> {
  await createNotification({
    task_id: taskId,
    execution_id: executionId,
    type: "failure",
    title: `Task "${taskName}" failed`,
    summary: error.slice(0, 500),
  });
}

export async function notifyTimeout(
  taskId: number,
  executionId: number,
  taskName: string,
): Promise<void> {
  await createNotification({
    task_id: taskId,
    execution_id: executionId,
    type: "timeout",
    title: `Task "${taskName}" timed out`,
    summary: "Execution exceeded the configured timeout limit.",
  });
}
