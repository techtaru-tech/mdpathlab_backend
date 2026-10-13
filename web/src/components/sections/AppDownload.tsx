import { Apple, Bell, FileCheck2, FileText, FlaskConical, Home, Play, Truck } from "lucide-react";
import { Reveal } from "@/components/ui-kit/Reveal";
import { useSiteSettings } from "@/lib/site-settings";
import { cn } from "@/lib/utils";

// What the app's own home screen offers (see the screenshot below) — kept to things the app really does.
const features = [
  { icon: FlaskConical, title: "Book tests and health packages", text: "Search any test or full body checkup and book in a few taps." },
  { icon: Home, title: "Free home sample collection", text: "Pick a slot — a trained phlebotomist comes to your door." },
  { icon: FileText, title: "Upload a prescription", text: "Send a photo; the lab picks the right tests for you." },
  { icon: Bell, title: "Reports, tracking and alerts", text: "Track the phlebotomist live and get your report on your phone." },
];

function StoreButton({
  href,
  icon: Icon,
  small,
  big,
}: {
  href: string | null | undefined;
  icon: typeof Play;
  small: string;
  big: string;
}) {
  const live = Boolean(href);
  return (
    <a
      href={href || undefined}
      target={live ? "_blank" : undefined}
      rel={live ? "noopener noreferrer" : undefined}
      aria-disabled={!live}
      className={cn(
        "relative flex items-center gap-3 rounded-xl bg-foreground px-5 py-3 text-left text-background transition-transform duration-300",
        live ? "hover:-translate-y-1" : "pointer-events-none opacity-70",
      )}
    >
      <Icon className="h-6 w-6 fill-background" />
      <span>
        <span className="block text-[10px] font-semibold uppercase">{small}</span>
        <span className="block text-sm font-extrabold">{big}</span>
      </span>
      {!live ? (
        <span className="absolute -top-2.5 -right-2 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold text-secondary-foreground shadow">
          Coming soon
        </span>
      ) : null}
    </a>
  );
}

export function AppDownload() {
  const settings = useSiteSettings();

  return (
    // Full-width band; short enough to be seen in one screen on a laptop.
    <section className="relative overflow-hidden bg-gradient-to-br from-primary-soft via-card to-secondary-soft/60">
      <div className="container-page">
        <Reveal>
          <div className="relative py-8 lg:py-10">
            <div aria-hidden className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
            <div aria-hidden className="pointer-events-none absolute -right-20 -bottom-28 h-80 w-80 rounded-full bg-secondary/15 blur-3xl" />

            <div className="relative grid items-center gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-12">
              {/* The app's real home screen in a phone frame */}
              <div className="relative mx-auto w-full max-w-[200px] sm:max-w-[215px]">
                <div className="relative rounded-[2.1rem] border-[8px] border-foreground bg-foreground shadow-[var(--shadow-lift)]">
                  <span aria-hidden className="absolute top-1 left-1/2 z-10 h-3.5 w-12 -translate-x-1/2 rounded-full bg-foreground" />
                  <img
                    src="/app/home-screen.webp"
                    width={600}
                    height={1196}
                    loading="lazy"
                    alt="MD Path Lab app home screen: search, Book a Test, Health Packages, Home Visit and Upload Prescription"
                    className="block h-auto w-full rounded-[1.6rem]"
                  />
                </div>

                <div className="absolute bottom-16 -left-10 hidden items-center gap-2.5 rounded-2xl bg-card px-3.5 py-2.5 shadow-[var(--shadow-lift)] sm:flex lg:-left-20">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-success/15 text-success">
                    <FileCheck2 className="h-4.5 w-4.5" />
                  </span>
                  <span>
                    <span className="block text-xs font-extrabold">Report ready</span>
                    <span className="block text-[11px] text-muted-foreground">Open it in the app</span>
                  </span>
                </div>

                <div className="absolute top-28 -right-10 hidden items-center gap-2.5 rounded-2xl bg-card px-3.5 py-2.5 shadow-[var(--shadow-lift)] sm:flex lg:-right-20">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary-soft text-primary">
                    <Truck className="h-4.5 w-4.5" />
                  </span>
                  <span>
                    <span className="block text-xs font-extrabold">Phlebotomist on the way</span>
                    <span className="block text-[11px] text-muted-foreground">Track live</span>
                  </span>
                </div>
              </div>

              <div>
                <p className="inline-flex rounded-full bg-card px-3 py-1 text-[11px] font-bold tracking-wide text-primary uppercase shadow-sm">
                  MD Path Lab app
                </p>
                <h2 className="text-balance-tight mt-3 text-3xl leading-[1.1] font-extrabold text-primary sm:text-4xl">
                  Your lab tests, in your pocket
                </h2>
                <p className="mt-3 max-w-lg text-base leading-relaxed text-muted-foreground">
                  Book tests, get samples collected at home and receive your reports — all from one app.
                </p>

                <ul className="mt-5 grid gap-x-6 gap-y-3.5 sm:grid-cols-2">
                  {features.map((f) => (
                    <li key={f.title} className="flex items-start gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-card text-primary shadow-sm">
                        <f.icon className="h-5 w-5" />
                      </span>
                      <span>
                        <span className="block text-sm font-extrabold text-foreground">{f.title}</span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{f.text}</span>
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="mt-6 flex flex-wrap items-center gap-4">
                  <StoreButton href={settings?.playStoreUrl} icon={Play} small="Get it on" big="Google Play" />
                  <StoreButton href={settings?.appStoreUrl} icon={Apple} small="Download on the" big="App Store" />
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
