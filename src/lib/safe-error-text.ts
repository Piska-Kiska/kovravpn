// src/lib/safe-error-text.ts
//
// An error as a log line that carries no working credentials.
//
// @upstash/redis builds its error text as
//   `${error}, command was: ${JSON.stringify(body)}`
// so a failed ZREM, SET `hy2:<uuid>` or EVAL puts the whole command, keys,
// device UUIDs and script arguments included, into the message, and from
// there into Vercel's logs. Here the command part is cut off, and any UUID
// left elsewhere in the text (a stack line, another client's message) is
// replaced, so a log never holds a device UUID.
//
// Pure, no imports: tests load it under Node's type stripping.

const COMMAND_TAIL = /, command was: .*$/gm;
const UUID_ANY = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** Longest text returned unless the caller asks for another limit. */
export const SAFE_ERROR_MAX = 300;

/**
 * `<name>: <message>` of any thrown value, without an Upstash command tail
 * and with every UUID replaced by `<uuid>`, at most `max` characters. With
 * `stack`, the stack follows, cleaned the same way. Never throws.
 */
export function safeErrorText(err: unknown, opts: { max?: number; stack?: boolean } = {}): string {
  const max = opts.max ?? SAFE_ERROR_MAX;
  let raw: string;
  try {
    if (err instanceof Error) {
      raw = `${err.name}: ${err.message}`;
      if (opts.stack && typeof err.stack === "string") {
        // The stack repeats "<name>: <message>" on its first line: keep the frames only.
        const frames = err.stack.split("\n").filter((line) => /^\s+at\s/.test(line));
        if (frames.length > 0) raw += `\n${frames.join("\n")}`;
      }
    } else {
      raw = String(err);
    }
  } catch {
    raw = "unprintable error";
  }
  return raw.replace(COMMAND_TAIL, "").replace(UUID_ANY, "<uuid>").slice(0, Math.max(0, max));
}
