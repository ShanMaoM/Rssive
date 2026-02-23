import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const source = path.join(projectRoot, 'preload', 'index.cjs')
const targetDir = path.join(projectRoot, 'dist', 'preload')
const target = path.join(targetDir, 'index.cjs')
const rendererSourceDir = path.resolve(projectRoot, '..', 'dist')
const rendererIndexFile = path.join(rendererSourceDir, 'index.html')
const rendererTargetDir = path.join(projectRoot, 'dist', 'renderer')

await fs.mkdir(targetDir, { recursive: true })
await fs.copyFile(source, target)
console.log('[desktop] copied preload CJS bridge to dist/preload/index.cjs')

try {
  await fs.access(rendererIndexFile)
  await fs.mkdir(rendererTargetDir, { recursive: true })
  await fs.cp(rendererSourceDir, rendererTargetDir, {
    recursive: true,
    force: true,
    errorOnExist: false,
  })
  console.log('[desktop] copied web dist to dist/renderer')
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error)
  console.warn(`[desktop] skipped renderer copy: ${reason}`)
}
