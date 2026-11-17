// 只允许对话正文批注：文件预览（侧边栏/右侧面板）里的正文与标题都不再接批注。
// Run with PLAYWRIGHT_MODULE pointing to an existing Playwright installation.
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } })
  page.setDefaultTimeout(8000)
  const errors = []
  page.on('pageerror', e => errors.push(String(e)))
  await page.route('http://annotation.test/', route => route.fulfill({ contentType: 'text/html', body: `
    <style>body{margin:40px} [data-textpreview-url]{margin-left:500px} [data-composer-card]{position:fixed;bottom:20px}</style>
    <div data-chat-flow-kind="assistant-step"><p id="chat">重复的原文</p></div>
    <section data-textpreview-url="dsh-resource://file/session/session/docs/a.md">
      <div data-textpreview-path title="/workspace/docs/a.md">a.md</div>
      <div data-textpreview-body><div data-document-markdown><p id="file-quote">重复的原文</p></div></div>
    </section>
    <div data-composer-card><div data-composer-input contenteditable="true">请检查</div></div>` }))
  await page.goto('http://annotation.test/')
  const boot = async () => {
    await page.evaluate(() => {
      window.__ModuleLoader__ = { load(entry) { window.api = entry.factory(() => ({})) } }
    })
    await page.addScriptTag({ path: fileURLToPath(new URL('../client.js', import.meta.url)) })
    await page.evaluate(() => {
      window.draft = '请检查'
      window.dispose = window.api.apply({ sessions: {
        list: { getSnapshot: () => ({ current: 'session' }), subscribe: () => () => {} }, scope: () => ({}),
      }, conversation: { input: { for: () => ({ state: { getSnapshot: () => ({ draft: window.draft }), subscribe: () => () => {} }, setDraft: value => { window.draft = value } }) } } })
    })
  }
  const select = async (selector) => {
    await page.waitForTimeout(100)
    await page.evaluate(selector => {
      const range = document.createRange()
      range.selectNodeContents(document.querySelector(selector))
      getSelection().removeAllRanges(); getSelection().addRange(range)
    }, selector)
  }
  await boot()

  // 文件预览正文：不再弹出批注工具条
  await select('#file-quote')
  await page.waitForTimeout(600)
  assert.equal(await page.locator('.dsh-ann-bar').count(), 0, '文件预览正文不再接收批注')
  assert.equal(await page.evaluate(() => localStorage.getItem('dsh.annotation.pending.v1.session')), null,
    '文件预览选区不产生待发送批注')

  // 文件标题：同样不是可批注正文
  await select('[data-textpreview-path]')
  await page.waitForTimeout(600)
  assert.equal(await page.locator('.dsh-ann-bar').count(), 0, '文件标题不是可批注正文')

  // 对话正文仍然正常
  await select('#chat')
  await page.waitForTimeout(600)
  assert.equal(await page.locator('.dsh-ann-bar').count(), 1, '对话正文仍可批注')

  await page.evaluate(() => window.dispose())
  assert.deepEqual(errors, [])
  console.log('PASS: 文件预览正文/标题不再接收批注，对话正文仍正常')
} finally { await browser.close() }
