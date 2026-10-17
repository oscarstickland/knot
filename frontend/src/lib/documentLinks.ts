export type LinkTone = "blue" | "green" | "gold" | "default";

export type LinkDescription = {
    host: string;
    initial: string;
    provider: string | null;
    tone: LinkTone;
};

type ProviderRule = {
    provider: string;
    tone: LinkTone;
    matches: (host: string, path: string) => boolean;
};

const isHostOrSubdomain = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

const PROVIDER_RULES: ProviderRule[] = [
    { provider: "Google Doc", tone: "blue", matches: (host, path) => host === "docs.google.com" && path.startsWith("/document") },
    { provider: "Google Sheet", tone: "green", matches: (host, path) => host === "docs.google.com" && path.startsWith("/spreadsheets") },
    { provider: "Google Slides", tone: "gold", matches: (host, path) => host === "docs.google.com" && path.startsWith("/presentation") },
    { provider: "Google Drive", tone: "gold", matches: (host) => host === "drive.google.com" },
    { provider: "Notion", tone: "default", matches: (host) => isHostOrSubdomain(host, "notion.so") || isHostOrSubdomain(host, "notion.site") },
    { provider: "Dropbox", tone: "blue", matches: (host) => isHostOrSubdomain(host, "dropbox.com") }
];

export function describeLink(url: string): LinkDescription {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return { host: "", initial: "?", provider: null, tone: "default" };
    }

    const host = parsed.hostname.replace(/^www\./, "");
    const rule = PROVIDER_RULES.find((candidate) => candidate.matches(host, parsed.pathname));

    return {
        host,
        initial: host.charAt(0).toUpperCase() || "?",
        provider: rule?.provider ?? null,
        tone: rule?.tone ?? "default"
    };
}
