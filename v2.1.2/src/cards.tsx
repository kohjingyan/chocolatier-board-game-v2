import type { ReactNode } from 'react'
import {
  INGREDIENT_GUIDE,
  INGREDIENT_LABEL,
  MASTERY_INFO,
  RECIPES,
  SCHEME_INFO,
  premiumPay,
  recipesUsing,
  schemePlayCost,
} from './engine/data'
import { recipePay } from './engine/income'
import { catalogCost, ownedFamilyCount, requiredResLevel } from './engine/queries'
import type { GameCard, GameState, IngredientFamily, Player, SchemeId } from './engine/types'

function money(n: number) {
  return `$${n}M`
}

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg className="card-icon" viewBox="0 0 24 24" aria-hidden="true">
      {children}
    </svg>
  )
}

export function IngredientIcon({
  family,
  premium,
  have,
}: {
  family: IngredientFamily
  premium?: boolean
  have?: boolean
}) {
  const dim = have === false
  const glow = have === true
  return (
    <span className={`ing-icon ${dim ? 'need' : ''} ${glow ? 'have' : ''}`} title={INGREDIENT_LABEL[family]}>
      {familyIcon(family)}
      {premium ? <span className="premium-dot">+</span> : null}
    </span>
  )
}

function familyIcon(family: IngredientFamily) {
  if (family === 'cocoa') {
    return (
      <Svg>
        <ellipse cx="12" cy="14" rx="7" ry="6" fill="#5c3317" />
        <path d="M9 8c1-3 5-3 6 0" fill="none" stroke="#3d2418" strokeWidth="1.6" />
      </Svg>
    )
  }
  if (family === 'sugar') {
    return (
      <Svg>
        <path d="M6 16l6-10 6 10z" fill="#f4ead6" stroke="#c9893a" strokeWidth="1.2" />
        <circle cx="12" cy="14" r="1.2" fill="#c9893a" />
      </Svg>
    )
  }
  if (family === 'milk') {
    return (
      <Svg>
        <path d="M8 7h8l1 3v9H7V10z" fill="#fff8ec" stroke="#8a6230" strokeWidth="1.2" />
        <path d="M9 7c0-2 6-2 6 0" fill="none" stroke="#8a6230" strokeWidth="1.2" />
      </Svg>
    )
  }
  if (family === 'matcha') {
    return (
      <Svg>
        <circle cx="12" cy="13" r="7" fill="#3d6b4f" />
        <path d="M8 12c2 2 6 2 8 0" fill="none" stroke="#f4ead6" strokeWidth="1.4" />
      </Svg>
    )
  }
  if (family === 'coffee') {
    return (
      <Svg>
        <path d="M6 9h10v7a4 4 0 01-4 4H10a4 4 0 01-4-4z" fill="#3d2418" />
        <path d="M16 10h3a2 2 0 010 5h-3" fill="none" stroke="#c9893a" strokeWidth="1.4" />
      </Svg>
    )
  }
  if (family === 'almond') {
    return (
      <Svg>
        <ellipse cx="12" cy="13" rx="5" ry="8" transform="rotate(-25 12 13)" fill="#d4b36a" stroke="#8a6230" />
      </Svg>
    )
  }
  if (family === 'wild_berries') {
    return (
      <Svg>
        <circle cx="9" cy="14" r="4" fill="#8b3a3a" />
        <circle cx="15" cy="13" r="3.4" fill="#6b2a4a" />
        <circle cx="12" cy="9" r="2.6" fill="#a44" />
      </Svg>
    )
  }
  if (family === 'caramel') {
    return (
      <Svg>
        <path d="M5 14c2 4 12 4 14 0-1 5-13 5-14 0z" fill="#c9893a" />
        <path d="M7 12c3-4 8-4 10 0" fill="none" stroke="#f4ead6" strokeWidth="1.3" />
      </Svg>
    )
  }
  if (family === 'strawberry') {
    return (
      <Svg>
        <path d="M12 20c-5-3-6-9-3-12 2 2 4 2 6 0 3 3 2 9-3 12z" fill="#b33" />
        <path d="M9 7c2 1 4 1 6 0-1-2-5-2-6 0z" fill="#3d6b4f" />
      </Svg>
    )
  }
  if (family === 'sea_salt') {
    return (
      <Svg>
        <path d="M4 15c3-2 5 2 8 0s5 2 8 0" fill="none" stroke="#7aa" strokeWidth="1.5" />
        <circle cx="9" cy="10" r="1.4" fill="#e8e8e8" />
        <circle cx="13" cy="8" r="1.1" fill="#ddd" />
        <circle cx="16" cy="11" r="1.2" fill="#eee" />
      </Svg>
    )
  }
  return (
    <Svg>
      <ellipse cx="12" cy="14" rx="6" ry="5" fill="#d4b36a" />
      <path d="M10 8c.5-2 3.5-2 4 0" fill="none" stroke="#8a6230" strokeWidth="1.4" />
    </Svg>
  )
}

export function KindIcon({
  kind,
  family,
  premium,
}: {
  kind: GameCard['kind'] | 'scheme'
  family?: IngredientFamily
  premium?: boolean
}) {
  if (kind === 'ingredient' && family) return <IngredientIcon family={family} premium={premium} />
  if (kind === 'researcher') {
    return (
      <Svg>
        <circle cx="12" cy="8" r="3.2" fill="#d4b36a" />
        <path d="M6 20c1-5 11-5 12 0" fill="#3d6b4f" />
        <rect x="15" y="6" width="5" height="3" rx="1" fill="#f4ead6" />
      </Svg>
    )
  }
  if (kind === 'journalist') {
    return (
      <Svg>
        <circle cx="9" cy="8" r="3" fill="#d4b36a" />
        <path d="M4 20c1-5 9-5 10 0" fill="#8b3a3a" />
        <rect x="13" y="9" width="8" height="10" fill="#f4ead6" stroke="#8a6230" />
        <path d="M15 12h4M15 15h4" stroke="#8a6230" />
      </Svg>
    )
  }
  if (kind === 'slot') {
    return (
      <Svg>
        <rect x="4" y="4" width="16" height="16" rx="3" fill="none" stroke="#c9893a" strokeWidth="1.6" strokeDasharray="3 2" />
        <path d="M12 8v8M8 12h8" stroke="#c9893a" strokeWidth="1.6" />
      </Svg>
    )
  }
  if (kind === 'mastery') {
    return (
      <Svg>
        <path d="M6 10l3 2 3-6 3 6 3-2-1 9H7z" fill="#d4b36a" stroke="#8a6230" />
      </Svg>
    )
  }
  return (
    <Svg>
      <path d="M5 11c0-4 14-4 14 0v7H5z" fill="#3d2418" />
      <circle cx="9" cy="14" r="1" fill="#d4b36a" />
      <circle cx="15" cy="14" r="1" fill="#d4b36a" />
    </Svg>
  )
}

export function HoverTip({
  text,
  children,
}: {
  text: ReactNode
  children: ReactNode
}) {
  if (!text) return <>{children}</>
  return (
    <span className="hover-tip">
      {children}
      <span className="hover-tip-box">{text}</span>
    </span>
  )
}

export function cardTooltip(card: GameCard): ReactNode {
  if (card.name === 'Hidden card' || card.name === 'Facedown') return 'Hidden from you.'
  if (card.kind === 'ingredient' && card.family) {
    if (card.family === 'cocoa' || card.family === 'sugar') {
      return card.premium
        ? `Counts as ${INGREDIENT_LABEL[card.family]} and adds +$${premiumPay(card)}M to that factory.`
        : `${INGREDIENT_LABEL[card.family]} is also sold on the Open Market.`
    }
    const used = recipesUsing(card.family)
      .slice(0, 8)
      .map((r) => r.name)
    const extra = recipesUsing(card.family).length > 8 ? '…' : ''
    const premium = card.premium
      ? `Counts as ${INGREDIENT_LABEL[card.family]} and adds +$${premiumPay(card)}M. `
      : ''
    return `${premium}Helps cook: ${used.join(', ')}${extra}`
  }
  if (card.kind === 'researcher') {
    return `Assign to the Research track for +${card.resP ?? 0} Research points.`
  }
  if (card.kind === 'journalist') {
    return `Assign to the Reputation track for +${card.repP ?? 0} Reputation points.`
  }
  if (card.kind === 'slot') {
    return 'Bank an extra ingredient slot, then attach it to a factory with + slot. Face is $5/$10/$15/$20M in Stages 1–4.'
  }
  if (card.kind === 'mastery' && card.masteryId) {
    return MASTERY_INFO[card.masteryId].text
  }
  return null
}

export function schemeTooltip(id: SchemeId, playerCount: number, stage: number): string {
  const info = SCHEME_INFO[id]
  return `${info.text} Play cost: ${schemePlayCost(id, playerCount, stage)} Rep.`
}

export function RecipeNeeds({
  recipe,
  player,
  state,
}: {
  recipe: (typeof RECIPES)[number]
  player?: Player | null
  state?: GameState
}) {
  const need = requiredResLevel(recipe)
  const used = new Map<IngredientFamily, number>()
  const haveLeft = new Map<IngredientFamily, number>()
  if (player) {
    for (const fam of Object.keys(INGREDIENT_LABEL) as IngredientFamily[]) {
      haveLeft.set(fam, ownedFamilyCount(player, fam))
    }
  }
  return (
    <span className="recipe-needs">
      <span className="recipe-needs-meta">
        Res L{need}
        {state ? ` · ${money(recipePay(state, recipe))}/turn` : ''}
      </span>
      <span className="recipe-needs-icons">
        {recipe.ingredients.map((fam, i) => {
          const already = used.get(fam) ?? 0
          used.set(fam, already + 1)
          const stock = haveLeft.get(fam)
          const have = stock === undefined ? undefined : stock > already
          return <IngredientIcon key={`${recipe.id}-${fam}-${i}`} family={fam} have={have} />
        })}
      </span>
    </span>
  )
}

function familyFromGuideName(name: string): IngredientFamily | undefined {
  const lower = name.toLowerCase()
  if (lower.includes('cocoa')) return 'cocoa'
  if (lower.includes('sugar')) return 'sugar'
  if (lower.includes('milk')) return 'milk'
  if (lower.includes('matcha')) return 'matcha'
  if (lower.includes('coffee')) return 'coffee'
  if (lower.includes('almond')) return 'almond'
  if (lower.includes('berries')) return 'wild_berries'
  if (lower.includes('caramel')) return 'caramel'
  if (lower.includes('strawberry')) return 'strawberry'
  if (lower.includes('salt')) return 'sea_salt'
  if (lower.includes('honey')) return 'royal_honey'
  return undefined
}

export function IngredientsGuide({ state }: { state: GameState }) {
  return (
    <details>
      <summary>Ingredients</summary>
      <p className="tiny light">Face cost and the first stage the card enters the deck.</p>
      <table className="ref-table">
        <thead>
          <tr>
            <th></th>
            <th>Ingredient</th>
            <th>$</th>
            <th>First stage</th>
          </tr>
        </thead>
        <tbody>
          {INGREDIENT_GUIDE.map((c) => {
            const family = familyFromGuideName(c.name)
            return (
              <tr key={c.name}>
                <td>{family ? <IngredientIcon family={family} premium={c.name.startsWith('Premium')} /> : null}</td>
                <td>
                  {c.name}
                  {c.notes ? <div className="tiny light">{c.notes}</div> : null}
                </td>
                <td>{catalogCost(state, c.name, c.cost)}</td>
                <td>{c.firstStage}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </details>
  )
}
