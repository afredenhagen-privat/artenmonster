import { useEffect, useMemo, useRef, useState } from 'react'
import type { GameData } from '../data/load.ts'
import type { GameState } from '../core/game.ts'
import { alreadyGuessed } from '../core/game.ts'
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
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const vorschlaege = useMemo(() => {
    if (text.trim().length < 1) return []
    return data.search.search(text, 8)
  }, [data, text])

  useEffect(() => setAktiv(0), [text])

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
          placeholder={t(lang, 'eingabe')}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-label={t(lang, 'eingabe')}
          className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 placeholder-slate-500 outline-none focus:border-teal-500 disabled:opacity-50"
        />
        <button
          type="button"
          disabled={disabled || vorschlaege.length === 0}
          onClick={() => absenden(vorschlaege[aktiv])}
          className="shrink-0 rounded-xl bg-teal-600 px-5 py-3 font-medium text-white transition hover:bg-teal-500 disabled:opacity-40"
        >
          {t(lang, 'raten')}
        </button>
      </div>

      {meldung && <p className="mt-2 text-sm text-amber-400">{meldung}</p>}

      {vorschlaege.length > 0 && !disabled && (
        <ul
          ref={listRef}
          className="absolute z-20 mt-2 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 shadow-xl"
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
                    'flex w-full items-baseline justify-between gap-3 px-4 py-2.5 text-left transition ' +
                    (i === aktiv ? 'bg-slate-800' : '') +
                    (schonGeraten ? ' opacity-40' : '')
                  }
                >
                  <span className="text-slate-100">{data.tree.nameOf(node, lang)}</span>
                  <span className="shrink-0 text-xs italic text-slate-500">
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
