import { useEffect } from 'react'
import type { Lang } from '../core/types.ts'
import { t } from '../i18n/strings.ts'

/**
 * Vollbild für den Stammbaum.
 *
 * Der Baum liegt über die ganze Fläche, die Bedienung schwebt darüber: links
 * oben ein Feld mit der Eingabe, rechts oben die Umschalter. Das ist nicht nur
 * Geschmack — säße die Eingabe unten, klappte die Vorschlagsliste aus dem Bild,
 * und eine Fußzeile nähme dem Baum die Höhe, die im Vollbild gerade der Gewinn
 * sein soll.
 *
 * Die echte Vollbild-Schnittstelle des Browsers wird mitgenommen, wenn sie
 * verfügbar ist. Sie ist aber nur die Zugabe: Die Anzeige liegt ohnehin über
 * allem, damit es auch dort funktioniert, wo der Browser sie verweigert.
 */

interface Props {
  lang: Lang
  /** Schwebt links oben: Eingabe und Stand der Runde. */
  tafel: React.ReactNode
  /**
   * Bringt die Tafel ihren eigenen Rahmen mit?
   *
   * Nach dem Spielende steht dort die Ergebniskarte, die schon gerahmt ist.
   * Ein zweiter Rahmen darum wäre doppelt gemoppelt. Ausserdem darf nur diese
   * Fassung scrollen: Während gespielt wird, klappt die Vorschlagsliste aus der
   * Tafel heraus, und ein Scrollrahmen würde sie abschneiden.
   */
  tafelGerahmt?: boolean
  /** Schwebt rechts oben: Umschalter. */
  steuerung: React.ReactNode
  beiSchliessen: () => void
  children: React.ReactNode
}

export function Vollbild({ lang, tafel, tafelGerahmt = true, steuerung, beiSchliessen, children }: Props) {
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
    <div className="fixed inset-0 z-50 bg-tinte">
      <div className="absolute inset-0">{children}</div>

      {/*
        Links oben. Breit genug für die Vorschlagsliste, die hier nach unten aufklappt.

        Die Ergebniskarte hängt auf schmalen Schirmen stattdessen unten: Oben
        rechts liegen die Umschalter, und auf einem Handy reicht die Breite nicht
        für beides nebeneinander — sie lägen sonst über dem Namen des Tieres. Ab
        der sm-Breite ist genug Platz, dort bleibt es bei oben links.
      */}
      <div
        className={
          'pointer-events-none absolute left-3 z-10 w-[min(22rem,calc(100vw-1.5rem))] sm:left-5 sm:top-5 ' +
          (tafelGerahmt ? 'top-3' : 'bottom-3 sm:bottom-auto')
        }
      >
        <div
          className={
            'pointer-events-auto shadow-2xl shadow-tinte ' +
            (tafelGerahmt
              ? 'border border-linie bg-kabinett/95 p-3 backdrop-blur'
              : 'max-h-[calc(100dvh-6rem)] overflow-y-auto sm:max-h-[calc(100dvh-2.5rem)]')
          }
        >
          {tafel}
        </div>
      </div>

      <div className="pointer-events-none absolute right-3 top-3 z-10 flex flex-wrap items-center justify-end gap-2 sm:right-5 sm:top-5">
        <div className="pointer-events-auto flex flex-wrap items-center gap-2">
          {steuerung}
          <button
            type="button"
            onClick={beiSchliessen}
            className="etikett border border-linie bg-kabinett/95 px-3 py-1.5 backdrop-blur transition hover:border-flechte hover:text-knochen"
          >
            {t(lang, 'vollbildVerlassen')}
          </button>
        </div>
      </div>
    </div>
  )
}
