import { createHash } from 'node:crypto'
import { createReadStream, existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import {
  ORCAD_SERVER_TARGET_FILENAME,
  ORCAD_VERSION,
  orcadArtifactFilenames,
  orcadOptionalArtifactFilenames
} from '../../shared/orcad-artifacts'
import { COMPAT_SERVER_TARGETS, SERVER_TARGETS } from '../../shared/node-runtime-pin'
import { orcadAgentBrowserNativeName } from '../../shared/orcad-agent-browser-name'

/** Hash installed bytes in the build's order; a version marker is not proof of delivery. */
export async function readOrcadArtifactIdentity(directory: string): Promise<string> {
  const target = z
    .enum([...SERVER_TARGETS, ...COMPAT_SERVER_TARGETS])
    .parse((await readFile(join(directory, ORCAD_SERVER_TARGET_FILENAME), 'utf8')).trim())
  const platform = target.startsWith('win32-')
    ? 'win32'
    : target.startsWith('darwin-')
      ? 'darwin'
      : 'linux'
  const browser = orcadAgentBrowserNativeName(
    platform,
    target.split('-')[1] ?? '',
    target.endsWith('-musl') ? 'musl' : 'glibc'
  )
  const filenames = orcadArtifactFilenames(target)
  for (const optional of [...orcadOptionalArtifactFilenames(target), browser]) {
    if (existsSync(join(directory, optional))) {
      filenames.push(optional)
    }
  }
  const hash = createHash('sha256')
  for (const filename of filenames) {
    for await (const chunk of createReadStream(join(directory, filename))) {
      hash.update(chunk)
    }
  }
  return `${ORCAD_VERSION}+${hash.digest('hex').slice(0, 12)}`
}
