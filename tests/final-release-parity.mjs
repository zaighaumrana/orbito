// Compatibility entry point for the canonical committed-source release gate.
import {validateWorkspace} from '../scripts/release-parity.mjs';
console.log('PASS final release parity '+JSON.stringify(await validateWorkspace()));
