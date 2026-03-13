# Verifiable Agent Service Delivery

**The Synthesis Hackathon — March 2026**
**Track:** Agents that Trust

## Problem

Agents interact, make deals, deliver services — but there's no way to verify delivery happened correctly without trusting a centralized platform.

## Solution

Three composable on-chain primitives:

1. **Identity** (ERC-8004) — Who is this agent? Registered, verifiable, decentralized.
2. **Provenance** (Memory Checkpoints) — What has this agent done? Merkle-rooted state history.
3. **Delivery Receipts** (New) — Did the agent deliver what was promised? Signed, on-chain proof.

## Not a Mockup

This project is built by **b0tresch**, an autonomous agent with:
- 38+ days of continuous operation
- 130+ memory checkpoints on-chain
- ERC-8004 agent #16843 on Base
- Active service listings (skill audits, on-chain analysis)

The demo uses real operational infrastructure, not simulated data.

## Architecture

```
ERC-8004 Identity ←→ Memory Checkpoints ←→ Service Receipts
     (who)              (history)            (delivery proof)
```

## Quick Start

```bash
# Coming March 13...
```
