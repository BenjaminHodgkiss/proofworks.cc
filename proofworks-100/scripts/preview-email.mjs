// Render the 100 Experts confirmation email with sample data, for design
// review. Writes exports/confirmation-email.html — open it in a browser, or
// forward it to yourself to check real-client rendering.
//
//   node proofworks-100/scripts/preview-email.mjs
//
// Imports the SAME template the edge function uses (Node 22 strips the TS
// types on import), so the preview can't drift from what actually ships.
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderConfirmationEmail } from '../supabase/functions/_shared/confirmation-email.ts'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', 'exports')

// A realistic allocation: 100 people, top-heavy on protocols + hardware
// security, with one custom addition. Sums to exactly 100.
const allocations = [
  { id: 'crypto',     label: 'Cryptographers',                                          group: 'protocols',   count: 12, custom: false },
  { id: 'formal',     label: 'Formal-verification experts',                             group: 'protocols',   count: 8,  custom: false },
  { id: 'redteam',    label: 'Offensive OC5-level cyber experts',                       group: 'protocols',   count: 6,  custom: false },
  { id: 'tcb',        label: 'Secure-systems-architecture/minimal-TCB experts',         group: 'protocols',   count: 5,  custom: false },
  { id: 'inspection', label: 'Physical inspection & hardware analysis experts',         group: 'hwsec',       count: 10, custom: false },
  { id: 'antitamper', label: 'Anti-tamper engineers',                                   group: 'hwsec',       count: 6,  custom: false },
  { id: 'sidechan',   label: 'Side-channel analysis experts',                           group: 'hwsec',       count: 4,  custom: false },
  { id: 'tee',        label: 'Secure-hardware (RoT/TPM/TEE/enclave) engineers',         group: 'hwsec',       count: 4,  custom: false },
  { id: 'hwattack',   label: 'Hardware attack & defence researchers',                   group: 'hwsec',       count: 4,  custom: false },
  { id: 'treaty',     label: 'Treaty enforcement experts and inspectors',              group: 'governance',  count: 6,  custom: false },
  { id: 'armscontrol',label: 'Arms-control verification theorists',                     group: 'governance',  count: 5,  custom: false },
  { id: 'standards',  label: 'Standards, governance, international-agreement & legal experts', group: 'governance', count: 4, custom: false },
  { id: 'evals',      label: 'Model evaluations, auditing, safety, control, and oversight experts', group: 'aiml', count: 6, custom: false },
  { id: 'mlsys',      label: 'ML systems & frontier ML researchers',                    group: 'aiml',        count: 4,  custom: false },
  { id: 'dcops',      label: 'Data-centre builders & operators',                        group: 'infra',       count: 4,  custom: false },
  { id: 'neteng',     label: 'Networking/optical-networking engineers',                group: 'infra',       count: 2,  custom: false },
  { id: 'intel',      label: 'Intelligence-collection experts',                         group: 'darkcompute', count: 3,  custom: false },
  { id: 'energy',     label: 'Energy & power-grid analysts',                            group: 'darkcompute', count: 2,  custom: false },
  { id: 'custom_hw_aware_ml_compiler', label: 'Hardware-aware ML compiler engineers',   group: 'custom',      count: 5,  custom: true },
]

const reasoning =
  'The hardest part is proving what a chip actually is and that it has not been tampered with, ' +
  'so I weighted physical inspection and cryptographic attestation most heavily.\n\n' +
  'I kept a real slice for governance and treaty enforcement — the cleverest technical scheme is ' +
  'worthless if no inspectorate can run it in practice or if states will not sign on.'

const { subject, html } = renderConfirmationEmail({
  name: 'Jordan Avery',
  allocations,
  reasoning,
  confirmUrl: 'https://example.supabase.co/functions/v1/confirm-submission?token=preview-token',
})

mkdirSync(outDir, { recursive: true })
const out = join(outDir, 'confirmation-email.html')
writeFileSync(out, html)
console.log('subject: ' + subject)
console.log('wrote:   ' + out)
