import mjml2html from 'mjml-browser'
import type { EmailBlock, EmailColumn, EmailDocument, EmailSection, EmailWrapper, StyleMap } from './types'

const attr = (name: string, value: unknown, unit = '') => value !== undefined && value !== '' && value !== 'transparent' ? ` ${name}="${String(value)}${unit}"` : ''
const padding = (s: StyleMap) => `${s.paddingTop ?? 0}px ${s.paddingRight ?? 0}px ${s.paddingBottom ?? 0}px ${s.paddingLeft ?? 0}px`
const safeClass = (id: string) => `pc-${id.replace(/[^a-zA-Z0-9_-]/g, '-')}`
const border = (s: StyleMap, prefix = '') => {
  const widthKey = prefix ? `${prefix}BorderWidth` : 'borderWidth'
  const styleKey = prefix ? `${prefix}BorderStyle` : 'borderStyle'
  const colorKey = prefix ? `${prefix}BorderColor` : 'borderColor'
  return Number(s[widthKey] ?? 0) > 0 ? `${s[widthKey]}px ${s[styleKey] ?? 'solid'} ${s[colorKey] ?? '#272621'}` : ''
}

function renderBlock(block: EmailBlock, columnWidthPx: number) {
  const s = block.styles
  const cssClasses = [s.cssDeclarations || (block.type === 'image' && s.imageFit) ? safeClass(block.id) : '', s.cssClass ?? ''].filter(Boolean).join(' ')
  const common = `${attr('container-background-color', s.containerBackgroundColor)}${attr('border', border(s, 'container'))}${attr('border-radius', s.containerBorderRadius, 'px')}${attr('css-class', cssClasses)}${attr('padding', padding(s))}`
  const typography = `${attr('font-family', s.fontFamily)}${attr('font-size', s.fontSize, 'px')}${attr('line-height', s.lineHeight)}${attr('font-weight', s.fontWeight)}${attr('font-style', s.fontStyle)}${attr('text-decoration', s.textDecoration)}${attr('text-transform', s.textTransform)}${attr('letter-spacing', s.letterSpacing, 'px')}${attr('align', s.textAlign)}${attr('color', s.color)}`

  switch (block.type) {
    case 'heading':
    case 'text': return `<mj-text${common}${typography}>${block.content}</mj-text>`
    case 'button': {
      const width = Number(s.widthPercent ?? 0) > 0 ? `${Math.round(columnWidthPx * Number(s.widthPercent) / 100)}px` : ''
      return `<mj-button${common}${typography}${attr('align', s.buttonAlign)}${attr('background-color', s.backgroundColor)}${attr('width', width)}${attr('border', border(s, 'element'))}${attr('border-radius', s.borderRadius, 'px')}${attr('inner-padding', s.innerPadding)}${attr('href', s.href)}${attr('target', s.target)}>${block.content}</mj-button>`
    }
    case 'image': {
      const horizontalPadding = Number(s.paddingLeft ?? 0) + Number(s.paddingRight ?? 0)
      const width = Math.max(40, Math.round((columnWidthPx - horizontalPadding) * Number(s.widthPercent ?? 100) / 100))
      return `<mj-image src="${block.content}"${common}${attr('alt', s.alt)}${attr('title', s.title)}${attr('href', s.href)}${attr('target', s.target)}${attr('align', s.imageAlign)}${attr('width', width, 'px')}${Number(s.height ?? 0) > 0 ? attr('height', s.height, 'px') : ''}${attr('border', border(s, 'element'))}${attr('border-radius', s.borderRadius, 'px')} fluid-on-mobile="true" />`
    }
    case 'divider': return `<mj-divider${common}${attr('align', s.dividerAlign)}${attr('border-color', s.color)}${attr('border-style', s.borderStyle)}${attr('border-width', s.borderWidth, 'px')}${attr('width', s.width)} />`
    case 'spacer': return `<mj-spacer${common}${attr('height', s.height, 'px')} />`
  }
}

function renderColumn(column: EmailColumn, documentWidth: number) {
  const s = column.styles
  const widthPx = documentWidth * column.width / 100
  return `<mj-column width="${column.width}%"${attr('background-color', s.backgroundColor)}${attr('vertical-align', s.verticalAlign)}${attr('padding', padding(s))}${attr('border', border(s))}${attr('border-radius', s.borderRadius, 'px')}${attr('css-class', s.cssClass)}>
        ${column.blocks.map(block => renderBlock(block, widthPx)).join('\n        ')}
      </mj-column>`
}

function renderSection(section: EmailSection, documentWidth: number, fallbackBackground = '') {
  const s = section.styles
  const fullWidth = s.fullWidth === 'true' ? 'full-width="full-width"' : ''
  const background = s.backgroundColor && s.backgroundColor !== 'transparent' ? s.backgroundColor : fallbackBackground
  return `<mj-section ${fullWidth}${attr('background-color', background)}${attr('padding', padding(s))}${attr('border', border(s))}${attr('border-radius', s.borderRadius, 'px')}${attr('direction', s.direction)}${attr('text-align', s.textAlign)}${attr('css-class', s.cssClass)}>
      ${section.columns.map(column => renderColumn(column, documentWidth)).join('\n      ')}
    </mj-section>`
}

function renderWrapper(wrapper: EmailWrapper, documentWidth: number, fallbackBackground: string) {
  const s = wrapper.styles
  const fullWidth = s.fullWidth === 'true' ? 'full-width="full-width"' : ''
  const background = s.backgroundColor && s.backgroundColor !== 'transparent' ? s.backgroundColor : fallbackBackground
  return `<mj-wrapper ${fullWidth}${attr('background-color', background)}${attr('background-url', s.backgroundUrl)}${attr('background-position', s.backgroundPosition)}${attr('background-repeat', s.backgroundRepeat)}${attr('background-size', s.backgroundSize)}${attr('padding', padding(s))}${attr('border', border(s))}${attr('border-radius', s.borderRadius, 'px')}${attr('css-class', s.cssClass)}>
    ${wrapper.sections.map(section => renderSection(section, documentWidth)).join('\n    ')}
    </mj-wrapper>`
}

export function toMjml(doc: EmailDocument) {
  const t = doc.theme
  const allSections = doc.body.flatMap(item => item.type === 'wrapper' ? item.sections : [item])
  const allBlocks = allSections.flatMap(section => section.columns.flatMap(column => column.blocks))
  const customCss = allBlocks.map(block => {
    const className = safeClass(block.id)
    const freeCss = block.styles.cssDeclarations ? `.${className} { ${block.styles.cssDeclarations} }` : ''
    const imageCss = block.type === 'image' && block.styles.imageFit ? `.${className} img { object-fit: ${block.styles.imageFit}; object-position: ${block.styles.imagePosition ?? 'center center'}; }` : ''
    return `${freeCss} ${imageCss}`.trim()
  }).filter(Boolean).join('\n')

  return `<mjml>
  <mj-head>
    <mj-title>${doc.subject}</mj-title>
    <mj-preview>${doc.preview}</mj-preview>
    <mj-attributes>
      <mj-all font-family="${t.fontFamily}" />
      <mj-text color="${t.textColor}" />
    </mj-attributes>
    <mj-style inline="inline">a { color: ${t.linkColor}; } ${customCss}</mj-style>
  </mj-head>
  <mj-body background-color="${t.backgroundColor}" width="${t.contentWidth}px">
    ${doc.body.map(item => item.type === 'wrapper' ? renderWrapper(item, t.contentWidth, t.contentColor) : renderSection(item, t.contentWidth, t.contentColor)).join('\n    ')}
  </mj-body>
</mjml>`
}

export function compileEmail(doc: EmailDocument) {
  return mjml2html(toMjml(doc), { validationLevel: 'soft', minify: false }).html
}

export function downloadFile(content: string, name: string, mime = 'text/plain') {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
