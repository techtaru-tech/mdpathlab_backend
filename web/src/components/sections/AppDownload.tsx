import {
  Apple,
  Bell,
  ChevronRight,
  FlaskConical,
  MapPin,
  Play,
  Scan,
  Search,
  ShoppingCart,
  Stethoscope,
} from "lucide-react";
import { Reveal } from "@/components/ui-kit/Reveal";

const appCategories = [
  { icon: FlaskConical, label: "Blood Tests", offer: "Up to 79% off", tint: "bg-primary-soft text-primary" },
  { icon: Scan, label: "X-Ray, Scans & MRI", offer: "Up to 70% off", tint: "bg-secondary-soft text-secondary" },
];

export function AppDownload() {
  return (
    <section className="overflow-hidden py-10 lg:py-16">
      <div className="container-page">
        <Reveal>
          <div className="grid items-center gap-12 lg:grid-cols-[0.85fr_1.15fr]">
            <div className="relative mx-auto h-[420px] w-full max-w-xs lg:h-[460px]">
              <div className="absolute top-6 -left-2 w-56 -rotate-[14deg] rounded-[2rem] border-[6px] border-border bg-card shadow-[var(--shadow-lift)] sm:w-60">
                <div className="overflow-hidden rounded-[1.6rem]">
                  <div className="bg-secondary px-4 pt-5 pb-8">
                    <p className="text-[10px] font-bold text-secondary-foreground/80">Full body checkup</p>
                    <p className="mt-1 text-sm font-extrabold text-secondary-foreground">94 tests</p>
                  </div>
                  <div className="bg-card p-3">
                    <span className="inline-flex rounded-full bg-warning/20 px-2 py-0.5 text-[9px] font-bold text-foreground uppercase">
                      New offer
                    </span>
                    <p className="mt-1.5 text-xs font-extrabold text-primary">₹1599</p>
                  </div>
                </div>
              </div>

              <div className="absolute inset-0 mx-auto w-64 rotate-[8deg] rounded-[2.25rem] border-[6px] border-foreground/90 bg-card p-1.5 shadow-[var(--shadow-lift)] sm:w-72">
                <div className="relative overflow-hidden rounded-[1.85rem] bg-muted">
                  <div className="bg-primary px-5 pt-5 pb-9 text-primary-foreground">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-[11px] text-primary-foreground/75">Welcome,</p>
                        <p className="text-base font-extrabold">Ananya</p>
                        <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-primary-foreground/85">
                          <MapPin className="h-3 w-3" /> Delhi NCR <ChevronRight className="h-3 w-3" />
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="relative grid h-8 w-8 place-items-center rounded-full bg-primary-foreground/15">
                          <Bell className="h-4 w-4" />
                          <span className="absolute -top-1 -right-1 grid h-4 w-4 place-items-center rounded-full bg-secondary text-[8px] font-bold text-secondary-foreground">
                            3
                          </span>
                        </span>
                        <span className="relative grid h-8 w-8 place-items-center rounded-full bg-primary-foreground/15">
                          <ShoppingCart className="h-4 w-4" />
                          <span className="absolute -top-1 -right-1 grid h-4 w-4 place-items-center rounded-full bg-secondary text-[8px] font-bold text-secondary-foreground">
                            1
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="relative -mt-5 mx-4 flex items-center gap-2 rounded-xl bg-card px-3 py-2.5 shadow-[var(--shadow-card)]">
                    <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="text-[11px] font-medium text-muted-foreground">Search for tests…</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 p-4 pt-3">
                    {appCategories.map((c) => (
                      <div key={c.label} className={`rounded-xl p-3 ${c.tint}`}>
                        <c.icon className="h-5 w-5" />
                        <p className="mt-2 text-[10px] leading-tight font-bold text-foreground">{c.label}</p>
                        <p className="mt-1 text-[9px] font-bold opacity-80">{c.offer}</p>
                      </div>
                    ))}
                    <div className="col-span-2 flex items-center gap-2.5 rounded-xl bg-success-soft p-3">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-card text-success">
                        <Stethoscope className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-[10px] font-bold text-foreground">Doctor & Diet Consult</p>
                        <p className="text-[9px] font-bold text-success">Up to 75% off</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-balance-tight text-3xl leading-[1.1] font-extrabold text-primary sm:text-4xl">
                Download Our App Now
              </h2>
              <p className="mt-4 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg">
                Tracking health status made easy with the app. Now available on both Google Play Store and
                App Store. Book health tests and access your smart reports and health trackers anytime
                anywhere.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-4">
                <button className="flex items-center gap-3 rounded-xl bg-foreground px-5 py-3 text-left text-background transition-transform duration-300 hover:-translate-y-1">
                  <Play className="h-6 w-6 fill-background" />
                  <span>
                    <span className="block text-[10px] font-semibold">GET IT ON</span>
                    <span className="block text-sm font-extrabold">Google Play</span>
                  </span>
                </button>
                <button className="flex items-center gap-3 rounded-xl bg-foreground px-5 py-3 text-left text-background transition-transform duration-300 hover:-translate-y-1">
                  <Apple className="h-6 w-6 fill-background" />
                  <span>
                    <span className="block text-[10px] font-semibold">Download on the</span>
                    <span className="block text-sm font-extrabold">App Store</span>
                  </span>
                </button>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
