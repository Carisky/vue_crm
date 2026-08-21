export type ParsedRange = { start: number; end: number };

export class RangeNotSatisfiableError extends Error {
  readonly size: number;

  constructor(size: number) {
    super("Requested range is not satisfiable.");
    this.name = "RangeNotSatisfiableError";
    this.size = size;
  }
}

const BYTE_RANGE = /^bytes=(\d*)-(\d*)$/u;

function rejectRange(size: number): never {
  throw new RangeNotSatisfiableError(size);
}

function parseOffset(value: string, size: number): number {
  if (!/^\d+$/u.test(value)) rejectRange(size);
  const offset = Number(value);
  if (!Number.isSafeInteger(offset)) rejectRange(size);
  return offset;
}

export function parseSingleRange(
  value: string | undefined,
  size: number,
): ParsedRange | null {
  if (value === undefined) return null;
  if (!Number.isSafeInteger(size) || size < 0) rejectRange(size);

  const match = BYTE_RANGE.exec(value);
  if (!match || size === 0) rejectRange(size);

  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) rejectRange(size);

  if (!rawStart) {
    const suffixLength = parseOffset(rawEnd, size);
    if (suffixLength === 0) rejectRange(size);
    return {
      start: Math.max(0, size - suffixLength),
      end: size - 1,
    };
  }

  const start = parseOffset(rawStart, size);
  if (start >= size) rejectRange(size);

  if (!rawEnd) return { start, end: size - 1 };

  const requestedEnd = parseOffset(rawEnd, size);
  if (requestedEnd < start) rejectRange(size);
  return { start, end: Math.min(requestedEnd, size - 1) };
}
