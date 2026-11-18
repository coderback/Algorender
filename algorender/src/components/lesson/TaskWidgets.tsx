import { expected, getTask, topicTasks } from '@/content/tasks';
import { TaskPlayer } from '@/tasks/ui/TaskPlayer';
import { TaskStrip } from '@/tasks/ui/TaskStrip';

// The language topics' task widgets for MDX (src/mdx-components.tsx), server
// side, so a lesson ships only its own tasks: content.test.ts checks every
// slug and concept they name.

/** One task worked inside the topic, usually its first prediction: `<TopicTask task="…" />`. */
export function TopicTask({ task: slug }: { task: string }) {
  const task = getTask(slug);
  if (!task) throw new Error(`No task ${slug}`);
  return <TaskPlayer task={task} expected={expected[slug] ?? {}} inline />;
}

/** The topic's tasks, in order, each on its own page: `<TaskStrip concept="…" />`. */
export function TopicTasks({ concept }: { concept: string }) {
  const mine = topicTasks(concept);
  if (mine.length === 0) throw new Error(`No tasks for ${concept}`);
  return <TaskStrip tasks={mine.map(({ slug, title, kind }) => ({ slug, title, kind }))} label="This topic’s tasks" />;
}
