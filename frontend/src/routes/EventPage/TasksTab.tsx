import { TasksSection } from "@/components/TasksSection";
import type { ClubEvent } from "@knot/backend/events";

export function TasksTab(props: { event: ClubEvent }) {
    return <TasksSection eventId={props.event.id} />
}