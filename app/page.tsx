import { Preloader } from "@/components/Preloader";
import { ChapterRail } from "@/components/ChapterRail";
import { Hero } from "@/components/Hero";
import { Pipeline } from "@/components/Pipeline";
import { Section } from "@/components/Section";
import {
  AirQuality, WhySatellites, Observations, AQIIndia, HCHO, Hotspots,
  Biomass, Transport, Model, Results, Insights, Future, FinalImpact, Footer,
} from "@/components/sections";

export default function Home() {
  return (
    <>
      <Preloader />
      <ChapterRail />
      <main>
        <Hero />
        <AirQuality />
        <WhySatellites />
        <Section
          id="pipeline"
          index="04"
          eyebrow="The Method"
          title="From raw signal to insight."
          lede="Six observation streams are fused, processed, learned by a CNN-LSTM, and turned into AQI maps and HCHO hotspots — one continuous scientific system."
        >
          <Pipeline />
        </Section>
        <Observations />
        <AQIIndia />
        <HCHO />
        <Hotspots />
        <Biomass />
        <Transport />
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
