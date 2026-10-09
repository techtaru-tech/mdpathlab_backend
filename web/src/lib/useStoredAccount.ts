import { useEffect, useState } from "react";

// The signed-in admin/lab name lives in localStorage, which the server render cannot see. Reading it during
// render made the server HTML (empty) differ from the browser's (the name), so React threw a hydration error and
// rebuilt every admin/lab page. Reading it after mount keeps both renders identical.
export function useStoredAccount<T>(read: () => T | null): T | null {
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => {
    setValue(read());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return value;
}
