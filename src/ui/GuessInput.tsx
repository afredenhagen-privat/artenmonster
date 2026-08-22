import { useEffect, useMemo, useRef, useState } from 'react'
import type { GameData } from '../data/load.ts'
import type { GameState } from '../core/game.ts'
import { alreadyGuessed, animalsInGroup, knownNode } from '../core/game.ts'
import type { Lang } from '../core/types.ts'
import { t } from '../i18n/strings.ts'

/**
 * Eingabefeld mit Autovervollständigung.
 *
 * Gesucht wird gleichzeitig in deutschen, englischen und wissenschaftlichen
 * Namen. Der Index ist umlautunempfindlich, "loewe" findet also den Löwen.
 */

interface Props {
  data: GameData
  state: GameState
  lang: Lang
  disabled?: boolean
  onGuess: (animal: number) => void
}

export function GuessInput({ data, state, lang, disabled, onGuess }: Props) {
  const [text, setText] = useState('')
  const [aktiv, setAktiv] = useState(0)
  const [meldung, setMeldung] = useState<string | null>(null)
  const [fokus, setFokus] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const animalNodes = useMemo(() => data.animals.map((a) => a.node), [data])

  /**
   * Bei leerer Eingabe: die Tiere der bereits eingegrenzten Gruppe anbieten,
   * sofern es wenige genug sind. Sonst die Treffer zur Eingabe.
   */
  const gruppe = useMemo(() => {
    if (text.trim().length > 0) return null
    const node = knownNode(state, data.tree)
    if (istWurzel(node, data)) return null
    const tiere = animalsInGroup(data.tree, animalNodes, node, 30)
    return tiere && tiere.length > 0 ? { node, tiere } : null
  }, [data, state, text, animalNodes])

  const vorschlaege = useMemo(() => {
    if (text.trim().length < 1) return gruppe ? gruppe.tiere.slice(0, 30) : []
    return data.search.search(text, 8)
  }, [data, text, gruppe])

  useEffect(() => setAktiv(0), [text, gruppe])

  useEffect(() => {
    if (!meldung) return
    const timer = setTimeout(() => setMeldung(null), 2200)
    return () => clearTimeout(timer)
  }, [meldung])

  // Die aktive Zeile in den sichtbaren Bereich holen.
  useEffect(() => {
    listRef.current?.children[aktiv]?.scrollIntoView({ block: 'nearest' })
  }, [aktiv])

  function absenden(animal: number | undefined): void {
    if (animal === undefined) {
      setMeldung(t(lang, 'nichtGefunden'))
      return
    }
    if (alreadyGuessed(state, animal)) {
      setMeldung(t(lang, 'schonGeraten'))
      return
    }
    onGuess(animal)
    setText('')
    inputRef.current?.focus()
  }

  function beiTaste(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setAktiv((i) => Math.min(i + 1, vorschlaege.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setAktiv((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      absenden(vorschlaege[aktiv] ?? data.search.exact(text) ?? undefined)
    } else if (e.key === 'Escape') {
      setText('')
    }
  }

  return (
    <div className="relative">
      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={text}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={beiTaste}
          onFocus={() => setFokus(true)}
          onBlur={() => setTimeout(() => setFokus(false), 150)}
          placeholder={t(lang, 'eingabe')}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-label={t(lang, 'eingabe')}
          className="w-full border border-linie bg-kabinett px-4 py-3 font-tafel text-[15px] text-knochen placeholder-flechte/60 outline-none transition focus:border-nah disabled:opacity-50"
        />
        <button
          type="button"
          disabled={disabled || vorschlaege.length === 0}
          onClick={() => absenden(vorschlaege[aktiv])}
          className="shrink-0 border border-nah bg-nah/15 px-5 py-3 font-etikett text-[11px] uppercase tracking-etikett text-nah transition hover:bg-nah hover:text-tinte disabled:opacity-30 disabled:hover:bg-nah/15 disabled:hover:text-nah"
        >
          {t(lang, 'raten')}
        </button>
      </div>

      {meldung && <p className="mt-2 text-[13px] text-mittel">{meldung}</p>}

      {gruppe && vorschlaege.length > 0 && (
        <p className="etikett mt-2">
          {vorschlaege.length}
          {lang === 'de' ? ' Tiere in ' : ' animals in '}
          {data.tree.nameOf(gruppe.node, lang)}
        </p>
      )}

      {vorschlaege.length > 0 && !disabled && fokus && (
        <ul
          ref={listRef}
          className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto border border-linie bg-kabinett shadow-2xl shadow-tinte"
        >
          {vorschlaege.map((animal, i) => {
            const node = data.animals[animal].node
            const schonGeraten = alreadyGuessed(state, animal)
            return (
              <li key={animal}>
                <button
                  type="button"
                  onMouseEnter={() => setAktiv(i)}
                  onClick={() => absenden(animal)}
                  className={
                    'flex w-full items-baseline justify-between gap-3 border-l-2 px-4 py-2 text-left transition ' +
                    (i === aktiv ? 'border-l-nah bg-fach' : 'border-l-transparent') +
                    (schonGeraten ? ' opacity-35' : '')
                  }
                >
                  <span className="font-tafel text-[14px] text-knochen">{data.tree.nameOf(node, lang)}</span>
                  <span className="binomen shrink-0 text-[11px] text-flechte">
                    {data.tree.scientificName(node)}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** Die Wurzel als Gruppe anzubieten waere sinnlos, das sind alle Tiere. */
function istWurzel(node: number, data: GameData): boolean {
  return data.tree.parentOf(node) === -1
}
