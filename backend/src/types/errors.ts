import type { ZodError } from "zod";

export function describeZodError(error: ZodError): string {
    return error.issues
        .map((issue) => `${issue.path.join(".") || "value"}: ${issue.message}`)
        .join("; ");
}
