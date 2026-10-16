// The tones a fact can take, for the dot or bar beside its words. The words
// always carry the meaning; the colour only helps the eye find what needs
// attention.
export type Tone = "positive" | "attention" | "negative" | "info" | "neutral";

/** The colour of a dot or a bar's fill in each tone. */
export const TONE_COLOURS: Record<Tone, string> = {
  positive: "bg-emerald-500",
  attention: "bg-amber-500",
  negative: "bg-red-500",
  info: "bg-sky-500",
  neutral: "bg-zinc-400",
};
