import dayjs from "dayjs";

export interface DuplicateDefaults {
    name: string;
    start: string;
    end: string;
}

interface DuplicateSource {
    name: string;
    start: Date | string;
    end: Date | string;
}

/**
 * Clubs run the same events annually, so suggest the same slot one year on (same weekday where
 * possible) keeping the duration. A year in the name is bumped too, otherwise " (copy)" is added.
 */
export function suggestDuplicateDefaults(source: DuplicateSource): DuplicateDefaults {
    const start = dayjs(source.start);
    const end = dayjs(source.end);
    const nextStart = start.add(52, "week");

    return {
        name: bumpYearInName(source.name, start.year(), nextStart.year()),
        start: nextStart.toISOString(),
        end: nextStart.add(end.diff(start), "millisecond").toISOString()
    };
}

function bumpYearInName(name: string, sourceYear: number, nextYear: number): string {
    const yearPattern = new RegExp(`\\b${sourceYear}\\b`);
    return yearPattern.test(name)
        ? name.replace(yearPattern, String(nextYear))
        : `${name} (copy)`;
}
