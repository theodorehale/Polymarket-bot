/**
 * Credential-free paper arbitrage scanner.
 *
 * Pure orchestration only: accepts already-fetched public books and delegates
 * every decision to calculateExecutableQuote. No wallet, SDK, network client,
 * signer, private key, or order-submission dependency is accepted here.
 */
import {
  calculateExecutableQuote,
  type ExecutableArbQuote,
  type ExecutableQuoteInput,
} from '../utils/executable-edge.js';

export type PaperArbitrageInput = Readonly<ExecutableQuoteInput>;

export interface PaperArbitrageResult {
  mode: 'PAPER_ONLY';
  paperExecutable: boolean;
  quote: ExecutableArbQuote;
  observedAt: number;
}

export function scanPaperArbitrage(input: PaperArbitrageInput): PaperArbitrageResult {
  const quote = calculateExecutableQuote(input);
  return {
    mode: 'PAPER_ONLY',
    paperExecutable: quote.safeToExecute,
    quote,
    observedAt: input.nowMs,
  };
}
