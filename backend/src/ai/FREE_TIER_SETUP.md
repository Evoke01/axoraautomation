# Free Tier AI Setup

This multi-layer AI system is designed to work entirely on free tiers.

## Implemented Providers

| Provider | File | Status | Env Key |
|----------|------|--------|---------|
| **Groq** | `providers/groq.ts` | ✅ Implemented | `GROQ_API_KEY` |
| **Ollama** | `providers/ollama.ts` | ✅ Implemented | `OLLAMA_BASE_URL` |
| **HuggingFace** | `providers/huggingface.ts` | ✅ Implemented | `HF_API_TOKEN` |
| **Mistral** | `providers/mistral.ts` | ✅ Implemented | `MISTRAL_API_KEY` |
| **Cohere** | `providers/cohere.ts` | ✅ Implemented | `COHERE_API_KEY` |

## Default Stack (No API Keys Required)

| Layer | Provider | Cost | Rate Limits |
|-------|----------|------|-------------|
| **Local** | Ollama (self-hosted) | $0 | Unlimited (your hardware) |
| **Fast** | Groq + Mistral | $0 | 20 req/min, 144k tokens/day |
| **Balanced** | Hugging Face + Cohere | $0 | 30k input + 10k output tokens/day |

## Optional (Free Tiers Available)

| Service | Free Tier | Uses |
|---------|-----------|------|
| **Cohere** (Scheduler Agent) | Trial credits | Post time optimization |
| **Mistral** (Optimizer Agent) | 1B tokens free | Metadata scoring |
| **Gemini** (Vision Agent) | 60 req/min | Video analysis (falls back to heuristic if unavailable) |

## Configuration

### Minimum (100% Free)
```bash
# Groq - fast inference (free tier)
GROQ_API_KEY=gsk_...

# Hugging Face - classification (free tier)
HF_API_TOKEN=hf_...
```

### With Scheduling & Optimization
```bash
# Add for full functionality:
COHERE_API_KEY=          # Free trial available
MISTRAL_API_KEY=         # Free tier: 1B tokens
GEMINI_API_KEY=          # Free: 60 req/min
```

### Local Only (No Cloud APIs)
```bash
# Just run Ollama locally:
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2:latest
```

## Fallback Behavior

If APIs are unavailable, the system gracefully degrades:

1. **Vision Agent** → Heuristic analysis (title/notes parsing)
2. **Scheduler Agent** → Default schedule (skipped)
3. **Optimizer Agent** → Variants used without scoring
4. **Trend Agent** → HuggingFace (free) or keyword extraction

## No Cron Jobs Required

The queue system (BullMQ + Redis) can be:
- Self-hosted Redis (free)
- Redis Cloud free tier (30MB)
- Disabled entirely (process jobs synchronously)

## Architecture

```
┌─────────────────────────────────────┐
│  Vision (Gemini/heuristic - free)   │
├─────────────────────────────────────┤
│  Writer (Groq Llama 3.3 70B - free)  │
├─────────────────────────────────────┤
│  Optimizer (Mistral/opt-out - free)  │
├─────────────────────────────────────┤
│  Scheduler (Cohere/opt-out - free)  │
├─────────────────────────────────────┤
│  Trend (HuggingFace - free)          │
└─────────────────────────────────────┘
```

All agents route through `createCascadeAI()` which prioritizes free tiers.
