/**
 * Deepgram Speech-to-Text integration.
 *
 * Transcribes audio buffers using the Deepgram Nova-2 model.
 */

export interface SpeechToTextOptions {
  language?: string
  model?: string
}

interface DeepgramResponse {
  results?: {
    channels?: Array<{
      alternatives?: Array<{
        transcript?: string
      }>
    }>
  }
}

export async function speechToText(
  audioBuffer: Buffer,
  options?: SpeechToTextOptions
): Promise<string> {
  const apiKey = process.env.DEEPGRAM_API_KEY
  if (!apiKey) {
    throw new Error('Missing DEEPGRAM_API_KEY environment variable')
  }

  const model = options?.model ?? 'nova-2'
  const language = options?.language ?? 'en'

  const params = new URLSearchParams({
    model,
    language,
  })

  const response = await fetch(
    `https://api.deepgram.com/v1/listen?${params.toString()}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': 'audio/mp3',
      },
      body: audioBuffer,
    }
  )

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(
      `Deepgram STT failed with ${response.status}: ${errorText.slice(0, 300)}`
    )
  }

  const data = (await response.json()) as DeepgramResponse
  const transcript =
    data.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? ''

  if (!transcript) {
    throw new Error('Deepgram returned empty transcript')
  }

  return transcript
}
