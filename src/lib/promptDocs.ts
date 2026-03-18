import { PROMPT_SOURCE_FILES } from "convex/data/generated/promptLibrary";

export type PromptDocEntry = {
  key: keyof typeof PROMPT_SOURCE_FILES;
  title: string;
  description: string;
  relativePath: string;
};

const PROMPT_DOC_METADATA: Record<keyof typeof PROMPT_SOURCE_FILES, Omit<PromptDocEntry, "key" | "relativePath">> = {
  claudeDraftReplyPreamble: {
    title: "Draft Reply Preamble",
    description:
      "High-level drafting instructions prepended to partner reply generation before the contextual thread, site, and partner details.",
  },
  claudeSystem: {
    title: "Claude System Prompt",
    description:
      "Global system behavior for the EDU Ops assistant, including scope boundaries, lifecycle rules, and response constraints.",
  },
};

export const PROMPT_DOCS: PromptDocEntry[] = Object.entries(PROMPT_SOURCE_FILES).map(
  ([key, relativePath]) => ({
    key: key as keyof typeof PROMPT_SOURCE_FILES,
    relativePath,
    ...PROMPT_DOC_METADATA[key as keyof typeof PROMPT_SOURCE_FILES],
  })
);

export function getPromptEditUrl(relativePath: string): string | null {
  const base = process.env.NEXT_PUBLIC_PROMPT_EDIT_BASE_URL;
  if (!base) {
    return null;
  }
  return `${base.replace(/\/$/, "")}/${relativePath}`;
}

export function getPromptBrowseUrl(relativePath: string): string | null {
  const base = process.env.NEXT_PUBLIC_PROMPT_BROWSE_BASE_URL;
  if (!base) {
    return null;
  }
  return `${base.replace(/\/$/, "")}/${relativePath}`;
}
