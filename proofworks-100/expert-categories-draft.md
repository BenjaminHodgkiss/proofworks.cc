# 100 Experts — category list (grouped draft)

The exercise: *"If I could magically give you 100 experts to work full-time on AI verification, what types of people would you pick?"* Users distribute 100 people across these types and can add their own. (We may reframe the prompt as *"which 100 people would you hire in the first year"* — TBD.)

The list is organised into **8 groups / 35 expert types**. Groups give the page structure (and drive the colour-by-field legend and dot grid); within a group, each line is `Name — one-line scope` (the scope becomes the card subtitle / blurb).

## 1. Hardware and software engineering

1. **Chip-design engineers** — architecture, RTL and physical design: what an accelerator's silicon should actually contain.
2. **FPGA engineers** — reconfigurable-logic chips that run a fixed, constrained function, simpler to inspect and reason about than a general-purpose processor.
3. **Semiconductor fab engineers** — process integration, lithography and device fabrication: how chips are physically made.
4. **Embedded / firmware & trusted-software engineers** — the embedded firmware and trusted software stack that runs on the off-chip verification devices and the trusted cluster: bootloaders, RTOS/OS, drivers and on-device application code sitting above the hardware roots of trust.

## 2. Hardware security, inspection and supply-chain integrity

5. **Anti-tamper engineers** — anti-tamper enclosures that resist tampering and/or reveal if hardware has been opened or interfered with.
6. **Hardware attack & defence researchers** — hardware Trojans, fault injection and glitching, and obfuscation/countermeasures.
7. **Physical inspection & hardware analysis experts** — optical and X-ray imaging, decapsulation and electrical measurement to establish what an actual chip or board physically is: authentic, unmodified, and matching its declared specification.
8. **Secure-hardware (TEE/enclave) engineers** — secure boot, hardware roots of trust, and firmware integrity, applied to the off-chip verification devices and the trusted cluster rather than the untrusted AI accelerators.
9. **Side-channel analysis experts** — power, EM and timing analysis of running hardware.
10. **Supply-chain experts (security)** — provenance and integrity of the verification devices and trusted cluster, so they cannot be compromised before deployment.

## 3. Infrastructure and monitoring

11. **AI data centre security experts** — physical and operational security of the facilities running AI compute: access control, monitoring, insider threat, accredited secure-facility build (e.g. SCIFs: TEMPEST and acoustic shielding) and how accreditation requirements get updated.
12. **Data centre builders and operators** — people who have built, networked, powered, and run large clusters and hold vendor relationships, needed to retrofit the off-chip devices into real datacenters and judge what is operationally feasible.
13. **Networking / optical-networking engineers** — line-rate traffic capture, optical fibre splitters and taps, traffic analysis, and egress control.

## 4. Protocols, proofs, assurance and red-teaming

14. **Cryptographers** — zero-knowledge proof, protocol design, commitments, and secure attestation schemes, including verifiable computation/proof of useful work, proof of secure erasure, and proof of memory.
15. **Formal verification experts** — mathematically proving hardware, firmware and software behave to spec, or have certain safety or security properties.
16. **Offensive cyber / OC5 red-teamers** — red-teaming the full verification system across network, software, firmware, and operations at RAND's OC5 level.
17. **Secure-systems-architecture / minimal-TCB experts** — shrinking the set of components the verification system must trust (its Trusted Computing Base) so the trusted core is small enough to fully audit or formally verify.
18. **Statisticians (sampling design / statistical safeguards)** — the sampling and sequential-testing design behind the correctness and completeness checks, with explicit detection-probability targets. From the IAEA's "statistical safeguards" tradition.
19. **Systems-theoretic safety / security analysis (STPA-Sec and similar)** — deriving the right security requirements and loss scenarios for a complex socio-technical system at the architecture level, top-down.

## 5. Building, testing and running the system

20. **Systems integration engineers** — making the devices, firmware, network taps, trusted cluster and protocols work together as one deployable system: interfaces, build/release, and end-to-end bring-up.
21. **Test & evaluation / independent V&V engineers** — independent test campaigns and acceptance testing that empirically prove the system meets its requirements and detection-probability targets in practice, distinct from formal proofs or adversarial red-teaming.
22. **Operations & sustainment / lifecycle leads** — running the deployed verification system over its full lifetime: maintenance, key rotation, recalibration, hardware refresh, configuration management and decommissioning, the way IAEA safeguards equipment is sustained for decades.
23. **Technical project managers** — orchestrating efforts that require more than one of the above categories, turning multi-disciplinary work into a delivered, integrated system.

## 6. AI/ML expertise

24. **Model evaluations, auditing, and oversight experts** — deciding which models are safe to whitelist (auditing candidates, ideally in a trusted cluster) and designing the trusted oversight model that one verification goal requires all inference to pass through.
25. **ML systems and frontier ML researchers** — how large training and inference workloads run on real clusters, including deterministic, reproducible inference; and what covert workloads actually matter, how small a model can be while remaining strategically significant, and how an adversary might compress or distribute training to evade the bounds.

## 7. Dark-compute detection

26. **Export-control / compliance specialists** — chip controls, end-use monitoring, licensing.
27. **Intelligence collection experts** — detecting and characterising undeclared ("dark") compute the in-facility system cannot see, in the national-technical-means tradition of arms-control monitoring (OSINT, IMINT/GEOINT, SIGINT, HUMINT).
28. **Energy & power-grid analysts** — estimating how much compute exists from its power footprint: grid draw, interconnection-queue and utility filings, substation buildouts and power-purchase agreements, as a signal for locating undeclared ("dark") datacenters.
29. **Supply-chain experts (semiconductor manufacturing and manufacturing-equipment, SM/SME)** — how chips and the tools that make them are produced and moved, used to estimate how much compute exists and detect undeclared capacity, including customs and trade-data analysis of chip and equipment flows.
30. **Whistleblower program experts** — designing whistleblower channels for surfacing undeclared compute or verification tampering, including incentives and protection.

## 8. Governance, diplomacy and law

31. **Arms-control verification theorists** — strategic design of monitoring regimes, detection-probability versus inspection-burden trade-offs, a cheating party's incentives, and when monitoring stabilises rather than undermines an agreement.
32. **Political-feasibility and diplomacy experts** — whether an agreement can be reached and sustained, covering Track-2 and Track-1.5 dialogue, the communication failure modes, and PRC (party-state), PLA (military), and industrial-policy dynamics and what is politically feasible on each side.
33. **Confidentiality / managed-access & inspection-data protection experts** — letting inspectors verify what they need without exposing model weights, IP or military secrets (managed access), and protecting the sensitive data that inspection itself collects (logs, traces, measurements) so verification does not become a leak or espionage vector.
34. **Standards, governance, international-agreement, & legal experts** — turning capability into auditable, adoptable standards and the international agreements that mandate them, including drafting those agreements and antitrust counsel.
35. **Treaty enforcement experts** — people who run an inspectorate in practice: on-site inspections, safeguards and compliance monitoring, like IAEA inspectors.

## Notes on handling custom additions

When users add their own type at runtime, store the raw text. Custom additions appear on the page under a "Your additions" group. In later analysis, merge near-duplicates (e.g. "FPGA eng." ≈ "FPGA engineers") by hand rather than auto-merging, so you keep control of the canonical list.
