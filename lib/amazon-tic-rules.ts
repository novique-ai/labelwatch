// Amazon 2026 TIC (Third-party Ingredient Compliance) ruleset for dietary supplements.
// Bead infrastructure-2e17. Citation audit pending in infrastructure-u297.
//
// Rules are organized by IngredientCategory and mirror the category selector
// customers configure at /onboard. Updated manually when Amazon publishes
// policy changes — last reviewed 2026-05-09.
//
// Canonical sources (see /references for the customer-facing list):
//   - https://sellercentral.amazon.com/help/hub/reference/external/201829010
//   - https://sellercentral.amazon.com/help/hub/reference/external/GNHU43TN2RHER9BQ
//
// severity:
//   critical — listing takedown risk if non-compliant
//   major    — warning / suppression risk
//   minor    — best-practice; non-compliance unlikely to trigger enforcement alone

import type { IngredientCategory } from "@/types/database.types";

export const RULESET_LAST_REVIEWED = "2026-05-09";

export const AMAZON_TIC_POLICY_URL =
  "https://sellercentral.amazon.com/help/hub/reference/external/201829010";

export const AMAZON_FAST_TRACK_URL =
  "https://sellercentral.amazon.com/help/hub/reference/external/GNHU43TN2RHER9BQ";

export type RuleSeverity = "critical" | "major" | "minor";
export type RuleStatus = "pass" | "fail" | "warn" | "unknown";

export interface TicRule {
  id: string;
  title: string;
  requirement: string;
  reference: string;
  severity: RuleSeverity;
}

export interface TicRuleResult extends TicRule {
  status: RuleStatus;
  evidence: string;
  recommendation: string;
}

// Rules that apply to every supplement category regardless of type.
export const GENERAL_RULES: TicRule[] = [
  {
    id: "GEN-001",
    title: "Certificate of Analysis from accredited lab",
    requirement:
      "A current CoA from an ISO 17025-accredited third-party laboratory must be on file. Amazon may request it at any time.",
    reference: "Amazon Seller Central — Dietary Supplements listing policy §2.1",
    severity: "critical",
  },
  {
    id: "GEN-002",
    title: "CoA dated within 12 months",
    requirement:
      "The CoA must have been issued within the last 12 months. CoAs older than 12 months do not satisfy Amazon's currency requirement.",
    reference: "Amazon Dietary Supplements policy §2.1",
    severity: "critical",
  },
  {
    id: "GEN-003",
    title: "Label ingredients match CoA",
    requirement:
      "Every ingredient declared on the Supplement Facts Panel must appear in the CoA at the stated quantity (±10%). Unlisted actives are a critical violation.",
    reference: "21 CFR 101.36; Amazon supplement policy §3.2",
    severity: "critical",
  },
  {
    id: "GEN-004",
    title: "DSHEA-compliant Supplement Facts Panel",
    requirement:
      "The product must carry a properly formatted Supplement Facts Panel per 21 CFR 101.36, including serving size, servings per container, and percent Daily Value where established.",
    reference: "21 CFR 101.36; DSHEA 1994",
    severity: "critical",
  },
  {
    id: "GEN-005",
    title: "No unauthorized disease claims",
    requirement:
      "Listing copy must not diagnose, cure, treat, mitigate, or prevent any disease. Structure/function claims are allowed with an FTC-style disclaimer. Disease claims trigger Amazon removal and potential FDA warning letter.",
    reference: "21 CFR 101.93; FTC Act §5; Amazon supplement policy §4",
    severity: "critical",
  },
  {
    id: "GEN-006",
    title: "No New Dietary Ingredient (NDI) without FDA notification",
    requirement:
      "Any ingredient not marketed in the US as a dietary supplement before October 15, 1994 requires a pre-market NDI notification to FDA. Marketing without it is an adulteration risk.",
    reference: "21 CFR 190.6; DSHEA §8",
    severity: "critical",
  },
  {
    id: "GEN-007",
    title: "cGMP manufacturing compliance",
    requirement:
      "Product must be manufactured in an FDA-registered facility following current Good Manufacturing Practices (21 CFR Part 111). Amazon may request a facility registration number.",
    reference: "21 CFR Part 111",
    severity: "major",
  },
  {
    id: "GEN-008",
    title: "No FDA-prohibited ingredients",
    requirement:
      "Product must not contain any ingredient currently prohibited by FDA enforcement action (e.g., DMAA, androstenedione, ephedra alkaloids, aristolochic acid, kava in high doses).",
    reference: "FDA Dietary Supplement Ingredient Advisory List",
    severity: "critical",
  },
];

// Per-category rules layered on top of GENERAL_RULES.
export const CATEGORY_RULES: Partial<Record<IngredientCategory, TicRule[]>> = {
  protein: [
    {
      id: "PRO-001",
      title: "Complete amino acid profile on CoA",
      requirement:
        "CoA must include a full amino acid panel confirming protein content by amino acid sum, not just Kjeldahl nitrogen. Nitrogen-to-protein conversion must be disclosed.",
      reference: "Amazon protein supplement requirements; AOAC 994.12",
      severity: "critical",
    },
    {
      id: "PRO-002",
      title: "No protein spiking",
      requirement:
        "Non-protein nitrogen compounds (taurine, glycine, creatine, urea, melamine) must not be listed in the serving-size stack in a way that inflates the declared protein content. Individual amino acids added for protein inflation are a deceptive-practice flag.",
      reference: "FTC Act §5; Amazon supplement policy §4.1",
      severity: "critical",
    },
    {
      id: "PRO-003",
      title: "Heavy metals tested (Prop 65 limits)",
      requirement:
        "CoA must include heavy metal results for lead, arsenic, cadmium, and mercury. Lead must be <0.5 µg/serving (California Prop 65 warning threshold for reproductive toxicity).",
      reference: "California Prop 65; Amazon supplement CoA requirements",
      severity: "major",
    },
    {
      id: "PRO-004",
      title: "Banned substance screen (sport-positioned products)",
      requirement:
        "If the listing targets athletes or uses sport-performance language, a banned substance screen (NSF Certified for Sport or Informed Sport) is required. Absence is a major risk for professional-athlete customers.",
      reference: "WADA Prohibited List; NSF/ANSI 173",
      severity: "major",
    },
  ],

  vitamins: [
    {
      id: "VIT-001",
      title: "Potency within ±10% of label claim",
      requirement:
        "Third-party CoA must confirm every vitamin at ≥90% of label potency. Over-potency (>120% label) also warrants disclosure for fat-soluble vitamins (A, D, E, K) due to toxicity risk.",
      reference: "USP <2040>; Amazon supplement CoA requirements §2.3",
      severity: "critical",
    },
    {
      id: "VIT-002",
      title: "Iron products: child-resistant packaging if ≥30 mg/serving",
      requirement:
        "If the product contains ≥30 mg elemental iron per serving, child-resistant packaging is federally required (PPPA). Non-compliant packaging is a recall risk.",
      reference: "16 CFR Part 1700; PPPA §4",
      severity: "critical",
    },
    {
      id: "VIT-003",
      title: "Vitamin D toxicity warning for high-dose products",
      requirement:
        "Products providing >4,000 IU vitamin D per serving must include a caution against exceeding the tolerable upper intake level. High-dose D3 is an FDA surveillance priority.",
      reference: "NIH ODS Vitamin D Fact Sheet; FDA dietary supplement guidance",
      severity: "major",
    },
    {
      id: "VIT-004",
      title: "USP or NSF certification for quality assurance",
      requirement:
        "Third-party quality certification (USP Verified, NSF Contents Certified, or equivalent) is not required but is strongly preferred by Amazon for vitamin products and significantly reduces takedown risk.",
      reference: "Amazon supplement quality program guidance",
      severity: "minor",
    },
  ],

  minerals: [
    {
      id: "MIN-001",
      title: "Heavy metals tested against Prop 65 limits",
      requirement:
        "Mineral products (especially calcium, magnesium, iron, zinc) must test for heavy metal contaminants. Lead <0.5 µg/daily serving; arsenic <10 µg/daily serving for non-seafood sources.",
      reference: "California Prop 65; FDA dietary supplement compliance program",
      severity: "critical",
    },
    {
      id: "MIN-002",
      title: "No exceeding Tolerable Upper Intake Level without warning",
      requirement:
        "If a single serving provides ≥100% of the Tolerable Upper Intake Level (UL) for any mineral (e.g., selenium UL 400 µg, zinc UL 40 mg), a caution statement is required.",
      reference: "NIH ODS Dietary Reference Intakes; 21 CFR 101.36",
      severity: "major",
    },
    {
      id: "MIN-003",
      title: "Bioavailability form substantiated if claimed",
      requirement:
        "Claims like 'highly bioavailable' or 'chelated for superior absorption' must be supported by published research cited in the listing or available on request.",
      reference: "FTC Act §5; FDA structure/function guidance",
      severity: "minor",
    },
  ],

  herbals_botanicals: [
    {
      id: "HRB-001",
      title: "Botanical species identity verified",
      requirement:
        "CoA must confirm botanical species identity via HPTLC, DNA barcoding, or equivalent method. Adulteration with substitute species is a major Amazon enforcement trigger.",
      reference: "USP <565>; FDA botanical ingredient guidance",
      severity: "critical",
    },
    {
      id: "HRB-002",
      title: "Pesticide residue testing",
      requirement:
        "Herbal ingredients must be tested for pesticide residues. Exceeding EU MRL limits (Amazon's international standard) is a critical violation. Multi-residue screen preferred.",
      reference: "EU Regulation 396/2005; Amazon import supplement requirements",
      severity: "critical",
    },
    {
      id: "HRB-003",
      title: "Heavy metals tested",
      requirement:
        "Botanical extracts must include CoA heavy metal data. Lead <0.5 µg/daily serving. Some botanicals (Ayurvedic herbs) are known high-risk sources.",
      reference: "California Prop 65; FDA compliance program 7321.002",
      severity: "critical",
    },
    {
      id: "HRB-004",
      title: "No FDA-prohibited botanicals",
      requirement:
        "Must not contain aristolochic acid (Aristolochia spp.), kava in non-traditional preparations, pennyroyal oil, or other FDA-actioned botanicals.",
      reference: "FDA Import Alert 66-38; FDA advisory list",
      severity: "critical",
    },
    {
      id: "HRB-005",
      title: "Solvent disclosure for extracts",
      requirement:
        "Extraction solvents must comply with ICH Q3C residual solvent limits. CO2 extracts are preferred. Hexane residuals must be declared if >1 ppm.",
      reference: "ICH Q3C; FDA guidance for industry",
      severity: "major",
    },
  ],

  probiotics: [
    {
      id: "PRB-001",
      title: "CFU count guaranteed at time of expiry",
      requirement:
        "Label must state CFU count at end of shelf life, not at manufacture. 'Guaranteed at time of manufacture' is insufficient and Amazon flags it. CoA must confirm viability through expiry via stability data.",
      reference: "ISAPP consensus statement on probiotics; Amazon supplement policy",
      severity: "critical",
    },
    {
      id: "PRB-002",
      title: "Strain designation at species level",
      requirement:
        "Each strain must be identified to at minimum genus + species level (e.g., Lactobacillus acidophilus). Strain designations (e.g., NCFM, LA-5) are preferred for clinical claim substantiation.",
      reference: "WHO/FAO probiotic guidelines 2002; ISAPP guidance",
      severity: "major",
    },
    {
      id: "PRB-003",
      title: "Viability testing methodology disclosed",
      requirement:
        "CoA must specify the testing method used to confirm viable CFU count (e.g., pour plate, flow cytometry). 'Proprietary method' alone is insufficient.",
      reference: "USP <61>; ISO 19344",
      severity: "major",
    },
    {
      id: "PRB-004",
      title: "Storage conditions properly labeled",
      requirement:
        "Refrigerated probiotics must be clearly labeled as requiring refrigeration. Shelf-stable products must have stability data supporting ambient storage through expiry.",
      reference: "21 CFR 101.9; ISAPP probiotic shelf-life guidance",
      severity: "minor",
    },
  ],

  sports_nutrition: [
    {
      id: "SPT-001",
      title: "Banned substance screen required",
      requirement:
        "Any product positioned for sport performance must have a current banned substance screen. NSF Certified for Sport or Informed Sport certification is the Amazon-accepted standard. Non-certified products targeting athletes risk category suppression.",
      reference: "NSF/ANSI 173; Informed Sport program; WADA Prohibited List",
      severity: "critical",
    },
    {
      id: "SPT-002",
      title: "No DMAA, DMHA, BMPEA, or AMP Citrate",
      requirement:
        "These stimulants are FDA-prohibited in dietary supplements. Their presence in any sports nutrition product is a critical violation resulting in immediate listing removal and potential product seizure.",
      reference: "FDA Dietary Supplement Ingredient Advisory List; 21 CFR 402(f)",
      severity: "critical",
    },
    {
      id: "SPT-003",
      title: "Stimulant dosages declared",
      requirement:
        "Total caffeine per serving must be listed in mg. Additional stimulants (synephrine, yohimbine, guarana, green tea EGCG) must be individually declared with amounts.",
      reference: "FDA proposed rule on caffeine; Amazon supplement label requirements",
      severity: "major",
    },
    {
      id: "SPT-004",
      title: "Heavy metals tested",
      requirement:
        "Sports nutrition products (especially post-workout/protein blends) must carry CoA heavy metal data meeting California Prop 65 thresholds.",
      reference: "California Prop 65; Clean Label Project standards",
      severity: "major",
    },
  ],

  weight_management: [
    {
      id: "WGT-001",
      title: "No ephedra alkaloids",
      requirement:
        "Ephedrine, pseudoephedrine, and all ephedra alkaloid sources are federally banned in dietary supplements. Any product containing them is adulterated and subject to seizure.",
      reference: "21 CFR 119.1; FDA Final Rule 2004",
      severity: "critical",
    },
    {
      id: "WGT-002",
      title: "No DNP (2,4-Dinitrophenol)",
      requirement:
        "DNP is an imminent health hazard. FDA has issued multiple warning letters; any product found to contain it will be seized and the seller account suspended.",
      reference: "FDA Import Alert; FDA warning letters 2019-2023",
      severity: "critical",
    },
    {
      id: "WGT-003",
      title: "Weight loss efficacy claims substantiated",
      requirement:
        "Claims like 'clinically proven to burn fat' or 'lose X lbs in Y days' require competent and reliable scientific evidence (FTC standard: RCT in humans for the specific product). Unsupported claims are an FTC/Amazon enforcement trigger.",
      reference: "FTC Act §5; FTC Dietary Supplements guidance 2001",
      severity: "critical",
    },
    {
      id: "WGT-004",
      title: "No DMAA, phentermine analogs, or lorcaserin derivatives",
      requirement:
        "Stimulant-based weight loss compounds that mimic prescription drugs are FDA-prohibited. This includes synthetic compounds marketed as 'natural' alternatives.",
      reference: "FDA Dietary Supplement Ingredient Advisory List",
      severity: "critical",
    },
    {
      id: "WGT-005",
      title: "Before/after imagery restrictions",
      requirement:
        "Before/after imagery must be accompanied by clear disclosure of results atypicality. FTC requires disclosure if results shown are not typical of what customers generally achieve.",
      reference: "FTC Endorsement Guides 16 CFR Part 255",
      severity: "major",
    },
  ],

  amino_acids: [
    {
      id: "AMN-001",
      title: "L-form designation disclosed",
      requirement:
        "Amino acid form (L- vs D-) must be specified on the label where relevant. L-forms are bioactive; D-forms are not absorbed and may be misleading if undisclosed.",
      reference: "21 CFR 101.36; FDA amino acid labeling guidance",
      severity: "major",
    },
    {
      id: "AMN-002",
      title: "Purity ≥98% standard",
      requirement:
        "Pharmaceutical-grade amino acids (≥98% purity by HPLC) are the Amazon-preferred standard. Lower purity products should include CoA disclosing actual purity.",
      reference: "USP amino acid monographs; Amazon supplement quality program",
      severity: "minor",
    },
    {
      id: "AMN-003",
      title: "Heavy metals tested",
      requirement:
        "Synthetic amino acids (especially from Chinese APIs) have elevated heavy metal risk. CoA must include lead, arsenic, cadmium, mercury results.",
      reference: "California Prop 65; FDA supplement compliance",
      severity: "major",
    },
  ],

  omega_fatty_acids: [
    {
      id: "OMG-001",
      title: "EPA/DHA content verified by independent testing",
      requirement:
        "Stated EPA and DHA milligrams must be confirmed by third-party GC or HPLC testing within ±10% of label. Overstated omega-3 content is a common Amazon enforcement finding.",
      reference: "CRN/AHPA omega-3 monograph; IFOS program standards",
      severity: "critical",
    },
    {
      id: "OMG-002",
      title: "Oxidation markers within limits",
      requirement:
        "CoA must include peroxide value (PV <5 mEq/kg) and anisidine value (AV <20) for fish and krill oils. Oxidized oils are a quality and safety concern Amazon actively monitors.",
      reference: "GOED omega-3 quality standards; IFOS protocol",
      severity: "major",
    },
    {
      id: "OMG-003",
      title: "PCBs and heavy metals tested for marine-source products",
      requirement:
        "Fish, krill, and algae oils must be tested for polychlorinated biphenyls (PCBs) and heavy metals. IFOS 5-star certification or equivalent CoA data is required.",
      reference: "California Prop 65; GOED standards; IFOS protocol",
      severity: "major",
    },
    {
      id: "OMG-004",
      title: "Enteric coating claim substantiated if made",
      requirement:
        "If the listing claims 'enteric coated' or 'no fishy burps,' dissolution testing demonstrating gastric resistance and intestinal release must be available.",
      reference: "USP <2040>; FTC Act §5",
      severity: "minor",
    },
  ],

  pre_workout: [
    {
      id: "PRW-001",
      title: "Total caffeine per serving declared in mg",
      requirement:
        "All caffeine sources (anhydrous, green tea, guarana, yerba mate) must be individually listed with amounts and totaled. FDA is actively pursuing undisclosed caffeine in supplements.",
      reference: "FDA proposed caffeine rule; 21 CFR 101.36",
      severity: "critical",
    },
    {
      id: "PRW-002",
      title: "No DMAA, DMHA, or BMPEA",
      requirement:
        "These stimulants are FDA-prohibited. Pre-workout is the highest-scrutiny category for prohibited stimulants. Presence results in immediate listing removal and likely account action.",
      reference: "FDA DMAA enforcement; FDA Dietary Supplement Ingredient Advisory List",
      severity: "critical",
    },
    {
      id: "PRW-003",
      title: "Synephrine and yohimbine individually declared",
      requirement:
        "Bitter orange (synephrine) and yohimbe (yohimbine) must be listed with mg per serving. Undisclosed synephrine is a common FDA warning letter trigger. Yohimbine has cardiovascular risk requiring a warning for sensitive populations.",
      reference: "FDA yohimbe guidance; FTC supplement warning 2019",
      severity: "major",
    },
    {
      id: "PRW-004",
      title: "Warning label for cardiovascular risk",
      requirement:
        "Pre-workout products with total caffeine >200 mg/serving or stimulant stacks must carry a warning: 'Not intended for individuals with heart conditions. Consult a physician before use.'",
      reference: "FDA dietary supplement labeling guidance; Amazon supplement policy",
      severity: "major",
    },
    {
      id: "PRW-005",
      title: "Banned substance screen",
      requirement:
        "Given sport-adjacent positioning, a banned substance screen via NSF or Informed Sport is strongly recommended. Amazon suppression risk is elevated for uncertified pre-workout in the sport category.",
      reference: "NSF/ANSI 173; Amazon sports supplement requirements",
      severity: "major",
    },
  ],

  childrens: [
    {
      id: "CHD-001",
      title: "Child-resistant packaging",
      requirement:
        "All children's supplement products are subject to PPPA child-resistant packaging requirements. Products with iron ≥30 mg/serving have a federal mandate; others should comply as best practice.",
      reference: "16 CFR Part 1700; PPPA §4",
      severity: "critical",
    },
    {
      id: "CHD-002",
      title: "Age-appropriate dosing with age range on label",
      requirement:
        "Label must specify the age range for which the product is intended and provide weight-adjusted dosing if applicable. Products for children <2 years require physician-consult language.",
      reference: "21 CFR 101.36; FDA pediatric supplement guidance",
      severity: "critical",
    },
    {
      id: "CHD-003",
      title: "Lead <5 µg/day (California Prop 65 children's threshold)",
      requirement:
        "California Prop 65 sets a maximum daily lead exposure of 0.5 µg for adults and 5 µg/day for children's supplements. CoA must confirm compliance.",
      reference: "California Prop 65; OEHHA children's lead threshold",
      severity: "critical",
    },
    {
      id: "CHD-004",
      title: "No adult-dosage stimulants or high-potency fat-solubles",
      requirement:
        "No caffeine, synephrine, or other stimulants. Vitamin A ≤2500 IU/day and Vitamin D ≤1000 IU/day for children <8 years without physician oversight language.",
      reference: "NIH ODS pediatric DRIs; FDA supplement labeling guidance",
      severity: "critical",
    },
    {
      id: "CHD-005",
      title: "Allergen labeling for top-9 allergens",
      requirement:
        "FASTER Act requires declaration of all top-9 allergens (milk, eggs, fish, shellfish, tree nuts, peanuts, wheat, soybeans, sesame) if present. This is especially important for children's products.",
      reference: "FASTER Act 2021; 21 CFR 101.4",
      severity: "major",
    },
  ],

  other: [
    {
      id: "OTH-001",
      title: "General DSHEA compliance",
      requirement:
        "All dietary supplements regardless of category must comply with DSHEA 1994 and 21 CFR Part 111 cGMP requirements. CoA from accredited lab, Supplement Facts Panel, and no disease claims are baseline requirements.",
      reference: "DSHEA 1994; 21 CFR Part 111; 21 CFR 101.36",
      severity: "critical",
    },
  ],
};

// Return all rules applicable to a set of categories (general + category-specific).
export function getRulesForCategories(categories: IngredientCategory[]): TicRule[] {
  const seen = new Set<string>();
  const rules: TicRule[] = [];
  for (const rule of GENERAL_RULES) {
    if (!seen.has(rule.id)) {
      seen.add(rule.id);
      rules.push(rule);
    }
  }
  for (const cat of categories) {
    const catRules = CATEGORY_RULES[cat] ?? [];
    for (const rule of catRules) {
      if (!seen.has(rule.id)) {
        seen.add(rule.id);
        rules.push(rule);
      }
    }
  }
  return rules;
}

export const CATEGORY_DISPLAY_NAMES: Record<IngredientCategory, string> = {
  protein: "Protein",
  vitamins: "Vitamins",
  minerals: "Minerals",
  herbals_botanicals: "Herbals & Botanicals",
  probiotics: "Probiotics",
  sports_nutrition: "Sports Nutrition",
  weight_management: "Weight Management",
  amino_acids: "Amino Acids",
  omega_fatty_acids: "Omega Fatty Acids",
  pre_workout: "Pre-Workout",
  childrens: "Children's",
  other: "Other",
};
