import { useNavigate } from "@tanstack/react-router";
import { Facebook, Instagram, Mail, MapPin, Phone } from "lucide-react";

const socialLinks = [
  { label: "MD Path Lab on Facebook", href: "https://www.facebook.com/Mdpathlabs/", Icon: Facebook },
  { label: "MD Path Lab on Instagram", href: "https://www.instagram.com/pathlabmd/", Icon: Instagram },
];
import { apiFileUrl } from "@/lib/api";
import { useSiteSettings } from "@/lib/site-settings";
import { useCities } from "@/lib/cities";
import { cities as staticCities } from "@/data/site";
import { useSelectedCity } from "@/lib/selectedCity";

// Every entry points at a real page. Package/test links use the catalogue's actual slugs — if an
// admin renames one of these in the catalogue, update its slug here too.
const columns: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Health Packages",
    links: [
      { label: "Advanced Full Body Checkup", href: "/packages/md-path-lab-advanced-full-body" },
      { label: "Essential Health Checkup", href: "/packages/md-path-lab-essential-health-checkup" },
      { label: "Women's Wellness", href: "/packages/md-path-lab-women-s-wellness" },
      { label: "Senior Citizen Care", href: "/packages/md-path-lab-senior-citizen-care" },
      { label: "Diabetes Screening", href: "/packages/diabetes-screening-package" },
      { label: "Cardiac Health Screening", href: "/packages/cardiac-health-marker-package" },
    ],
  },
  {
    title: "Popular Tests",
    links: [
      { label: "Complete Blood Count", href: "/tests/complete-blood-count-cbc" },
      { label: "Thyroid Profile (T3 T4 TSH)", href: "/tests/thyroid-profile-total-t3-t4-tsh" },
      { label: "HbA1c", href: "/tests/hba1c-glycated-haemoglobin" },
      { label: "Lipid Profile", href: "/tests/lipid-profile" },
      { label: "Vitamin D", href: "/tests/vitamin-d-25-oh" },
      { label: "Liver Function Test", href: "/tests/liver-function-test-lft" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About MD Path Lab", href: "/about" },
      { label: "Franchise Opportunity", href: "/franchise" },
      { label: "Lifestyle Disorders", href: "/lifestyle-disorders" },
      { label: "Health Blog", href: "/blog" },
      { label: "Corporate Wellness", href: "/contact" },
      { label: "Careers", href: "/careers" },
    ],
  },
  {
    title: "Support",
    links: [
      { label: "Download Reports", href: "/dashboard?section=reports" },
      { label: "Track My Sample", href: "/dashboard?section=bookings" },
      { label: "Upload Prescription", href: "/dashboard?section=prescriptions" },
      { label: "Book a Home Visit", href: "/home-visit" },
      { label: "Privacy Policy", href: "/privacy-policy" },
      { label: "Terms of Service", href: "/terms-conditions" },
      { label: "Contact Us", href: "/contact" },
    ],
  },
];

export function Footer() {
  const settings = useSiteSettings();
  const liveCities = useCities();
  const cities = liveCities && liveCities.length > 0 ? liveCities.map((c) => c.name) : staticCities;
  const { selectCityByName } = useSelectedCity();
  const navigate = useNavigate();

  return (
    // --callback-bar-h is the open "Get a call back" bar's height (0 when closed — see CallbackBar), so the last
    // footer lines can scroll above it without leaving empty space when it's closed.
    <footer className="bg-primary text-primary-foreground" style={{ paddingBottom: "var(--callback-bar-h, 0px)" }}>
      <div className="container-page pt-16 pb-6 lg:pt-20 lg:pb-7">
        <div className="grid gap-12 lg:grid-cols-[1.15fr_2.85fr]">
          <div>
            <div className="flex items-center gap-3">
              <img
                src={settings?.logoUrl ? apiFileUrl(settings.logoUrl) : "/logo.png"}
                alt="MD Path Lab"
                className="h-12 w-12 shrink-0 rounded-full object-contain"
              />
              <span className="text-xl font-extrabold tracking-tight">
                MD Path Lab
              </span>
            </div>
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-primary-foreground/70">
              India's trusted preventive health testing platform. NABL accredited laboratories, certified
              phlebotomists and doctor-reviewed reports — delivered to your doorstep.
            </p>
            <div className="mt-6 space-y-3 text-sm text-primary-foreground/80">
              <p className="flex items-center gap-3">
                <Phone className="h-4 w-4 shrink-0" />
                {settings?.phone || "8400100800 (24x7)"}
              </p>
              <p className="flex items-center gap-3">
                <Mail className="h-4 w-4 shrink-0" /> {settings?.email || "mdpathlabs2021@gmail.com"}
              </p>
              <p className="flex items-start gap-3 whitespace-pre-line">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                {settings?.address ||
                  "MD PATHLAB, 104A/264, Main, P Rd, Rambagh Chauraha, Nehru Nagar, Ram Bagh, Kanpur, Uttar Pradesh 208012"}
              </p>
            </div>
            <div className="mt-6 flex gap-3">
              {socialLinks.map(({ label, href, Icon }) => (
                <a
                  key={href}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  title={label}
                  className="grid h-10 w-10 place-items-center rounded-xl border border-primary-foreground/15 bg-primary-foreground/5 transition-colors hover:bg-primary-foreground/15"
                >
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
            {columns.map((col) => (
              <div key={col.title}>
                <h3 className="text-sm font-bold tracking-wide">{col.title}</h3>
                <ul className="mt-4 space-y-2.5">
                  {col.links.map((l) => (
                    <li key={l.label}>
                      <a
                        href={l.href}
                        className="text-sm text-primary-foreground/65 transition-colors hover:text-primary-foreground"
                      >
                        {l.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-14 border-t border-primary-foreground/12 pt-8">
          <h3 className="text-sm font-bold">Now serving in</h3>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
            {cities.map((c) => (
              // Switches the site to this city (same as the header's location picker) and shows its tests.
              <button
                key={c}
                type="button"
                onClick={() => {
                  selectCityByName(c);
                  window.scrollTo({ top: 0 });
                  navigate({ to: "/tests" });
                }}
                className="text-sm text-primary-foreground/60 transition-colors hover:text-primary-foreground"
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* sm:pr-20 keeps the last row clear of the round call button fixed in the bottom-right corner. */}
        <div className="mt-10 flex flex-col gap-3 border-t border-primary-foreground/12 pt-6 text-xs text-primary-foreground/55 sm:flex-row sm:items-center sm:justify-between sm:pr-20">
          <p>© {new Date().getFullYear()} Madhumesh Diagnostics Pvt. Ltd. All rights reserved.</p>
          <p>Reports are for diagnostic guidance and do not replace a physician's consultation.</p>
          <p>
            Developed by{" "}
            <a
              href="https://techtaru.com/"
              target="_blank"
              rel="noopener"
              className="font-semibold text-primary-foreground/80 underline-offset-2 hover:text-primary-foreground hover:underline"
            >
              TechTaru Digital
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
