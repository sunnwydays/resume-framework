import { expect, test } from "vitest";

// Guards the config itself: if the TZ env stops reaching the workers, every
// date test below would silently run in the machine's own zone.
test("tests run in the zone the project asks for", () => {
  const winter = new Date(2026, 0, 15, 12).getTimezoneOffset();
  const summer = new Date(2026, 6, 15, 12).getTimezoneOffset();
  if (process.env.TZ === "America/Toronto") {
    expect(winter).toBe(300); // EST, UTC-5
    expect(summer).toBe(240); // EDT, UTC-4
  } else {
    expect(process.env.TZ).toBe("Pacific/Auckland");
    expect(winter).toBe(-780); // NZDT, UTC+13
    expect(summer).toBe(-720); // NZST, UTC+12
  }
});
