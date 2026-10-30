// Turns an uploaded PDF or DOCX into plain text, entirely in the browser.
// The libraries are loaded on demand so they don't weigh down the first page load.

export async function pdfText(buf: ArrayBuffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise
  const out: string[] = []
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n)
    const content = await page.getTextContent()
    // Rebuild lines from positioned text runs: a new line starts when the baseline moves.
    let line = '', lastY: number | null = null
    for (const item of content.items) {
      if (!('str' in item)) continue
      const y = Math.round(item.transform[5])
      if (lastY !== null && Math.abs(y - lastY) > 2) { out.push(line); line = '' }
      line += (line && !line.endsWith(' ') && item.str && !item.str.startsWith(' ') ? ' ' : '') + item.str
      lastY = y
      if (item.hasEOL) { out.push(line); line = ''; lastY = null }
    }
    if (line) out.push(line)
  }
  return out.join('\n')
}

async function docxText(buf: ArrayBuffer): Promise<string> {
  const mammoth = (await import('mammoth/mammoth.browser.js')).default
  const { value } = await mammoth.extractRawText({ arrayBuffer: buf })
  return value
}

export async function extractText(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') return pdfText(buf)
  if (/\.docx$/i.test(file.name)) return docxText(buf)
  throw new Error('Only PDF and DOCX files can be read. Older .doc files need to be saved as .docx first.')
}
