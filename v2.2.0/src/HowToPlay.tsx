export function HowToPlay() {
  return (
    <section className="panel rules-sheet" aria-labelledby="how-to-play-title">
      <div className="brand">Rules</div>
      <h2 id="how-to-play-title">How to play</h2>
      <p>
        You run a chocolate atelier. Buy ingredients, staff, and upgrades from a shared market, then
        assign them to factories so recipes pay you every round. After three stages, the richest net
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
        This edition is for <b>3 or 4 players</b>. There are <b>3 stages</b>, and each stage has{' '}
        <b>8 rounds</b>. A new stage brings new cards (Coffee, Almond, and Caramel in Stage 2; Wild
        Berries, Royal Honey, and Sea Salt in Stage 3). Recipe lists and card counts sit in the
        reference tables below this sheet.
      </p>
      <p>
        At the start of every stage you bid cash for <b>turn order</b>. Higher bid goes first. Ties
        go to higher Reputation, then a re-bid, then dice. After each round, the first player
        rotates to last. Online rooms let everyone bid, contribute, play Private Viewing, and pick
        relief at the same time; Schemes and Assignment stay in turn order.
      </p>

      <h3>A round, in order</h3>
      <ol className="rules-steps">
        <li>
          <b>Market.</b> Each player is dealt 9 Stage cards and secretly contributes <b>one</b> of
          them. Those cards are shuffled into a shared pool.
        </li>
        <li>
          <b>Private Viewing.</b> If you hold that Scheme and have 2 Reputation, you may play it now
          to cut the purchase line. Several plays queue by current turn-order tokens (highest first).
          Bots never play it.
        </li>
        <li>
          <b>Purchasing</b> (in turn order). Take <b>one</b> pool card: buy it, or discard it to the
          public Discard for <b>$4M / $8M / $12M</b> in Stages 1–3. During your turn you may also
          buy Open Market Cocoa or Sugar for <b>$5M / $10M / $15M</b> and, if you have Research L3,
          one Mastery for $50M from the shared offer (n unique Masteries revealed at game start).
          The open tray restocks each stage (2× players of each in Stage 1, then +n each later;
          unsold stock carries over).
        </li>
        <li>
          <b>Schemes.</b> Optionally pay 1 Reputation to draw 3 Schemes and keep 1 (hand limit 3;
          you cannot draw if fewer than 3 remain). Clicking a Scheme plays it immediately — others
          get a Veto window first, then you choose any targets. The Ledger does not name which
          Scheme was played. Veto Power is the exception: it is used when someone else plays a
          Scheme, and it does not use up your play.
        </li>
        <li>
          <b>Assignment.</b> Click Researchers and Journalists to put them on your tracks. Click Extra
          Ingredient Slot cards (face $5/$10/$15M by stage) to bank them, then <b>+ slot</b> on a
          factory. Select ingredients (or use a Ready to produce button) and assign a recipe. Tear
          down is free: ingredients return to Supply and you may rebuild a better recipe the same
          turn. Reputation for new recipes is awarded only after <b>everyone</b> finishes Assignment
          (turn-order tokens break ties for first-to-make). Online Assignment is simultaneous.
        </li>
        <li>
          <b>Income.</b> Everyone is paid at once: factory recipes + Research track + Reputation
          track. Temporary Scheme effects can change that payment; scoring later strips them.
        </li>
        <li>
          <b>End of Stage relief</b> after Stages 1–2 (not 3). Standings freeze using cash + 5×ResP
          + 4×RepP + 3× clean production + Mastery points. Ties share the worse rank. Rank 3+ may
          take up to 1 package (or skip). Last place chooses first; joint last rolls dice. Packages:
          +1/+2 ResP, +2/+3 Rep, $10/20M, or one Discard ingredient. Each package taken costs 25/50
          final-score penalty.
        </li>
      </ol>

      <h3>How a factory pays</h3>
      <ul>
        <li>A recipe needs the exact ingredient types, in the exact counts, and nothing extra.</li>
        <li>Each recipe lists the Research level required to assign it.</li>
        <li>Recipes are not limited across the table — any number of players may run the same recipe.</li>
        <li>
          Premium extras: Cocoa/Sugar/Milk +$1M, Coffee/Almond +$2M to that factory. A hazardous
          extra slot subtracts $1/$2/$3M by the current stage.
        </li>
        <li>Factories keep paying every round until you tear them down.</li>
      </ul>

      <h3>Research and Reputation</h3>
      <p>
        Assign staff from Supply. Junior / Senior / Master Researchers are +1 / +2 / +3 Research
        points. Journalists are +2 / +3 / +4 Reputation. Both tracks also pay income: <b>$1M / $3M /
        $6M</b> per round at Level 1 / 2 / 3, and those stack.
      </p>
      <ul>
        <li>
          <b>Research</b> levels at 3 / 7 / 11 points. Unlocks recipes, and 25% off Coffee/Almond
          (L1), Wild Berries/Caramel (L2), Royal Honey (L3). Sea Salt is buyable with no gate;
          recipes that use it still need Research L2.
        </li>
        <li>
          <b>Reputation</b> levels at 4 / 12 / 20 points. You spend it to draw and play Schemes.
          Completing a recipe awards 1 / 2 / 3 / 6 Reputation for 3 / 4 / 5 / 6 ingredients, plus +1
          if you are first to make that recipe — except Basic Chocolate. There is no free Research
          from Reputation. Shop unlocks stay after you drop below the level; income and discounts
          drop until you climb again. L1: a $5M extra slot and a $4M Junior Researcher. L2: a $10M
          slot, a $20M factory, and a $10M Senior Researcher. L3: another $10M Senior Researcher.
          Same 25% family discounts as Research, and they add.
        </li>
        <li>
          <b>Most Reputable</b> is first awarded to a unique lead with at least 4 Reputation. A tie
          does not remove it — the holder keeps the title until another player is strictly ahead
          (Catan-style). Dropping below 4 loses it. The title knocks $2M / $2M / $3M off pool prices
          in Stages 1–3, then track percents apply. It does not discount Open Market Cocoa/Sugar.
        </li>
      </ul>

      <h3>Schemes and Masteries</h3>
      <p>
        Schemes are optional dirty tricks. Each has a Reputation play cost (often 1, sometimes stage
        or stage+1). Other players get a chance to Veto. Press Leak peeks at exactly two opponents'
        Schemes and may discard one from each who holds two or more. Embezzlement takes $3/$6/$9M
        from each other player by stage (they pay all cash if short). Hostile Takeover makes you Most
        Reputable for this turn and the next 2. Double Agent swaps one hand card with each of two
        other players. n unique Masteries are revealed at game start; buy one for $50M with Research
        L3, first come first served in turn order. Masteries count in standings (including relief)
        and final scoring.
      </p>
      <p className="tiny">
        Full Scheme and Mastery texts are in the ledger reference once a game is open.
      </p>

      <h3>How you win</h3>
      <p>After Stage 3, round 8, score everything you have:</p>
      <ul>
        <li>Cash on hand</li>
        <li>
          <b>$5M</b> per Research point
        </li>
        <li>
          <b>$4M</b> per Reputation point
        </li>
        <li>
          <b>3×</b> your last clean production (temporary Scheme effects stripped)
        </li>
        <li>Mastery scores</li>
        <li>
          <b>$25M</b> split among whoever has the most Research points, and another <b>$25M</b> split
          among whoever has the most Reputation (ties share; floor).
        </li>
        <li>Minus any End of Stage relief penalties you took (25 / 50 per package after Stages 1 / 2).</li>
      </ul>

      <h3>First-game advice</h3>
      <ol>
        <li>
          On Assignment, make <b>Basic Chocolate</b> immediately. It is unlimited and starts your
          income.
        </li>
        <li>Bid small in Stage 1. Cash spent on turn order is cash you cannot spend on cards.</li>
        <li>
          Buy Researchers when you see them. Research L1 unlocks Extra Dark and cheapens Coffee and
          Almond later.
        </li>
        <li>
          If a pool card is useless to you, discard it for the stage pay rather than leaving a gift
          for the player after you — but remember you only resolve one pool card on your turn.
        </li>
        <li>Skip Schemes until you have Reputation to spare. They are not required to win.</li>
        <li>
          Hot-seat and online: you only see your own hand and Schemes. Opponents&apos; hands stay
          hidden unless Double Agent lets you look. Factories and Supply stay public.
        </li>
      </ol>
    </section>
  )
}
