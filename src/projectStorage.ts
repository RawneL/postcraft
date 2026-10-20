import type { EmailDocument } from './types'

const PROJECT_FORMAT = 'postcraft-project'
const PROJECT_VERSION = 1
export const MAX_PROJECT_BYTES = 100 * 1024 * 1024
const blockTypes = new Set(['heading', 'text', 'button', 'image', 'divider', 'spacer'])
const localUrlPattern = /blob:[^\s"'<>\\()[\]{},;]+/g

interface ProjectFile {
  format: typeof PROJECT_FORMAT
  version: typeof PROJECT_VERSION
  savedAt: string
  document: EmailDocument
}

function record(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} : objet attendu.`)
}

function string(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string') throw new Error(`${label} : texte attendu.`)
}

function number(value: unknown, label: string, minimum = 0): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum) throw new Error(`${label} : nombre invalide.`)
}

function array(value: unknown, label: string): asserts value is unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} : liste attendue.`)
}

function styles(value: unknown) {
  record(value, 'Réglages du bloc')
  for (const [key, setting] of Object.entries(value)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key) || (typeof setting !== 'string' && (typeof setting !== 'number' || !Number.isFinite(setting)))) {
      throw new Error(`Réglage « ${key} » invalide.`)
    }
  }
}

// Validate before touching the active document; retain every supported style and HTML content.
function validateDocument(value: unknown): asserts value is EmailDocument {
  record(value, 'Document')
  for (const key of ['name', 'subject', 'preview']) string(value[key], `Document.${key}`)
  record(value.theme, 'Thème')
  for (const key of ['backgroundColor', 'contentColor', 'fontFamily', 'textColor', 'linkColor']) string(value.theme[key], `Thème.${key}`)
  number(value.theme.contentWidth, 'Largeur du mail', 1)
  if (value.theme.contentWidth > 10000) throw new Error('La largeur du mail dépasse 10 000 pixels.')
  array(value.body, 'Body MJML')
  const ids = new Set<string>()

  const node = (item: unknown) => {
    record(item, 'Bloc')
    string(item.id, 'Identifiant du bloc')
    if (!item.id || ids.has(item.id)) throw new Error('Identifiant de bloc vide ou en double.')
    ids.add(item.id)
    if (ids.size > 10000) throw new Error('Le projet contient trop de blocs (maximum : 10 000).')
    styles(item.styles)
    return item
  }

  const section = (item: unknown) => {
    const current = node(item)
    if (current.type !== 'section') throw new Error('Une section MJML était attendue.')
    array(current.columns, 'Colonnes de la section')
    for (const item of current.columns) {
      const column = node(item)
      if (column.type !== 'column') throw new Error('Une colonne MJML était attendue.')
      number(column.width, 'Largeur de colonne')
      array(column.blocks, 'Contenu de la colonne')
      for (const item of column.blocks) {
        const block = node(item)
        if (typeof block.type !== 'string' || !blockTypes.has(block.type)) throw new Error(`Type de bloc non pris en charge : ${String(block.type)}.`)
        string(block.content, 'Contenu du bloc')
      }
    }
  }

  for (const item of value.body) {
    record(item, 'Élément du body')
    if (item.type === 'wrapper') {
      const wrapper = node(item)
      array(wrapper.sections, 'Sections du wrapper')
      wrapper.sections.forEach(section)
    } else {
      section(item)
    }
  }
}

function mapStrings(value: unknown, transform: (text: string) => string): unknown {
  if (typeof value === 'string') return transform(value)
  if (Array.isArray(value)) return value.map(item => mapStrings(item, transform))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, mapStrings(item, transform)]))
  return value
}

async function embedImage(source: string): Promise<string> {
  try {
    const response = await fetch(source)
    if (!response.ok) throw new Error('Image inaccessible')
    const blob = await response.blob()
    if (!blob.type.startsWith('image/') || !blob.size || blob.size > MAX_PROJECT_BYTES) throw new Error('Image invalide')
    const bytes = new Uint8Array(await blob.arrayBuffer())
    let binary = ''
    for (let start = 0; start < bytes.length; start += 16384) binary += String.fromCharCode(...bytes.subarray(start, start + 16384))
    return `data:${blob.type};base64,${btoa(binary)}`
  } catch {
    throw new Error('Une image locale n’est plus accessible. Sélectionnez à nouveau son fichier avant d’enregistrer le projet.')
  }
}

export async function serializeProject(doc: EmailDocument): Promise<{ content: string; fileName: string; embeddedImages: number }> {
  const snapshot = structuredClone(doc)
  validateDocument(snapshot)
  const sources = new Set<string>()
  mapStrings(snapshot, text => { text.match(localUrlPattern)?.forEach(source => sources.add(source)); return text })
  const images = new Map<string, string>()
  // Fetch each local URL only once, even when duplicated or used in a background / HTML fragment.
  for (const source of sources) images.set(source, await embedImage(source))
  const document = mapStrings(snapshot, text => text.replace(localUrlPattern, source => images.get(source)!)) as EmailDocument
  const file: ProjectFile = { format: PROJECT_FORMAT, version: PROJECT_VERSION, savedAt: new Date().toISOString(), document }
  const content = JSON.stringify(file, null, 2)
  if (new Blob([content]).size > MAX_PROJECT_BYTES) throw new Error('Le projet dépasse 100 Mo. Réduisez la taille des images avant de l’enregistrer.')
  const name = doc.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'email'
  return { content, fileName: `${name}.postcraft.json`, embeddedImages: images.size }
}

export function parseProject(content: string): EmailDocument {
  if (content.length > MAX_PROJECT_BYTES) throw new Error('Le fichier dépasse la taille maximale de 100 Mo.')
  let file: unknown
  try { file = JSON.parse(content.replace(/^\uFEFF/, '')) } catch { throw new Error('Le fichier n’est pas un JSON valide.') }
  record(file, 'Fichier de projet')
  if (file.format !== PROJECT_FORMAT) throw new Error('Ce fichier n’est pas un projet Postcraft. Choisissez un fichier .postcraft.json enregistré depuis l’éditeur.')
  if (file.version !== PROJECT_VERSION) throw new Error('Cette version du projet n’est pas prise en charge par cet éditeur.')
  validateDocument(file.document)
  mapStrings(file.document, text => {
    if (text.match(localUrlPattern)) throw new Error('Ce projet contient une image locale temporaire non embarquée. Enregistrez-le à nouveau depuis sa session d’origine.')
    return text
  })
  return file.document
}
