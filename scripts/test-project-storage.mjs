import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import ts from 'typescript'

// Keep the regression suite dependency-free; load the same TypeScript used by the app.
async function loadTypeScript(relativePath) {
  const source = await readFile(new URL(relativePath, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext } })
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
}
const { serializeProject, parseProject } = await loadTypeScript('../src/projectStorage.ts')
const { createBlankDocument, createBlock, createColumn, createSection, createWrapper, starterDocument } = await loadTypeScript('../src/data.ts')
const envelope = document => JSON.stringify({ format: 'postcraft-project', version: 1, savedAt: '2026-10-01T00:00:00.000Z', document })
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1sAAAAASUVORK5CYII='

test('exact round trip: all block types, nesting, free HTML, theme and independent column widths', async () => {
  const doc = createBlankDocument()
  doc.name = 'Été à La Réunion 🌴'
  doc.subject = 'Sujet avec accents'
  doc.preview = 'Un aperçu'
  const blocks = ['heading', 'text', 'button', 'image', 'divider', 'spacer'].map(createBlock)
  blocks[1].content = '<p>Du <strong>gras</strong><br><u>et du HTML</u> &amp; des accents é.</p>'
  blocks[1].styles.cssDeclarations = 'border-radius: 13px; color: #123456;'
  blocks[1].styles.customSetting = 'future-compatible'
  const section = createSection([createColumn(blocks, 75), createColumn([], 60)])
  section.styles.textAlign = 'center'
  doc.body = [createWrapper([section]), createSection()]
  const original = structuredClone(doc)
  const result = await serializeProject(doc)
  assert.deepEqual(parseProject(result.content), original)
  assert.deepEqual(doc, original, 'saving must not mutate the active document')
  assert.equal(result.fileName, 'ete-a-la-reunion.postcraft.json')
  assert.equal(JSON.parse(result.content).version, 1)
  assert.equal(result.embeddedImages, 0)
})

test('blank and starter documents can both be reopened', async () => {
  for (const doc of [createBlankDocument(), starterDocument]) assert.deepEqual(parseProject((await serializeProject(doc)).content), doc)
})

test('new emails and blocks use a neutral theme without recoloring existing projects', async () => {
  const doc = createBlankDocument()
  assert.deepEqual(doc.theme, {
    backgroundColor: '#f5f5f5', contentColor: '#ffffff', contentWidth: 620,
    fontFamily: 'Helvetica, Arial, sans-serif', textColor: '#171717', linkColor: '#171717',
  })
  assert.deepEqual(doc.body, [])
  assert.equal(createWrapper().styles.backgroundColor, '#ffffff')
  assert.equal(createBlock('button').styles.backgroundColor, '#171717')
  assert.equal(createBlock('divider').styles.color, '#e5e5e5')
  doc.theme.textColor = '#123456'
  assert.equal(createBlankDocument().theme.textColor, '#171717', 'new documents have independent themes')
  const reopened = parseProject((await serializeProject(starterDocument)).content)
  assert.equal(reopened.theme.fontFamily, 'Georgia, Times New Roman, serif')
  assert.equal(reopened.theme.linkColor, '#d85f37')
})

test('local images survive closing the original session and remain usable by fetch / ZIP export', async () => {
  const source = URL.createObjectURL(new Blob([Buffer.from(png, 'base64')], { type: 'image/png' }))
  const doc = createBlankDocument()
  const image = createBlock('image')
  image.content = source
  image.styles.sourceType = 'local'
  image.styles.sourceName = 'Mon image.png'
  const copy = { ...structuredClone(image), id: 'image-copy' }
  const text = createBlock('text')
  text.content = `<img src="${source}"><img src='${source}'>`
  text.styles.cssDeclarations = `background-image: url(${source});`
  const wrapper = createWrapper([createSection([createColumn([image, copy, text])])])
  wrapper.styles.backgroundUrl = source
  doc.body = [wrapper]
  const result = await serializeProject(doc)
  URL.revokeObjectURL(source)
  const imported = parseProject(result.content)
  assert.equal(result.embeddedImages, 1)
  assert.equal(result.content.includes(source), false)
  assert.equal(doc.body[0].sections[0].columns[0].blocks[0].content, source)
  const importedBlocks = imported.body[0].sections[0].columns[0].blocks
  const embedded = `data:image/png;base64,${png}`
  assert.equal(importedBlocks[0].content, embedded)
  assert.equal(importedBlocks[1].content, embedded)
  assert.equal(importedBlocks[0].styles.sourceName, 'Mon image.png')
  assert.equal(imported.body[0].styles.backgroundUrl, embedded)
  assert.equal(importedBlocks[2].content, `<img src="${embedded}"><img src='${embedded}'>`)
  assert.equal(importedBlocks[2].styles.cssDeclarations, `background-image: url(${embedded});`)
  assert.deepEqual(Buffer.from(await (await fetch(embedded)).arrayBuffer()), Buffer.from(png, 'base64'))
  assert.deepEqual(parseProject((await serializeProject(imported)).content), imported)
})

test('expired local URLs fail saving explicitly without altering the document', async () => {
  const doc = createBlankDocument()
  const image = createBlock('image')
  image.content = 'blob:null/expired-local-image'
  doc.body = [createSection([createColumn([image])])]
  const original = structuredClone(doc)
  await assert.rejects(serializeProject(doc), /image locale n’est plus accessible/)
  assert.deepEqual(doc, original)
})

test('bad files, unsupported versions, broken hierarchy and duplicate IDs are rejected', () => {
  assert.throws(() => parseProject('{oops'), /JSON valide/)
  assert.throws(() => parseProject('{}'), /pas un projet Postcraft/)
  assert.throws(() => parseProject(JSON.stringify({ format: 'postcraft-project', version: 2 })), /version/)
  const doc = structuredClone(starterDocument)
  doc.body[0].sections[0].columns[0].blocks[0].type = 'unknown'
  assert.throws(() => parseProject(envelope(doc)), /Type de bloc/)
  doc.body[0].sections[0].columns[0].blocks[0].type = 'text'
  doc.body[0].sections[0].columns[0].id = doc.body[0].id
  assert.throws(() => parseProject(envelope(doc)), /en double/)
  doc.body[0].sections = 'broken'
  assert.throws(() => parseProject(envelope(doc)), /liste attendue/)
})

test('invalid styles, dimensions and unembedded temporary URLs are rejected', () => {
  const doc = structuredClone(starterDocument)
  doc.theme.contentWidth = '600'
  assert.throws(() => parseProject(envelope(doc)), /nombre invalide/)
  doc.theme.contentWidth = 600
  doc.body[0].styles = { backgroundColor: { invalid: true } }
  assert.throws(() => parseProject(envelope(doc)), /Réglage/)
  doc.body[0].styles = {}
  doc.body[0].sections[0].columns[0].blocks[1].content = 'blob:https://example.com/temporary'
  assert.throws(() => parseProject(envelope(doc)), /non embarquée/)
})

test('UTF-8 BOM is accepted without changing user content', () => {
  assert.deepEqual(parseProject(`\uFEFF${envelope(starterDocument)}`), starterDocument)
})
