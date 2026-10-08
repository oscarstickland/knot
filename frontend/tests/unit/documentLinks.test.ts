import { describe, it, expect } from "bun:test";
import { describeLink } from "../../src/lib/documentLinks.ts";

describe("describeLink", () => {
    it("strips www from the host", () => {
        expect(describeLink("https://www.example.com/path").host).toBe("example.com");
    });

    it("keeps subdomains other than www", () => {
        expect(describeLink("https://docs.example.com/a").host).toBe("docs.example.com");
    });

    it("uses the first letter of the host as the initial", () => {
        expect(describeLink("https://www.example.com").initial).toBe("E");
    });

    it("recognises Google Docs", () => {
        const link = describeLink("https://docs.google.com/document/d/abc/edit");
        expect(link.provider).toBe("Google Doc");
        expect(link.tone).toBe("blue");
    });

    it("recognises Google Sheets", () => {
        const link = describeLink("https://docs.google.com/spreadsheets/d/abc");
        expect(link.provider).toBe("Google Sheet");
        expect(link.tone).toBe("green");
    });

    it("recognises Google Slides", () => {
        expect(describeLink("https://docs.google.com/presentation/d/abc").provider).toBe("Google Slides");
    });

    it("recognises Google Drive", () => {
        expect(describeLink("https://drive.google.com/file/d/abc").provider).toBe("Google Drive");
    });

    it("recognises Notion on both of its domains", () => {
        expect(describeLink("https://www.notion.so/page").provider).toBe("Notion");
        expect(describeLink("https://team.notion.site/page").provider).toBe("Notion");
    });

    it("does not treat lookalike hosts as a known provider", () => {
        expect(describeLink("https://notion.so.evil.com/page").provider).toBeNull();
        expect(describeLink("https://evildocs.google.com.example.com/document/d/a").provider).toBeNull();
    });

    it("falls back to a neutral tone for unknown hosts", () => {
        const link = describeLink("https://example.com/file.pdf");
        expect(link.provider).toBeNull();
        expect(link.tone).toBe("default");
    });

    it("handles an unparseable url without throwing", () => {
        const link = describeLink("not a url");
        expect(link.host).toBe("");
        expect(link.initial).toBe("?");
        expect(link.provider).toBeNull();
    });
});
