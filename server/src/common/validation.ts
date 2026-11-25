import type { z } from "zod";
import { BadRequestError } from "./errors.js";

// Turn a ZodError into a flat message for the client.
export function zodMessage(err: z.ZodError): string {
  return err.issues
    .map((i) => `${i.path.join(".") || "field"}: ${i.message}`)
    .join("; ");
}

// Parse input against a schema, returning typed data or throwing a
// BadRequestError (→ 400 { error }) with a flattened message. Keeps validation
// uniform across routes and preserves the existing error-body shape.
export function parse<S extends z.ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) throw new BadRequestError(zodMessage(result.error));
  return result.data;
}
