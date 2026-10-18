import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ORCAD_VERSION,
  orcadArtifactFilenames,
  orcadOptionalArtifactFilenames
} from '../../src/shared/orcad-artifacts.ts'

/** The runtime enters through `.runtime-node`'s executableSha256 string, never its bytes (design D2). */
export function computeOrcadFullVersion(artifactDir, { target, agentBrowserFilename }) {
  const hash = createHash('sha256')
  for (const filename of orcadArtifactFilenames(target)) {
    const artifactPath = join(artifactDir, filename)
    if (!existsSync(artifactPath)) {
      throw new Error(
        `orcad declares ${filename} in ORCAD_ARTIFACTS but never emitted it. Add the build ` +
          'step, or drop it from src/shared/orcad-artifacts.ts.'
      )
    }
    hash.update(readFileSync(artifactPath))
  }
  for (const filename of orcadOptionalArtifactFilenames(target)) {
    if (existsSync(join(artifactDir, filename))) {
      hash.update(readFileSync(join(artifactDir, filename)))
    }
  }
  if (agentBrowserFilename && existsSync(join(artifactDir, agentBrowserFilename))) {
    hash.update(readFileSync(join(artifactDir, agentBrowserFilename)))
  }
  return `${ORCAD_VERSION}+${hash.digest('hex').slice(0, 12)}`
}
