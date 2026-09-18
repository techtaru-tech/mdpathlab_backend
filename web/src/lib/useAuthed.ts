import { useEffect, useState } from "react";
import { session } from "@/lib/api";

/**
 * Whether the current visitor has a saved session — `null` until we actually know.
 *
 * `session.getToken()` reads localStorage, which doesn't exist during SSR. Computing it directly
 * at render time made every authed page render the signed-out view on the server and then swap
 * to the signed-in view the instant client hydration ran — a text/DOM mismatch that forces React
 * to throw away and rebuild the whole tree (visible as a "Hydration failed" warning). On a slower
 * device that rebuild isn't instant, so a user landing back on an authed page — e.g. right after
 * cancelling a booking — could see a flash of "Log in to view this booking" before the real
 * content took over, which reads exactly like the app logged them out even though the session
 * was never touched.
 *
 * Server and the first client render both return `null` here, so they match; the real value only
 * fills in a tick later, client-side, once we can safely read localStorage.
 */
export function useAuthed(): boolean | null {
  const [authed, setAuthed] = useState<boolean | null>(null);
  useEffect(() => {
    setAuthed(session.getToken() !== null);
  }, []);
  return authed;
}
