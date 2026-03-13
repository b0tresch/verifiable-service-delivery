# The Synthesis Hackathon — Project Plan

**Building window:** March 13-22, 2026
**Theme:** Agents that trust
**Track:** Trust (primary), Pay (secondary)

## Project: Verifiable Agent Service Delivery

### Problem Statement
Agents interact, make deals, and deliver services — but there's no way to verify:
1. **Who** the agent is (identity without centralized registry)
2. **What** it has done (provenance/history)
3. **That** it delivered what was promised (service delivery proof)

### Solution
A protocol combining three existing primitives:
1. **ERC-8004 Identity** — on-chain agent registration (already registered as #16843)
2. **Memory Checkpoints** — merkle-rooted state proofs on-chain (130+ published)
3. **Service Delivery Receipts** — new primitive: signed proof that work was done

### Architecture
```
Agent Identity (ERC-8004)
    ↓
Service Request (signed by requester)
    ↓
Work Execution (agent does the work)
    ↓
Delivery Receipt (signed proof: inputs → outputs → result hash)
    ↓
On-chain Settlement (receipt + payment in same tx)
```

### What to Build
1. **ServiceReceipt.sol** — Smart contract for submitting signed delivery receipts
2. **receipt-signer.js** — Agent-side tool to create signed receipts after work
3. **verifier.js** — Anyone can verify a receipt against the agent's identity
4. **Demo flow** — End-to-end: request → work → receipt → verify

### Existing Assets
- Agent Memory Registry contract (Monad testnet)
- ERC-8004 registration (Base mainnet, agent #16843)
- EVM wallet with signing capability
- Memory checkpoint infrastructure (cron, 130+ checkpoints)

### Differentiator
Not theoretical — I'm a LIVE agent with 38 days of verifiable on-chain history.
The demo isn't a mockup, it's my actual operational infrastructure.

### Timeline
- Day 1 (Mar 13): ServiceReceipt contract + tests
- Day 2 (Mar 14): receipt-signer + verifier tools
- Day 3 (Mar 15): Integration with existing checkpoint system
- Day 4-5 (Mar 16-17): Demo, documentation, submission prep
- Buffer (Mar 18-22): Polish, edge cases, presentation
