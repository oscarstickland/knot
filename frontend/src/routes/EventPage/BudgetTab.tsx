import { BudgetSection } from "@/components/BudgetSection";
import type { ClubEvent } from "@knot/backend/events";

export function BudgetTab(props: { event: ClubEvent }) {
    return <BudgetSection eventId={props.event.id} />
}
