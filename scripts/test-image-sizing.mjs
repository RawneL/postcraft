import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'

// Run the real canvas component without adding a browser/test framework dependency.
async function loadTypeScript(relativePath) {
  const source = await readFile(new URL(relativePath, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX,
  } })
  const resolved = outputText.replace(/from (["'])([^"']+)\1/g, (_, quote, name) => `from ${quote}${import.meta.resolve(name)}${quote}`)
  return import(`data:text/javascript;base64,${Buffer.from(resolved).toString('base64')}`)
}

const { createBlock } = await loadTypeScript('../src/data.ts')
const { BlockPreview } = await loadTypeScript('../src/components.tsx')
const render = styles => renderToStaticMarkup(createElement(BlockPreview, {
  block: { id: 'image-test', type: 'image', content: 'data:image/png;base64,example', styles },
}))

test('new images preserve their native proportions by default', () => {
  const block = createBlock('image')
  assert.equal(block.styles.height, 0)
  assert.match(renderToStaticMarkup(createElement(BlockPreview, { block })), /height:auto/)
})

test('images without a height also use automatic sizing in the canvas', () => {
  assert.match(render({ widthPercent: 68 }), /width:68%;height:auto/)
})

test('changing width leaves automatic height intact, including linked images', () => {
  for (const widthPercent of [10, 50, 68, 100]) {
    const markup = render({ widthPercent, height: 0, href: 'https://example.com', imageFit: 'cover' })
    assert.match(markup, new RegExp(`width:${widthPercent}%;height:auto`))
    assert.match(markup, /<a href="https:\/\/example.com"/)
  }
})

test('explicit fixed-height crops remain available without changing legacy documents', () => {
  assert.match(render({ widthPercent: 68, height: 300, imageFit: 'cover' }), /width:68%;height:300px;object-fit:cover/)
  assert.match(render({ widthPercent: 40, height: 160, imageFit: 'contain' }), /width:40%;height:160px;object-fit:contain/)
})

test('image alignment, padding, border radius and borders survive automatic sizing', () => {
  const markup = render({ widthPercent: 50, height: 0, imageAlign: 'right', paddingLeft: 24,
    paddingRight: 24, borderRadius: 16, elementBorderWidth: 2, elementBorderColor: '#123456' })
  assert.match(markup, /padding:0px 24px 0px 24px/)
  assert.match(markup, /border-radius:16px/)
  assert.match(markup, /border:2px solid #123456/)
  assert.match(markup, /margin:0 0 0 auto/)
})
