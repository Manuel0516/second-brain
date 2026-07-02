import TaskItem from '@tiptap/extension-task-item'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { TaskItemNodeView } from './TaskItemNodeView'

export const EditableTaskItem = TaskItem.extend({
  addNodeView() {
    return ReactNodeViewRenderer(TaskItemNodeView)
  },
}).configure({ nested: true })
