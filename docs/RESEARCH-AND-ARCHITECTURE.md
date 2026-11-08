# ImageBridge — research, feasibility and architecture decisions

Research reviewed on 2026-11-08. This document separates documented platform behavior from assumptions that must be verified against each client version.

## Executive decision

Build ImageBridge as a **local-first Windows companion + optional self-hosted image service + portable Agent Skill**.

Do not build a browser extension as the core product, do not patch ChatGPT binaries, and do not advertise unlimited uploads or upload-limit bypasses. The strongest useful product is a small desktop utility that can:
1. prepare and temporarily host an image;
2. copy a normal image to the OS clipboard for native chat attachment;
3. expose a token-protected URL to integrations that explicitly support image URLs;
4. provide an opt-in Skill/CLI workflow to agents.

The EXE is the end-user experience. The Skill is the automation interface. The service is the transport layer. None of these alone can force a third-party chat composer to treat a URL as an uploaded image.

## Primary research

### OpenAI and Codex skills

- ChatGPT Learn, Build skills: https://learn.chatgpt.com/docs/build-skills
  - Skills are folders with required `SKILL.md`, optional scripts/references/assets and optional `agents/openai.yaml`.
  - Codex discovers project skills under `.agents/skills`.
  - Explicit invocation is supported; implicit invocation depends on the description.
  - Restart Codex if a skill change is not discovered.
- OpenAI Developers, Skills: https://developers.openai.com/plugins/concepts/skills
  - Skills package repeatable instructions; tools/MCP provide live capabilities and controlled actions.
- OpenAI's skill creator reference: https://github.com/openai/skills/tree/main/skills/.system/skill-creator
  - Recommends concise scope, clear trigger conditions, scripts/references for repeatable work.
- OpenAI API, Images and vision: https://developers.openai.com/api/docs/guides/images-vision
  - Vision-capable API requests can receive image bytes as Base64/data URL, a file ID, or a fully qualified image URL.
  - The API request must put the URL in an image input field such as Responses `input_image.image_url`; ordinary prompt text containing a URL is not equivalent.
  - Image inputs count toward model usage/billing and model limits still apply.
- OpenAI Responses API reference: https://developers.openai.com/api/reference/resources/responses/methods/create
  - `input_image` exposes `image_url`, `file_id`, and `detail`.

### Windows desktop integration

- Microsoft UI Automation overview: https://learn.microsoft.com/en-us/windows/win32/winauto/uiauto-uiautomationoverview
  - UI Automation exposes desktop controls and supports programmatic interaction for accessibility and testing.
  - This is a legitimate route for best-effort UI integration, but third-party app UI changes can break selectors and automation. Use visible, reversible actions and avoid hidden/private APIs.
- Microsoft clipboard formats: https://learn.microsoft.com/en-us/windows/win32/dataxchg/clipboard-formats
  - Windows supports image clipboard representations including CF_DIB and CF_DIBV5; a real clipboard image is materially different from copying a URL string.
- Windows clipboard overview: https://learn.microsoft.com/en-us/windows/win32/dataxchg/clipboard
  - Clipboard is the interoperable handoff mechanism for applications. ImageBridge Desktop currently uses WinForms `Clipboard.SetImage` for the actual image data.

### Security and operations

- OWASP File Upload Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
  - Do not trust client MIME alone; validate file signatures, use generated storage names, cap sizes, store outside webroot, require authorization, and consider scanning/re-encoding.
  - Public file retrieval creates abuse, disclosure and availability risks.
- Node.js Security Best Practices: https://nodejs.org/en/learn/getting-started/security-best-practices
  - Configure HTTP timeouts and concurrency controls; protect against DoS; keep dependencies and runtime maintained.
- GitHub Actions artifacts: https://docs.github.com/en/actions/using-workflows/storing-workflow-data-as-artifacts
  - Artifacts are build outputs attached to workflow runs; they are suitable for testing, while versioned releases are a better long-term distribution channel.

### Prior art and product comparisons

- Clippy: https://github.com/Alfroud/Clippy
  - Native Windows utility using tray/global hotkeys and UI Automation to stage a screenshot as an image in a ChatGPT browser draft. Strong evidence that a small desktop bridge is useful; it does not make a hosted URL become a native attachment.
- chatgpt-clipboard-upload: https://github.com/dev-newb/chatgpt-clipboard-upload
  - Demonstrates clipboard-based attachment staging and checking the resulting attachment card in a Codex in-app browser workflow.
- ShareX: https://getsharex.com/
  - Mature reference for capture/upload/copy-link workflows. ImageBridge should focus on AI handoff and native clipboard rather than competing as a general-purpose screenshot tool.

## Compatibility matrix

| Destination | Correct mechanism | What ImageBridge can honestly promise |
|---|---|---|
| ChatGPT Web / Windows app | Copy real image to Windows clipboard, then Ctrl+V; or use the native + picker | Clipboard image handoff. No promise of replacing + or bypassing limits. |
| Codex CLI / IDE | Agent Skill plus local file path and/or explicit supported image input; CLI upload via script for URL workflows | Skill can upload on request and return a verified temporary URL. Client-specific image input must be checked. |
| Codex desktop | Skill discovery plus supported local attachment/clipboard workflow | No undocumented composer injection guarantee. |
| OpenAI Responses API | Send hosted URL in `input_image.image_url` | Supported when model, URL reachability, MIME and API account requirements are satisfied. API billing is separate from ChatGPT subscription. |
| Other vision APIs | Their own documented image URL/base64/file input format | Per-provider adapters only after official docs confirm it. |
| Browser extensions | Content scripts/clipboard/drag-drop | Optional future distribution channel, not the foundation. |

## Current architecture

- Node.js 20+ built-in HTTP server; no runtime npm dependencies.
- Local-only bind by default (`127.0.0.1`).
- Optional bearer authentication; non-loopback bind requires `IMAGEBRIDGE_API_TOKEN` with at least 32 characters.
- Raw image uploads, generated server-side filenames, signature checks, maximum upload size, TTL cleanup, token-protected reads/deletes.
- Persistent storage directory configurable with `IMAGEBRIDGE_DATA_DIR`.
- Windows .NET 8 WinForms companion with Mica-inspired glass UI, drag/drop, clipboard image, upload, URL copy, tray and global shortcut.
- Agent Skill with a bundled Node CLI script. Skill only uploads after explicit user intent.

## Security model and known boundaries

- Treat the URL query token and API bearer token as credentials.
- Use HTTPS for remote hosting. Keep the server local for personal use.
- Use persistent disk. Ephemeral container filesystems will lose images on restart/redeploy.
- Current in-process rate limiting is a basic abuse brake, not a substitute for a reverse proxy/WAF, per-account quotas, durable rate limits, malware scanning, monitoring, or a content reporting process.
- Signature checks confirm common file headers but do not prove the entire file is safe or decodable. For public multi-user service, add sandboxed decode/re-encode, resource limits and malware/content review.
- Current metadata is a JSON file; this is suitable for a single-process MVP, not concurrent multi-instance production. Use SQLite/Postgres plus object storage for a multi-user hosted service.
- No private ChatGPT endpoints, binary patching, cookie scraping, or hidden API interception should be used.

## Product positioning

Recommended one-line description:

> ImageBridge moves images between your desktop, AI agents and vision APIs—with temporary links and native clipboard handoff.

Avoid:
- “Unlimited uploads to ChatGPT”
- “Bypasses Plus / upload limits”
- “Every AI automatically sees the URL”
- “Replaces ChatGPT's + button”

## References to verify when integrations are added

Before implementing a provider adapter, confirm from its official documentation:
1. Does the API accept a remote image URL, base64, file ID, or only uploaded multipart data?
2. Which MIME types, image sizes, image counts and URL authentication methods are supported?
3. Can the provider fetch a tokenized URL from the public internet?
4. Are there API billing, rate, model, and data-retention constraints?
5. Does the specific desktop/web client support image attachments through clipboard or accessibility UI automation?

A URL that requires an Authorization header cannot normally be fetched by an API that only receives a URL string. ImageBridge's tokenized query URL is intentionally self-contained for this reason; protect it as a bearer secret.
