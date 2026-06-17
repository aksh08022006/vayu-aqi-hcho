import { Preloader } from "@/components/Preloader";
import { ChapterRail } from "@/components/ChapterRail";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Hero } from "@/components/Hero";
import { Pipeline } from "@/components/Pipeline";
import { Section } from "@/components/Section";
import {
  MissionSnapshot, AirQuality, Signals, WhySatellites, Observations, AQIIndia,
  HCHO, Hotspots, Biomass, Transport, PolicyActionBoard, Evidence,
  Model, Results, Insights, Future, FinalImpact, Footer,
} from "@/components/sections";

export default function Home() {
  return (
    <>
      <Preloader />
      <ChapterRail />
      <ThemeToggle />
      <main>
        <Hero />
        <MissionSnapshot />
        <AirQuality />
        <Signals />
        <WhySatellites />
        <Section
          id="pipeline"
          index="06"
          eyebrow="The Method"
          title="From raw signal to insight."
          lede="Six observation streams are fused, quality-screened, gridded and converted into AQI maps, HCHO anomaly layers and source-attribution hypotheses."
        >
          <Pipeline />
        </Section>
        <Observations />
        <AQIIndia />
        <HCHO />
        <Hotspots />
        <Biomass />
        <Transport />
        <PolicyActionBoard />
        <Evidence />
        <Model />
        <Results />
        <Insights />
        <Future />
        <FinalImpact />
      </main>
      <Footer />
    </>
  );
}
