import { Facebook, Instagram, Linkedin, Mail, MapPin, Phone, Youtube } from "lucide-react";
import { cities } from "@/data/site";

const columns = [
  {
    title: "Health Packages",
    links: [
      "Advanced Full Body Checkup",
      "Essential Health Checkup",
      "Women's Wellness Panel",
      "Senior Citizen Care",
      "Diabetes Care Panel",
      "Heart Health Screening",
    ],
  },
  {
    title: "Popular Tests",
    links: [
      "Complete Blood Count",
      "Thyroid Profile (T3 T4 TSH)",
      "HbA1c",
      "Lipid Profile",
      "Vitamin D",
      "Liver Function Test",
    ],
  },
  {
    title: "Company",
    links: ["About MD Path Lab", "Our Laboratories", "Careers", "Corporate Wellness", "Partner With Us", "Press & Media"],
  },
  {
    title: "Support",
    links: ["Download Reports", "Track My Sample", "Refund Policy", "Privacy Policy", "Terms of Service", "Contact Us"],
  },
];

export function Footer() {
  return (
    <footer className="bg-primary text-primary-foreground">
      <div className="container-page py-16 lg:py-20">
        <div className="grid gap-12 lg:grid-cols-[1.15fr_2.85fr]">
          <div>
            <div className="flex items-center gap-3">
              <img
                src="/logo.png"
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
                <Phone className="h-4 w-4 shrink-0" />8400100800 (24x7)
              </p>
              <p className="flex items-center gap-3">
                <Mail className="h-4 w-4 shrink-0" /> mdpathlabs2021@gmail.com
              </p>
              <p className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" /> MD PATHLAB
104A/264, Main, P Rd, Rambagh Chauraha,
Nehru Nagar, Ram Bagh, Kanpur, Uttar
Pradesh 208012
              </p>
            </div>
            <div className="mt-6 flex gap-3">
              {[Facebook, Instagram, Linkedin, Youtube].map((Icon, i) => (
                <a
                  key={i}
                  href="#top"
                  aria-label="Social link"
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
                    <li key={l}>
                      <a
                        href="#top"
                        className="text-sm text-primary-foreground/65 transition-colors hover:text-primary-foreground"
                      >
                        {l}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-14 border-t border-primary-foreground/12 pt-8">
          <h3 className="text-sm font-bold">Serving 1,000+ cities across India</h3>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
            {cities.map((c) => (
              <a
                key={c}
                href="#top"
                className="text-sm text-primary-foreground/60 transition-colors hover:text-primary-foreground"
              >
                {c}
              </a>
            ))}
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-primary-foreground/12 pt-8 text-xs text-primary-foreground/55 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Madhumesh Diagnostics Pvt. Ltd. All rights reserved.</p>
          <p>Reports are for diagnostic guidance and do not replace a physician's consultation.</p>
        </div>
      </div>
    </footer>
  );
}
