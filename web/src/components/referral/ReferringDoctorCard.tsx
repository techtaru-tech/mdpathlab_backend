import { useEffect, useState } from "react";
import { partnerTitle, referralApi, type ReferralPartnerPublic } from "@/lib/referral-api";

// "Your referring doctor" line on the dashboard's Profile section. Renders nothing while the feature is off (the
// API answers 404), when there is no referral, or on any error — so it can never disturb the profile page.
export function ReferringDoctorCard() {
  const [data, setData] = useState<{ partner: ReferralPartnerPublic; boundAt: string } | null>(null);

  useEffect(() => {
    referralApi
      .mine()
      .then((res) => setData(res.referral))
      .catch(() => setData(null));
  }, []);

  if (!data) return null;
  return (
    <div className="mb-4 rounded-xl border border-border bg-muted/40 px-4 py-3">
      <p className="text-[11px] font-semibold text-muted-foreground">Referring doctor</p>
      <p className="mt-1 text-sm font-bold">
        {partnerTitle(data.partner)}
        <span className="ml-2 text-xs font-medium text-muted-foreground">
          since {new Date(data.boundAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
        </span>
      </p>
    </div>
  );
}
