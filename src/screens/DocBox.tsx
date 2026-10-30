import { useRef, useState } from 'react'
import type { ReactNode, Ref } from 'react'

/** Keep edited documents to plain formatting: no scripts, event handlers or links that run code. */
export function sanitize(html: string): string {
  return html
    .replace(/<(script|style|iframe|object|embed)[\s\S]*?<\/\1>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*("|')\s*javascript:[^"']*\2/gi, '')
}

/**
 * A resume or cover letter: the generated version, or the user's edited copy for this job.
 * Editing works on the document itself; pasted text arrives as plain text.
 */
export function DocBox({ generated, saved, onSave, elRef, hidden }: {
  generated: ReactNode
  saved?: string
  onSave: (html: string | null) => void
  elRef?: Ref<HTMLDivElement>
  hidden?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const draft = useRef<HTMLDivElement | null>(null)
  // Remounting the editable copy throws away unsaved changes on Cancel.
  const [version, setVersion] = useState(0)
  const [start, setStart] = useState('')
  const view = useRef<HTMLDivElement | null>(null)
  // Hand the shown element to both this box (to start editing from) and the parent (to copy, print or save it).
  const attach = (el: HTMLDivElement | null) => {
    view.current = el
    if (typeof elRef === 'function') elRef(el)
    else if (elRef) (elRef as { current: HTMLDivElement | null }).current = el
  }

  const begin = () => {
    setStart(view.current?.innerHTML ?? '')
    setEditing(true)
  }
  const save = () => {
    if (draft.current) onSave(sanitize(draft.current.innerHTML))
    setEditing(false)
    setVersion((v) => v + 1)
  }
  const cancel = () => {
    setEditing(false)
    setVersion((v) => v + 1)
  }

  return (
    <div style={{ display: hidden ? 'none' : 'flex', flexDirection: 'column', gap: 8 }}>
      {editing ? (
        <div
          key={`edit-${version}`}
          ref={(el) => {
            draft.current = el
            attach(el)
          }}
          className="doc editing"
          contentEditable
          suppressContentEditableWarning
          spellCheck
          onPaste={(e) => {
            e.preventDefault()
            document.execCommand('insertText', false, e.clipboardData.getData('text/plain'))
          }}
          dangerouslySetInnerHTML={{ __html: start }}
        />
      ) : saved ? (
        <div key={`saved-${version}`} ref={attach} className="doc" dangerouslySetInnerHTML={{ __html: saved }} />
      ) : (
        <div key={`gen-${version}`} ref={attach} className="doc">{generated}</div>
      )}
      <div className="row" style={{ justifyContent: 'flex-end', gap: 6, flexWrap: 'wrap' }}>
        {editing ? (
          <>
            <button className="chip" onClick={cancel}>Cancel</button>
            <button className="chip on" onClick={save}>Save changes</button>
          </>
        ) : (
          <>
            {saved && <button className="chip" onClick={() => { if (confirm('Discard your edits and go back to the tailored version?')) { onSave(null); setVersion((v) => v + 1) } }}>Reset</button>}
            <button className="chip" onClick={begin}>{saved ? 'Edit again' : 'Edit'}</button>
          </>
        )}
      </div>
    </div>
  )
}

/** Opens the document in a print view, where the browser can save it as a PDF. */
export function printDoc(html: string, title: string) {
  const w = window.open('', '_blank')
  if (!w) return false
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title.replace(/</g, '&lt;')}</title>
<link href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500&family=Geist:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  @page { margin: 18mm 16mm; }
  body { font-family: 'Geist', system-ui, sans-serif; font-size: 11pt; line-height: 1.5; color: #1E1B17; max-width: 720px; margin: 24px auto; padding: 0 16px; }
  .serif { font-family: 'Newsreader', Georgia, serif; }
  .muted { color: #6B645A; }
  .sec { font-weight: 600; font-size: 9pt; letter-spacing: .08em; margin: 14px 0 4px; }
  .mb { margin-bottom: 10px; }
  .hl { background: none; }
</style></head><body>${sanitize(html)}</body></html>`)
  w.document.close()
  w.addEventListener('load', () => w.print())
  return true
}
