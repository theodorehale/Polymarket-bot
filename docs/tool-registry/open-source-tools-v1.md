# Hale One — Open Source Tool Registry v1

Research inventory only. Listing does not mean installed, approved, or safe for production. Keep third-party code out of the arbitrage core until reviewed.

| Tool | Official repository | Proposed use | Priority | Caveat |
|---|---|---|---|---|
| n8n | https://github.com/n8n-io/n8n | Lead intake, CRM and controlled workflow orchestration | P0 | Fair-code licensing, hosting/security and email compliance review |
| Ollama | https://github.com/ollama/ollama | Local inference experiments and private document classification | P0 | Hardware, power and model licenses; local is not costless |
| Whisper | https://github.com/openai/whisper | Authorized audio transcription and searchable research evidence | P0 | CPU/GPU expense; accuracy and privacy checks |
| yt-dlp | https://github.com/yt-dlp/yt-dlp | Authorized research media retrieval | P1 | Copyright, platform rules and download permissions |
| Plausible | https://github.com/plausible/analytics | Website analytics for commercial landing pages | P2 | Hosting and license review |
| AppFlowy | https://github.com/AppFlowy-IO/AppFlowy | Internal project knowledge base | P2 | Hosting and AGPL obligations |
| Penpot | https://github.com/penpot/penpot | Product design prototypes | P2 | Deployment and license review |
| Cal.com | https://github.com/calcom/cal.com | Customer booking | P1 | Deployment and licensing review |
| Bitwarden | https://github.com/bitwarden/server | Human-controlled secret management | P1 | Never commit secrets; hosting/security controls |
| Fooocus | https://github.com/lllyasviel/Fooocus | Optional creative asset experiments | P3 | GPU cost, model licenses and maintenance status |

## First experiment
Build an isolated proof-of-concept workflow: authorized input → transcription or parsing → evidence record → human review → draft outreach → CRM entry. Do not send messages or handle funds automatically. Measure latency, quality, costs and failures. Do not claim tests passed without running them.

## Promotion gate
Verify source/version, license, threat model, secrets handling, reproducible setup, test results, and actual user value before integrating any tool into production. Maintain research/revenue separation and preserve Hale One constitution.
