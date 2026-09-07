export function HowToPlay() {
  return (
    <section className="panel rules-sheet" aria-labelledby="how-to-play-title">
      <div className="brand">Rules</div>
      <h2 id="how-to-play-title">How to play</h2>
      <p>
        You run a chocolate atelier. Buy ingredients, staff, and upgrades from a shared market, then
        assign them to factories so recipes pay you every round. After four stages, the richest net
        worth wins.
      </p>

      <h3>What you start with</h3>
      <ul>
        <li>
          <b>$20M</b> cash.
        </li>
        <li>
          One <b>Basic Cocoa</b> and one <b>Sugar</b> in Supply — enough for Basic Chocolate.
        </li>
        <li>
          <b>Four factories</b>, each with 3 ingredient slots. Bigger recipes need extra slots.
        </li>
        <li>No Research, no Reputation, no Schemes yet.</li>
      </ul>

      <h3>The shape of the game</h3>
      <p>
        There are <b>4 stages</b>, and each stage has <b>8 rounds</b>. A new stage brings new cards
        (Coffee and Almond in Stage 2, berries and caramel in Stage 3, Royal Honey and Masteries in
        Stage 4). Recipe lists and card counts sit in the reference tables below this sheet.
      </p>
      <p>
        At the start of every stage you bid cash for <b>turn order</b>. Higher bid goes first. Ties
        go to higher Reputation, then a re-bid, then dice. After each round, the first player
        rotates to last.
      </p>

      <h3>A round, in order</h3>
      <ol className="rules-steps">
        <li>
          <b>Market.</b> In the usual game, each player was dealt 10 Stage cards and now secretly
          contributes <b>one</b> of them. Those cards are shuffled into a shared pool. Direct draw
          skips that: the table draws one card per player from the Stage deck instead.
        </li>
        <li>
          <b>Private Viewing.</b> If you hold that Scheme and have 2 Reputation, you may play it now
          to buy first. Otherwise pass. Bots never play it.
        </li>
        <li>
          <b>Purchasing</b> (in turn order). Take <b>one</b> pool card: buy it, or discard it to the
          public Discard for <b>$5M / $10M / $15M / $20M</b> in Stages 1–4. During your turn you may
          also buy Open Market Cocoa or Sugar for <b>$5M</b> each. The open tray restocks each stage
          (2× players of each in Stage 1, then 1× players). Then the next player goes. When the pool
          is empty, purchasing ends even if someone has not had a turn.
        </li>
        <li>
          <b>Schemes.</b> Optionally pay 1 Reputation to draw 3 Schemes and keep 1 (hand limit 3;
          you cannot draw if fewer than 3 remain). Then play at most one Scheme. Veto Power is the
          exception: it is used when someone else plays a Scheme, and it does not use up your play.
        </li>
        <li>
          <b>Assignment.</b> Click Researchers and Journalists to put them on your tracks. Click
          Extra Ingredient Slot cards (face $5/$10/$15/$20M by stage) to bank them, then <b>+ slot</b> on a factory. Select
          ingredients (or use a Ready to produce button) and assign a recipe. Tear down returns
          those ingredients to Supply so you can rebuild. Reputation awards for new recipes are
          granted only when you click <b>Done assigning</b>.
        </li>
        <li>
          <b>Income.</b> Everyone is paid at once: factory recipes + Research track + Reputation
          track + Mastery bonuses.
        </li>
        <li>
          <b>End of Stage relief</b> after Stages 1–3 (not 4). Standings freeze using cash + 5×ResP
          + 4×RepP + 3× last production. Ties share the worse rank. Rank 3–4 may take up to 1
          package; rank 5+ up to 2 different packages (or skip). Last place chooses first; joint
          last rolls dice. Packages: +1/+2/+3 ResP, +2/+3/+4 Rep, $10/20/30M, or one Discard
          ingredient. Each package taken costs 25/50/75 final-score penalty.
        </li>
      </ol>

      <h3>How a factory pays</h3>
      <ul>
        <li>A recipe needs the exact ingredient types, in the exact counts, and nothing extra.</li>
        <li>
          Recipe <b>Tier N</b> needs Research Level <b>N−1</b> (Tier 1 is open from the start).
        </li>
        <li>
          Many recipes are limited across the whole table: n+1, n, n−1, or by-count (2/2/3/4
          factories at 3/4/5/6 players). Stage 2 adds Milky Almond Chocolate.
        </li>
        <li>
          Premium extras: Cocoa +$1M, Milk +$2M, Coffee +$3M, Almond +$3M to that factory.
        </li>
        <li>Factories keep paying every round until you tear them down.</li>
      </ul>

      <h3>Research and Reputation</h3>
      <p>
        Assign staff from Supply. Junior / Senior / Master Researchers are +1 / +2 / +3 Research
        points. Journalists are +2 / +3 / +5 Reputation. Both tracks also pay income: <b>$1M / $3M /
        $6M</b> per round at Level 1 / 2 / 3, and those stack.
      </p>
      <ul>
        <li>
          <b>Research</b> levels at 3 / 7 / 11 points. Unlocks higher-tier recipes, Sea Salt at L2,
          and 25% off Coffee/Almond (L1), Wild Berries/Caramel (L2), Royal Honey (L3).
        </li>
        <li>
          <b>Reputation</b> levels at 5 / 13 / 21 points. You spend it to draw and play Schemes.
          Completing a recipe awards 1 / 2 / 4 / 8 Reputation for 3 / 4 / 5 / 6 ingredients, plus
          +1 if you are first in the game to make that recipe (the Recipe board highlights that
          player). Reputation bonus Research is +1 / +3 / +5 ResP at L1 / L2 / L3. L1: a $5M extra
          slot. L2: a second $10M slot and a $20M extra factory.
          Strawberry needs L2 to buy. Same 25% family discounts as Research, and they add.
        </li>
        <li>
          <b>Most Reputable</b> is first awarded to a unique lead with at least 5 Reputation. A tie
          does not remove it — the holder keeps the title until another player is strictly ahead
          (Catan-style). Dropping below 5 loses it. The title knocks $1M / $1M / $2M / $3M off pool
          prices in Stages 1–4, then track percents apply. It does not discount Open Market
          Cocoa/Sugar.
        </li>
      </ul>

      <h3>Schemes and Masteries</h3>
      <p>
        Schemes are optional dirty tricks. Each has a Reputation play cost (sometimes players−2 or
        the current stage). Other players get a chance to Veto. Hostile Takeover makes you Most
        Reputable for this turn and the next 2. Double Agent swaps one hand card with each of two
        other players. Stage 4 can put a Mastery into play if you have Research L3 or Reputation L3
        — you keep only one.
      </p>
      <p className="tiny">
        Full Scheme and Mastery texts are in the ledger reference once a game is open.
      </p>

      <h3>How you win</h3>
      <p>After Stage 4, round 8, score everything you have:</p>
      <ul>
        <li>Cash on hand</li>
        <li>
          <b>$5M</b> per Research point
        </li>
        <li>
          <b>$4M</b> per Reputation point
        </li>
        <li>
          <b>3×</b> your last income payment
        </li>
        <li>
          <b>$25M</b> split among whoever has the most Research points, and another <b>$25M</b> split
          among whoever has the most Reputation (ties share; floor).
        </li>
        <li>
          Minus any End of Stage relief penalties you took (25 / 50 / 75 per package after Stages
          1 / 2 / 3).
        </li>
      </ul>

      <h3>First-game advice</h3>
      <ol>
        <li>
          On Assignment, make <b>Basic Chocolate</b> immediately. It is unlimited and starts your
          income.
        </li>
        <li>Bid small in Stage 1. Cash spent on turn order is cash you cannot spend on cards.</li>
        <li>
          Buy Researchers when you see them. Research L1 unlocks Tier 2 recipes and cheapens Coffee
          and Almond later.
        </li>
        <li>
          If a pool card is useless to you, discard it for the stage pay rather than leaving a gift for the
          player after you — but remember you only resolve one pool card on your turn.
        </li>
        <li>Skip Schemes until you have Reputation to spare. They are not required to win.</li>
        <li>
          Hot-seat: the screen hides between turns — pass the device. Online: you only see your own
          hand and Schemes; factories and Supply stay public.
        </li>
      </ol>
    </section>
  )
}
