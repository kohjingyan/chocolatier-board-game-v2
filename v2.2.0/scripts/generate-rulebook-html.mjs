/**
 * Generates rulebook.html from live game data so the booklet stays in sync.
 * Run: node scripts/generate-rulebook-html.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CARD_CATALOG,
  INGREDIENT_LABEL,
  MASTERY_INFO,
  RECIPES,
  SCHEME_IDS,
  SCHEME_INFO,
  STAGE_INGREDIENTS,
} from '../src/engine/data.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, '../rulebook/rulebook.html')

function playCostLabel(kind, stage = 2) {
  if (kind === '1') return '1 Reputation'
  if (kind === '2') return '2 Reputation'
  if (kind === 'stage') return `${stage} Reputation (equal to the current stage)`
  if (kind === 'stage_plus_1') return `${stage + 1} Reputation (stage plus one)`
  return kind
}

function ingredientList(families) {
  return families.map((f) => INGREDIENT_LABEL[f]).join(' + ')
}

const schemesHtml = SCHEME_IDS.map((id) => {
  const s = SCHEME_INFO[id]
  const cost = playCostLabel(s.playCost)
  return `<tr><td><strong>${s.name}</strong></td><td>${cost}</td><td>${s.text}</td></tr>`
}).join('\n')

const masteriesHtml = Object.values(MASTERY_INFO)
  .map((m) => `<tr><td><strong>${m.name}</strong></td><td>${m.text}</td></tr>`)
  .join('\n')

function recipesForStage(stage) {
  return RECIPES.filter((r) => r.likelyStage === stage)
    .map((r) => {
      const res =
        r.requiredRes === 0
          ? 'none'
          : r.requiredRes === 1
            ? 'Research Level 1'
            : r.requiredRes === 2
              ? 'Research Level 2'
              : 'Research Level 3'
      return `<tr><td>${r.name}</td><td>${ingredientList(r.ingredients)}</td><td>$${r.income}M</td><td>${res}</td></tr>`
    })
    .join('\n')
}

const catalogHtml = CARD_CATALOG.filter((c) => c.kind !== 'Mastery')
  .map((c) => `<tr><td>${c.name}</td><td>$${c.cost}M</td><td>${c.stages.join(' · ')}</td><td>${c.notes || '—'}</td></tr>`)
  .join('\n')

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Chocolatier — Rulebook (v2.2.1)</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,700;1,9..144,500&family=Source+Sans+3:wght@400;600;700&display=swap" rel="stylesheet" />
  <style>
    :root {
      --ink: #2a1810;
      --cocoa: #3d2418;
      --cream: #fff8ec;
      --paper: #f4ead6;
      --caramel: #c9893a;
      --gold: #d4b36a;
      --mint: #3d6b4f;
    }
    @page { size: A5 portrait; margin: 12mm; }
    * { box-sizing: border-box; }
    html { font-size: 10.5pt; }
    body {
      margin: 0;
      color: var(--ink);
      font-family: 'Source Sans 3', sans-serif;
      line-height: 1.45;
      background: var(--cream);
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    h1, h2, h3, h4 { font-family: Fraunces, serif; font-weight: 700; line-height: 1.15; margin: 0 0 0.5rem; }
    h1 { font-size: 2rem; letter-spacing: 0.02em; }
    h2 { font-size: 1.35rem; color: var(--cocoa); margin-top: 0; padding-top: 0.2rem; border-top: 2px solid var(--gold); }
    h3 { font-size: 1.05rem; color: var(--caramel); margin-top: 1rem; }
    p { margin: 0 0 0.65rem; }
    ul, ol { margin: 0 0 0.75rem; padding-left: 1.2rem; }
    li { margin-bottom: 0.35rem; }
    .page { page-break-after: always; padding: 0.2rem 0 1rem; min-height: 100%; }
    .page:last-child { page-break-after: auto; }
    .cover {
      display: flex; flex-direction: column; justify-content: center; align-items: center;
      text-align: center; min-height: 168mm; border: 3px double var(--gold);
      background: linear-gradient(165deg, var(--cream) 0%, var(--paper) 45%, #ead9bc 100%);
      padding: 2rem 1.5rem;
    }
    .cover .mark { font-size: 3rem; line-height: 1; margin-bottom: 0.5rem; }
    .cover .subtitle { font-family: Fraunces, serif; font-style: italic; font-size: 1.15rem; color: var(--cocoa); max-width: 14em; margin: 0.75rem auto 1.5rem; }
    .cover .edition { font-size: 0.85rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--caramel); }
    .lead { font-size: 1.05rem; color: var(--cocoa); }
    .box {
      background: var(--paper); border-left: 4px solid var(--caramel);
      padding: 0.65rem 0.85rem; margin: 0.75rem 0; border-radius: 0 6px 6px 0;
    }
    .phase { margin-bottom: 0.85rem; }
    .phase-title { font-weight: 700; color: var(--cocoa); font-size: 1rem; margin-bottom: 0.2rem; }
    table { width: 100%; border-collapse: collapse; font-size: 0.88rem; margin: 0.5rem 0 0.85rem; }
    th { text-align: left; background: var(--cocoa); color: var(--cream); padding: 0.35rem 0.45rem; font-weight: 600; }
    td { padding: 0.3rem 0.45rem; border-bottom: 1px solid #dcc9a8; vertical-align: top; }
    tr:nth-child(even) td { background: rgba(255,255,255,0.35); }
    .two-col { column-count: 2; column-gap: 1.2rem; }
    .small { font-size: 0.85rem; color: #5c4330; }
    .footer-note { font-size: 0.8rem; color: #6b5340; margin-top: 1rem; font-style: italic; }
    strong { font-weight: 700; }
    .toc li { margin-bottom: 0.5rem; }
    @media print {
      body { background: white; }
      .cover { min-height: 155mm; }
    }
  </style>
</head>
<body>

<section class="page cover">
  <div class="mark">🍫</div>
  <h1>Chocolatier</h1>
  <p class="subtitle">Build a chocolate empire from market stalls to royal assortments.</p>
  <p class="edition">Rulebook · Version 2.2.1</p>
  <p class="small" style="margin-top:2rem;">3–4 players · About 90–120 minutes</p>
</section>

<section class="page">
  <h2>Overview</h2>
  <p class="lead">You run a chocolate atelier. Buy ingredients, hire staff, and upgrade your factories so each recipe pays you every round. After three stages, the player with the highest net worth wins.</p>
  <div class="box">
    <strong>What you are doing each round:</strong> shape the shared market, buy what you need, play optional Schemes, assign staff and recipes to your factories, then collect income.
  </div>
  <h3>Contents of this booklet</h3>
  <ol class="toc">
    <li>Setup and game structure</li>
    <li>Each round, step by step</li>
    <li>Factories and recipes</li>
    <li>Research and Reputation</li>
    <li>Buying from the pool</li>
    <li>Schemes</li>
    <li>Masteries</li>
    <li>End-of-stage relief</li>
    <li>Final scoring</li>
    <li>Reference tables</li>
  </ol>
  <h3>What you start with</h3>
  <ul>
    <li><strong>$20 million</strong> in cash.</li>
    <li>One <strong>Basic Cocoa</strong> and one <strong>Sugar</strong> in your Supply — enough to make Basic Chocolate.</li>
    <li><strong>Four factories</strong>, each with three ingredient slots. Larger recipes need extra slots.</li>
    <li>No Research, no Reputation, and no Schemes yet.</li>
  </ul>
</section>

<section class="page">
  <h2>Game structure</h2>
  <p>The game is for <strong>three or four players</strong>. It lasts <strong>three stages</strong>. Each stage has <strong>eight rounds</strong>.</p>
  <h3>New cards each stage</h3>
  <ul>
    ${STAGE_INGREDIENTS.map((s) => `<li>${s}</li>`).join('')}
  </ul>
  <h3>Turn order</h3>
  <p>At the start of every stage, everyone secretly bids cash for turn order. The highest bid goes first. Ties go to the player with more Reputation, then to a re-bid among tied players, then to dice if still tied.</p>
  <p>After each round, the first player moves to last place and everyone else moves up one spot.</p>
  <h3>Hand privacy</h3>
  <p>Your <strong>hand</strong> (market cards dealt each round) and your <strong>Schemes</strong> are private. Your Supply, factories, tracks, and cash are public.</p>
</section>

<section class="page">
  <h2>Each round, step by step</h2>
  <p>Every round follows these steps in order. End-of-stage relief happens only after the eighth round of Stages 1 and 2.</p>

  <div class="phase">
    <div class="phase-title">1 · Market</div>
    <p>Each player is dealt nine stage cards face down. Everyone secretly chooses <strong>one</strong> card to contribute. Those cards are shuffled together to form the shared <strong>pool</strong> for this round.</p>
  </div>

  <div class="phase">
    <div class="phase-title">2 · Private Viewing</div>
    <p>If you hold the Private Viewing Scheme and have at least <strong>2 Reputation</strong>, you may play it now to jump ahead in the purchase line. If several players play it, resolve in turn order (earlier token first). Playing Private Viewing counts as your one Scheme play for the round.</p>
  </div>

  <div class="phase">
    <div class="phase-title">3 · Purchasing</div>
    <p>In turn order, each player takes <strong>one</strong> turn. On your turn you may:</p>
    <ul>
      <li>Take <strong>one card from the pool</strong> — either buy it at its listed price, or discard it to the public Discard pile and take <strong>$4M / $8M / $12M</strong> from the Bank (Stages 1, 2, and 3).</li>
      <li>Buy <strong>Open Market Cocoa or Sugar</strong> for <strong>$5M / $10M / $15M</strong> (by stage).</li>
      <li>If you have <strong>Research Level 3</strong>, buy one <strong>Mastery</strong> from the shared offer for <strong>$50M</strong> (one Mastery per player; first come, first served in turn order).</li>
    </ul>
    <p class="small">The Open Market tray restocks at the start of each stage. Unsold stock carries over.</p>
  </div>

  <div class="phase">
    <div class="phase-title">4 · Schemes</div>
    <p>In turn order, each player may optionally:</p>
    <ul>
      <li>Pay <strong>1 Reputation</strong> to draw three Scheme cards and keep one (hand limit three; you cannot draw if fewer than three remain in the deck).</li>
      <li>Play <strong>one Scheme</strong> from hand (Veto Power is the exception — see Schemes section).</li>
    </ul>
    <p>When you play a Scheme, every other player gets a chance to cancel it with Veto Power. If it is not cancelled, resolve its effect. The exact Scheme name is never announced — only that someone played one.</p>
  </div>
</section>

<section class="page">
  <div class="phase">
    <div class="phase-title">5 · Assignment</div>
    <p>Build your atelier for this round:</p>
    <ul>
      <li>Place <strong>Researchers</strong> and <strong>Journalists</strong> from Supply onto your Research and Reputation tracks.</li>
      <li>Bank <strong>Extra Ingredient Slot</strong> cards, then attach slots to factories.</li>
      <li>Select ingredients from Supply and assign a <strong>recipe</strong> to an empty factory.</li>
      <li><strong>Tear down</strong> a factory for free: ingredients return to Supply and you may assign a new recipe the same round.</li>
    </ul>
    <p>When you complete a recipe for the first time this game, you earn Reputation (see below). Reputation is awarded only after <strong>every player</strong> has finished Assignment. If several players make the same recipe in the same round, the earlier turn-order token earns the bonus for being first in the game.</p>
  </div>

  <div class="phase">
    <div class="phase-title">6 · Income</div>
    <p>Everyone is paid at once:</p>
    <ul>
      <li>Factory income from each running recipe.</li>
      <li>Research track income.</li>
      <li>Reputation track income.</li>
    </ul>
    <p>Temporary Scheme effects may change this payment. Final scoring later ignores those temporary boosts.</p>
  </div>

  <div class="phase">
    <div class="phase-title">7 · Rotate first player</div>
    <p>The first player token moves to last. Begin the next round.</p>
  </div>
  <p class="small">After the <strong>eighth round</strong> of Stage 1 or Stage 2, resolve <strong>end-of-stage relief</strong> before the next stage begins (see Relief section). There is no relief after Stage 3.</p>
</section>

<section class="page">
  <h2>Factories and recipes</h2>
  <ul>
    <li>A recipe needs the <strong>exact ingredient types and counts</strong> shown — nothing extra, nothing missing.</li>
    <li>Each recipe lists a <strong>Research level</strong> you must reach before you can assign it (unless Unlicensed Chef removes that gate).</li>
    <li>Any number of players may run the <strong>same recipe</strong> — there is no global limit.</li>
    <li><strong>Premium</strong> Cocoa, Sugar, or Milk add <strong>$1M</strong> to that factory’s income. Premium Coffee or Almond add <strong>$2M</strong>.</li>
    <li>A factory using a <strong>hazardous</strong> extra slot loses <strong>$1M / $2M / $3M</strong> in Stages 1, 2, and 3.</li>
    <li>Factories keep paying every round until you tear them down.</li>
  </ul>
  <h3>Reputation for new recipes</h3>
  <p>When you assign a recipe (after everyone finishes Assignment):</p>
  <ul>
    <li>3 ingredients → <strong>1 Reputation</strong></li>
    <li>4 ingredients → <strong>2 Reputation</strong></li>
    <li>5 ingredients → <strong>3 Reputation</strong></li>
    <li>6 ingredients → <strong>6 Reputation</strong></li>
  </ul>
  <p>Plus <strong>1 extra Reputation</strong> if you are the first player in the game to make that recipe (Basic Chocolate never grants this bonus).</p>
</section>

<section class="page">
  <h2>Research</h2>
  <p>Assign Researchers from Supply to your Research track:</p>
  <ul>
    <li>Junior Researcher → <strong>+1</strong> Research point</li>
    <li>Senior Researcher → <strong>+2</strong> Research points</li>
    <li>Master Researcher → <strong>+3</strong> Research points</li>
  </ul>
  <h3>Research levels</h3>
  <table>
    <tr><th>Level</th><th>Points needed</th><th>Track income per round</th><th>Unlocks</th></tr>
    <tr><td>1</td><td>3</td><td>$1M</td><td>Research Level 1 recipes; 25% off Coffee and Almond purchases</td></tr>
    <tr><td>2</td><td>7</td><td>$3M (stacks with Level 1 → $4M total)</td><td>Level 2 recipes; 25% off Wild Berries and Caramel</td></tr>
    <tr><td>3</td><td>11</td><td>$6M (stacks → $10M total at Level 3)</td><td>Level 3 recipes; 25% off Royal Honey; buy Masteries</td></tr>
  </table>
  <p class="small">Sea Salt can be bought from the pool with no Research gate, but recipes that use Sea Salt still need Research Level 2 to assign.</p>
</section>

<section class="page">
  <h2>Reputation</h2>
  <p>Assign Journalists from Supply to your Reputation track:</p>
  <ul>
    <li>Junior Journalist → <strong>+2</strong> Reputation</li>
    <li>Senior Journalist → <strong>+3</strong> Reputation</li>
    <li>Master Journalist → <strong>+4</strong> Reputation</li>
  </ul>
  <h3>Reputation levels</h3>
  <table>
    <tr><th>Level</th><th>Points needed</th><th>Track income per round</th><th>Shop unlocks (one-time purchase)</th></tr>
    <tr><td>1</td><td>4</td><td>$1M</td><td>Extra slot $5M · Junior Researcher $4M</td></tr>
    <tr><td>2</td><td>12</td><td>$3M (stacks → $4M)</td><td>Extra slot $10M · Extra factory $20M · Senior Researcher $10M</td></tr>
    <tr><td>3</td><td>20</td><td>$6M (stacks → $10M)</td><td>Another Senior Researcher $10M</td></tr>
  </table>
  <p>Reputation is also spent to draw and play Schemes. There is <strong>no free Research</strong> from Reputation.</p>
  <p>Shop unlocks stay available even if you later drop below the level, but track income and ingredient discounts fall until you climb back up.</p>
  <p>Reputation grants the same 25% family discounts as Research (Coffee/Almond, Wild Berries/Caramel, Royal Honey). Discounts from both tracks <strong>add together</strong>.</p>
</section>

<section class="page">
  <h2>Most Reputable</h2>
  <p>The title goes to the first player with a <strong>unique lead</strong> and at least <strong>4 Reputation</strong>. A tie does not remove the title — the holder keeps it until another player has <strong>strictly more</strong> Reputation (and still at least 4), or the holder drops below 4.</p>
  <p>While you hold the title, pool purchases cost less:</p>
  <ul>
    <li>Stage 1 or 2: <strong>$2M</strong> off the face price</li>
    <li>Stage 3: <strong>$3M</strong> off</li>
  </ul>
  <p>Then Research and Reputation percentage discounts apply to the original face price. The title does <strong>not</strong> discount Open Market Cocoa or Sugar.</p>
  <p><strong>Hostile Takeover</strong> makes you Most Reputable for this turn and the next two, overriding the usual rules.</p>
</section>

<section class="page">
  <h2>Buying from the pool</h2>
  <p>Face prices are printed on each card. Extra Ingredient Slots cost <strong>$5M / $10M / $15M</strong> depending on which stage they entered the deck.</p>
  <p>When buying from the pool, discounts apply in this order:</p>
  <ol>
    <li>Most Reputable flat discount (if you hold the title).</li>
    <li>Research 25% off eligible families (round down from original face price).</li>
    <li>Reputation 25% off the same families (also from original face price).</li>
  </ol>
  <p>Price cannot fall below zero.</p>
</section>

<section class="page">
  <h2>Schemes</h2>
  <p>Schemes are optional. Each lists a Reputation cost to play. Other players may cancel with <strong>Veto Power</strong> (which does not count as their Scheme play for the round).</p>
  <table>
    <tr><th>Scheme</th><th>Cost</th><th>Effect</th></tr>
    ${schemesHtml}
  </table>
  <p class="footer-note">Play costs marked “stage” or “stage plus one” use the current stage number as Reputation (Stage 2 → 2 Rep, etc.). Black Market costs stage plus one.</p>
</section>

<section class="page">
  <h2>Masteries</h2>
  <p>At game start, reveal one unique Mastery per player from the deck. Any player with Research Level 3 may buy one Mastery from the shared offer during the Purchasing phase for <strong>$50M</strong>, in turn order. Each player may hold only one Mastery.</p>
  <table>
    <tr><th>Mastery</th><th>End-game bonus</th></tr>
    ${masteriesHtml}
  </table>
</section>

<section class="page">
  <h2>End-of-stage relief</h2>
  <p>After Stages 1 and 2, freeze standings using:</p>
  <ul>
    <li>Cash on hand</li>
    <li>Five million dollars per Research point</li>
    <li>Four million dollars per Reputation point</li>
    <li>Three times your clean factory production (ignore temporary Scheme effects)</li>
    <li>Mastery points</li>
  </ul>
  <p>Tied players share the <strong>worse</strong> rank. Players ranked third or lower (i.e. not in the top two) may take <strong>one relief package</strong> or skip:</p>
  <table>
    <tr><th>After Stage</th><th>Research package</th><th>Reputation package</th><th>Cash package</th><th>Discard ingredient</th><th>Score penalty if taken</th></tr>
    <tr><td>1</td><td>+1 Research point</td><td>+2 Reputation</td><td>$10M</td><td>One from public Discard</td><td>−$25M at final scoring</td></tr>
    <tr><td>2</td><td>+2 Research points</td><td>+3 Reputation</td><td>$20M</td><td>One from public Discard</td><td>−$50M at final scoring</td></tr>
  </table>
  <p>Last place chooses first. If several players tie for last, they roll dice — lowest roll chooses first among the tied players.</p>
</section>

<section class="page">
  <h2>Final scoring</h2>
  <p>After Stage 3, round 8, add everything:</p>
  <ul>
    <li>Cash on hand</li>
    <li><strong>$5M</strong> per Research point</li>
    <li><strong>$4M</strong> per Reputation point</li>
    <li><strong>Three times</strong> your last clean factory production (temporary Scheme effects stripped)</li>
    <li>Mastery scores</li>
    <li><strong>$25M</strong> split among players tied for most Research points (round down)</li>
    <li><strong>$25M</strong> split among players tied for most Reputation points (round down)</li>
    <li>Minus any relief penalties you took (−$25M or −$50M per package)</li>
  </ul>
  <p>The highest total wins. Ties share victory.</p>
  <h3>First-game tips</h3>
  <ol>
    <li>Make <strong>Basic Chocolate</strong> on your first Assignment — it starts your income immediately.</li>
    <li>Bid modestly in Stage 1. Cash spent on turn order is cash you cannot spend on cards.</li>
    <li>Buy Researchers early. Research Level 1 unlocks stronger recipes and future discounts.</li>
    <li>Discard useless pool cards for cash rather than gifting them to the next player.</li>
    <li>Skip Schemes until you have Reputation to spare — they are never required to win.</li>
  </ol>
</section>

<section class="page">
  <h2>Reference · Recipes (Stage 1)</h2>
  <table>
    <tr><th>Recipe</th><th>Ingredients</th><th>Income</th><th>Research</th></tr>
    ${recipesForStage(1)}
  </table>
</section>

<section class="page">
  <h2>Reference · Recipes (Stage 2)</h2>
  <table>
    <tr><th>Recipe</th><th>Ingredients</th><th>Income</th><th>Research</th></tr>
    ${recipesForStage(2)}
  </table>
</section>

<section class="page">
  <h2>Reference · Recipes (Stage 3)</h2>
  <table>
    <tr><th>Recipe</th><th>Ingredients</th><th>Income</th><th>Research</th></tr>
    ${recipesForStage(3)}
  </table>
</section>

<section class="page">
  <h2>Reference · Card costs</h2>
  <p class="small">“Stages” shows when copies enter the deck (n = number of players).</p>
  <table>
    <tr><th>Card</th><th>Face cost</th><th>Deck stages</th><th>Notes</th></tr>
    ${catalogHtml}
  </table>
  <p class="footer-note">Chocolatier v2.2.1 — digital playtest available. Full scheme texts match this booklet.</p>
</section>

</body>
</html>`

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, html)
console.log(`Wrote ${OUT}`)
