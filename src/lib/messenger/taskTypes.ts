export const TASK_STATUSES = ['todo', 'in_progress', 'done', 'on_hold'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: '할일',
  in_progress: '진행중',
  done: '완료',
  on_hold: '보류',
};

export const TASK_PRIORITIES = ['high', 'medium', 'low'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  high: '높음',
  medium: '중간',
  low: '낮음',
};

export interface MessengerTask {
  id: string;
  storeId: string;
  title: string;
  description: string;
  status: TaskStatus;
  assignee: string;
  assigneeName?: string;
  dueDate: string;
  priority: TaskPriority;
  sourceMessageId?: string;
  sourceRoomId?: string;
  createdBy: string;
  createdByName?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface TaskInput {
  title: string;
  description?: string;
  status?: TaskStatus;
  assignee?: string;
  assigneeName?: string;
  dueDate?: string;
  priority?: TaskPriority;
  sourceMessageId?: string;
  sourceRoomId?: string;
}
