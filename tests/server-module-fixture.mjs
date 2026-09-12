import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

export function buildServerModules(entries) {
  const tempRoot = join(repoRoot, 'node_modules', '.tmp')
  mkdirSync(tempRoot, { recursive: true })
  const output = mkdtempSync(join(tempRoot, 'arklake-server-modules-'))
  execFileSync(process.execPath, [
    join(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc'), ...entries, '--outDir', output, '--rootDir', '.', '--target', 'ES2022',
    '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--skipLibCheck',
  ], { cwd: repoRoot, stdio: 'pipe' })
  return {
    import: (compiledPath) => import(pathToFileURL(join(output, compiledPath)).href),
  }
}
