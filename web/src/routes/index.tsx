import { createFileRoute } from "@tanstack/react-router";
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
import { Reviews } from "@/components/sections/Reviews";
import { Faq } from "@/components/sections/Faq";
import { AppDownload } from "@/components/sections/AppDownload";

const title = "MD Path Lab — NABL Accredited Lab Tests at Home";
const description =
  "Book 4,500+ lab tests and full body health packages with free home sample collection, same-day NABL-accredited reports and a free doctor consultation.";

export const Route = createFileRoute("/")({
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
  return (
    <>
      <Hero />
      <ServiceCategories />
      <PopularTests />
      <HealthPackages />
      <WhyChooseUs />
      <HealthConcerns />
      <HowItWorks />
      <TrustIndicators />
      <DoctorRecommendation />
      <Certifications />
      <Reviews />
      <Faq />
      <AppDownload />
    </>
  );
}
