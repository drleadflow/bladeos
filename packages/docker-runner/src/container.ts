import Dockerode from 'dockerode'
import { logger } from '@blade/shared'

const docker = new Dockerode()

const SANDBOX_IMAGE = 'blade-sandbox:latest'
const DEFAULT_TIMEOUT = 120_000

export async function isDockerAvailable(): Promise<boolean> {
  try {
    await docker.ping()
    return true
  } catch {
    return false
  }
}

export async function createContainer(
  name: string,
  workDir: string,
  env: Record<string, string> = {}
): Promise<Dockerode.Container> {
  logger.info('Docker', `Creating container: ${name}`)

  const envArray = Object.entries(env).map(([k, v]) => `${k}=${v}`)

  const container = await docker.createContainer({
    Image: SANDBOX_IMAGE,
    name,
    Cmd: ['sleep', 'infinity'],
    WorkingDir: '/workspace',
    Env: envArray,
    HostConfig: {
      Binds: [`${workDir}:/workspace`],
      Memory: 2 * 1024 * 1024 * 1024, // 2GB
      NanoCpus: 2_000_000_000, // 2 CPUs
      NetworkMode: 'bridge',
      // Security hardening
      ReadonlyRootfs: false,
      CapDrop: ['ALL'],
      CapAdd: ['CHOWN', 'DAC_OVERRIDE', 'FOWNER', 'SETGID', 'SETUID'],
      SecurityOpt: ['no-new-privileges'],
      Tmpfs: { '/tmp': 'rw,noexec,nosuid,size=256m' },
    } as Dockerode.HostConfig,
  })

  return container as unknown as Dockerode.Container
}

export async function startContainer(container: Dockerode.Container): Promise<void> {
  await container.start()
  logger.info('Docker', `Container started: ${(await container.inspect()).Name}`)
}

export async function execInContainer(
  container: Dockerode.Container,
  command: string[],
  timeout = DEFAULT_TIMEOUT
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const exec = await container.exec({
    Cmd: command,
    AttachStdout: true,
    AttachStderr: true,
    WorkingDir: '/workspace',
  })

  const stream = await exec.start({ hijack: true, stdin: false })

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Command timed out after ${timeout}ms: ${command.join(' ')}`))
    }, timeout)

    let stdout = ''
    let stderr = ''

    // Dockerode multiplexes stdout/stderr
    docker.modem.demuxStream(stream, {
      write: (chunk: Buffer) => { stdout += chunk.toString() },
    } as NodeJS.WritableStream, {
      write: (chunk: Buffer) => { stderr += chunk.toString() },
    } as NodeJS.WritableStream)

    stream.on('end', async () => {
      clearTimeout(timer)
      const info = await exec.inspect()
      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: info.ExitCode ?? 1,
      })
    })

    stream.on('error', (err: Error) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}

export async function stopContainer(container: Dockerode.Container): Promise<void> {
  try {
    await container.stop({ t: 5 })
    logger.info('Docker', 'Container stopped')
  } catch (err) {
    // Already stopped
    logger.debug('Docker', `Stop: ${err instanceof Error ? err.message : String(err)}`)
  }
}

export async function removeContainer(container: Dockerode.Container): Promise<void> {
  try {
    await container.remove({ force: true })
    logger.info('Docker', 'Container removed')
  } catch (err) {
    logger.debug('Docker', `Remove: ${err instanceof Error ? err.message : String(err)}`)
  }
}
