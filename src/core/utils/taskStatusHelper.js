export const CLOSED_TASK_STATES = ['1_done', '1_canceled'];

export function isTaskClosed(state) {
  return CLOSED_TASK_STATES.includes(state);
}
