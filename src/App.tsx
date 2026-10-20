import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, pointerWithin, rectIntersection, useDraggable, useDroppable, useSensor, useSensors, type CollisionDetection } from '@dnd-kit/core'
import { arrayMove, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { BookmarkPlus, Box, ChevronDown, Code2, Columns3, Download, Eye, FileImage, FilePlus2, FileText, FolderOpen, Heading, Image, LayoutTemplate, Menu, Minus, Monitor, MousePointerClick, PanelLeft, PanelRight, PanelTop, Redo2, Rows3, Save, Smartphone, Text, Trash2, Undo2, Upload, X } from 'lucide-react'
import { blockCatalog, createBlankDocument, createBlock, createColumn, createSection, createWrapper, itemLabel, normalizeDocument, structureCatalog } from './data'
import { compileEmail, downloadFile, toMjml } from './emailRenderer'
import { exportEmailPackage, type PackageExportResult } from './packageExporter'
import { exportEmailPdf, exportEmailPng, type VisualExportResult } from './visualExporter'
import { EmptyCanvas, SectionCanvas, WrapperCanvas } from './components'
import { loadPresets, persistPresets } from './presetStorage'
import { MAX_PROJECT_BYTES, parseProject, serializeProject } from './projectStorage'
import type { BuilderItemType, EmailBlock, EmailColumn, EmailDocument, EmailPreset, EmailSection, EmailWrapper, SelectedNode, StyleMap } from './types'
import { Button as FluidButton } from './components/ui/button'
import { Tabs as FluidTabs, TabsList as FluidTabsList, TabItem as FluidTabItem } from './components/ui/tabs'
import { Tooltip } from './components/ui/tooltip'
import { Field, EditorInput, EditorSelect, NumberField, ColorInput, OptionalColorInput, SettingsSection, EditorMessage, AlignmentControl, FullWidthControl } from './editor-controls'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './components/ui/dialog'
import { DropdownMenu, DropdownTrigger, DropdownContent, DropdownLabel, DropdownSeparator } from './components/ui/dropdown'
import { MenuItem } from './components/ui/menu-item'
import { Banner, BannerTitle } from './components/ui/banner'
import { Card, CardGroup, CardHeader, CardTitle, CardDescription, CardContent, CardAction } from './components/ui/card'
import { ScrollArea } from './components/ui/scroll-area'
import { Badge } from './components/ui/badge'

const iconMap: Record<BuilderItemType, React.ReactNode> = {
  wrapper: <PanelTop />, section: <Rows3 />, column: <Columns3 />, heading: <Heading />, text: <Text />, button: <MousePointerClick />, image: <Image />, divider: <Minus />, spacer: <Box />
}

const emailFonts = [
  { label: 'Police globale', value: '' }, { label: 'Arial — neutre', value: 'Arial, Helvetica, sans-serif' }, { label: 'Georgia — éditoriale', value: 'Georgia, Times New Roman, serif' }, { label: 'Helvetica — moderne', value: 'Helvetica, Arial, sans-serif' }, { label: 'Trebuchet — chaleureuse', value: 'Trebuchet MS, Arial, sans-serif' }, { label: 'Verdana — très lisible', value: 'Verdana, Geneva, sans-serif' }, { label: 'Courier — monospace', value: 'Courier New, Courier, monospace' },
]

type Viewport = 'desktop' | 'mobile'
type Modal = 'welcome' | 'preview' | 'code' | 'new-email' | 'save-preset' | null
type PanelTab = 'content' | 'design' | 'advanced'

const cloneDocument = (doc: EmailDocument): EmailDocument => structuredClone(doc)

const preciseCollisionDetection: CollisionDetection = args => {
  const pointerCollisions = pointerWithin(args)
  if (!pointerCollisions.length) return rectIntersection(args)
  return [...pointerCollisions].sort((a, b) => {
    const aRect = args.droppableRects.get(a.id)
    const bRect = args.droppableRects.get(b.id)
    const aArea = aRect ? aRect.width * aRect.height : Number.POSITIVE_INFINITY
    const bArea = bRect ? bRect.width * bRect.height : Number.POSITIVE_INFINITY
    return aArea - bArea
  })
}

function dragPointerPosition(event: DragEndEvent) {
  const activator = event.activatorEvent
  if ('clientX' in activator && 'clientY' in activator) return { x: Number(activator.clientX) + event.delta.x, y: Number(activator.clientY) + event.delta.y }
  if ('touches' in activator) {
    const touchEvent = activator as TouchEvent
    const touch = touchEvent.touches[0] ?? touchEvent.changedTouches[0]
    if (touch) return { x: touch.clientX + event.delta.x, y: touch.clientY + event.delta.y }
  }
  return null
}

const documentSections = (doc: EmailDocument) => doc.body.flatMap(item => item.type === 'wrapper' ? item.sections : [item])

function sectionPlacement(doc: EmailDocument, sectionId: string) {
  for (let bodyIndex = 0; bodyIndex < doc.body.length; bodyIndex += 1) {
    const item = doc.body[bodyIndex]
    if (item.type === 'section' && item.id === sectionId) return { section: item, bodyIndex, sectionIndex: -1, wrapper: undefined }
    if (item.type === 'wrapper') {
      const sectionIndex = item.sections.findIndex(section => section.id === sectionId)
      if (sectionIndex >= 0) return { section: item.sections[sectionIndex], bodyIndex, sectionIndex, wrapper: item }
    }
  }
  return null
}

function detachSection(doc: EmailDocument, sectionId: string) {
  const placement = sectionPlacement(doc, sectionId)
  if (!placement) return null
  if (placement.wrapper) return placement.wrapper.sections.splice(placement.sectionIndex, 1)[0]
  return doc.body.splice(placement.bodyIndex, 1)[0] as EmailSection
}

function insertSection(doc: EmailDocument, section: EmailSection, targetId: string | null) {
  const target = locateNode(doc, targetId)
  if (target?.kind === 'wrapper') { (target.node as EmailWrapper).sections.push(section); return }
  if (target?.sectionId) {
    const placement = sectionPlacement(doc, target.sectionId)
    if (placement?.wrapper) { placement.wrapper.sections.splice(placement.sectionIndex, 0, section); return }
    if (placement) { doc.body.splice(placement.bodyIndex, 0, section); return }
  }
  doc.body.push(section)
}

function locateNode(doc: EmailDocument, id: string | null): SelectedNode | null {
  if (!id) return null
  for (const item of doc.body) {
    if (item.type === 'wrapper' && item.id === id) return { kind: 'wrapper', node: item, wrapperId: item.id }
    const sections = item.type === 'wrapper' ? item.sections : [item]
    for (const section of sections) {
    const wrapperId = item.type === 'wrapper' ? item.id : undefined
    if (section.id === id) return { kind: 'section', node: section, wrapperId, sectionId: section.id }
    for (const column of section.columns) {
      if (column.id === id) return { kind: 'column', node: column, wrapperId, sectionId: section.id, columnId: column.id }
      const block = column.blocks.find(item => item.id === id)
      if (block) return { kind: 'block', node: block, wrapperId, sectionId: section.id, columnId: column.id }
    }
    }
  }
  return null
}

function rekeyBlock(block: EmailBlock): EmailBlock { return { ...structuredClone(block), id: `${block.type}-${crypto.randomUUID()}` } }
function rekeyColumn(column: EmailColumn): EmailColumn { return { ...structuredClone(column), id: `column-${crypto.randomUUID()}`, blocks: column.blocks.map(rekeyBlock) } }
function rekeySection(section: EmailSection): EmailSection { return { ...structuredClone(section), id: `section-${crypto.randomUUID()}`, columns: section.columns.map(rekeyColumn) } }
function rekeyWrapper(wrapper: EmailWrapper): EmailWrapper { return { ...structuredClone(wrapper), id: `wrapper-${crypto.randomUUID()}`, sections: wrapper.sections.map(rekeySection) } }

export function App() {
  const [doc, setDoc] = useState<EmailDocument>(() => createBlankDocument())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeNewType, setActiveNewType] = useState<BuilderItemType | null>(null)
  const [viewport, setViewport] = useState<Viewport>('desktop')
  const [modal, setModal] = useState<Modal>('welcome')
  const [panelTab, setPanelTab] = useState<PanelTab>('content')
  const [savedDocument, setSavedDocument] = useState<EmailDocument | null>(null)
  const [projectBusy, setProjectBusy] = useState<'save' | 'open' | null>(null)
  const [projectNotice, setProjectNotice] = useState<{ kind: 'success' | 'error'; message: string } | null>(null)
  const [presets, setPresets] = useState<EmailPreset[]>(loadPresets)
  const [history, setHistory] = useState<EmailDocument[]>([])
  const [future, setFuture] = useState<EmailDocument[]>([])
  const [libraryOpen, setLibraryOpen] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(true)
  const lastDoc = useRef(doc)
  const projectInputRef = useRef<HTMLInputElement>(null)
  const canvasAreaRef = useRef<HTMLDivElement | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  const { setNodeRef: setBodyDropRef, isOver: bodyIsOver } = useDroppable({ id: 'body-drop' })
  const setCanvasDropRef = useCallback((node: HTMLDivElement | null) => { canvasAreaRef.current = node; setBodyDropRef(node) }, [setBodyDropRef])
  const selected = locateNode(doc, selectedId)

  useEffect(() => {
    if (projectNotice?.kind !== 'success') return
    const timer = setTimeout(() => setProjectNotice(null), 7000)
    return () => clearTimeout(timer)
  }, [projectNotice])

  const commit = (next: EmailDocument) => {
    const previous = lastDoc.current
    setHistory(items => [...items.slice(-29), previous])
    setFuture([])
    lastDoc.current = next
    setDoc(next)
  }
  const undo = () => { const previous = history[history.length - 1]; if (!previous) return; setFuture(items => [doc, ...items]); setHistory(items => items.slice(0, -1)); lastDoc.current = previous; setDoc(previous) }
  const redo = () => { const next = future[0]; if (!next) return; setHistory(items => [...items, doc]); setFuture(items => items.slice(1)); lastDoc.current = next; setDoc(next) }

  const replaceDocument = (nextDocument: EmailDocument) => {
    const next = normalizeDocument(cloneDocument(nextDocument))
    lastDoc.current = next
    setDoc(next)
    setHistory([])
    setFuture([])
    setSelectedId(null)
    setPanelTab('content')
    setViewport('desktop')
    setSavedDocument(null)
    setModal(null)
  }

  const saveProject = async () => {
    if (projectBusy) return
    // Inline text commits on blur; read the ref so the last canvas edit is included.
    const snapshot = lastDoc.current
    setProjectBusy('save')
    setProjectNotice(null)
    try {
      const project = await serializeProject(snapshot)
      downloadFile(project.content, project.fileName, 'application/json')
      setSavedDocument(snapshot)
      setProjectNotice({ kind: 'success', message: `Projet téléchargé : ${project.fileName}. Les images locales sont incluses.` })
    } catch (error) {
      setProjectNotice({ kind: 'error', message: error instanceof Error ? error.message : 'Impossible d’enregistrer le projet.' })
    } finally {
      setProjectBusy(null)
    }
  }

  const openProject = async (file?: File) => {
    if (!file || projectBusy) return
    setProjectBusy('open')
    setProjectNotice(null)
    try {
      if (file.size > MAX_PROJECT_BYTES) throw new Error('Le fichier dépasse la taille maximale de 100 Mo.')
      const next = parseProject(await file.text())
      commit(next)
      setSavedDocument(next)
      setSelectedId(null)
      setPanelTab('content')
      setViewport('desktop')
      setModal(null)
      setProjectNotice({ kind: 'success', message: `Projet ouvert : ${next.name || file.name}. Vous pouvez reprendre l’édition ou annuler l’ouverture.` })
    } catch (error) {
      setProjectNotice({ kind: 'error', message: `${error instanceof Error ? error.message : 'Impossible d’ouvrir le projet.'} Le mail en cours a été conservé.` })
    } finally {
      setProjectBusy(null)
    }
  }

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey
      if (!modifier) return
      if (event.key.toLowerCase() === 's') { event.preventDefault(); void saveProject(); return }
      if (event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
      }
    }
    window.addEventListener('keydown', onShortcut)
    return () => window.removeEventListener('keydown', onShortcut)
  })

  const saveCurrentAsPreset = (name: string) => {
    const now = new Date().toISOString()
    const nextPreset: EmailPreset = {
      id: `preset-${crypto.randomUUID()}`,
      name: name.trim(),
      createdAt: now,
      updatedAt: now,
      document: cloneDocument(doc),
    }
    const nextPresets = [nextPreset, ...presets]
    setPresets(nextPresets)
    persistPresets(nextPresets)
    setModal(null)
  }

  const createFromPreset = (preset: EmailPreset) => {
    const next = normalizeDocument(cloneDocument(preset.document))
    next.body = next.body.map(item => item.type === 'wrapper' ? rekeyWrapper(item) : rekeySection(item))
    replaceDocument(next)
  }

  const deletePreset = (id: string) => {
    const nextPresets = presets.filter(preset => preset.id !== id)
    setPresets(nextPresets)
    persistPresets(nextPresets)
  }

  const insertBlock = (next: EmailDocument, block: EmailBlock, targetId: string | null) => {
    const target = locateNode(next, targetId)
    if (target?.kind === 'block' && target.columnId) {
      const column = locateNode(next, target.columnId)?.node as EmailColumn
      const index = column.blocks.findIndex(item => item.id === target.node.id)
      column.blocks.splice(index, 0, block); return
    }
    if (target?.kind === 'column') { (target.node as EmailColumn).blocks.push(block); return }
    if (target?.kind === 'section') {
      const section = target.node as EmailSection
      if (section.columns.length < 4) section.columns.push(createColumn([block]))
      else section.columns[0].blocks.push(block)
      return
    }
    if (target?.kind === 'wrapper') { (target.node as EmailWrapper).sections.push(createSection([createColumn([block])])) ; return }
    next.body.push(createSection([createColumn([block])]))
  }

  const addItem = (type: BuilderItemType, targetId: string | null = 'body-drop') => {
    const next = cloneDocument(doc)
    if (type === 'wrapper') {
      const wrapper = createWrapper([createSection()], next.theme.contentColor)
      const target = locateNode(next, targetId)
      const targetRootId = target?.wrapperId ?? (target?.kind === 'section' ? target.node.id : undefined)
      const targetIndex = targetRootId ? next.body.findIndex(item => item.id === targetRootId) : -1
      next.body.splice(targetIndex >= 0 ? targetIndex : next.body.length, 0, wrapper); commit(next); setSelectedId(wrapper.id); return
    }
    if (type === 'section') {
      const section = createSection(); insertSection(next, section, targetId); commit(next); setSelectedId(section.id); return
    }
    if (type === 'column') {
      const target = locateNode(next, targetId); const section = target?.sectionId ? locateNode(next, target.sectionId)?.node as EmailSection : undefined
      if (section && section.columns.length < 4) { const column = createColumn(); section.columns.push(column); commit(next); setSelectedId(column.id) }
      else { const column = createColumn(); const newSection = createSection([column]); if (target?.kind === 'wrapper') (target.node as EmailWrapper).sections.push(newSection); else next.body.push(newSection); commit(next); setSelectedId(column.id) }
      return
    }
    const block = createBlock(type); insertBlock(next, block, targetId); commit(next); setSelectedId(block.id); setPanelTab('content')
  }

  const removeNode = (id: string) => {
    const next = cloneDocument(doc); const location = locateNode(next, id); if (!location) return
    if (location.kind === 'wrapper') next.body = next.body.filter(item => item.id !== id)
    if (location.kind === 'section') detachSection(next, id)
    if (location.kind === 'column') { const section = locateNode(next, location.sectionId!)?.node as EmailSection; section.columns = section.columns.filter(column => column.id !== id); if (!section.columns.length) detachSection(next, section.id) }
    if (location.kind === 'block') { const column = locateNode(next, location.columnId!)?.node as EmailColumn; column.blocks = column.blocks.filter(block => block.id !== id) }
    commit(next); if (selectedId === id) setSelectedId(null)
  }

  const duplicateNode = (id: string) => {
    const next = cloneDocument(doc); const location = locateNode(next, id); if (!location) return
    let newId = ''
    if (location.kind === 'wrapper') { const index = next.body.findIndex(item => item.id === id); const copy = rekeyWrapper(location.node as EmailWrapper); next.body.splice(index + 1, 0, copy); newId = copy.id }
    if (location.kind === 'section') { const placement = sectionPlacement(next, id)!; const copy = rekeySection(location.node as EmailSection); if (placement.wrapper) placement.wrapper.sections.splice(placement.sectionIndex + 1, 0, copy); else next.body.splice(placement.bodyIndex + 1, 0, copy); newId = copy.id }
    if (location.kind === 'column') { const section = locateNode(next, location.sectionId!)?.node as EmailSection; if (section.columns.length >= 4) return; const index = section.columns.findIndex(column => column.id === id); const copy = rekeyColumn(location.node as EmailColumn); section.columns.splice(index + 1, 0, copy); newId = copy.id }
    if (location.kind === 'block') { const column = locateNode(next, location.columnId!)?.node as EmailColumn; const index = column.blocks.findIndex(block => block.id === id); const copy = rekeyBlock(location.node as EmailBlock); column.blocks.splice(index + 1, 0, copy); newId = copy.id }
    commit(next); setSelectedId(newId)
  }

  const updateBlock = (patch: Partial<EmailBlock>, stylePatch?: StyleMap) => {
    if (!selectedId) return; const next = cloneDocument(doc); const found = locateNode(next, selectedId); if (found?.kind !== 'block') return
    Object.assign(found.node, patch); (found.node as EmailBlock).styles = { ...(found.node as EmailBlock).styles, ...stylePatch }; commit(next)
  }
  const updateBlockContent = (id: string, content: string) => {
    const next = cloneDocument(doc); const found = locateNode(next, id); if (found?.kind !== 'block' || (found.node as EmailBlock).content === content) return
    ;(found.node as EmailBlock).content = content; commit(next)
  }
  const updateWrapper = (stylePatch: StyleMap) => { if (!selectedId) return; const next = cloneDocument(doc); const found = locateNode(next, selectedId); if (found?.kind !== 'wrapper') return; (found.node as EmailWrapper).styles = { ...(found.node as EmailWrapper).styles, ...stylePatch }; commit(next) }
  const updateSection = (stylePatch: StyleMap) => { if (!selectedId) return; const next = cloneDocument(doc); const found = locateNode(next, selectedId); if (found?.kind !== 'section') return; (found.node as EmailSection).styles = { ...(found.node as EmailSection).styles, ...stylePatch }; commit(next) }
  const updateColumn = (stylePatch: StyleMap) => { if (!selectedId) return; const next = cloneDocument(doc); const found = locateNode(next, selectedId); if (found?.kind !== 'column') return; (found.node as EmailColumn).styles = { ...(found.node as EmailColumn).styles, ...stylePatch }; commit(next) }
  const updateColumnWidth = (value: number) => {
    if (!selectedId) return; const next = cloneDocument(doc); const found = locateNode(next, selectedId); if (found?.kind !== 'column') return
    (found.node as EmailColumn).width = value; commit(next)
  }

  const onDragStart = (event: DragStartEvent) => { const id = String(event.active.id); setActiveNewType(id.startsWith('new:') ? id.slice(4) as BuilderItemType : null) }
  const onDragEnd = (event: DragEndEvent) => {
    const activeId = String(event.active.id)
    let overId = event.over ? String(event.over.id) : null
    if (!overId && activeId.startsWith('new:') && canvasAreaRef.current) {
      const pointer = dragPointerPosition(event)
      const rect = canvasAreaRef.current.getBoundingClientRect()
      if (pointer && pointer.x >= rect.left && pointer.x <= rect.right && pointer.y >= rect.top && pointer.y <= rect.bottom) overId = 'body-drop'
    }
    setActiveNewType(null); if (!overId) return
    if (activeId.startsWith('new:')) { addItem(activeId.slice(4) as BuilderItemType, overId); return }
    if (activeId === overId) return
    const source = locateNode(doc, activeId); if (!source) return
    const next = cloneDocument(doc); const target = locateNode(next, overId)
    if (source.kind === 'wrapper') {
      const from = next.body.findIndex(item => item.id === activeId)
      const targetRootId = target?.wrapperId ?? target?.sectionId
      const to = targetRootId ? next.body.findIndex(item => item.id === targetRootId) : next.body.length - 1
      if (from >= 0 && to >= 0) commit({ ...next, body: arrayMove(next.body, from, to) })
      return
    }
    if (source.kind === 'section') {
      if (target?.sectionId === activeId) return
      const sourcePlacement = sectionPlacement(next, activeId)
      const targetPlacement = target?.sectionId ? sectionPlacement(next, target.sectionId) : null
      const sameWrapper = sourcePlacement?.wrapper?.id && sourcePlacement.wrapper.id === targetPlacement?.wrapper?.id
      const bothAtRoot = sourcePlacement && targetPlacement && !sourcePlacement.wrapper && !targetPlacement.wrapper
      if (sourcePlacement && targetPlacement && (sameWrapper || bothAtRoot)) {
        if (sourcePlacement.wrapper && targetPlacement.wrapper) sourcePlacement.wrapper.sections = arrayMove(sourcePlacement.wrapper.sections, sourcePlacement.sectionIndex, targetPlacement.sectionIndex)
        else next.body = arrayMove(next.body, sourcePlacement.bodyIndex, targetPlacement.bodyIndex)
        commit(next); setSelectedId(activeId); return
      }
      const section = detachSection(next, activeId)
      if (section) { insertSection(next, section, overId); commit(next); setSelectedId(section.id) }
      return
    }
    if (source.kind === 'block') {
      const sourceNow = locateNode(next, activeId)!; const sourceColumn = locateNode(next, sourceNow.columnId!)?.node as EmailColumn; const index = sourceColumn.blocks.findIndex(block => block.id === activeId)
      if (target && target.columnId === sourceNow.columnId) {
        const targetIndex = target.kind === 'block' ? sourceColumn.blocks.findIndex(block => block.id === target.node.id) : sourceColumn.blocks.length - 1
        if (index >= 0 && targetIndex >= 0) sourceColumn.blocks = arrayMove(sourceColumn.blocks, index, targetIndex)
        commit(next); setSelectedId(activeId); return
      }
      const [block] = sourceColumn.blocks.splice(index, 1); insertBlock(next, block, overId); commit(next); setSelectedId(block.id); return
    }
    if (source.kind === 'column') {
      const sourceNow = locateNode(next, activeId)!; const sourceSection = locateNode(next, sourceNow.sectionId!)?.node as EmailSection; const index = sourceSection.columns.findIndex(column => column.id === activeId)
      if (target && target.sectionId === sourceNow.sectionId) {
        const targetColumnId = target.kind === 'column' ? target.node.id : target.columnId
        const targetIndex = targetColumnId ? sourceSection.columns.findIndex(column => column.id === targetColumnId) : sourceSection.columns.length - 1
        if (index >= 0 && targetIndex >= 0) sourceSection.columns = arrayMove(sourceSection.columns, index, targetIndex)
        commit(next); setSelectedId(activeId); return
      }
      const [column] = sourceSection.columns.splice(index, 1)
      const targetAfter = locateNode(next, overId); const targetSection = targetAfter?.sectionId ? locateNode(next, targetAfter.sectionId)?.node as EmailSection : undefined
      if (targetSection && targetSection.columns.length < 4) { const targetColumnId = targetAfter?.kind === 'column' ? targetAfter.node.id : targetAfter?.columnId; const targetIndex = targetColumnId ? targetSection.columns.findIndex(item => item.id === targetColumnId) : targetSection.columns.length; targetSection.columns.splice(targetIndex >= 0 ? targetIndex : targetSection.columns.length, 0, column) }
      else if (targetAfter?.kind === 'wrapper') (targetAfter.node as EmailWrapper).sections.push(createSection([column]))
      else next.body.push(createSection([column]))
      if (!sourceSection.columns.length) detachSection(next, sourceSection.id)
      commit(next); setSelectedId(column.id)
    }
  }

  const isExportModal = modal === 'preview' || modal === 'code'
  const exportMode = useRef<'preview' | 'code'>('preview')
  if (isExportModal) exportMode.current = modal
  const cachedHtml = useRef('')
  const html = useMemo(() => {
    if (isExportModal) cachedHtml.current = compileEmail(doc)
    return cachedHtml.current
  }, [doc, isExportModal])
  const allSections = documentSections(doc)
  const blockCount = allSections.reduce((total, section) => total + section.columns.reduce((sum, column) => sum + column.blocks.length, 0), 0)
  const customCanvasCss = allSections.flatMap(section => section.columns.flatMap(column => column.blocks)).filter(block => block.styles.cssDeclarations).map(block => `.canvas-block[data-block-id="${block.id}"] > *:first-child { ${block.styles.cssDeclarations} }`).join('\n')
  const libraryTarget = (type: BuilderItemType) => {
    if (type === 'wrapper' || !selected) return 'body-drop'
    if (type === 'section') return selected.kind === 'wrapper' ? selected.node.id : 'body-drop'
    if (type === 'column') return selected.sectionId ?? (selected.kind === 'wrapper' ? selected.node.id : 'body-drop')
    if (selected.kind === 'block') return selected.columnId ?? 'body-drop'
    if (selected.kind === 'column') return selected.node.id
    return selected.node.id
  }

  return <DndContext sensors={sensors} collisionDetection={preciseCollisionDetection} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveNewType(null)}>
    <div className={`app-shell ${libraryOpen ? '' : 'library-collapsed'} ${settingsOpen ? '' : 'settings-collapsed'}`}>
      <header className="topbar">
        <div className="brand"><div className="brand-mark">P</div><div><strong>postcraft</strong><span>Email studio</span></div></div>
        <div className="document-title"><input aria-label="Nom du mail" value={doc.name} onChange={event => { const next = { ...doc, name: event.target.value }; lastDoc.current = next; setDoc(next) }} /><span className={savedDocument === doc ? 'saved' : ''}>{savedDocument === doc ? 'Projet enregistré' : 'À sauvegarder'}</span></div>
        <div className="top-actions">
          <FluidButton className="ff-button" variant="tertiary" leadingIcon={FilePlus2} onClick={() => setModal('new-email')}>Nouveau</FluidButton>
          <ProjectMenu busy={projectBusy} onSave={saveProject} onOpen={() => projectInputRef.current?.click()} onSavePreset={() => setModal('save-preset')} />
          <div className="history-buttons"><Tooltip content="Annuler · ⌘Z"><FluidButton className="ff-icon-button" variant="ghost" size="icon-compact" onClick={undo} disabled={!history.length} aria-label="Annuler"><Undo2 /></FluidButton></Tooltip><Tooltip content="Rétablir · ⇧⌘Z"><FluidButton className="ff-icon-button" variant="ghost" size="icon-compact" onClick={redo} disabled={!future.length} aria-label="Rétablir"><Redo2 /></FluidButton></Tooltip></div>
          <FluidButton className="ff-button" variant="tertiary" leadingIcon={Eye} onClick={() => setModal('preview')}>Aperçu</FluidButton><FluidButton className="ff-button ff-primary" variant="primary" leadingIcon={Code2} trailingIcon={ChevronDown} onClick={() => setModal('code')}>Exporter</FluidButton>
        </div>
      </header>

      <aside className="library-panel"><ScrollArea className="panel-scroll"><div className="panel-heading"><div><span className="kicker">CONSTRUCTION</span><h2>Composants</h2></div><LayoutTemplate size={18} /></div>
        <div className="library-group"><span className="kicker">Structure</span><div className="blocks-grid structure-grid">{structureCatalog.map(item => <LibraryItem key={item.type} {...item} onClick={() => addItem(item.type, libraryTarget(item.type))} />)}</div></div>
        <div className="library-group"><span className="kicker">Contenu</span><div className="blocks-grid">{blockCatalog.map(item => <LibraryItem key={item.type} {...item} onClick={() => addItem(item.type, libraryTarget(item.type))} />)}</div></div>
        <EditorMessage title={<>Structure automatique</>}> Un contenu lâché dans le body crée automatiquement sa section et sa colonne.</EditorMessage>
        <StructureTree doc={doc} selectedId={selectedId} onSelect={setSelectedId} blockCount={blockCount} />
      </ScrollArea></aside>

      <main className="workspace" onClick={() => setSelectedId(null)}><div className="workspace-toolbar"><div className="workspace-toolbar-edge"><Tooltip content={libraryOpen ? 'Masquer les composants' : 'Afficher les composants'}><FluidButton className="ff-icon-button panel-toggle" variant="ghost" size="icon-compact" active={libraryOpen} onClick={event => { event.stopPropagation(); setLibraryOpen(value => !value) }} aria-label={libraryOpen ? 'Masquer les composants' : 'Afficher les composants'}><PanelLeft /></FluidButton></Tooltip></div><div className="workspace-toolbar-center"><FluidTabs value={viewport} onValueChange={value => setViewport(value as Viewport)} size="compact"><FluidTabsList className="viewport-tabs"><FluidTabItem value="desktop" label="Bureau"><Monitor /> Bureau</FluidTabItem><FluidTabItem value="mobile" label="Mobile"><Smartphone /> Mobile</FluidTabItem></FluidTabsList></FluidTabs><Badge color="gray" variant="dot" size="compact">MJML prêt</Badge><span>{doc.theme.contentWidth}px</span></div><div className="workspace-toolbar-edge end"><Tooltip content={settingsOpen ? 'Masquer les réglages' : 'Afficher les réglages'}><FluidButton className="ff-icon-button panel-toggle" variant="ghost" size="icon-compact" active={settingsOpen} onClick={event => { event.stopPropagation(); setSettingsOpen(value => !value) }} aria-label={settingsOpen ? 'Masquer les réglages' : 'Afficher les réglages'}><PanelRight /></FluidButton></Tooltip></div></div>
        <div ref={setCanvasDropRef} className={`canvas-scroll ${bodyIsOver ? 'body-drop-active' : ''} ${activeNewType ? 'accepting-new-item' : ''}`}><div className={`email-canvas ${viewport}`} style={{ maxWidth: viewport === 'desktop' ? doc.theme.contentWidth : 375, background: doc.theme.contentColor, fontFamily: doc.theme.fontFamily, color: doc.theme.textColor }}><style>{customCanvasCss}</style>
          {doc.body.length === 0 ? <EmptyCanvas /> : <SortableContext items={doc.body.map(item => item.id)} strategy={verticalListSortingStrategy}>{doc.body.map(item => item.type === 'wrapper' ? <WrapperCanvas key={item.id} wrapper={item} selectedId={selectedId} onSelect={setSelectedId} onDelete={removeNode} onDuplicate={duplicateNode} onContentChange={updateBlockContent} /> : <SectionCanvas key={item.id} section={item} selectedId={selectedId} onSelect={setSelectedId} onDelete={removeNode} onDuplicate={duplicateNode} onContentChange={updateBlockContent} />)}</SortableContext>}
          <button className="add-row" onClick={event => { event.stopPropagation(); addItem('section') }}>＋ Ajouter une section</button>
        </div></div>
      </main>

      <aside className="settings-panel"><ScrollArea className="panel-scroll">{selected?.kind === 'block' ? <BlockSettings block={selected.node as EmailBlock} tab={panelTab} setTab={setPanelTab} onUpdate={updateBlock} onClose={() => setSelectedId(null)} /> : selected?.kind === 'wrapper' ? <WrapperSettings wrapper={selected.node as EmailWrapper} onUpdate={updateWrapper} onClose={() => setSelectedId(null)} /> : selected?.kind === 'section' ? <SectionSettings section={selected.node as EmailSection} onUpdate={updateSection} onClose={() => setSelectedId(null)} /> : selected?.kind === 'column' ? <ColumnSettings column={selected.node as EmailColumn} onUpdate={updateColumn} onWidth={updateColumnWidth} onClose={() => setSelectedId(null)} /> : <DocumentSettings doc={doc} onUpdate={patch => commit({ ...doc, ...patch })} />}</ScrollArea></aside>
    </div>
    <DragOverlay>{activeNewType ? <div className="drag-card">{iconMap[activeNewType]} {itemLabel(activeNewType)}</div> : null}</DragOverlay>
    {<ExportModal open={modal === 'preview' || modal === 'code'} mode={exportMode.current} doc={doc} html={html} mjml={isExportModal ? toMjml(doc) : ''} viewport={viewport} setViewport={setViewport} onClose={() => setModal(null)} name={doc.name} />}
    {<SavePresetModal open={modal === 'save-preset'} doc={doc} onSave={saveCurrentAsPreset} onClose={() => setModal(null)} />}
    <WelcomeModal open={modal === 'welcome'} onCreateBlank={() => replaceDocument(createBlankDocument())} onOpenProject={() => projectInputRef.current?.click()} projectBusy={Boolean(projectBusy)} onClose={() => setModal(null)} />
    {<NewEmailModal open={modal === 'new-email'} presets={presets} onCreateBlank={() => replaceDocument(createBlankDocument())} onCreateFromPreset={createFromPreset} onDeletePreset={deletePreset} onOpenProject={() => projectInputRef.current?.click()} projectBusy={Boolean(projectBusy)} onClose={() => setModal(null)} />}
    <input ref={projectInputRef} className="project-file-input" type="file" accept=".json,application/json" aria-label="Fichier du projet Postcraft" disabled={Boolean(projectBusy)} onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; void openProject(file) }} />
    {projectNotice && <div className="editor-notice"><Banner status={projectNotice.kind === 'error' ? 'error' : 'success'} dismissible dismissLabel="Fermer la notification" onDismiss={() => setProjectNotice(null)}><BannerTitle>{projectNotice.message}</BannerTitle></Banner></div>}
  </DndContext>
}

function ProjectMenu({ busy, onSave, onOpen, onSavePreset }: { busy: 'save' | 'open' | null; onSave: () => void; onOpen: () => void; onSavePreset: () => void }) {
  const [open, setOpen] = useState(false)
  return <DropdownMenu open={open} onOpenChange={setOpen} disabled={Boolean(busy)}>
    <DropdownTrigger render={<FluidButton className="ff-button" variant="secondary" leadingIcon={FolderOpen} trailingIcon={ChevronDown} loading={Boolean(busy)} active={open}>Projet</FluidButton>} />
    <DropdownContent align="end" className="w-72">
      <DropdownLabel>Projet</DropdownLabel>
      <MenuItem index={0} icon={Save} label="Enregistrer le projet" onSelect={onSave} />
      <MenuItem index={1} icon={FolderOpen} label="Ouvrir un projet" onSelect={onOpen} />
      <DropdownSeparator />
      <MenuItem index={2} icon={BookmarkPlus} label="Enregistrer comme preset" onSelect={onSavePreset} />
    </DropdownContent>
  </DropdownMenu>
}

function LibraryItem({ type, label, description, onClick }: { type: BuilderItemType; label: string; description: string; onClick: () => void }) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: `new:${type}` })
  return <button ref={setNodeRef} className={`library-block library-${type} ${type === 'wrapper' || type === 'section' || type === 'column' ? 'structure-item' : ''}`} onClick={onClick} {...listeners} {...attributes}><span>{iconMap[type]}</span><strong>{label}</strong><small>{description}</small></button>
}

function StructureTree({ doc, selectedId, onSelect, blockCount }: { doc: EmailDocument; selectedId: string | null; onSelect: (id: string) => void; blockCount: number }) {
  let sectionNumber = 0
  const renderSection = (section: EmailSection) => {
    sectionNumber += 1
    return <div className="tree-section" key={section.id}><button className={selectedId === section.id ? 'active-item' : ''} onClick={() => onSelect(section.id)}><Rows3 /><strong>Section {sectionNumber}</strong><small>{section.columns.length} col.</small></button>{section.columns.map((column, columnIndex) => <div className="tree-column" key={column.id}><button className={selectedId === column.id ? 'active-item' : ''} onClick={() => onSelect(column.id)}><Columns3 /><span>Colonne {columnIndex + 1}</span><small>{Math.round(column.width)}%</small></button>{column.blocks.map(block => <button className={`tree-block ${selectedId === block.id ? 'active-item' : ''}`} key={block.id} onClick={() => onSelect(block.id)}><i className="tree-block-icon">{iconMap[block.type]}</i><span className="tree-block-label">{itemLabel(block.type)}</span></button>)}</div>)}</div>
  }
  const sectionCount = documentSections(doc).length
  return <div className="structure"><span className="kicker">Structure du document</span><div className="structure-summary"><Menu /><span><strong>Body MJML</strong><small>{sectionCount} sections · {blockCount} blocs</small></span></div>{doc.body.map((item, wrapperIndex) => item.type === 'wrapper' ? <div className="tree-wrapper" key={item.id}><button className={selectedId === item.id ? 'active-item' : ''} onClick={() => onSelect(item.id)}><PanelTop /><strong>Wrapper {wrapperIndex + 1}</strong><small>{item.sections.length} sec.</small></button><div className="tree-wrapper-children">{item.sections.map(renderSection)}</div></div> : renderSection(item))}</div>
}

function LocalImageInput({ currentName, onSelect }: { currentName: string; onSelect: (localUrl: string, fileName: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  const importFile = (file?: File) => {
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.type)) { setError('Format non pris en charge. Utilisez PNG, JPG, GIF ou WEBP.'); return }
    onSelect(URL.createObjectURL(file), file.name)
    setError('')
  }
  return <div className="local-image-import">
    <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" onChange={event => { importFile(event.target.files?.[0]); event.currentTarget.value = '' }} />
    <FluidButton variant="tertiary" type="button" leadingIcon={Upload} className="w-full justify-start" onClick={() => inputRef.current?.click()}>{currentName ? 'Changer le fichier local' : 'Choisir un fichier local'}</FluidButton>
    <p className="image-sizing-help mt-2">PNG, JPG, GIF ou WEBP</p>
    {currentName && <div className="local-image-file"><Image /><span><strong>{currentName}</strong><small>Image locale · incluse dans le projet JSON</small></span></div>}
    {error && <p className="local-image-error">{error}</p>}
    <p className="local-image-warning"><strong>Pour conserver cette image :</strong> utilisez « Projet → Enregistrer le projet ». Le JSON embarque son contenu pour la retrouver après fermeture. Pour un envoi, les images doivent être hébergées ou jointes en CID.</p>
  </div>
}

function CommonSurfaceSettings({ styles, onUpdate, label = 'Surface' }: { styles: StyleMap; onUpdate: (patch: StyleMap) => void; label?: string }) {
  return <><SettingsSection title={<>{label}</>} className=""><Field label="Couleur de fond"><OptionalColorInput value={String(styles.backgroundColor ?? styles.containerBackgroundColor ?? 'transparent')} onChange={value => onUpdate(styles.containerBackgroundColor !== undefined ? { containerBackgroundColor: value } : { backgroundColor: value })} /></Field><NumberField label="Arrondi" value={styles.borderRadius ?? styles.containerBorderRadius ?? 0} min={0} max={80} onChange={value => onUpdate(styles.containerBorderRadius !== undefined ? { containerBorderRadius: value } : { borderRadius: value })} /></SettingsSection><SettingsSection title={<>Bordure</>} className=""><NumberField label="Épaisseur" value={styles.borderWidth ?? styles.containerBorderWidth ?? 0} min={0} max={16} onChange={value => onUpdate(styles.containerBorderWidth !== undefined ? { containerBorderWidth: value } : { borderWidth: value })} /><Field label="Style"><EditorSelect value={String(styles.borderStyle ?? styles.containerBorderStyle ?? 'solid')} onChange={event => onUpdate(styles.containerBorderStyle !== undefined ? { containerBorderStyle: event.target.value } : { borderStyle: event.target.value })}><option value="solid">Pleine</option><option value="dashed">Tirets</option><option value="dotted">Pointillés</option><option value="double">Double</option></EditorSelect></Field><Field label="Couleur"><ColorInput value={String(styles.borderColor ?? styles.containerBorderColor ?? '#272621')} onChange={value => onUpdate(styles.containerBorderColor !== undefined ? { containerBorderColor: value } : { borderColor: value })} /></Field></SettingsSection></>
}

function BlockSettings({ block, tab, setTab, onUpdate, onClose }: { block: EmailBlock; tab: PanelTab; setTab: (tab: PanelTab) => void; onUpdate: (patch: Partial<EmailBlock>, styles?: StyleMap) => void; onClose: () => void }) {
  const s = block.styles
  const importLocalImage = (localUrl: string, fileName: string) => onUpdate({ content: localUrl }, {
    sourceType: 'local', sourceName: fileName,
    // A replacement has its own aspect ratio; never inherit a previous crop height.
    height: 0,
    ...(String(s.alt ?? '').trim() ? {} : { alt: fileName.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ') }),
  })
  // Keep object URLs alive: duplicated blocks and undo history may still reference them.
  return <><div className="settings-head"><div><span className="kicker">BLOC DE CONTENU</span><h2>{itemLabel(block.type)}</h2></div><Tooltip content="Fermer les réglages"><FluidButton className="ff-icon-button" variant="ghost" size="icon-compact" onClick={onClose} aria-label="Fermer les réglages"><X /></FluidButton></Tooltip></div><FluidTabs value={tab} onValueChange={value => setTab(value as PanelTab)} size="compact" className="settings-fluid-tabs"><FluidTabsList className="settings-tabs-list"><FluidTabItem value="content" label="Contenu">Contenu</FluidTabItem><FluidTabItem value="design" label="Style">Style</FluidTabItem><FluidTabItem value="advanced" label="Avancé">Avancé</FluidTabItem></FluidTabsList></FluidTabs><div className="settings-body">
    {tab === 'content' ? <>{block.type !== 'divider' && block.type !== 'spacer' && <Field label={block.type === 'image' ? 'URL de l’image' : 'Contenu'}>{block.type === 'text' || block.type === 'heading' ? <textarea rows={block.type === 'text' ? 7 : 4} value={block.content} onChange={event => onUpdate({ content: event.target.value })} /> : block.type === 'image' ? <EditorInput placeholder={s.sourceType === 'local' ? `Image locale : ${String(s.sourceName ?? '')}` : 'https://…'} value={s.sourceType === 'local' ? '' : block.content} onChange={event => onUpdate({ content: event.target.value }, { sourceType: 'remote', sourceName: '' })} /> : <EditorInput value={block.content} onChange={event => onUpdate({ content: event.target.value })} />}</Field>}{block.type === 'image' && <><LocalImageInput currentName={s.sourceType === 'local' ? String(s.sourceName ?? '') : ''} onSelect={importLocalImage} /><Field label="Lien au clic"><EditorInput placeholder="https://…" value={String(s.href ?? '')} onChange={event => onUpdate({}, { href: event.target.value })} /></Field><Field label="Texte alternatif"><EditorInput value={String(s.alt ?? '')} onChange={event => onUpdate({}, { alt: event.target.value })} /></Field></>}{block.type === 'button' && <Field label="Lien de destination"><EditorInput value={String(s.href ?? '')} onChange={event => onUpdate({}, { href: event.target.value })} /></Field>}<EditorMessage title={<>Imbrication MJML valide</>}> Ce contenu appartient toujours à une colonne, elle-même placée dans une section.</EditorMessage></> : tab === 'design' ? <>
      {!['image', 'divider', 'spacer'].includes(block.type) && <><Field label="Police"><EditorSelect value={String(s.fontFamily ?? '')} onChange={event => onUpdate({}, { fontFamily: event.target.value })}>{emailFonts.map(font => <option key={font.value} value={font.value}>{font.label}</option>)}</EditorSelect></Field><NumberField label="Taille du texte" value={s.fontSize} min={9} max={64} onChange={value => onUpdate({}, { fontSize: value })} /><Field label="Alignement"><AlignmentControl value={String(s.textAlign ?? 'left')} onChange={value => onUpdate({}, { textAlign: value })} /></Field><Field label="Couleur du texte"><ColorInput value={String(s.color ?? '#272621')} onChange={value => onUpdate({}, { color: value })} /></Field></>}
      <SettingsSection title={<>Surface du bloc</>} className=""><Field label="Couleur de fond"><OptionalColorInput value={String(s.containerBackgroundColor ?? 'transparent')} onChange={value => onUpdate({}, { containerBackgroundColor: value })} /></Field><NumberField label="Arrondi du conteneur" value={s.containerBorderRadius ?? 0} min={0} max={80} onChange={value => onUpdate({}, { containerBorderRadius: value })} /></SettingsSection>
      {block.type === 'button' && <SettingsSection title={<>Bouton</>} className=""><Field label="Couleur"><ColorInput value={String(s.backgroundColor)} onChange={value => onUpdate({}, { backgroundColor: value })} /></Field><NumberField label="Arrondi du bouton" value={s.borderRadius} min={0} max={80} onChange={value => onUpdate({}, { borderRadius: value })} /><NumberField label="Largeur (0 = auto)" value={s.widthPercent ?? 0} min={0} max={100} unit="%" onChange={value => onUpdate({}, { widthPercent: value })} /></SettingsSection>}
      {block.type === 'image' && <SettingsSection title={<>Image</>} className="">
        
        <NumberField label="Largeur" value={s.widthPercent ?? 100} min={10} max={100} unit="%" onChange={value => onUpdate({}, { widthPercent: value })} />
        <Field label="Hauteur"><EditorSelect value={Number(s.height ?? 0) > 0 ? 'fixed' : 'auto'} onChange={event => onUpdate({}, { height: event.target.value === 'auto' ? 0 : 300 })}><option value="auto">Automatique · proportions d’origine</option><option value="fixed">Hauteur fixe · ajustement personnalisé</option></EditorSelect></Field>
        {Number(s.height ?? 0) > 0 && <NumberField label="Hauteur fixe" value={s.height} min={0} max={Math.max(600, Number(s.height))} onChange={value => onUpdate({}, { height: value })} />}
        <p className="image-sizing-help">{Number(s.height ?? 0) > 0 ? 'Une hauteur fixe peut recadrer l’image avec l’ajustement « Couvrir ». Choisissez « Automatique » pour conserver ses proportions.' : 'La hauteur suit la largeur : l’image reste entière, sans recadrage.'}</p>
        <NumberField label="Arrondi" value={s.borderRadius} min={0} max={80} onChange={value => onUpdate({}, { borderRadius: value })} />
      </SettingsSection>}
      {block.type === 'divider' && <><Field label="Couleur de la ligne"><ColorInput value={String(s.color)} onChange={value => onUpdate({}, { color: value })} /></Field><NumberField label="Largeur" value={parseFloat(String(s.width ?? 100))} min={10} max={100} unit="%" onChange={value => onUpdate({}, { width: `${value}%` })} /></>}{block.type === 'spacer' && <NumberField label="Hauteur" value={s.height} min={4} max={200} onChange={value => onUpdate({}, { height: value })} />}
      <SettingsSection title={<>Espacement</>} className=""><div className="spacing-grid"><NumberField label="Haut" value={s.paddingTop} onChange={value => onUpdate({}, { paddingTop: value })} /><NumberField label="Bas" value={s.paddingBottom} onChange={value => onUpdate({}, { paddingBottom: value })} /><NumberField label="Gauche" value={s.paddingLeft} onChange={value => onUpdate({}, { paddingLeft: value })} /><NumberField label="Droite" value={s.paddingRight} onChange={value => onUpdate({}, { paddingRight: value })} /></div></SettingsSection>
    </> : <>
      {!['image', 'divider', 'spacer'].includes(block.type) && <SettingsSection title={<>Typographie fine</>} className="first"><Field label="Graisse"><EditorSelect value={String(s.fontWeight ?? '400')} onChange={event => onUpdate({}, { fontWeight: event.target.value })}>{['300', '400', '500', '600', '700', '800'].map(weight => <option key={weight}>{weight}</option>)}</EditorSelect></Field><div className="two-fields"><Field label="Style"><EditorSelect value={String(s.fontStyle ?? 'normal')} onChange={event => onUpdate({}, { fontStyle: event.target.value })}><option value="normal">Normal</option><option value="italic">Italique</option></EditorSelect></Field><Field label="Décoration"><EditorSelect value={String(s.textDecoration ?? 'none')} onChange={event => onUpdate({}, { textDecoration: event.target.value })}><option value="none">Aucune</option><option value="underline">Souligné</option><option value="line-through">Barré</option></EditorSelect></Field></div><Field label="Casse"><EditorSelect value={String(s.textTransform ?? 'none')} onChange={event => onUpdate({}, { textTransform: event.target.value })}><option value="none">Originale</option><option value="uppercase">MAJUSCULES</option><option value="lowercase">minuscules</option><option value="capitalize">Capitales</option></EditorSelect></Field><NumberField label="Interligne" value={s.lineHeight ?? 1.4} min={0.8} max={3} step={0.1} unit="×" onChange={value => onUpdate({}, { lineHeight: value })} /><NumberField label="Espacement lettres" value={s.letterSpacing ?? 0} min={-4} max={20} onChange={value => onUpdate({}, { letterSpacing: value })} /></SettingsSection>}
      <SettingsSection title={<>Bordure du bloc</>} className=""><NumberField label="Épaisseur" value={s.containerBorderWidth ?? 0} min={0} max={16} onChange={value => onUpdate({}, { containerBorderWidth: value })} /><Field label="Style"><EditorSelect value={String(s.containerBorderStyle ?? 'solid')} onChange={event => onUpdate({}, { containerBorderStyle: event.target.value })}><option value="solid">Pleine</option><option value="dashed">Tirets</option><option value="dotted">Pointillés</option><option value="double">Double</option></EditorSelect></Field><Field label="Couleur"><ColorInput value={String(s.containerBorderColor ?? '#272621')} onChange={value => onUpdate({}, { containerBorderColor: value })} /></Field></SettingsSection>
      {block.type === 'image' && <SettingsSection title={<>Attributs image</>} className=""><div className="two-fields"><Field label="Alignement"><EditorSelect value={String(s.imageAlign ?? 'center')} onChange={event => onUpdate({}, { imageAlign: event.target.value })}><option value="left">Gauche</option><option value="center">Centre</option><option value="right">Droite</option></EditorSelect></Field><Field label="Ajustement"><EditorSelect value={String(s.imageFit ?? 'cover')} onChange={event => onUpdate({}, { imageFit: event.target.value })}><option value="cover">Couvrir</option><option value="contain">Contenir</option><option value="fill">Étirer</option></EditorSelect></Field></div><Field label="Position"><EditorSelect value={String(s.imagePosition ?? 'center center')} onChange={event => onUpdate({}, { imagePosition: event.target.value })}><option value="center center">Centre</option><option value="center top">Haut</option><option value="center bottom">Bas</option><option value="left center">Gauche</option><option value="right center">Droite</option></EditorSelect></Field><Field label="Titre au survol"><EditorInput value={String(s.title ?? '')} onChange={event => onUpdate({}, { title: event.target.value })} /></Field></SettingsSection>}
      {(block.type === 'image' || block.type === 'button') && <SettingsSection title={<>Bordure de l’élément</>} className=""><NumberField label="Épaisseur" value={s.elementBorderWidth ?? 0} min={0} max={16} onChange={value => onUpdate({}, { elementBorderWidth: value })} /><Field label="Couleur"><ColorInput value={String(s.elementBorderColor ?? '#272621')} onChange={value => onUpdate({}, { elementBorderColor: value })} /></Field></SettingsSection>}
      <SettingsSection title={<>Contrôle CSS</>} className="code-settings"><Field label="Classe CSS"><EditorInput value={String(s.cssClass ?? '')} onChange={event => onUpdate({}, { cssClass: event.target.value })} /></Field><Field label="Déclarations libres"><textarea rows={6} placeholder="box-shadow: 0 8px 24px rgba(0,0,0,.12);" value={String(s.cssDeclarations ?? '')} onChange={event => onUpdate({}, { cssDeclarations: event.target.value })} /></Field></SettingsSection>
    </>}
  </div></>
}

function WrapperSettings({ wrapper, onUpdate, onClose }: { wrapper: EmailWrapper; onUpdate: (patch: StyleMap) => void; onClose: () => void }) {
  const s = wrapper.styles
  return <><div className="settings-head"><div><span className="kicker">Structure</span><h2>Wrapper</h2></div><FluidButton variant="ghost" aria-label="Fermer" size="icon-compact" onClick={onClose}><X /></FluidButton></div><div className="node-path"><span>body</span><b>/</b><strong>wrapper</strong></div><div className="settings-body"><EditorMessage title={<>Groupe de sections</>}> Le wrapper applique une surface commune à plusieurs sections.</EditorMessage><CommonSurfaceSettings styles={s} onUpdate={onUpdate} label="Surface du wrapper" /><SettingsSection title={<>Arrière-plan avancé</>} className=""><Field label="URL de l’image"><EditorInput placeholder="https://…" value={String(s.backgroundUrl ?? '')} onChange={event => onUpdate({ backgroundUrl: event.target.value })} /></Field><div className="two-fields"><Field label="Taille"><EditorSelect value={String(s.backgroundSize ?? 'cover')} onChange={event => onUpdate({ backgroundSize: event.target.value })}><option value="cover">Couvrir</option><option value="contain">Contenir</option><option value="auto">Originale</option></EditorSelect></Field><Field label="Répétition"><EditorSelect value={String(s.backgroundRepeat ?? 'no-repeat')} onChange={event => onUpdate({ backgroundRepeat: event.target.value })}><option value="no-repeat">Aucune</option><option value="repeat">Répéter</option><option value="repeat-x">Horizontale</option><option value="repeat-y">Verticale</option></EditorSelect></Field></div><Field label="Position"><EditorSelect value={String(s.backgroundPosition ?? 'center center')} onChange={event => onUpdate({ backgroundPosition: event.target.value })}><option value="center center">Centre</option><option value="center top">Haut</option><option value="center bottom">Bas</option><option value="left center">Gauche</option><option value="right center">Droite</option></EditorSelect></Field></SettingsSection><SettingsSection title={<>Espacement</>} className=""><div className="spacing-grid"><NumberField label="Haut" value={s.paddingTop} onChange={value => onUpdate({ paddingTop: value })} /><NumberField label="Bas" value={s.paddingBottom} onChange={value => onUpdate({ paddingBottom: value })} /><NumberField label="Gauche" value={s.paddingLeft} onChange={value => onUpdate({ paddingLeft: value })} /><NumberField label="Droite" value={s.paddingRight} onChange={value => onUpdate({ paddingRight: value })} /></div></SettingsSection><SettingsSection title={<>Comportement</>} className=""><FullWidthControl value={String(s.fullWidth ?? 'false')} onChange={event => onUpdate({ fullWidth: event.target.value })} /><Field label="Classe CSS"><EditorInput value={String(s.cssClass ?? '')} onChange={event => onUpdate({ cssClass: event.target.value })} /></Field></SettingsSection></div></>
}

function SectionSettings({ section, onUpdate, onClose }: { section: EmailSection; onUpdate: (patch: StyleMap) => void; onClose: () => void }) {
  const s = section.styles
  return <><div className="settings-head"><div><span className="kicker">Structure</span><h2>Section</h2></div><FluidButton variant="ghost" aria-label="Fermer" size="icon-compact" onClick={onClose}><X /></FluidButton></div><div className="node-path"><span>body</span><b>/</b><strong>section</strong></div><div className="settings-body"><EditorMessage title={<>Rangée de mise en page</>}> Une section contient de 1 à 4 colonnes.</EditorMessage><CommonSurfaceSettings styles={s} onUpdate={onUpdate} label="Surface de la section" /><SettingsSection title={<>Espacement</>} className=""><div className="spacing-grid"><NumberField label="Haut" value={s.paddingTop} onChange={value => onUpdate({ paddingTop: value })} /><NumberField label="Bas" value={s.paddingBottom} onChange={value => onUpdate({ paddingBottom: value })} /><NumberField label="Gauche" value={s.paddingLeft} onChange={value => onUpdate({ paddingLeft: value })} /><NumberField label="Droite" value={s.paddingRight} onChange={value => onUpdate({ paddingRight: value })} /></div></SettingsSection><SettingsSection title={<>Comportement</>} className=""><Field label="Direction"><EditorSelect value={String(s.direction ?? 'ltr')} onChange={event => onUpdate({ direction: event.target.value })}><option value="ltr">Gauche → droite</option><option value="rtl">Droite → gauche</option></EditorSelect></Field><FullWidthControl value={String(s.fullWidth ?? 'false')} onChange={event => onUpdate({ fullWidth: event.target.value })} /><Field label="Classe CSS"><EditorInput value={String(s.cssClass ?? '')} onChange={event => onUpdate({ cssClass: event.target.value })} /></Field></SettingsSection></div></>
}

function ColumnSettings({ column, onUpdate, onWidth, onClose }: { column: EmailColumn; onUpdate: (patch: StyleMap) => void; onWidth: (width: number) => void; onClose: () => void }) {
  const s = column.styles
  return <><div className="settings-head"><div><span className="kicker">Structure</span><h2>Colonne</h2></div><FluidButton variant="ghost" aria-label="Fermer" size="icon-compact" onClick={onClose}><X /></FluidButton></div><div className="node-path"><span>section</span><b>/</b><strong>column</strong></div><div className="settings-body"><EditorMessage title={<>Conteneur de contenu</>}> La largeur de cette colonne est indépendante des autres.</EditorMessage><NumberField label="Largeur" value={column.width} min={10} max={100} unit="%" onChange={onWidth} /><Field label="Alignement vertical"><EditorSelect value={String(s.verticalAlign ?? 'top')} onChange={event => onUpdate({ verticalAlign: event.target.value })}><option value="top">Haut</option><option value="middle">Milieu</option><option value="bottom">Bas</option></EditorSelect></Field><CommonSurfaceSettings styles={s} onUpdate={onUpdate} label="Surface de la colonne" /><SettingsSection title={<>Espacement interne</>} className=""><div className="spacing-grid"><NumberField label="Haut" value={s.paddingTop} onChange={value => onUpdate({ paddingTop: value })} /><NumberField label="Bas" value={s.paddingBottom} onChange={value => onUpdate({ paddingBottom: value })} /><NumberField label="Gauche" value={s.paddingLeft} onChange={value => onUpdate({ paddingLeft: value })} /><NumberField label="Droite" value={s.paddingRight} onChange={value => onUpdate({ paddingRight: value })} /></div></SettingsSection><Field label="Classe CSS"><EditorInput value={String(s.cssClass ?? '')} onChange={event => onUpdate({ cssClass: event.target.value })} /></Field></div></>
}

function DocumentSettings({ doc, onUpdate }: { doc: EmailDocument; onUpdate: (patch: Partial<EmailDocument>) => void }) {
  const theme = doc.theme; const setTheme = (patch: Partial<EmailDocument['theme']>) => onUpdate({ theme: { ...theme, ...patch } })
  return <><div className="settings-head"><div><span className="kicker">PARAMÈTRES</span><h2>Email</h2></div><Save /></div><div className="node-path"><strong>body</strong><span>Racine du document</span></div><div className="settings-body"><Field label="Objet"><EditorInput value={doc.subject} onChange={event => onUpdate({ subject: event.target.value })} /></Field><Field label="Pré-en-tête"><textarea rows={3} value={doc.preview} onChange={event => onUpdate({ preview: event.target.value })} /></Field><SettingsSection title={<>Thème global</>} className=""><Field label="Police"><EditorSelect value={theme.fontFamily} onChange={event => setTheme({ fontFamily: event.target.value })}>{emailFonts.filter(font => font.value).map(font => <option key={font.value} value={font.value}>{font.label}</option>)}</EditorSelect></Field><Field label="Arrière-plan"><ColorInput value={theme.backgroundColor} onChange={value => setTheme({ backgroundColor: value })} /></Field><Field label="Fond du contenu"><ColorInput value={theme.contentColor} onChange={value => setTheme({ contentColor: value })} /></Field><Field label="Couleur du texte"><ColorInput value={theme.textColor} onChange={value => setTheme({ textColor: value })} /></Field><Field label="Couleur des liens"><ColorInput value={theme.linkColor} onChange={value => setTheme({ linkColor: value })} /></Field><NumberField label="Largeur" value={theme.contentWidth} min={480} max={720} onChange={value => setTheme({ contentWidth: value })} /></SettingsSection></div></>
}

function documentStats(doc: EmailDocument) {
  const sections = documentSections(doc)
  const blocks = sections.reduce((total, section) => total + section.columns.reduce((sum, column) => sum + column.blocks.length, 0), 0)
  return `${sections.length} section${sections.length > 1 ? 's' : ''} · ${blocks} bloc${blocks > 1 ? 's' : ''}`
}

function PresetMiniature({ doc, blank = false }: { doc: EmailDocument; blank?: boolean }) {
  return <div className={`preset-miniature ${blank ? 'blank' : ''}`} style={{ background: doc.theme.backgroundColor }}>
    <div className="preset-miniature-paper" style={{ background: doc.theme.contentColor }}>
      {blank ? <FilePlus2 /> : documentSections(doc).slice(0, 5).map((section, index) => {
        const blockCount = section.columns.reduce((sum, column) => sum + column.blocks.length, 0)
        return <span key={`${section.id}-${index}`} style={{ height: `${Math.min(30, 7 + blockCount * 4)}px`, background: index === 1 ? doc.theme.linkColor : doc.theme.textColor, opacity: index === 1 ? .72 : .18 }} />
      })}
    </div>
  </div>
}

function SavePresetModal({ open, doc, onSave, onClose }: { open: boolean; doc: EmailDocument; onSave: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState(doc.name)
  useEffect(() => { if (open) setName(doc.name) }, [open, doc.name])
  const submit = (event: React.FormEvent) => { event.preventDefault(); if (name.trim()) onSave(name) }
  return <Dialog open={open} onOpenChange={next => { if (!next) onClose() }}>
    <DialogContent size="xl" showCloseButton={false} aria-describedby={undefined} className="modal p-0 max-w-[760px] preset-dialog save-preset-dialog">
      <div className="modal-head"><div><span className="kicker">Bibliothèque locale</span><DialogTitle>Enregistrer comme preset</DialogTitle></div><div className="modal-actions"><FluidButton variant="ghost" aria-label="Fermer" size="icon-compact" onClick={onClose}><X /></FluidButton></div></div>
      <form onSubmit={submit}>
        <div className="save-preset-body">
          <div className="save-preset-copy"><div className="preset-dialog-icon"><BookmarkPlus /></div><h3>Capturez ce modèle</h3><p>Le preset conservera la structure MJML, les contenus et tous les réglages visuels actuels.</p><Field label="Nom du preset"><EditorInput autoFocus value={name} onChange={event => setName(event.target.value)} placeholder="Ex. Newsletter mensuelle" /></Field><small>Stocké localement sur cet appareil.</small></div>
          <div className="save-preset-summary"><PresetMiniature doc={doc} /><span className="kicker">APERÇU DU PRESET</span><strong>{name.trim() || 'Preset sans nom'}</strong><small>{documentStats(doc)}</small></div>
        </div>
        <div className="dialog-footer"><FluidButton variant="tertiary" type="button" onClick={onClose}>Annuler</FluidButton><FluidButton variant="primary" type="submit" leadingIcon={BookmarkPlus} disabled={!name.trim()}>Enregistrer le preset</FluidButton></div>
      </form>
    </DialogContent>
  </Dialog>
}

function WelcomeModal({ open, onCreateBlank, onOpenProject, projectBusy, onClose }: { open: boolean; onCreateBlank: () => void; onOpenProject: () => void; projectBusy: boolean; onClose: () => void }) {
  return <Dialog open={open} onOpenChange={next => { if (!next && !projectBusy) onClose() }}>
    <DialogContent size="lg" showCloseButton={false} className="p-0 max-w-[600px] overflow-hidden">
      <div className="flex items-start justify-between gap-6 border-b border-border p-6">
        <div><DialogTitle>Bienvenue dans Postcraft</DialogTitle><DialogDescription className="mt-2">Un nouvel email, ou un projet à reprendre ?</DialogDescription></div>
        <FluidButton variant="ghost" size="icon-compact" aria-label="Fermer l’accueil" disabled={projectBusy} onClick={onClose}><X /></FluidButton>
      </div>
      <div className="p-6">
        <CardGroup orientation="inline" border="outlined" separated>
          <Card label="Commencer sur une page vierge" onClick={projectBusy ? undefined : onCreateBlank}>
            <CardContent className="flex w-16 shrink-0 items-center justify-center text-muted-foreground"><FilePlus2 className="h-5 w-5" /></CardContent>
            <CardHeader><CardTitle>Commencer sur une page vierge</CardTitle><CardDescription>Composez votre email à partir d’un canvas vide.</CardDescription></CardHeader>
          </Card>
          <Card label="Ouvrir un projet" onClick={projectBusy ? undefined : onOpenProject}>
            <CardContent className="flex w-16 shrink-0 items-center justify-center text-muted-foreground"><FolderOpen className="h-5 w-5" /></CardContent>
            <CardHeader><CardTitle>{projectBusy ? 'Ouverture du projet…' : 'Ouvrir un projet'}</CardTitle><CardDescription>Retrouvez les contenus et les réglages de votre fichier JSON.</CardDescription></CardHeader>
          </Card>
        </CardGroup>
      </div>
    </DialogContent>
  </Dialog>
}

function NewEmailModal({ open, presets, onCreateBlank, onCreateFromPreset, onDeletePreset, onOpenProject, projectBusy, onClose }: { open: boolean; presets: EmailPreset[]; onCreateBlank: () => void; onCreateFromPreset: (preset: EmailPreset) => void; onDeletePreset: (id: string) => void; onOpenProject: () => void; projectBusy: boolean; onClose: () => void }) {
  return <Dialog open={open} onOpenChange={next => { if (!next) onClose() }}>
    <DialogContent size="xl" showCloseButton={false} aria-describedby={undefined} className="modal p-0 max-w-[920px] preset-dialog preset-library-dialog">
      <div className="modal-head"><DialogTitle>Choisir un point de départ</DialogTitle><FluidButton variant="ghost" size="icon-compact" onClick={onClose} aria-label="Fermer"><X /></FluidButton></div>
      <ScrollArea className="preset-library-scroll"><div className="preset-library-body">
        <section>
          <div className="preset-section-heading"><h3>Commencer de zéro</h3><Badge color="gray">Email vierge</Badge></div>
          <CardGroup orientation="inline" border="outlined">
            <Card label="Créer un email vierge" onClick={onCreateBlank}>
              <CardContent className="w-32 shrink-0"><PresetMiniature doc={createBlankDocument()} blank /></CardContent>
              <CardHeader><CardTitle>Email vierge</CardTitle><CardDescription>Une page blanche pour votre prochain email.</CardDescription></CardHeader>
            </Card>
          </CardGroup>
        </section>
        <section>
          <div className="preset-section-heading"><h3>Réutiliser un modèle</h3><Badge color="gray">{presets.length} modèle{presets.length > 1 ? 's' : ''}</Badge></div>
          {presets.length === 0 ? <EditorMessage title="Aucun modèle pour l’instant">Utilisez « Projet → Enregistrer comme preset » pour conserver votre premier modèle.</EditorMessage> :
            <CardGroup columns={3} border="outlined" separated>
              {presets.map(preset => <Card key={preset.id} label={`Utiliser le modèle ${preset.name}`} onClick={() => onCreateFromPreset(preset)}>
                <CardContent><PresetMiniature doc={preset.document} /></CardContent>
                <CardHeader><CardTitle>{preset.name}</CardTitle><CardDescription>{documentStats(preset.document)}</CardDescription>
                  <CardAction><Tooltip content={`Supprimer ${preset.name}`}><FluidButton variant="ghost" size="icon-compact" aria-label={`Supprimer ${preset.name}`} onClick={() => onDeletePreset(preset.id)}><Trash2 /></FluidButton></Tooltip></CardAction>
                </CardHeader>
              </Card>)}
            </CardGroup>}
        </section>
      </div></ScrollArea>
      <div className="dialog-footer project-open-footer"><span>Vous avez déjà un mail sauvegardé ?</span><FluidButton variant="tertiary" leadingIcon={FolderOpen} disabled={projectBusy} onClick={onOpenProject}>Ouvrir un projet JSON</FluidButton></div>
    </DialogContent>
  </Dialog>
}

function ExportModal({ open, mode, doc, html, mjml, viewport, setViewport, onClose, name }: { open: boolean; mode: 'preview' | 'code'; doc: EmailDocument; html: string; mjml: string; viewport: Viewport; setViewport: (viewport: Viewport) => void; onClose: () => void; name: string }) {
  const [codeTab, setCodeTab] = useState<'html' | 'mjml'>('html')
  const [packageProgress, setPackageProgress] = useState('')
  const [packageResult, setPackageResult] = useState<PackageExportResult | null>(null)
  const [packageError, setPackageError] = useState('')
  const [isPackaging, setIsPackaging] = useState(false)
  const [visualProgress, setVisualProgress] = useState('')
  const [visualResult, setVisualResult] = useState<(VisualExportResult & { format: 'PNG' | 'PDF' }) | null>(null)
  const [visualError, setVisualError] = useState('')
  const [visualFormat, setVisualFormat] = useState<'png' | 'pdf' | null>(null)
  const code = codeTab === 'html' ? html : mjml
  const downloadPackage = async () => {
    setIsPackaging(true); setPackageError(''); setPackageResult(null)
    try { setPackageResult(await exportEmailPackage(doc, setPackageProgress)) }
    catch { setPackageError('Impossible de créer l’archive. Vérifiez les images puis réessayez.') }
    finally { setIsPackaging(false); setPackageProgress('') }
  }
  const downloadVisual = async (format: 'png' | 'pdf') => {
    setVisualFormat(format); setVisualError(''); setVisualResult(null)
    try {
      const result = format === 'png' ? await exportEmailPng(doc, setVisualProgress) : await exportEmailPdf(doc, setVisualProgress)
      setVisualResult({ ...result, format: format.toUpperCase() as 'PNG' | 'PDF' })
    } catch {
      setVisualError('Impossible de générer le rendu. Une image distante bloque peut-être l’accès CORS.')
    } finally { setVisualFormat(null); setVisualProgress('') }
  }
  const visualMessage = visualResult ? `${visualResult.fileName} créé · ${visualResult.width} × ${visualResult.height}px · rendu 2×` : visualError
  return <Dialog open={open} onOpenChange={next => { if (!next) onClose() }}>
    <DialogContent size="xl" showCloseButton={false} aria-describedby={undefined} className={`modal p-0 max-w-[1040px] ${mode}`}>
      <div className="modal-head"><div><span className="kicker">{mode === 'preview' ? 'VÉRIFICATION' : 'PRÊT À ENVOYER'}</span><DialogTitle>{mode === 'preview' ? 'Aperçu de l’email' : 'Exporter l’email'}</DialogTitle></div><div className="modal-actions">{mode === 'preview' && <FluidTabs value={viewport} onValueChange={value => setViewport(value as Viewport)} size="compact"><FluidTabsList><FluidTabItem value="desktop" label="Bureau" icon={Monitor} /><FluidTabItem value="mobile" label="Mobile" icon={Smartphone} /></FluidTabsList></FluidTabs>}<FluidButton variant="ghost" aria-label="Fermer" size="icon-compact" onClick={onClose}><X /></FluidButton></div></div>
      {mode === 'preview' ? <div className="preview-stage"><iframe title="Aperçu email" srcDoc={html} style={{ width: viewport === 'desktop' ? 760 : 390 }} /></div> : <div className="export-body">
        <FluidTabs value={codeTab} onValueChange={value => setCodeTab(value as 'html' | 'mjml')} size="compact" className="export-fluid-tabs"><FluidTabsList><FluidTabItem value="html" label="HTML compilé">HTML compilé</FluidTabItem><FluidTabItem value="mjml" label="Source MJML">Source MJML</FluidTabItem></FluidTabsList></FluidTabs>
        <EditorMessage title="Pack ZIP recommandé">Le code et les images dans une archive. Les exports PNG et PDF utilisent un rendu 2× pleine hauteur.</EditorMessage>
        <textarea className="code-area" readOnly value={code} />
        {(packageResult || packageError) && <EditorMessage status={packageError ? 'error' : packageResult?.external ? 'warning' : 'success'}>{packageError || `${packageResult?.fileName} créé · ${packageResult?.bundled} image(s) copiée(s)${packageResult?.external ? ` · ${packageResult.external} URL(s) externe(s) conservée(s)` : ''}`}</EditorMessage>}
        {(visualResult || visualError) && <EditorMessage status={visualError ? 'error' : 'success'}>{visualMessage}</EditorMessage>}
        <div className="export-footer"><span className="export-progress">{packageProgress || visualProgress}</span><FluidButton variant="tertiary" onClick={() => navigator.clipboard.writeText(code)}>Copier</FluidButton><FluidButton variant="tertiary" leadingIcon={Download} onClick={() => downloadFile(code, `${name.toLowerCase().replace(/\s+/g, '-')}.${codeTab}`, codeTab === 'html' ? 'text/html' : 'text/xml')}>.{codeTab}</FluidButton><FluidButton variant="tertiary" leadingIcon={FileImage} loading={visualFormat === 'png'} disabled={Boolean(visualFormat)} onClick={() => downloadVisual('png')}>PNG</FluidButton><FluidButton variant="tertiary" leadingIcon={FileText} loading={visualFormat === 'pdf'} disabled={Boolean(visualFormat)} onClick={() => downloadVisual('pdf')}>PDF</FluidButton><FluidButton variant="primary" leadingIcon={Download} loading={isPackaging} disabled={isPackaging} onClick={downloadPackage}>Pack .zip</FluidButton></div>
      </div>}
    </DialogContent>
  </Dialog>
}
