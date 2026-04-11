import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

let _client: S3Client | null = null

function getR2Client(): S3Client {
  if (_client) return _client

  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('R2 not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.')
  }

  _client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  })

  return _client
}

const BUCKET = () => process.env.R2_BUCKET_NAME ?? 'bladesuperagent'

const MAX_FILE_SIZE = 1024 * 1024 * 1024 // 1GB
const PRESIGN_EXPIRY = 3600 // 1 hour

const ALLOWED_TYPES = new Set([
  // Video
  'video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo',
  // Image
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml',
  // Document
  'application/pdf', 'text/plain', 'text/csv',
  // Audio
  'audio/mpeg', 'audio/wav', 'audio/webm', 'audio/ogg',
])

export interface PresignedUpload {
  uploadUrl: string
  key: string
  expiresIn: number
  publicUrl: string
}

export async function createPresignedUpload(
  fileName: string,
  fileType: string,
  fileSize: number,
  userId?: string
): Promise<PresignedUpload> {
  if (fileSize > MAX_FILE_SIZE) {
    throw new Error(`File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB.`)
  }

  if (!ALLOWED_TYPES.has(fileType)) {
    throw new Error(`File type "${fileType}" is not allowed.`)
  }

  // Generate unique key: uploads/{userId}/{timestamp}-{sanitized-name}
  const sanitized = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
  const timestamp = Date.now()
  const prefix = userId ? `uploads/${userId}` : 'uploads/anonymous'
  const key = `${prefix}/${timestamp}-${sanitized}`

  const client = getR2Client()
  const command = new PutObjectCommand({
    Bucket: BUCKET(),
    Key: key,
    ContentType: fileType,
    ContentLength: fileSize,
  })

  const uploadUrl = await getSignedUrl(client, command, {
    expiresIn: PRESIGN_EXPIRY,
  })

  const publicUrl = `${process.env.R2_ENDPOINT}/${BUCKET()}/${key}`

  return {
    uploadUrl,
    key,
    expiresIn: PRESIGN_EXPIRY,
    publicUrl,
  }
}

export async function deleteFile(key: string): Promise<void> {
  const client = getR2Client()
  await client.send(new DeleteObjectCommand({
    Bucket: BUCKET(),
    Key: key,
  }))
}
