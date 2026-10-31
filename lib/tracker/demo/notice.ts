// The demo is read-only: every mutation does nothing and says so. The banner in
// the demo layout listens for this event and shows the message.
export const DEMO_NOTICE = "Demo: changes aren't saved";
const EVENT = "tracker-demo-notice";

// Returns the message too, so a mutation that reports an error string can pass it on.
export function demoNotice(): string {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT));
  return DEMO_NOTICE;
}

export function onDemoNotice(listener: () => void): () => void {
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
