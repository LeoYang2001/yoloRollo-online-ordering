import type { VercelRequest, VercelResponse } from "@vercel/node";
import { issueToken } from "./_session.js";

/**
 * POST /api/kds/auth
 *
 * Body: { pin: "1234" }
 * Returns: { token: "..." }  (200) on success
 *          { error: "Invalid PIN" } (401) on mismatch
 *
 * Client stores the returned token in localStorage and sends it as
 * `Authorization: Bearer <token>` on subsequent /api/kds/* requests.
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const expected = process.env.KDS_PIN;
  if (!expected) {
    return res
      .status(500)
      .json({ error: "KDS_PIN env var not set on server" });
  }
  const provided = String((req.body as { pin?: unknown })?.pin ?? "");
  if (!provided || provided !== expected) {
    // Soft delay to discourage rapid PIN-guessing.
    await new Promise((r) => setTimeout(r, 400));
    return res.status(401).json({ error: "Invalid PIN" });
  }
  return res.status(200).json({ token: issueToken() });
}
