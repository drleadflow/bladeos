/**
 * Channel Adapter contract.
 *
 * Adapters CALL the engine — the engine has no knowledge of adapters.
 * This interface enforces a consistent shape across adapters.
 */

import type { ConversationRequest, ConversationEvent, ChannelType } from '@blade/core'

export interface ChannelAdapter<TIncoming = unknown, TOutgoing = unknown> {
  readonly channel: ChannelType
  parseIncoming(raw: TIncoming): ConversationRequest | null
  deliver(events: AsyncGenerator<ConversationEvent>, context: DeliveryContext): Promise<TOutgoing>
  formatResponse(text: string): string
}

export interface DeliveryContext {
  destination: unknown
  conversationId: string
}
