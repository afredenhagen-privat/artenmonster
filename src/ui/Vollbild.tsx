import { useEffect } from 'react'
import type { Lang } from '../core/types.ts'
import { t } from '../i18n/strings.ts'

/**
 * Vollbild für den Stammbaum.
 *
 * Der Baum ist das Kernstück, und auf einem grossen Bildschirm ist die schmale
 * Spalte daneben Verschwendung. Hier bekommt er alles: oben eine schmale Leiste
 * mit den Umschaltern, unten das Eingabefeld, dazwischen nichts als Baum.
 *
 * Die echte Vollbild-Schnittstelle des Browsers wird mitgenommen, wenn sie
 * verfügbar ist. Sie ist aber nur die Zugabe: Die Anzeige liegt ohnehin über
 * allem, damit es auch dort funktioniert, wo der Browser sie verweigert.
 */

interface Props {
  lang: Lang
  kopf: React.ReactNode
  fuss: React.ReactNode
  beiSchliessen: () => void
  children: React.ReactNode
}

export function Vollbild({ lang, kopf, fuss, beiSchliessen, children }: Props) {
  // Escape schliesst, und das Blättern der Seite darunter wird stillgelegt.
  useEffect(() => {
    const beiTaste = (e: KeyboardEvent) => {
      if (e.key === 'Escape') beiSchliessen()
    }
    document.addEventListener('keydown', beiTaste)
    const vorher = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', beiTaste)
      document.body.style.overflow = vorher
    }
  }, [beiSchliessen])

  // Zugabe, kein Muss: Verweigert der Browser das echte Vollbild, bleibt die
  // Anzeige trotzdem bildschirmfüllend.
  useEffect(() => {
    document.documentElement.requestFullscreen?.().catch(() => {})
    return () => {
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-tinte">
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-linie px-4 py-2">
        {kopf}
        <button
          type="button"
          onClick={beiSchliessen}
          className="etikett ml-auto border border-linie px-3 py-1.5 transition hover:border-flechte hover:text-knochen"
        >
          {t(lang, 'vollbildVerlassen')}
        </button>
      </div>

      <div className="min-h-0 flex-1">{children}</div>

      <div className="shrink-0 border-t border-linie px-4 py-3">{fuss}</div>
    </div>
  )
}
