import JSZip from 'jszip'
import { compileEmail, toMjml } from './emailRenderer'
import type { EmailBlock, EmailDocument } from './types'

export interface PackageExportResult {
  bundled: number
  external: number
  fileName: string
}

const mimeExtensions: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
}

const slug = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'email'

function imageBlocks(doc: EmailDocument) {
  return doc.body.flatMap(item => item.type === 'wrapper' ? item.sections : [item]).flatMap(section => section.columns.flatMap(column => column.blocks)).filter((block): block is EmailBlock => block.type === 'image' && Boolean(block.content))
}

function sourceFileName(block: EmailBlock, mime: string, index: number) {
  const explicitName = String(block.styles.sourceName ?? '')
  let urlName = ''
  try { urlName = decodeURIComponent(new URL(block.content, window.location.href).pathname.split('/').pop() ?? '') } catch { /* URL non standard */ }
  const candidate = explicitName || urlName || String(block.styles.alt ?? '') || `image-${index + 1}`
  const candidateExtension = candidate.match(/\.([a-zA-Z0-9]{2,5})$/)?.[1]?.toLowerCase()
  const extension = candidateExtension || mimeExtensions[mime] || 'img'
  const base = slug(candidate.replace(/\.[^.]+$/, '')) || `image-${index + 1}`
  return `${base}.${extension}`
}

function uniqueName(requested: string, used: Set<string>) {
  const dot = requested.lastIndexOf('.')
  const base = dot > 0 ? requested.slice(0, dot) : requested
  const extension = dot > 0 ? requested.slice(dot) : ''
  let name = requested
  let suffix = 2
  while (used.has(name)) name = `${base}-${suffix++}${extension}`
  used.add(name)
  return name
}

async function fetchImage(source: string) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 12000)
  try {
    const response = await fetch(source, { signal: controller.signal })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return { bytes: await response.arrayBuffer(), mime: response.headers.get('content-type')?.split(';')[0] ?? '' }
  } finally {
    window.clearTimeout(timeout)
  }
}

function triggerBlobDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function exportEmailPackage(doc: EmailDocument, onProgress?: (message: string) => void): Promise<PackageExportResult> {
  const zip = new JSZip()
  const packagedDocument = structuredClone(doc)
  const originalImages = imageBlocks(doc)
  const packagedImages = imageBlocks(packagedDocument)
  const imagesFolder = zip.folder('images')!
  const pathsBySource = new Map<string, string>()
  const usedNames = new Set<string>()
  const externalSources: string[] = []
  let bundled = 0

  for (let index = 0; index < originalImages.length; index += 1) {
    const original = originalImages[index]
    const packaged = packagedImages[index]
    onProgress?.(`Récupération de l’image ${index + 1} sur ${originalImages.length}…`)
    const existingPath = pathsBySource.get(original.content)
    if (existingPath) { packaged.content = existingPath; continue }
    try {
      const asset = await fetchImage(original.content)
      const fileName = uniqueName(sourceFileName(original, asset.mime, index), usedNames)
      const relativePath = `images/${fileName}`
      imagesFolder.file(fileName, asset.bytes)
      pathsBySource.set(original.content, relativePath)
      packaged.content = relativePath
      bundled += 1
    } catch {
      externalSources.push(original.content)
    }
  }

  onProgress?.('Compilation du HTML et du MJML…')
  const html = compileEmail(packagedDocument)
  const mjml = toMjml(packagedDocument)
  zip.file('email.html', html)
  zip.file('email.mjml', mjml)
  zip.file('rapport-export.txt', [
    'POSTCRAFT — RAPPORT D’EXPORT',
    '',
    `${bundled} image(s) copiée(s) dans le dossier images/.`,
    `${externalSources.length} image(s) conservée(s) avec leur URL d’origine.`,
    '',
    ...(externalSources.length ? ['URLs non copiées (serveur distant inaccessible ou URL locale expirée) :', ...externalSources.map(source => `- ${source}`), ''] : []),
    'Important : les chemins images/ sont adaptés à une consultation locale. Pour envoyer cet email, hébergez les images publiquement ou utilisez des pièces jointes CID.',
  ].join('\n'))

  onProgress?.('Création de l’archive ZIP…')
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } })
  const fileName = `${slug(doc.name)}-export.zip`
  triggerBlobDownload(blob, fileName)
  return { bundled, external: externalSources.length, fileName }
}
