// Notes on a deadline as it is typed, under the field's own description:
// the academic year it falls in, who that reaches, and any mismatch with the
// module's semester (see deadlineNotes). Announced as they change.
export function DeadlineNotes({ notes }: { notes: readonly string[] }) {
  return (
    <span aria-live="polite" className="block">
      {notes.map((note) => (
        <span key={note} className="mt-1 block text-foreground">
          {note}
        </span>
      ))}
    </span>
  );
}
