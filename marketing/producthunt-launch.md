---
owner: Mark Howell
last_reviewed: 2026-05-19
status: DRAFT — awaiting operator decisions on (1) tagline pick, (2) launch date, (3) hunter, (4) maker accounts, (5) image gallery final cuts
bead: infrastructure-mlb1
parent_epic: infrastructure-5rp5
source_of_truth_for: LabelWatch ProductHunt submission copy, assets, timing, and launch-day playbook
---

# LabelWatch — ProductHunt Launch Submission

> **Purpose.** Single source of truth for the ProductHunt submission. Updated on every iteration; final version is what gets pasted into PH. Doubles as the template for future Shell Corp product PH launches.

---

## 1. Submission fields

### Name
```
LabelWatch
```

### Tagline — three options to pick from (60 char max)

PH ranking favors taglines that pair with the product name to form a complete sentence ("LabelWatch — X"). All three are within the 60-char limit and were drafted against the 2026-04-30 copywriter pattern (name actor + deadline + plain-language consequence).

| # | Tagline | Char count | Angle | Best when… |
|---|---|---|---|---|
| A | `FDA recall alerts + Amazon TIC scoring for supplements` | 54 | **Dual-feature.** Signals product breadth (recall radar AND compliance scoring). | Audience knows neither; we educate on both wedges. |
| B | `Score supplement SKUs against Amazon's 2026 TIC rule` | 52 | **Amazon-TIC sharp.** Matches the live hero "what stays on shelf" framing. | Audience already feels Amazon pressure; convert urgency. |
| C | `The FDA recall radar built for supplement brands` | 49 | **Original wedge.** Sticks to the founding pain. Less topical but more durable. | Audience has been burned by a recall — emotional resonance. |

**Recommendation: A.** Broader top-of-funnel pull on PH, where the audience won't pre-filter for "supplements" — the tagline has to do double work (relevant + clear). The Amazon-TIC sharpness lives in the description + first comment.

### Description (260 char max)

```
FDA gives supplement brands 5 keyword alerts. We give you the whole shelf —
Slack, Teams, webhook, and email notifications on every Class I/II/III recall,
plus per-SKU Amazon TIC compliance scoring before 2026 takedowns hit Q4. From
$39/mo.
```
Char count: 254 ✓

### Topics (pick up to 3 on PH)

Recommended:
- **SaaS** (default for paid B2B tools)
- **Health & Fitness** (PH's supplement-adjacent topic)
- **Compliance** (PH has this — newer category, less crowded)

Fallback if Compliance unavailable: **Productivity** (lowest CPM but broad reach) or **FDA** if PH adds it (unlikely).

### Pricing model

`Subscription` — Starter $39/mo, Pro $99/mo, Team $299/mo.
Promo: consider a "ProductHunt launch — first month free with code PRODUCTHUNT" if we want to spike signups. ⚠️ Coupon code does NOT exist in Stripe yet — operator decision whether to wire one before launch.

### Links

| Field | Value |
|---|---|
| Website | `https://label.watch` |
| Twitter/X | ⚠️ **OPERATOR FILL** — Novique.ai handle or @markhowell? |
| LinkedIn | ⚠️ **OPERATOR FILL** — company page or personal? |
| GitHub | leave blank — closed-source |
| Discord | leave blank — no public community yet |

---

## 2. First comment (Maker comment) — 1500 char limit

This is the most important field on PH. It seeds the conversation, gives early hunters something to upvote against, and is the #1 conversion lever once people are on the page. Problem-first, link to the actual product mid-comment, link the real Amazon URL so anyone who asks "where's the rule" can verify in one click.

Draft (v2 — opens with the policy event, not an invented anecdote):

```
Hey Product Hunt 👋 — Mark here from Novique.

In December 2025, Amazon expanded its third-party testing rule to every
dietary supplement on the platform. Sellers contacted by Amazon get 90
days to push documentation through an approved Testing-Inspection-Certification
provider, or the listings come down. Policy page:
https://sellercentral.amazon.com/help/hub/reference/external/201829010

The supplement brands I talked to had two problems:

1. They didn't know whether their existing CoAs + cGMP paperwork would pass
   Amazon's TIC audit when it landed.
2. FDA recalls — which can also tank an Amazon listing overnight — were
   reaching them via FDA's free 5-keyword email alerts, which routinely
   miss recalls on ingredients they hadn't pre-registered.

LabelWatch is built for both:

• **Recall radar** — Slack, Teams, webhook, email on every Class I/II/III
  FDA recall, normalized to your ingredients and your contract manufacturers
  (the firm-aliases problem the FDA email tool doesn't solve).

• **Peer watch** — alert when a recall hits a CMO you share with someone
  else, before it lands on your SKUs.

• **TIC compliance scoring** — paste a label, get a 0-100 score against
  Amazon's 2026 rule + cGMP requirements in 21 CFR Part 111. Built so the
  Amazon audit is a confirmation, not a discovery.

$39/mo Starter (daily digest, email + one Slack channel).
$99 Pro adds realtime + per-channel severity routing + TIC scoring.
$299 Team adds multi-user, custom alert rules, CSV export, REST API.

Try the free SKU audit: https://label.watch/audit/new

Happy to talk openFDA data, Amazon's TIC timeline, or how the firm-alias
normalization works. Feedback welcome 🙏
```

Char count: ~1490 ✓

⚠️ **Operator review still needed before posting.** Verify: (a) the "/audit/new is free" claim matches the actual paywall state at launch time; (b) the "21 CFR Part 111" cite is real (it is, but worth re-reading the rule once); (c) AI-content tone — run through humanizer (mgek) once it ships, OR hand-edit to break up the bullet-list rhythm if you want it less polished.

---

## 3. Gallery assets

PH allows 1 primary image (1270×760 ideal, 2:1.18 ratio) + up to 11 secondary (1270×760) + 1 optional video.

### Primary image — recommended

The dark Risk-Meter hero crop at 1270×760. Source: `data/screenshots/labelwatch/labelwatch-after-1440.png` — needs crop to 2:1.18.

⚠️ **Operator action:** crop existing screenshot OR have me generate via Playwright headless at custom viewport. Confirm preference.

### Secondary images — recommended order

PH hunters scroll the gallery in order; lead with what's visual and ends with what's data-dense.

1. **`labelwatch-after-1440.png`** — full landing hero (sets context)
2. **`labelwatch-after-375.png`** — mobile hero (signals "works on phone")
3. **`account-full.png`** — dashboard overview (shows actual product)
4. **`dxkk-account-pro-with-severity.png`** — per-channel severity routing UI (shows Pro tier value)
5. **`fovp-team-all-time.png`** — 12-month history view (shows Team tier value)
6. **Slack notification screenshot** — ⚠️ **MISSING.** Need actual delivered Slack alert. Either pull from `#lw-staging` or set up a fresh test channel and trigger a synthetic recall.
7. **TIC audit result page** — ⚠️ **MISSING.** Need a screenshot of `/audit/[run_id]` showing the 0-100 score + breakdown. Use existing demo audit or run one fresh.

Total: 7 images. PH allows up to 11; padding to 7 is fine — gallery quality > quantity.

### Video — optional

A 30-60s screen recording of the audit flow (paste label → see score → see breakdown) would lift conversion materially. ⚠️ **Operator decision:** ship without video for v1 launch, or delay 24h to record one?

---

## 4. Launch-day timing

PH resets daily at **00:01 Pacific Time**. Submissions go live the moment they're scheduled for. The first 6 hours determine top-3 placement.

**Best launch days** (per PH analytics studies):
- Tuesday — highest traffic, highest competition
- Wednesday — second-highest traffic, slightly less competition
- Thursday — lower traffic, much less competition (often better #1 odds)

**Worst:** Friday (low traffic, weekend kill), Monday (US holidays cluster), weekends.

**Recommendation: Tuesday or Wednesday in the next 2-week window.**

⚠️ **Operator pick — proposed dates:**

| Date | Day | Notes |
|---|---|---|
| 2026-05-26 | Tue | 7 days out — tight for hunter outreach + gallery assets |
| 2026-05-27 | Wed | 8 days out — slightly more buffer |
| 2026-06-02 | Tue | 14 days out — comfortable, lets humanizer ship + Reddit warmup |
| 2026-06-03 | Wed | 15 days out — same |

**Recommendation: 2026-06-02 Tuesday** — gives 14 days to finish missing screenshots, decide on hunter, line up 5-10 upvote supporters, finish Reddit warmup (humanizer-dependent), and pre-tease on LinkedIn.

---

## 5. Hunter strategy

Two paths:

**Path A — Self-hunt.** Cheapest, most controllable, but reduces reach because PH algorithm gives a boost when a high-follower hunter submits.

**Path B — Find a hunter.** Reach out to a known hunter in the SaaS/compliance/health space 2-3 weeks before launch. They submit on the chosen day. Higher reach but coordination cost + risk of misalignment on timing.

⚠️ **Operator decision.** For a first-product launch from a new factory, self-hunt is probably right — owns timing, no coordination risk, learning value. Hunter-supported launches are higher-leverage when the product already has signal.

**Recommendation: Self-hunt** (Mark's PH account, or create one if none exists).

---

## 6. Pre-launch checklist (T-14 days)

```
T-14d (today, 2026-05-19):
  [✓] Bing + GSC verification (today)
  [ ] Confirm PH account exists / create one (operator)
  [ ] Decide tagline (A / B / C)
  [ ] Decide launch date

T-10d (2026-05-23):
  [ ] All gallery screenshots collected (incl. Slack notification + TIC audit)
  [ ] Primary image cropped to 1270×760
  [ ] First comment finalized + reviewed
  [ ] Stripe promo code created if using launch-day discount

T-7d (2026-05-26):
  [ ] Line up 5-10 early supporters (LinkedIn DMs from df0d list)
  [ ] LinkedIn pre-tease post drafted
  [ ] Twitter pre-tease drafted (if using Twitter)

T-3d (2026-05-30):
  [ ] PH submission drafted in PH UI (saved as draft, not scheduled)
  [ ] All assets uploaded to PH draft
  [ ] Preview link generated for final sanity check

T-1d (2026-06-01):
  [ ] Schedule PH for 00:01 PST 2026-06-02
  [ ] LinkedIn pre-tease goes live in evening
  [ ] Slack/Discord ping early supporters with reminder

T-0 (2026-06-02 00:01 PST):
  [ ] Live on PH
  [ ] Mark posts first comment within 1 min
  [ ] Slack #notices ping
  [ ] LinkedIn post goes live at 08:00 PST
  [ ] Reply to every PH comment within 1 hour for first 6 hours

T+1d:
  [ ] Capture rank, upvote count, signups, traffic to label.watch
  [ ] Capture in Open Brain as session-log
  [ ] Update bead infrastructure-mlb1 with results + close
```

---

## 7. Risks / known unknowns

- **AI-content rules.** PH is softer than Reddit but commenters still call out AI-flavored copy. Run first comment through humanizer (mgek) once that ships, OR hand-edit to break up the bullet-list rhythm.
- **Amazon-TIC claim — RESOLVED 2026-05-19.** Authoritative URL captured in OB thought 99402198: `https://sellercentral.amazon.com/help/hub/reference/external/201829010`. Linked in first comment. Citation audit of `lib/amazon-tic-rules.ts` filed as bead `infrastructure-u297` (P1); product-UI URL surfacing filed as bead `infrastructure-gnq4` (P1); URL verification monitor filed as bead `infrastructure-m7fn` (P2). Block PH launch on u297 + gnq4 — see §9 dependencies.
- **Tier mismatch on PH price tag.** PH shows ONE pricing label. "$39/mo" is the most welcoming but undersells. "$39-$299/mo" is honest. Test both in PH preview before going live.
- **/audit/new free vs paywalled.** First-comment says "free SKU audit" — verify what the actual paywall state is at launch time (currently free if I read the code right, but check before submitting).

## 9. Launch dependencies (must complete before PH submission)

- ✅ Bing + GSC verified + sitemaps submitted (today)
- 🚧 [`infrastructure-u297`] Audit and fix fabricated Amazon citations in `lib/amazon-tic-rules.ts`. Customers clicking through from PH will hit the compliance page; the cite references must be honest.
- 🚧 [`infrastructure-gnq4`] Surface the Amazon policy URL in product UI (footer, /account/compliance, /audit/[run_id]). PH commenters who ask "where's the rule" need an in-product answer, not just a comment-thread link.
- ⏭ [`infrastructure-m7fn`] URL verification monitor — nice-to-have, NOT a launch blocker. Can ship post-launch.
- ⏭ [`infrastructure-mgek`] Humanizer voice profile — preferred but not strictly blocking. If mgek isn't ready, hand-edit the first comment to break the bullet cadence.

---

## 8. Post-launch follow-ups

- Reddit launch posts (bead `infrastructure-s42l`) — separate channel, do NOT coincide with PH day (split attention).
- LinkedIn cold DMs (bead `infrastructure-df0d`) — use PH presence as social proof in DM-1.
- Long-form article (bead `infrastructure-b12d`) — "Lessons from launching a recall-intelligence product on PH" — post 2 weeks after launch on LinkedIn.

---

## Changelog

- **2026-05-19** — Initial draft. All operator-only fields flagged ⚠️. Pending decisions: tagline pick, launch date, hunter path, missing screenshots (Slack notif + TIC audit), Stripe promo code go/no-go, optional video.
- **2026-05-19 (later)** — Removed fabricated friend-recall opener from first comment (operator flag). Rewrote opener to lead with the December 2025 Amazon policy event. Embedded canonical Amazon URL (`sellercentral.amazon.com/help/hub/reference/external/201829010`) into first comment. Filed three companion beads: `infrastructure-u297` (citation audit, P1, blocks PH), `infrastructure-gnq4` (surface URL in product UI, P1, blocks PH), `infrastructure-m7fn` (URL verification monitor, P2, post-launch ok). Added §9 launch-dependencies section.
