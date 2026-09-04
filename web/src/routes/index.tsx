import { createFileRoute } from "@tanstack/react-router";
import { catalogueApi } from "@/lib/catalogue";
import { Hero } from "@/components/sections/Hero";
import { ServiceCategories } from "@/components/sections/ServiceCategories";
import { PopularTests } from "@/components/sections/PopularTests";
import { HealthPackages } from "@/components/sections/HealthPackages";
import { WhyChooseUs } from "@/components/sections/WhyChooseUs";
import { HealthConcerns } from "@/components/sections/HealthConcerns";
import { HowItWorks } from "@/components/sections/HowItWorks";
import { TrustIndicators } from "@/components/sections/TrustIndicators";
import { DoctorRecommendation } from "@/components/sections/DoctorRecommendation";
import { Certifications } from "@/components/sections/Certifications";
import { Offers } from "@/components/sections/Offers";
import { BlogHighlights } from "@/components/sections/BlogHighlights";
import { Reviews } from "@/components/sections/Reviews";
import { Faq } from "@/components/sections/Faq";
import { AppDownload } from "@/components/sections/AppDownload";

const title = "MD Path Lab — NABL Accredited Lab Tests at Home";
const description =
  "Book 4,500+ lab tests and full body health packages with free home sample collection, same-day NABL-accredited reports and a free doctor consultation.";

// Matches the card count the original static homepage arrays shipped with — the homepage design
// was built around exactly this many cards, so the live query preserves it rather than dumping
// every active Test/Package onto the page.
const POPULAR_TESTS_LIMIT = 8;
const HEALTH_PACKAGES_LIMIT = 4;

export const Route = createFileRoute("/")({
  loader: async () => {
    const [tests, packages] = await Promise.all([
      catalogueApi.listTests().catch(() => []),
      catalogueApi.listPackages().catch(() => []),
    ]);
    return {
      tests: tests.slice(0, POPULAR_TESTS_LIMIT),
      packages: packages.slice(0, HEALTH_PACKAGES_LIMIT),
      totalTestsCount: tests.length,
    };
  },
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const { tests, packages, totalTestsCount } = Route.useLoaderData();
  return (
    <>
      <Hero />
      <ServiceCategories />
      <PopularTests tests={tests} totalTestsCount={totalTestsCount} />
      <HealthPackages packages={packages} />
      <WhyChooseUs />
      <HealthConcerns />
      <HowItWorks />
      <TrustIndicators />
      <DoctorRecommendation />
      <Certifications />
      <Offers />
      <BlogHighlights />
      <Reviews />
      <Faq />
      <AppDownload />
    </>
  );
}
