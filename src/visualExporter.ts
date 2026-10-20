import { compileEmail } from './emailRenderer'
import type { EmailDocument } from './types'

export interface VisualExportResult {
  fileName: string
  width: number
  height: number
  pages?: number
}

const slug = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'email'

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function waitForImages(document: Document) {
  const pending = [...document.images].filter(image => !image.complete).map(image => new Promise<void>(resolve => {
    image.addEventListener('load', () => resolve(), { once: true })
    image.addEventListener('error', () => resolve(), { once: true })
  }))
  return Promise.race([Promise.all(pending), new Promise<void>(resolve => window.setTimeout(resolve, 12000))])
}

async function renderEmail(doc: EmailDocument, onProgress?: (message: string) => void) {
  const width = Math.round(doc.theme.contentWidth)
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText = `position:fixed;left:-100000px;top:0;width:${width}px;height:1000px;border:0;pointer-events:none;`
  document.body.appendChild(iframe)

  try {
    onProgress?.('Préparation du rendu…')
    const loaded = new Promise<void>((resolve, reject) => {
      iframe.addEventListener('load', () => resolve(), { once: true })
      iframe.addEventListener('error', () => reject(new Error('Impossible de préparer le document.')), { once: true })
    })
    iframe.srcdoc = compileEmail(doc)
    await loaded

    const frameDocument = iframe.contentDocument
    if (!frameDocument) throw new Error('Le document de rendu est inaccessible.')
    onProgress?.('Chargement des images et des polices…')
    await Promise.all([waitForImages(frameDocument), frameDocument.fonts?.ready ?? Promise.resolve()])

    const height = Math.ceil(Math.max(frameDocument.body.scrollHeight, frameDocument.documentElement.scrollHeight, 1))
    iframe.style.height = `${height}px`
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))

    onProgress?.('Création de l’image haute résolution…')
    const { default: html2canvas } = await import('html2canvas')
    const canvas = await html2canvas(frameDocument.documentElement, {
      allowTaint: false,
      backgroundColor: doc.theme.backgroundColor,
      height,
      logging: false,
      scale: 2,
      scrollX: 0,
      scrollY: 0,
      useCORS: true,
      width,
      windowHeight: height,
      windowWidth: width,
    })
    return { canvas, width, height }
  } finally {
    iframe.remove()
  }
}

export async function exportEmailPng(doc: EmailDocument, onProgress?: (message: string) => void): Promise<VisualExportResult> {
  const { canvas, width, height } = await renderEmail(doc, onProgress)
  onProgress?.('Encodage du PNG…')
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('Impossible d’encoder le PNG.')), 'image/png'))
  const fileName = `${slug(doc.name)}.png`
  downloadBlob(blob, fileName)
  return { fileName, width: canvas.width, height: canvas.height }
}

export async function exportEmailPdf(doc: EmailDocument, onProgress?: (message: string) => void): Promise<VisualExportResult> {
  const { canvas, width, height } = await renderEmail(doc, onProgress)
  onProgress?.('Création du PDF pleine hauteur…')
  const { jsPDF } = await import('jspdf')
  const orientation = canvas.width > canvas.height ? 'landscape' : 'portrait'
  const pdf = new jsPDF({ orientation, unit: 'px', format: [canvas.width, canvas.height], compress: true, hotfixes: ['px_scaling'] })
  const image = canvas.toDataURL('image/png')
  pdf.addImage(image, 'PNG', 0, 0, canvas.width, canvas.height, undefined, 'FAST')

  const fileName = `${slug(doc.name)}.pdf`
  pdf.save(fileName)
  return { fileName, width: canvas.width, height: canvas.height, pages: 1 }
}
