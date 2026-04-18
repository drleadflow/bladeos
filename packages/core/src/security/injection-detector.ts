import { logger } from '@blade/shared'

export interface InjectionCheckResult {
  isInjection: boolean
  score: number
  matchedPatterns: string[]
  severity: 'none' | 'low' | 'medium' | 'high' | 'critical'
}

const INJECTION_PATTERNS: Array<{ pattern: RegExp; weight: number; name: string }> = [
  // Direct instruction override
  { pattern: /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?|context)/i, weight: 0.9, name: 'instruction_override' },
  { pattern: /disregard\s+(all\s+)?(previous|prior|above|earlier)/i, weight: 0.9, name: 'disregard_previous' },
  { pattern: /forget\s+(everything|all|what)\s+(you|I)\s+(told|said|know)/i, weight: 0.8, name: 'forget_context' },

  // Role manipulation
  { pattern: /you\s+are\s+now\s+(a\s+)?different/i, weight: 0.85, name: 'role_change' },
  { pattern: /pretend\s+(you('re|\s+are)\s+)?(a\s+)?(?!to\s+be\s+a\s+(developer|coder|assistant))/i, weight: 0.7, name: 'pretend' },
  { pattern: /act\s+as\s+(if\s+you\s+are\s+|a\s+)?(?!a\s+(developer|coder|assistant))/i, weight: 0.6, name: 'act_as' },
  { pattern: /you\s+are\s+(DAN|evil|unfiltered|uncensored|jailbroken)/i, weight: 0.95, name: 'identity_override' },

  // System prompt extraction
  { pattern: /what\s+(is|are)\s+your\s+(system|initial)\s+(prompt|instructions?|rules?)/i, weight: 0.7, name: 'system_prompt_extract' },
  { pattern: /repeat\s+(your\s+)?(system|initial|original)\s+(prompt|instructions?|message)/i, weight: 0.8, name: 'repeat_system' },
  { pattern: /show\s+me\s+(your\s+)?(system|hidden|secret)\s+(prompt|instructions?)/i, weight: 0.75, name: 'show_system' },

  // Format injection
  { pattern: /\[INST\]|\[\/INST\]/i, weight: 0.9, name: 'llama_format' },
  { pattern: /<<SYS>>|<\/SYS>>/i, weight: 0.9, name: 'llama2_system' },
  { pattern: /<\|im_start\|>|<\|im_end\|>/i, weight: 0.9, name: 'chatml_format' },
  { pattern: /```system\b/i, weight: 0.8, name: 'code_block_system' },

  // Jailbreak keywords
  { pattern: /\bDAN\s+mode\b/i, weight: 0.95, name: 'dan_mode' },
  { pattern: /\bjailbreak\b/i, weight: 0.8, name: 'jailbreak' },
  { pattern: /\bdo\s+anything\s+now\b/i, weight: 0.9, name: 'do_anything' },
  { pattern: /developer\s+mode\s+(enabled|on|activated)/i, weight: 0.85, name: 'dev_mode' },

  // Social engineering
  { pattern: /this\s+is\s+(an?\s+)?(emergency|urgent|test)\s+(and\s+)?(you\s+)?(must|need|have\s+to)/i, weight: 0.6, name: 'urgency_pressure' },
  { pattern: /you\s+will\s+be\s+(shut\s+down|deleted|terminated|punished)/i, weight: 0.7, name: 'threat' },
  { pattern: /if\s+you\s+don'?t\s+(comply|do\s+this|help)/i, weight: 0.5, name: 'coercion' },

  // Data exfiltration attempts via prompt
  { pattern: /send\s+(all|my|the)\s+(data|info|credentials|keys?|secrets?|tokens?)\s+to/i, weight: 0.9, name: 'data_exfil_request' },
  { pattern: /curl\s+.*\|\s*sh/i, weight: 0.85, name: 'remote_execution' },
  { pattern: /base64\s+(encode|decode)\s+.*key/i, weight: 0.7, name: 'encoded_key_extract' },

  // Multi-turn manipulation
  { pattern: /in\s+your\s+(next|following)\s+(response|message|reply),?\s+(only|just)\s+(say|output|return)/i, weight: 0.6, name: 'controlled_output' },
  { pattern: /respond\s+with\s+only\s+(yes|no|true|false|1|0)\b/i, weight: 0.4, name: 'binary_response' },

  // Encoding evasion
  { pattern: /eval\s*\(|exec\s*\(|Function\s*\(/i, weight: 0.7, name: 'code_execution' },
  { pattern: /\bprocess\.env\b/i, weight: 0.5, name: 'env_access' },

  // Hidden instructions in content
  { pattern: /<!--.*(?:ignore|system|instruction).*-->/is, weight: 0.8, name: 'hidden_html_instruction' },
  { pattern: /\u200b.*instruction/i, weight: 0.9, name: 'zero_width_instruction' },
]

const SCORE_THRESHOLD = 0.7

export function detectInjection(text: string): InjectionCheckResult {
  const matchedPatterns: string[] = []
  let maxWeight = 0

  for (const { pattern, weight, name } of INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      matchedPatterns.push(name)
      maxWeight = Math.max(maxWeight, weight)
    }
  }

  const score = matchedPatterns.length === 0
    ? 0
    : Math.min(1.0, maxWeight + (matchedPatterns.length - 1) * 0.05)

  const severity: InjectionCheckResult['severity'] = score === 0 ? 'none'
    : score < 0.4 ? 'low'
    : score < 0.6 ? 'medium'
    : score < 0.8 ? 'high'
    : 'critical'

  const isInjection = score >= SCORE_THRESHOLD

  if (isInjection) {
    logger.warn('InjectionDetector', `Injection detected (score=${score.toFixed(2)}, severity=${severity}): ${matchedPatterns.join(', ')}`)
  }

  return { isInjection, score, matchedPatterns, severity }
}

export function getInjectionPatternCount(): number {
  return INJECTION_PATTERNS.length
}
