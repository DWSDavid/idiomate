# Idiomate — Roadmap & Product Vision (North Star)

**Status:** living document · **Owner:** Rubi · **Last updated:** 2026-06-04

> This is the long view. The MVP spec (`docs/superpowers/specs/`) and plan (`docs/superpowers/plans/`) are the *near* term; this file is where the whole product is allowed to dream, so every near-term tradeoff can be checked against where we're going.

---

## 0. North Star (one sentence)

**The companion that makes you sound native by *teaching*, not *fixing* — across everything you write, every day, remembering every pattern you have, so the same mistake stops repeating and the words you collect actually come out of your mouth and keyboard.**

The enemy is not "wrong grammar." The enemy is **fossilization** (the same L1-transfer mistakes forever) and **passive vocabulary** (thousands of words you recognize but never produce). Idiomate exists to kill both — by building a long memory of *your* language self and coaching against it.

---

## 1. What Idiomate becomes (the end state)

A **website-like, always-available companion** — open in a tab, ask it anything, anytime:

- *"Polish this email, but tell me what you changed and why."*
- *"What do I keep getting wrong this month?"*
- *"Give me a more natural way to say this — and is there a word from my own list that fits?"*
- *"Quiz me on the phrases I captured but never used."*

Three things make it more than "paste into ChatGPT":

1. **It watches your real writing, every day** — not just assigned exercises.
2. **It remembers** — every mistake is typed, tallied, and archived into a long-term *language memory* it can reason over.
3. **It has a stance** — it teaches (names the error, explains the logic, makes you try) instead of silently fixing, so you actually change.

---

## 2. Form-factor evolution

| Stage | Form | What it adds |
|---|---|---|
| **v0 — MVP (now)** | Local web app, dedicated practice | Daily prompt → write → coaching loop (reveal gate); error profile; vocab capture + activation |
| **v1 — Real-writing mode** | Same web app + paste-in / browser reach | Track & polish your *actual* emails/Slack/docs (two-speed, see §4); everything feeds the same memory |
| **v2 — Always-on companion** | A proper website you keep open + conversational interface | Ask anything anytime; the memory becomes queryable in natural language; daily/weekly review rituals |
| **v3+ — Reach** | Browser extension / editor integration; later, speaking | Coach in-place where you already write; pronunciation as a secondary layer |

Privacy stance: **local-first by default.** A cloud/sync option is opt-in, only if/when it goes public — never required for the single-user core.

---

## 3. The two-speed model (how real-writing mode keeps its soul)

Real writing has a tension: sometimes you're learning, sometimes you just need to hit send. Idiomate runs **two lanes**, and *both* feed the memory:

- **Learn-it lane** — full coaching loop: hints first, you rewrite, then side-by-side reveal + the *why* and the named error. For when you have time and want to grow.
- **Ship-it lane** — fast natural rewrite + a one-line "what changed, why, what it's called," then you send. **The diff is still logged to your error profile** so the learning accrues even when you compromised for speed.

> **Design invariant:** no matter the lane or the source (assigned prompt or real email), every correction is *typed* and written to the **same** error memory. The product's intelligence compounds because the memory is unified.

---

## 4. The memory layer (the moat and the magic)

This is the part that makes Idiomate defensible and personal. Tracked problems don't vanish — they're **archived into a layered language memory**:

| Layer | What it holds | Example |
|---|---|---|
| **L1 — Raw log** | Every annotation: span, error type, your rewrite, the native version, source | "2026-06-04, redundancy, 'make an improvement to' → 'improve'" |
| **L2 — Error profile** | Typed tallies, recurrence, recency, trend per error type | "redundancy: 47×, trending ↓; modality: 12×, trending ↑" |
| **L3 — Vocab activation** | Each captured term's `capture_count`, `times_suggested`, `times_used`; phrases/collocations prioritized | "'leverage' captured 4×, used 0× — still passive" |
| **L4 — Language fingerprint** | The synthesized picture: your top mindset patterns, your plateau, your wins over time | "Your writing is 30% less wordy than 8 weeks ago; modality is your current frontier" |

**Why it matters:**
- **Queryable** — "show my progress on tense," "what are my 3 worst habits right now."
- **Personalization engine** — coaching prioritizes *your* recurring patterns; priming surfaces *your* not-yet-activated words and chunks first.
- **Defensibility** — a competitor can copy a prompt overnight; they cannot copy *your two years of longitudinal language memory*. The memory is the lock-in and the value.

---

## 5. Phased roadmap

- **Phase A — MVP** *(in progress)*: practice space, coaching brain + error taxonomy v0, error profile, vocab capture/import + activation. *Goal: the brain is good enough to impress a picky advanced learner — you.*
- **Phase B — Real-writing mode + conversational ask**: two-speed lanes; paste-in real writing; natural-language queries over the memory ("what do I keep getting wrong?"); daily/weekly review.
- **Phase C — Aesthetics & UX pass**: drive the whole UI through the **`design-taste-frontend` / taste-skill** (installed) for a premium, calm, non-generic writing experience — see §6.
- **Phase D — Speaking (secondary)**: start from writing you already produced (read aloud, pronunciation, spoken rephrase drills).
- **Phase E — Multi-language engine**: generalize the language-agnostic core (taxonomy + profile + activation); add new L1→L2 pairs by building each one's transfer knowledge base (Japanese→EN, Korean→EN, Spanish→EN, …).
- **Phase F — The mindset-layer deep bet**: turn L1→L2 *thinking/discourse* transfer (not just surface errors) into something diagnosable, trainable, and **measurable**. This is the category-defining research — and the hardest (see §7).

---

## 6. Aesthetics & UX philosophy

The writing surface is where you'll live daily, so it has to feel **calm, focused, and premium** — never a cluttered SaaS dashboard.

- **Tooling:** when we reach the UI polish (Phase C, and incrementally during MVP Phase 5), drive components through the installed **`design-taste-frontend`** skill (and siblings like `minimalist-ui`, `high-end-visual-design`) so the result isn't generic AI-slop UI. Audit-first on anything already built.
- **Principles:**
  - **Distraction-free writing** — the draft is the hero; coaching lives in a quiet margin, not in your face.
  - **The reveal gate is a *moment*** — the side-by-side "your version vs native" should feel earned and satisfying, not punishing.
  - **The dashboard is a mirror, not a scoreboard** — show growth and frontier, not shame. Trends ↓ on bad habits, ↑ on activation.
  - **Typographic, restrained palette, generous space** — reading-grade type because you read all day; the UI should respect that taste.

---

## 7. The hard problem: measuring "more native"

The mindset layer (Phase F) lives or dies on a question we must answer honestly: **how do we know you actually got more native?** Candidate proxies to validate over time:

- Error-type recurrence falling (esp. discourse-level: redundancy, sprawl, calque).
- Vocab/chunk **activation rate** rising (passive → active).
- Rewrites needing fewer coach interventions per 100 words.
- Blind native-rater "does this read translated?" score on held-out samples.

No single metric is truth; the bet is that the *combination*, tracked longitudinally, is. This is the research spine of the whole product — worth its own spec before Phase F.

---

## 8. Public-app outlook (if it grows up)

- **Wedge to protect:** teaching + mindset + memory. The moment we compete on "fix it fast," we lose to Grammarly. We win with the motivated advanced learner who wants to *change*, not just patch.
- **Moats:** per-language transfer knowledge bases (slow, hard, defensible) + each user's longitudinal memory + brand ("the tool that makes you sound native by teaching").
- **Real risks:** LLM commoditization of "coaching"; retention/habit (the #1 risk — friction is intentional, so the audience is smaller but higher-intent); trust/accuracy at the discourse level where LLMs wobble.
- **Verdict:** strong personal tool first; credible category bet *only* on the mindset/memory axis. Nail Chinese→English so deeply it dazzles one picky user — that's the whole proof. Everything else (multi-language, public) is downstream of that.

---

## 9. Guardrails (don't drift)

- **Teach, don't fix.** The day Idiomate becomes a silent autocorrect, it's dead.
- **One unified memory.** Every correction, every lane, every source feeds the same profile.
- **Local-first, your data is yours.** Cloud is opt-in, never the price of entry.
- **The writing is the hero.** Coaching serves the writer, not the other way around.
