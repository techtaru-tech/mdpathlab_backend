// A real Indian mobile number: 10 digits starting 6-9, and not an obviously made-up pattern — the same digit ten
// times (9999999999) or a straight run up or down (6789012345, 9876543210). Used to keep fake and scripted
// callback requests from reaching the lab.
export function isGenuineIndianMobile(value: string): boolean {
  if (!/^[6-9]\d{9}$/.test(value)) return false;
  const d = value.split('').map(Number);
  if (d.every((x) => x === d[0])) return false;
  const steps = d.slice(1).map((x, i) => (x - d[i]! + 10) % 10);
  if (steps.every((s) => s === 1) || steps.every((s) => s === 9)) return false;
  return true;
}
