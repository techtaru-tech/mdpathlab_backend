// Same rule as the API (src/common/mobile-number.ts): 10 digits starting 6-9, not the same digit ten times and
// not a straight run up or down. Lets the form say "invalid" before anything is sent.
export function isGenuineIndianMobile(value: string): boolean {
  if (!/^[6-9]\d{9}$/.test(value)) return false;
  const d = value.split("").map(Number);
  if (d.every((x) => x === d[0])) return false;
  const steps = d.slice(1).map((x, i) => (x - d[i]! + 10) % 10);
  if (steps.every((s) => s === 1) || steps.every((s) => s === 9)) return false;
  return true;
}

export const INVALID_MOBILE_MESSAGE = "Please enter a valid 10-digit mobile number.";
