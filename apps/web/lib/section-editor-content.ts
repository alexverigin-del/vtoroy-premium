import type { SectionContent } from "@vtoroy/shared";

/** Null means legacy mode; an explicitly empty value is an editorial deletion. */
export function mergeSectionEditorContent(
  row: Record<string, unknown>,
  legacy: SectionContent,
): SectionContent {
  const content = { ...legacy };
  for (const [field, key] of [
    ["editor_note", "note"],
    ["editor_disclaimer", "disclaimer"],
  ] as const) {
    if (typeof row[field] === "string") content[key] = row[field];
  }
  if (row.editor_steps != null) {
    content.steps = Array.isArray(row.editor_steps)
      ? row.editor_steps.filter(
          (step): step is { title: string; text: string } =>
            step != null &&
            typeof step === "object" &&
            typeof step.title === "string" &&
            typeof step.text === "string",
        )
      : [];
  }
  if (row.editor_proof != null) {
    content.proof = Array.isArray(row.editor_proof)
      ? row.editor_proof.flatMap((item) =>
          item != null && typeof item === "object" && typeof item.text === "string"
            ? [item.text]
            : [],
        )
      : [];
  }
  return content;
}
