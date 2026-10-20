import { useCallback, useEffect, useRef, useState } from 'react'
import { CSS } from '@dnd-kit/utilities'
import { horizontalListSortingStrategy, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Bold, Columns3, Copy, GripVertical, Image as ImageIcon, Italic, List, ListOrdered, MousePointer2, PanelTop, RemoveFormatting, Rows3, Strikethrough, Trash2, Underline } from 'lucide-react'
import type { EmailBlock, EmailColumn, EmailSection, EmailWrapper, StyleMap } from './types'

const padding = (s: StyleMap) => `${s.paddingTop ?? 0}px ${s.paddingRight ?? 0}px ${s.paddingBottom ?? 0}px ${s.paddingLeft ?? 0}px`
const border = (s: StyleMap, prefix = '') => {
  const widthKey = prefix ? `${prefix}BorderWidth` : 'borderWidth'
  const styleKey = prefix ? `${prefix}BorderStyle` : 'borderStyle'
  const colorKey = prefix ? `${prefix}BorderColor` : 'borderColor'
  return Number(s[widthKey] ?? 0) > 0 ? `${s[widthKey]}px ${s[styleKey] ?? 'solid'} ${s[colorKey] ?? '#272621'}` : undefined
}

const richTextTypes = new Set(['heading', 'text'])

type InlineCommand = 'bold' | 'italic' | 'underline' | 'strikeThrough' | 'insertUnorderedList' | 'insertOrderedList'

const inlineActions: Array<{ command: InlineCommand; label: string; icon: React.ReactNode }> = [
  { command: 'bold', label: 'Gras', icon: <Bold /> },
  { command: 'italic', label: 'Italique', icon: <Italic /> },
  { command: 'underline', label: 'Souligné', icon: <Underline /> },
  { command: 'strikeThrough', label: 'Barré', icon: <Strikethrough /> },
  { command: 'insertUnorderedList', label: 'Liste à puces', icon: <List /> },
  { command: 'insertOrderedList', label: 'Liste numérotée', icon: <ListOrdered /> },
]

function normalizeEditorHtml(html: string) {
  return html === '<br>' || html === '<div><br></div>' ? '' : html
}

function plainTextToHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\r?\n/g, '<br>')
}

function InlineEditor({ block, editorRef, onCommit, onSelectionChange }: { block: EmailBlock; editorRef: React.RefObject<HTMLDivElement>; onCommit: (html: string) => void; onSelectionChange: () => void }) {
  const [empty, setEmpty] = useState(!block.content.trim())
  const refreshEmpty = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return
    // contentEditable often leaves <br> or empty formatting tags after deletion.
    const text = (editor.textContent ?? '').replace(/[\u00a0\u200b]/g, '').trim()
    setEmpty(!text && !editor.querySelector('img, svg, video, audio, iframe, canvas, hr, table'))
  }, [editorRef])

  useEffect(() => {
    const editor = editorRef.current
    if (editor && document.activeElement !== editor && editor.innerHTML !== block.content) editor.innerHTML = block.content
    refreshEmpty()
  }, [block.content, editorRef, refreshEmpty])

  return <div
    ref={editorRef}
    className="inline-rich-editor"
    data-empty={empty ? 'true' : undefined}
    contentEditable
    suppressContentEditableWarning
    role="textbox"
    aria-label={`Modifier le contenu du bloc ${block.type}`}
    aria-multiline="true"
    spellCheck
    onFocus={() => { document.execCommand('defaultParagraphSeparator', false, 'div'); onSelectionChange() }}
    onClick={onSelectionChange}
    onKeyUp={onSelectionChange}
    onMouseUp={onSelectionChange}
    onInput={refreshEmpty}
    onPaste={event => {
      event.preventDefault()
      document.execCommand('insertHTML', false, plainTextToHtml(event.clipboardData.getData('text/plain')))
      refreshEmpty()
      onSelectionChange()
    }}
    onBlur={event => onCommit(normalizeEditorHtml(event.currentTarget.innerHTML))}
    onKeyDown={event => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.currentTarget.blur()
      }
    }}
  />
}

function InlineToolbar({ editorRef, activeCommands, onCommand }: { editorRef: React.RefObject<HTMLDivElement>; activeCommands: Set<InlineCommand>; onCommand: () => void }) {
  const runCommand = (command: InlineCommand | 'removeFormat') => {
    const editor = editorRef.current
    if (!editor) return
    editor.focus()
    document.execCommand(command, false)
    onCommand()
  }

  return <div className="inline-format-toolbar" role="toolbar" aria-label="Mise en forme du texte">
    {inlineActions.map(action => <button
      key={action.command}
      type="button"
      className={activeCommands.has(action.command) ? 'active' : ''}
      title={action.label}
      aria-label={action.label}
      aria-pressed={activeCommands.has(action.command)}
      onMouseDown={event => { event.preventDefault(); event.stopPropagation(); runCommand(action.command) }}
    >{action.icon}</button>)}
    <span className="inline-toolbar-divider" />
    <button type="button" title="Effacer la mise en forme" aria-label="Effacer la mise en forme" onMouseDown={event => { event.preventDefault(); event.stopPropagation(); runCommand('removeFormat') }}><RemoveFormatting /></button>
  </div>
}

export function BlockPreview({ block, editorRef, onContentCommit, onSelectionChange }: { block: EmailBlock; editorRef?: React.RefObject<HTMLDivElement>; onContentCommit?: (html: string) => void; onSelectionChange?: () => void }) {
  const s = block.styles
  const pad = padding(s)
  const frameStyle: React.CSSProperties = { background: String(s.containerBackgroundColor ?? 'transparent'), borderRadius: Number(s.containerBorderRadius ?? 0), border: border(s, 'container'), overflow: 'hidden', direction: (s.direction as React.CSSProperties['direction']) ?? 'ltr' }
  if (block.type === 'image') {
    const align = s.imageAlign === 'left' ? '0 auto 0 0' : s.imageAlign === 'right' ? '0 0 0 auto' : '0 auto'
    const height = Number(s.height ?? 0)
    const image = <img src={block.content} alt={String(s.alt ?? '')} title={String(s.title ?? '')} style={{ display: 'block', width: `${Number(s.widthPercent ?? 100)}%`, height: height > 0 ? height : 'auto', objectFit: (s.imageFit as React.CSSProperties['objectFit']) ?? 'cover', objectPosition: String(s.imagePosition ?? 'center center'), borderRadius: Number(s.borderRadius ?? 0), border: border(s, 'element'), margin: align, boxSizing: 'border-box' }} />
    return <div style={{ padding: pad, ...frameStyle }}>{s.href ? <a href={String(s.href)} target={String(s.target ?? '_blank')} style={{ display: 'block' }} onClick={event => event.preventDefault()}>{image}</a> : image}</div>
  }
  if (block.type === 'button') {
    const buttonStyle: React.CSSProperties = {
      display: 'inline-block',
      overflow: 'hidden',
      backgroundColor: String(s.backgroundColor),
      backgroundClip: 'padding-box',
      color: String(s.color),
      width: Number(s.widthPercent ?? 0) > 0 ? `${s.widthPercent}%` : undefined,
      boxSizing: 'border-box',
      border: border(s, 'element'),
      borderRadius: `${Math.max(0, Number(s.borderRadius ?? 0))}px`,
      fontFamily: s.fontFamily ? String(s.fontFamily) : undefined,
      fontSize: Number(s.fontSize),
      lineHeight: String(s.lineHeight ?? 1.2),
      fontWeight: String(s.fontWeight),
      fontStyle: String(s.fontStyle ?? 'normal'),
      textDecoration: String(s.textDecoration ?? 'none'),
      textTransform: (s.textTransform as React.CSSProperties['textTransform']) ?? 'none',
      letterSpacing: Number(s.letterSpacing ?? 0),
      padding: String(s.innerPadding),
    }
    return <div style={{ padding: pad, textAlign: ((s.buttonAlign ?? s.textAlign) as React.CSSProperties['textAlign']) ?? 'center', ...frameStyle }}>
      {s.href
        ? <a className="email-button" href={String(s.href)} target={String(s.target ?? '_blank')} style={buttonStyle} onClick={event => event.preventDefault()}>{block.content}</a>
        : <span className="email-button" style={buttonStyle}>{block.content}</span>}
    </div>
  }
  if (block.type === 'divider') {
    const margin = s.dividerAlign === 'left' ? '0 auto 0 0' : s.dividerAlign === 'right' ? '0 0 0 auto' : '0 auto'
    return <div style={{ padding: pad, ...frameStyle }}><hr style={{ border: 0, borderTop: `${s.borderWidth ?? 1}px ${s.borderStyle ?? 'solid'} ${s.color}`, width: String(s.width), margin }} /></div>
  }
  if (block.type === 'spacer') return <div style={{ height: Number(s.height), ...frameStyle }} />
  const textStyle = { padding: pad, color: String(s.color ?? 'inherit'), fontFamily: s.fontFamily ? String(s.fontFamily) : undefined, fontSize: Number(s.fontSize), lineHeight: String(s.lineHeight), fontWeight: String(s.fontWeight), fontStyle: String(s.fontStyle ?? 'normal'), textDecoration: String(s.textDecoration ?? 'none'), textTransform: (s.textTransform as React.CSSProperties['textTransform']) ?? 'none', letterSpacing: s.letterSpacing ? Number(s.letterSpacing) : undefined, textAlign: (s.textAlign as React.CSSProperties['textAlign']), ...frameStyle }
  if (richTextTypes.has(block.type) && editorRef && onContentCommit && onSelectionChange) return <div style={textStyle}><InlineEditor block={block} editorRef={editorRef} onCommit={onContentCommit} onSelectionChange={onSelectionChange} /></div>
  return <div style={textStyle} dangerouslySetInnerHTML={{ __html: block.content }} />
}

interface SortableBlockProps { block: EmailBlock; selected: boolean; onSelect: () => void; onSelectParent: () => void; onDelete: () => void; onDuplicate: () => void; onContentChange: (id: string, content: string) => void }

export function SortableBlock({ block, selected, onSelect, onSelectParent, onDelete, onDuplicate, onContentChange }: SortableBlockProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id })
  const editorRef = useRef<HTMLDivElement>(null)
  const [activeCommands, setActiveCommands] = useState<Set<InlineCommand>>(new Set())
  const isRichText = richTextTypes.has(block.type)
  const refreshActiveCommands = useCallback(() => {
    if (!selected || !editorRef.current?.contains(document.getSelection()?.anchorNode ?? null)) return
    setActiveCommands(new Set(inlineActions.filter(action => document.queryCommandState(action.command)).map(action => action.command)))
  }, [selected])

  useEffect(() => {
    if (!selected || !isRichText) return
    document.addEventListener('selectionchange', refreshActiveCommands)
    return () => document.removeEventListener('selectionchange', refreshActiveCommands)
  }, [isRichText, refreshActiveCommands, selected])

  return <div ref={setNodeRef} data-block-id={block.id} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? .45 : 1 }} className={`canvas-block ${selected ? 'selected' : ''}`} onClick={event => { event.stopPropagation(); onSelect() }}>
    <BlockPreview block={block} editorRef={isRichText ? editorRef : undefined} onContentCommit={isRichText ? content => onContentChange(block.id, content) : undefined} onSelectionChange={isRichText ? refreshActiveCommands : undefined} />
    <button className="parent-selector" type="button" title="Sélectionner la colonne parente" aria-label="Sélectionner la colonne parente" onClick={event => { event.stopPropagation(); onSelectParent() }}><Columns3 /></button>
    <div className="block-tools"><button title="Déplacer" {...attributes} {...listeners}><GripVertical size={15} /></button><span>{block.type}</span><button title="Dupliquer" onClick={event => { event.stopPropagation(); onDuplicate() }}><Copy size={14} /></button><button title="Supprimer" onClick={event => { event.stopPropagation(); onDelete() }}><Trash2 size={14} /></button></div>
    {selected && isRichText && <InlineToolbar editorRef={editorRef} activeCommands={activeCommands} onCommand={refreshActiveCommands} />}
  </div>
}

interface ColumnCanvasProps {
  column: EmailColumn; selectedId: string | null; onSelect: (id: string) => void; onSelectParent: () => void; onDelete: (id: string) => void; onDuplicate: (id: string) => void; onContentChange: (id: string, content: string) => void
}

function ColumnCanvas({ column, selectedId, onSelect, onSelectParent, onDelete, onDuplicate, onContentChange }: ColumnCanvasProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({ id: column.id })
  const s = column.styles
  return <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? .45 : 1, padding: padding(s), background: String(s.backgroundColor ?? 'transparent'), border: border(s), borderRadius: Number(s.borderRadius ?? 0) }} className={`column-canvas ${selectedId === column.id ? 'selected-column' : ''} ${isOver ? 'drop-active' : ''}`} onClick={event => { event.stopPropagation(); onSelect(column.id) }}>
    <button className="parent-selector column-parent-selector" type="button" title="Sélectionner la section parente" aria-label="Sélectionner la section parente" onClick={event => { event.stopPropagation(); onSelectParent() }}><Rows3 /></button>
    <div className="column-badge"><button {...attributes} {...listeners} title="Déplacer la colonne"><GripVertical /></button><Columns3 /><span>Colonne · {Math.round(column.width)}%</span><button onClick={event => { event.stopPropagation(); onDuplicate(column.id) }}><Copy /></button><button onClick={event => { event.stopPropagation(); onDelete(column.id) }}><Trash2 /></button></div>
    <SortableContext items={column.blocks.map(block => block.id)} strategy={verticalListSortingStrategy}>
      {column.blocks.map(block => <SortableBlock key={block.id} block={block} selected={selectedId === block.id} onSelect={() => onSelect(block.id)} onSelectParent={() => onSelect(column.id)} onDelete={() => onDelete(block.id)} onDuplicate={() => onDuplicate(block.id)} onContentChange={onContentChange} />)}
    </SortableContext>
    {column.blocks.length === 0 && <div className="empty-column"><span>Déposez un bloc ici</span></div>}
  </div>
}

interface SectionCanvasProps {
  section: EmailSection; parentId?: string; selectedId: string | null; onSelect: (id: string) => void; onDelete: (id: string) => void; onDuplicate: (id: string) => void; onContentChange: (id: string, content: string) => void
}

export function SectionCanvas({ section, parentId, selectedId, onSelect, onDelete, onDuplicate, onContentChange }: SectionCanvasProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({ id: section.id })
  const s = section.styles
  const columnAlignment = s.textAlign === 'left' ? 'start' : s.textAlign === 'right' ? 'end' : 'center'
  return <section ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? .45 : 1, padding: padding(s), background: String(s.backgroundColor ?? 'transparent'), border: border(s), borderRadius: Number(s.borderRadius ?? 0) }} className={`section-canvas ${selectedId === section.id ? 'selected-section' : ''} ${isOver ? 'drop-active' : ''}`} onClick={event => { event.stopPropagation(); onSelect(section.id) }}>
    {parentId && <button className="parent-selector section-parent-selector" type="button" title="Sélectionner le wrapper parent" aria-label="Sélectionner le wrapper parent" onClick={event => { event.stopPropagation(); onSelect(parentId) }}><PanelTop /></button>}
    <div className="section-badge"><button {...attributes} {...listeners} title="Déplacer la section"><GripVertical /></button><Rows3 /><span>Section</span><button onClick={event => { event.stopPropagation(); onDuplicate(section.id) }}><Copy /></button><button onClick={event => { event.stopPropagation(); onDelete(section.id) }}><Trash2 /></button></div>
    <SortableContext items={section.columns.map(column => column.id)} strategy={horizontalListSortingStrategy}>
      <div className="section-columns" style={{ gridTemplateColumns: section.columns.map(column => `${column.width}%`).join(' '), justifyContent: columnAlignment }}>
        {section.columns.map(column => <ColumnCanvas key={column.id} column={column} selectedId={selectedId} onSelect={onSelect} onSelectParent={() => onSelect(section.id)} onDelete={onDelete} onDuplicate={onDuplicate} onContentChange={onContentChange} />)}
      </div>
    </SortableContext>
  </section>
}

interface WrapperCanvasProps {
  wrapper: EmailWrapper; selectedId: string | null; onSelect: (id: string) => void; onDelete: (id: string) => void; onDuplicate: (id: string) => void; onContentChange: (id: string, content: string) => void
}

export function WrapperCanvas({ wrapper, selectedId, onSelect, onDelete, onDuplicate, onContentChange }: WrapperCanvasProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({ id: wrapper.id })
  const s = wrapper.styles
  const backgroundUrl = String(s.backgroundUrl ?? '').trim()
  return <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? .45 : 1, padding: padding(s), backgroundColor: String(s.backgroundColor ?? 'transparent'), backgroundImage: backgroundUrl ? `url("${backgroundUrl}")` : undefined, backgroundPosition: String(s.backgroundPosition ?? 'center center'), backgroundRepeat: String(s.backgroundRepeat ?? 'no-repeat'), backgroundSize: String(s.backgroundSize ?? 'cover'), border: border(s), borderRadius: Number(s.borderRadius ?? 0) }} className={`wrapper-canvas ${selectedId === wrapper.id ? 'selected-wrapper' : ''} ${isOver ? 'drop-active' : ''}`} onClick={event => { event.stopPropagation(); onSelect(wrapper.id) }}>
    <div className="wrapper-badge"><button {...attributes} {...listeners} title="Déplacer le wrapper"><GripVertical /></button><PanelTop /><span>Wrapper · {wrapper.sections.length} section{wrapper.sections.length > 1 ? 's' : ''}</span><button onClick={event => { event.stopPropagation(); onDuplicate(wrapper.id) }}><Copy /></button><button onClick={event => { event.stopPropagation(); onDelete(wrapper.id) }}><Trash2 /></button></div>
    <SortableContext items={wrapper.sections.map(section => section.id)} strategy={verticalListSortingStrategy}>
      {wrapper.sections.map(section => <SectionCanvas key={section.id} section={section} parentId={wrapper.id} selectedId={selectedId} onSelect={onSelect} onDelete={onDelete} onDuplicate={onDuplicate} onContentChange={onContentChange} />)}
    </SortableContext>
    {wrapper.sections.length === 0 && <div className="empty-wrapper"><span>Déposez une section ici</span></div>}
  </div>
}

export function EmptyCanvas() {
  return <div className="empty-canvas"><div className="empty-icon"><ImageIcon size={22} /></div><strong>Commencez par un wrapper ou une section</strong><span>Ou déposez un contenu : sa structure MJML sera créée automatiquement</span><MousePointer2 size={16} /></div>
}
