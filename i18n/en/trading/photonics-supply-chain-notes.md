---
translatedFrom: "trading/photonics-supply-chain-notes"
lang: "en"
title: "The Optical Module Supply Chain: Thoughts and Takeaways"
excerpt: "Breaking down the 7-step supply chain behind optical interconnects in AI data centers: the scarce steps capture the most value, and the bottlenecks are all upstream."
readTime: 6
sourceHash: "48a9aed32b608452"
---

**A full-chain analysis of the photonics supply chain** — based on a 21 February 2026 post by @crux_capital_ (Gaetano) ([original post](https://x.com/crux_capital_/status/2025323778474164601))

This is a typical entry in his "Education Saturday" series of explainers. The author, an independent investor focused on photonics, follows up on his 7 February post "Photonics Glossary and Key Terms" (his glossary post) with a clearly structured infographic that systematically breaks down the complete "0 to 7" supply chain of high-speed optical interconnects in AI data centers.

- **Core thesis** (the line at the bottom of the infographic): **"The scarce steps capture the most value. Bottlenecks are upstream."** This directly explains why, even as demand for AI optical modules is exploding, the players that actually make money and hold the most pricing power tend to sit upstream in raw materials, substrates and epitaxy, not downstream in module assembly.

## 1. The 7 steps (actually steps 0–7), layer by layer

**Step 0: Mining & Refining**

The raw material is **indium**, the core element of high-performance data-center lasers (essential for compound semiconductors such as InGaAsP). Indium has no mines of its own: 100% of it is a by-product of zinc smelting, and the global recovery rate is only about 25% (75% is lost with the zinc residue). Supply depends heavily on the zinc-mining cycle and on recovery incentives, and both price and capacity swing sharply.

- **Insight**: Indium is a textbook "associated mineral" and "the bottleneck of bottlenecks." Upstream raw-material supply is almost completely inelastic.

**Step 1: Substrate — InP wafers**

Indium and phosphorus are synthesized into single-crystal indium phosphide (InP) → sliced into wafers. The mainstream is now moving from 4-inch/5-inch to 6-inch (silicon is already at 12-inch/300 mm). InP wafers are brittle and expensive, and defect density is extremely hard to control.

- **Insight**: The gap in wafer size means a several-fold difference in chip count per unit area (6-inch ≈ 4× a 3-inch), which directly caps overall capacity. The original post also notes that part of the substrate capacity is constrained by export licensing, creating a structural choke point where "the goods exist but can't be shipped."

**Step 2: Epitaxial Growth**

MOCVD/MBE tools grow nanometer-scale (a few nm) multi-quantum-well structures on the InP substrate, layer by layer. The composition of each layer precisely determines the laser's wavelength, threshold current and temperature stability. A 1% deviation scraps the whole wafer.

- **Insight**: This is the most underrated "hidden bottleneck." Only a handful of tools and teams worldwide can deliver data-center-grade, high-reliability epitaxy; expansion cycles are long and the know-how barrier is extremely high. It is almost never discussed publicly, yet it is the most important moat behind gross margin.

**Step 3: Wafer Fabrication**

Lithography, etching and deposition form microstructures such as waveguides, DFB/DBR cavities and modulators. **This requires a dedicated photonics fab**; a standard silicon fab can't be used (the process compatibility and cleanliness requirements differ). Building and qualifying a fab often takes 3–5 years, and qualified capacity worldwide is very limited.

- **Insight**: This step also explains why moving from small InP wafers to 6-inch cuts substrate consumption so sharply (roughly 4× as many chips per wafer): it is effectively an indirect capacity expansion.

**Step 4: Dicing & Yield**

After the wafer is diced into dies, 100% of them are tested. **Yield is the ultimate variable that determines the cost of each chip**, and low yield eats straight into gross margin.

- **Insight**: When looking at how gross margins change at companies like these, yield and process iteration often matter more than downstream assembly. The yield curve is a hidden metric worth tracking over the long term.

**Step 5: Component Assembly**

The laser die has to be aligned to the fiber with sub-micron precision (&lt;0.5μm) and integrated with a photodetector (PD) and a modulator (EML/MZM), then sealed in a **hermetic package**: a ceramic-and-metal housing that keeps out moisture and dust.

- **Insight**: Hermetic packages are a bottleneck in their own right (few suppliers, long lead times). The high temperature and humidity of data-center environments impose strict reliability requirements, which makes automating this step among the hardest anywhere in the world.

**Step 6: Transceiver Module**

Optical components + DSP (Coherent/PAM4) + PCB + housing → pluggable optical module (800G/1.6T). Final testing of each module is slow and expensive, and it forms a hidden ceiling on shipment rates.

- **Insight**: CPO (Co-Packaged Optics) and ELS (External Light Source) architectures exist precisely to get around this bottleneck: they put the optical engine right next to the switch chip and cut out the pluggable test step.

**Step 7: Data Center Deployment**

The modules plug into switches, and ultra-low-loss fiber provides the optical interconnect between servers, racks and buildings.

- **Insight**: Fiber itself is highly mature, but with the trend toward co-packaged optics, optics is moving from "peripheral interconnect" to "on-chip / in-package interconnect," and the market is expanding from "scale-out" to "scale-up."

## 2. Key bottlenecks and where the value sits

1. **Structural upstream shortage (raw material → substrate → epitaxy)**: sets the capacity ceiling for the whole industry. Demand comes from AI clusters (a single cluster already uses hundreds of thousands of optical modules), while supply is constrained on three fronts: physics (InP crystal growth), equipment (MOCVD) and geopolitics (Chinese export licensing).
2. **Midstream process barriers (Fab + Yield + Hermetic)**: high capex, scarce talent and know-how that takes more than a decade to build up, which produces an oligopoly.
3. **Downstream modularization (Assembly + Transceiver)**: relatively standardized and more competitive, but new architectures such as CPO/OCS/ELS will reshape the value chain.
4. **The infographic's core conclusion**: **scarcity is pricing power**. Every 1% of added upstream capacity acts as an amplifier downstream; every 1% gain in downstream yield lifts gross margin directly.

## 3. The one-line conclusion

At heart, the post is a "map plus bottleneck diagnosis" of the photonics supply chain: the constraint is not on the demand side but in upstream physical limits (crystal growth, epitaxy) and geopolitics (export licensing). Once you understand why value concentrates in the scarce steps, the industry's news and earnings reports become much easier to read.

The infographic in the original post and the author's earlier glossary post make good introductory material, and I recommend reading them side by side.

---

*These are study notes on public material. They reflect only my own understanding and do not constitute investment advice of any kind.*
