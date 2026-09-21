/**
 * Credential-only TypeSafe/Jev connectivity smoke test.
 *
 * No Polymarket wallet, signer, private key, trading service, or order path is
 * imported here. This only verifies that the local TYPESAFE_API_KEY can reach
 * System One and return a valid Noul probability.
 */
import { noul, TypeSafeClient } from '@typesafe-ai/sdk';

async function main(): Promise<void> {
  if (!process.env.TYPESAFE_API_KEY) {
    console.error('JEV_SMOKE_ERROR: TYPESAFE_API_KEY_NOT_LOADED');
    process.exitCode = 1;
    return;
  }

  try {
    const client = new TypeSafeClient();
    const response = await client.systemOne({
      state: {
        mode: 'PAPER_ONLY',
        purpose: 'Connectivity and response-shape validation only',
        candidate: {
          deterministicStatus: 'PAPER_EXECUTABLE',
          expectedNetProfitUsd: 0.30,
          worstCaseNetProfitUsd: 0.20,
          dataFresh: true,
          malformedBookDetected: false,
        },
      },
      questions: {
        acceptable: noul(
          'Is this synthetic paper-only candidate internally coherent enough to continue to paper review? This is only a connectivity test and is not authorization to trade.'
        ),
      },
    });

    const probability = response.answers.acceptable.noul;
    if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
      console.error('JEV_SMOKE_ERROR: INVALID_JEV_PROBABILITY');
      process.exitCode = 1;
      return;
    }

    console.log('JEV_SMOKE_OK');
    console.log('mode=PAPER_ONLY');
    console.log(`probability=${probability}`);
    console.log('No wallet, signer, Polymarket private key, or order submission was used.');
  } catch (error) {
    console.error(
      'JEV_SMOKE_ERROR:',
      error instanceof Error ? error.message : 'UNKNOWN_JEV_ERROR'
    );
    process.exitCode = 1;
  }
}

void main();
