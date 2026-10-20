import type { BlockType, BuilderItemType, EmailBlock, EmailColumn, EmailDocument, EmailSection, EmailWrapper } from './types'

export const structureCatalog: { type: BuilderItemType; label: string; description: string }[] = [
  { type: 'wrapper', label: 'Wrapper', description: 'Groupe de sections' },
  { type: 'section', label: 'Section', description: 'Rangée MJML' },
  { type: 'column', label: 'Colonne', description: 'Zone de contenu' },
]

export const blockCatalog: { type: BlockType; label: string; description: string }[] = [
  { type: 'heading', label: 'Titre', description: 'Accroche éditoriale' },
  { type: 'text', label: 'Texte', description: 'Paragraphe enrichi' },
  { type: 'button', label: 'Bouton', description: 'Appel à l’action' },
  { type: 'image', label: 'Image', description: 'Visuel responsive' },
  { type: 'divider', label: 'Séparateur', description: 'Ligne de rythme' },
  { type: 'spacer', label: 'Espacement', description: 'Espace vertical' },
]

export function createBlock(type: BlockType): EmailBlock {
  const id = `${type}-${crypto.randomUUID()}`
  switch (type) {
    case 'heading': return { id, type, content: 'Votre titre ici', styles: { fontSize: 34, lineHeight: 1.15, fontWeight: '400', textAlign: 'center', paddingTop: 24, paddingBottom: 12, paddingLeft: 36, paddingRight: 36 } }
    case 'text': return { id, type, content: 'Rédigez votre message. Utilisez le panneau de droite pour personnaliser chaque détail.', styles: { fontSize: 15, lineHeight: 1.6, textAlign: 'left', paddingTop: 12, paddingBottom: 12, paddingLeft: 36, paddingRight: 36 } }
    case 'button': return { id, type, content: 'En savoir plus', styles: { backgroundColor: '#171717', color: '#ffffff', fontSize: 14, fontWeight: '700', borderRadius: 3, paddingTop: 16, paddingBottom: 24, innerPadding: '14px 24px', href: 'https://example.com', target: '_blank' } }
    case 'image': return { id, type, content: 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=1200&q=80', styles: { alt: 'Description de l’image', href: '', target: '_blank', widthPercent: 100, paddingLeft: 24, paddingRight: 24, height: 0, imageFit: 'cover', imagePosition: 'center center', borderRadius: 2 } }
    case 'divider': return { id, type, content: '', styles: { color: '#e5e5e5', width: '88%', borderWidth: 1, borderStyle: 'solid', dividerAlign: 'center', paddingTop: 14, paddingBottom: 14 } }
    case 'spacer': return { id, type, content: '', styles: { height: 32 } }
  }
}

export function createColumn(blocks: EmailBlock[] = [], width = 100): EmailColumn {
  return { id: `column-${crypto.randomUUID()}`, type: 'column', width, styles: { paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0, verticalAlign: 'top' }, blocks }
}

export function createSection(columns: EmailColumn[] = [createColumn()]): EmailSection {
  return { id: `section-${crypto.randomUUID()}`, type: 'section', styles: { paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0, backgroundColor: 'transparent', borderRadius: 0 }, columns }
}

export function createWrapper(sections: EmailSection[] = [createSection()], backgroundColor = '#ffffff'): EmailWrapper {
  return { id: `wrapper-${crypto.randomUUID()}`, type: 'wrapper', styles: { paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0, backgroundColor, borderRadius: 0, fullWidth: 'false' }, sections }
}

export const defaultTheme: EmailDocument['theme'] = {
  backgroundColor: '#f5f5f5',
  contentColor: '#ffffff',
  contentWidth: 620,
  fontFamily: 'Helvetica, Arial, sans-serif',
  textColor: '#171717',
  linkColor: '#171717',
}

export function createBlankDocument(): EmailDocument {
  return {
    name: 'Nouvel email',
    subject: '',
    preview: '',
    theme: { ...defaultTheme },
    body: [],
  }
}

const header: EmailSection = {
  id: 'section-header', type: 'section', styles: { backgroundColor: 'transparent', paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0, borderRadius: 0 }, columns: [{
    id: 'column-header', type: 'column', width: 100, styles: { verticalAlign: 'top' }, blocks: [
      { id: 'logo', type: 'text', content: 'MAISON SÉLÈNE', styles: { fontSize: 13, fontWeight: '700', letterSpacing: 3, textAlign: 'center', paddingTop: 30, paddingBottom: 24, color: '#272621' } },
      { id: 'hero', type: 'image', content: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1200&q=85', styles: { alt: 'Collection de vêtements aux tons naturels', href: '', target: '_blank', widthPercent: 100, paddingLeft: 24, paddingRight: 24, borderRadius: 2, height: 340, imageFit: 'cover', imagePosition: 'center center' } },
    ]
  }]
}

const story: EmailSection = {
  id: 'section-story', type: 'section', styles: { backgroundColor: 'transparent', paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0, borderRadius: 0 }, columns: [{
    id: 'column-story', type: 'column', width: 100, styles: { verticalAlign: 'top' }, blocks: [
      { id: 'eyebrow', type: 'text', content: 'ÉDITION N° 04 — AUTOMNE', styles: { fontSize: 11, fontWeight: '700', letterSpacing: 2.2, textAlign: 'center', paddingTop: 36, paddingBottom: 10, color: '#a64b2d' } },
      { id: 'title', type: 'heading', content: 'Le beau dans<br/>les choses simples.', styles: { fontSize: 43, lineHeight: 1.08, fontWeight: '400', textAlign: 'center', paddingLeft: 52, paddingRight: 52, paddingBottom: 18, color: '#272621' } },
      { id: 'intro', type: 'text', content: 'Une collection dessinée pour durer, inspirée par la lumière douce et les matières brutes. Découvrez des essentiels qui traversent les saisons.', styles: { fontSize: 16, lineHeight: 1.65, textAlign: 'center', paddingLeft: 68, paddingRight: 68, paddingBottom: 26, color: '#625f57' } },
      { id: 'cta', type: 'button', content: 'Découvrir la collection', styles: { backgroundColor: '#d85f37', color: '#ffffff', fontSize: 14, fontWeight: '700', borderRadius: 2, paddingBottom: 42, innerPadding: '15px 26px', href: 'https://example.com', target: '_blank' } },
    ]
  }]
}

const footer: EmailSection = {
  id: 'section-footer', type: 'section', styles: { backgroundColor: 'transparent', paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0, borderRadius: 0 }, columns: [{
    id: 'column-footer', type: 'column', width: 100, styles: { verticalAlign: 'top' }, blocks: [
      { id: 'divider', type: 'divider', content: '', styles: { color: '#ded9cf', width: '86%', borderWidth: 1, borderStyle: 'solid', dividerAlign: 'center', paddingBottom: 30 } },
      { id: 'footer', type: 'text', content: 'Maison Sélène · Paris<br/><span style="font-size:11px;color:#969187">Se désabonner · Voir dans le navigateur</span>', styles: { fontSize: 12, lineHeight: 1.8, textAlign: 'center', paddingBottom: 28, color: '#625f57' } },
    ]
  }]
}

export const starterDocument: EmailDocument = {
  name: 'Collection Automne', subject: 'La nouvelle collection est arrivée 🍂', preview: 'Des pièces pensées pour les jours qui raccourcissent.',
  theme: { backgroundColor: '#edeae3', contentColor: '#fffdf8', contentWidth: 620, fontFamily: 'Georgia, Times New Roman, serif', textColor: '#272621', linkColor: '#d85f37' },
  body: [{ id: 'wrapper-main', type: 'wrapper', styles: { backgroundColor: '#fffdf8', paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0, borderRadius: 0, fullWidth: 'false' }, sections: [header, story, footer] }],
}

function migrateRetiredBlocks(document: EmailDocument) {
  const sections = document.body.flatMap(item => item.type === 'wrapper' ? item.sections : [item])
  sections.forEach(section => section.columns.forEach(column => {
    column.blocks = column.blocks.map(block => (block as unknown as { type: string }).type === 'social' ? { ...block, type: 'text' } : block)
  }))
  return document
}

export function normalizeDocument(document: EmailDocument): EmailDocument {
  if (Array.isArray(document.body)) return migrateRetiredBlocks(document)
  const legacySections = (document as unknown as { sections?: EmailSection[] }).sections ?? []
  const migrated = { ...document, body: legacySections.length ? [createWrapper(legacySections, document.theme.contentColor)] : [] } as EmailDocument
  delete (migrated as unknown as { sections?: EmailSection[] }).sections
  return migrateRetiredBlocks(migrated)
}

export const itemLabel = (type: BuilderItemType) => type === 'wrapper' ? 'Wrapper' : type === 'section' ? 'Section' : type === 'column' ? 'Colonne' : blockCatalog.find(item => item.type === type)?.label ?? type
