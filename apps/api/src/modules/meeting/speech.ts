import { z } from "zod";
import { RequestError } from "../../lib/api-boundary";
export function speechConfiguration() {
  return process.env.SPEECH_ENABLED === "true" && !!process.env.SPEECH_TOKEN;
}
export async function transcribe(
  audio: string,
  transport: typeof fetch = fetch,
) {
  if (!speechConfiguration())
    throw new RequestError("Local speech service is not configured.", 503);
  const bytes = Buffer.from(audio, "base64");
  if (
    !bytes.length ||
    bytes.length > 160000 ||
    bytes.toString("base64") !== audio
  )
    throw new RequestError("Invalid audio clip.", 400);
  try {
    const response = await transport("http://127.0.0.1:8091/transcribe", {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(45000),
      headers: {
        Authorization: "Bearer " + process.env.SPEECH_TOKEN,
        "Content-Type": "application/octet-stream",
      },
      body: bytes,
    });
    if (response.status === 429)
      throw new RequestError("Speech service busy. Retry this clip.", 429);
    if (!response.ok) throw Error("Speech unavailable");
    return z.object({ text: z.string().max(4000) }).parse(await response.json())
      .text;
  } catch (e) {
    if (e instanceof RequestError) throw e;
    throw new RequestError("Speech processing failed. Retry the clip.", 503);
  }
}
