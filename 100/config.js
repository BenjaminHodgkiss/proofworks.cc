// ─────────────────────────────────────────────────────────────
//  Proofworks · 100 Experts exercise — configuration
//  Fill these two values in after creating your Supabase project.
//  (Project settings → API → Project URL + anon/public key.)
//  These are safe to expose publicly: row-level security (see
//  supabase-setup.sql) controls what can actually be read/written.
// ─────────────────────────────────────────────────────────────
window.PW_CONFIG = {
  SUPABASE_URL: "https://ekyzrnhoxutcnnqrvszp.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVreXpybmhveHV0Y25ucXJ2c3pwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3NjI1ODYsImV4cCI6MjA5NzMzODU4Nn0.cHxayTylBPGgtAeoTWmhYiIlaIbAgMqwpSuycMI2Wao",

  // Set to true to run the page without a backend (submits are stubbed
  // locally so you can preview the full flow). Set false for production.
  DEMO_MODE: false,

  // Bump this whenever you change PW_CATEGORIES / PW_GROUPS below. It is stored
  // with each submission (meta.catalog_version) so analysis can tell which
  // category revision a respondent saw. Any short stable string works.
  CATALOG_VERSION: "2026-06-18b",
};

// ─────────────────────────────────────────────────────────────
//  Groups. Order here = section order on the page. Each category
//  belongs to a group and inherits its colour, so the dot grid and
//  legend read as fields. Palette: Tableau 10 (distinct + tested),
//  ordered so adjacent groups stay easy to tell apart.
// ─────────────────────────────────────────────────────────────
window.PW_GROUPS = [
  { id: "hwdesign",    name: "Hardware and software engineering",                   color: "#4E79A7" },
  { id: "hwsec",       name: "Hardware security, inspection & supply-chain",        color: "#F28E2B" },
  { id: "infra",       name: "Infrastructure & monitoring",                         color: "#76B7B2" },
  { id: "protocols",   name: "Protocols, proofs, assurance & red-teaming",          color: "#B07AA1" },
  { id: "buildrun",    name: "Building, testing & running the system",              color: "#9C755F" },
  { id: "aiml",        name: "AI/ML expertise",                                     color: "#E15759" },
  { id: "darkcompute", name: "Dark-compute detection",                              color: "#5E5A50" },
  { id: "governance",  name: "Governance, diplomacy & law",                         color: "#EDC948" },
];

// ─────────────────────────────────────────────────────────────
//  The starter expert types. Edit freely — order within a group =
//  card order. `group` must match a PW_GROUPS id (colour is inherited).
// ─────────────────────────────────────────────────────────────
window.PW_CATEGORIES = [
  // 1 · Hardware and software engineering
  { id: "chip",        group: "hwdesign",    name: "Chip-design engineers",                          blurb: "Architecture, RTL and physical design; what an accelerator's silicon should contain." },
  { id: "fpga",        group: "hwdesign",    name: "FPGA engineers",                                 blurb: "Reconfigurable logic running a fixed, constrained function; simpler to inspect." },
  { id: "fab",         group: "hwdesign",    name: "Semiconductor fab engineers",                    blurb: "Process integration, lithography, device fabrication; how chips are made." },
  { id: "firmware",    group: "hwdesign",    name: "Embedded/firmware & trusted-software engineers",blurb: "The firmware and trusted software stack on the verification devices, above the hardware roots of trust." },
  { id: "hweng",       group: "hwdesign",    name: "Systems integrators",                            blurb: "Engineers who turn components into working prototypes and verification devices." },

  // 2 · Hardware security, inspection & supply-chain integrity
  { id: "antitamper",  group: "hwsec",       name: "Anti-tamper engineers",                          blurb: "Enclosures that resist tampering or reveal if hardware was opened." },
  { id: "hwattack",    group: "hwsec",       name: "Hardware attack & defence researchers",          blurb: "Hardware Trojans, fault injection, glitching, obfuscation/countermeasures." },
  { id: "inspection",  group: "hwsec",       name: "Physical inspection & hardware analysis experts",blurb: "Optical/X-ray imaging, decap and electrical measurement to confirm what a chip is." },
  { id: "tee",         group: "hwsec",       name: "Secure-hardware (RoT/TPM/TEE/enclave) engineers",        blurb: "Secure boot, roots of trust and firmware integrity for the verification devices." },
  { id: "sidechan",    group: "hwsec",       name: "Side-channel analysis experts",                  blurb: "Power, EM and timing analysis of running hardware." },
  { id: "supplysec",   group: "hwsec",       name: "Supply-chain experts: Security",                blurb: "Provenance and integrity of the verification devices before deployment." },

  // 3 · Infrastructure & monitoring
  { id: "dcsec",       group: "infra",       name: "Physical & operational security experts",        blurb: "Physical and operational security of the facilities running AI compute: access control, monitoring, insider threat, accredited secure-facility build and how accreditation requirements get updated." },
  { id: "dcops",       group: "infra",       name: "Data-centre builders & operators",               blurb: "Built, networked, powered and run large clusters; judge what's operationally feasible." },
  { id: "neteng",      group: "infra",       name: "Networking/optical-networking engineers",      blurb: "Line-rate capture, fibre splitters/taps, traffic analysis, egress control." },

  // 4 · Protocols, proofs, assurance & red-teaming
  { id: "crypto",      group: "protocols",   name: "Cryptographers",                                 blurb: "ZK proofs, protocols, commitments, attestation, proof of useful work/erasure/memory." },
  { id: "formal",      group: "protocols",   name: "Formal-verification experts",                    blurb: "Mathematically proving hardware, firmware and software meet spec or safety properties." },
  { id: "redteam",     group: "protocols",   name: "Offensive OC5-level cyber experts",              blurb: "Designing and red-teaming the full verification system across network, software, firmware, and operations at RAND's OC5 level." },
  { id: "tcb",         group: "protocols",   name: "Secure-systems-architecture/minimal-TCB experts", blurb: "Shrinking the trusted core so it's small enough to audit or formally verify." },
  { id: "stats",       group: "protocols",   name: "Statisticians (sampling/statistical safeguards)", blurb: "Sampling and sequential-test design with explicit detection-probability targets." },
  { id: "stpa",        group: "protocols",   name: "Systems-theoretic safety/security analysis",     blurb: "STPA-Sec-style top-down derivation of security requirements and loss scenarios." },
  { id: "seceng",      group: "protocols",   name: "Security Engineer",                              blurb: "Engineers who try to improve the security of a system (typically focused on software/cyber security)." },

  // 5 · Building, testing & running the system
  { id: "integration", group: "buildrun",    name: "Systems integration engineers",                  blurb: "Making the devices, firmware, taps, cluster and protocols work together as one deployable system." },
  { id: "tev",         group: "buildrun",    name: "Test & evaluation/independent V&V engineers",  blurb: "Independent test and acceptance campaigns, proving the system hits its detection-probability targets in practice." },
  { id: "opssustain",  group: "buildrun",    name: "Operations & sustainment/lifecycle leads",     blurb: "Running the deployed system for decades; maintenance, key rotation, recalibration, hardware refresh, decommissioning." },
  { id: "techpm",      group: "buildrun",    name: "Technical project managers",                     blurb: "Orchestrating efforts that span more than one of these disciplines into a delivered system." },
  { id: "syseng",      group: "buildrun",    name: "Systems Engineer",                               blurb: "Engineers who think about how the complete (verification) system looks like, what the requirements are, what the interfaces are, which functions are on track and which functions need more focus." },

  // 6 · AI/ML expertise
  { id: "evals",       group: "aiml",        name: "Model evaluations, auditing, safety, control, and oversight experts",blurb: "Deciding which models to whitelist and designing the trusted oversight model." },
  { id: "mlsys",       group: "aiml",        name: "ML systems & frontier ML researchers",           blurb: "How large training/inference really runs; which covert workloads actually matter." },

  // 7 · Dark-compute detection
  { id: "export",      group: "darkcompute", name: "Export-control/compliance specialists",        blurb: "Chip controls, end-use monitoring, licensing." },
  { id: "intel",       group: "darkcompute", name: "Intelligence-collection experts",                blurb: "Detecting undeclared 'dark' compute via OSINT, IMINT/GEOINT, SIGINT, HUMINT." },
  { id: "energy",      group: "darkcompute", name: "Energy & power-grid analysts",                   blurb: "Estimating compute from power as a dark-compute signal, using grid draw, interconnection filings, substations and PPAs." },
  { id: "supplysme",   group: "darkcompute", name: "Supply-chain experts: SM/SME",                  blurb: "Chip and tool-making flows; estimate total compute and detect undeclared capacity." },
  { id: "whistle",     group: "darkcompute", name: "Whistleblower-program experts",                  blurb: "Channels for surfacing undeclared compute or tampering; incentives and protection." },

  // 8 · Governance, diplomacy & law
  { id: "armscontrol", group: "governance",  name: "Arms-control verification theorists",            blurb: "Monitoring-regime design, detection vs inspection-burden, cheating incentives." },
  { id: "diplomacy",   group: "governance",  name: "Political-feasibility & diplomacy experts",      blurb: "Whether a deal can be reached and sustained; Track-2/1.5; PRC/PLA dynamics." },
  { id: "managedaccess", group: "governance", name: "Confidentiality/managed-access & inspection-data protection experts", blurb: "Verifying without leaking secrets (managed access) and protecting the data inspection collects." },
  { id: "standards",   group: "governance",  name: "Standards, governance, international-agreement & legal experts", blurb: "Auditable standards, the agreements that mandate them, drafting and antitrust." },
  { id: "treaty",      group: "governance",  name: "Treaty enforcement experts and inspectors",                     blurb: "Running an inspectorate in practice; on-site inspections and compliance, like IAEA." },
  { id: "comms",       group: "governance",  name: "Communicators and advocates",                    blurb: "Writers, media-makers and Track 1-2 participants who build understanding and acceptance of verification where appropriate." },
];
