import { DocumentsSection } from "@/components/DocumentsSection";
import type { ClubEvent } from "@knot/backend/events";

export function DocumentsTab(props: { event: ClubEvent }) {
    return <DocumentsSection eventId={props.event.id} />
}
