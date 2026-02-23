import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT_DIR = path.resolve(__dirname, '..')

const SKIP_DIR_NAMES = new Set([
  '.git',
  'node_modules',
])

const ALLOWED_ENV_FILES = new Set([
  '.env.example',
  '.env.sample',
  '.env.template',
])

const SUSPICIOUS_PATH_RULES = [
  {
    reason: 'Local database snapshot',
    test: (normalizedPath) => /\.(db|sqlite|sqlite3|sqlitedb|db-wal|db-shm)$/i.test(normalizedPath),
  },
  {
    reason: 'Browser storage snapshot',
    test: (normalizedPath) => /\.(localstorage|localstorage-journal)$/i.test(normalizedPath),
  },
  {
    reason: 'Developer log export snapshot',
    test: (normalizedPath) => /rssive-developer-logs/i.test(normalizedPath),
  },
  {
    reason: 'Credential env file',
    test: (normalizedPath) => {
      const baseName = path.posix.basename(normalizedPath)
      if (!/(^\.env($|\.))/i.test(baseName)) return false
      return !ALLOWED_ENV_FILES.has(baseName.toLowerCase())
    },
  },
]

const readDirEntries = async (absoluteDir) => {
  return fs.readdir(absoluteDir, { withFileTypes: true })
}

const collectRepoFiles = async (rootDir) => {
  const collected = []
  const queue = ['.']

  while (queue.length) {
    const relativeDir = queue.shift()
    const absoluteDir = path.resolve(rootDir, relativeDir)
    const entries = await readDirEntries(absoluteDir)
    for (const entry of entries) {
      const entryRelativePath = path.join(relativeDir, entry.name)
      const normalizedRelativePath = entryRelativePath.replace(/\\/g, '/').replace(/^\.\//, '')
      if (entry.isDirectory()) {
        if (SKIP_DIR_NAMES.has(entry.name)) continue
        queue.push(entryRelativePath)
        continue
      }
      if (!entry.isFile()) continue
      collected.push(normalizedRelativePath)
    }
  }

  return collected
}

const parseDesktopPackagedFiles = (yamlText) => {
  const entries = []
  const lines = yamlText.split(/\r?\n/)
  let inFilesBlock = false

  for (const rawLine of lines) {
    const line = rawLine.replace(/\t/g, '  ')
    const trimmed = line.trim()
    if (!inFilesBlock) {
      if (trimmed === 'files:') {
        inFilesBlock = true
      }
      continue
    }

    if (!line.startsWith(' ') && !line.startsWith('-')) {
      break
    }
    if (!trimmed || trimmed.startsWith('#')) continue
    const match = trimmed.match(/^-\s+(.+)$/)
    if (!match) continue
    entries.push(match[1].trim().replace(/^['"]|['"]$/g, ''))
  }

  return entries
}

const checkSuspiciousFiles = (files) => {
  const violations = []
  for (const filePath of files) {
    for (const rule of SUSPICIOUS_PATH_RULES) {
      if (!rule.test(filePath)) continue
      violations.push(`${filePath} (${rule.reason})`)
      break
    }
  }
  return violations
}

const checkDesktopPackConfig = async () => {
  const builderConfigPath = path.join(ROOT_DIR, 'desktop', 'electron-builder.yml')
  const builderConfigText = await fs.readFile(builderConfigPath, 'utf8')
  const packagedFiles = parseDesktopPackagedFiles(builderConfigText)
  const allowedEntries = new Set(['dist/**', 'assets/**'])

  if (!packagedFiles.length) {
    return ['desktop/electron-builder.yml (Missing files block)']
  }

  const violations = []
  for (const entry of packagedFiles) {
    if (allowedEntries.has(entry)) continue
    violations.push(`desktop/electron-builder.yml (Disallowed packaged path: ${entry})`)
  }
  return violations
}

const run = async () => {
  const files = await collectRepoFiles(ROOT_DIR)
  const suspiciousFiles = checkSuspiciousFiles(files)
  const desktopPackViolations = await checkDesktopPackConfig()
  const violations = [...suspiciousFiles, ...desktopPackViolations]

  if (violations.length) {
    console.error('Release baseline check failed.')
    violations.forEach((violation) => {
      console.error(`- ${violation}`)
    })
    process.exit(1)
  }

  console.log('Release baseline check passed.')
}

run().catch((error) => {
  console.error('Release baseline check failed with an unexpected error.')
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
