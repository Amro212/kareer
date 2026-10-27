# Security

Kareer keeps profiles, files and application execution local. Managed AI adds one
Cloudflare Worker/D1 for Lemon Squeezy payments, reusable licenses, credits and
OpenRouter routing. Advanced BYOK and the userscript call OpenRouter directly.

## Credential boundaries

License keys, checkout claim secrets and BYOK keys are privileged background
storage, excluded from content snapshots, backups, logs, page DOM and page storage.
Only extension pages can write credentials and initiate billing. Core uses the
platform contract; it never accesses Chrome or GM APIs directly. Credential
updates preserve the other connection; switching modes is explicit.

A reusable license is a bearer credential: anyone holding it may spend its shared
wallet. No device lock or Kareer account is used. The gateway hashes keys and claim
secrets. Worker provider credentials are secrets, distinct for staging/production.
Browser origins and extension IDs are supplementary checks, never payment proof.

## Gateway trust boundaries

Webhook HMAC verification uses the raw body. Store, environment, approved offer,
payment state and checkout binding are checked. Current provider state is retrieved
before reconciling entitlements; orders/invoices deduplicate immutable grants.
Activation and status recover missing payment events. Subscription key expiry
does not invalidate purchased credits; disabled keys and reversals revoke affected
entitlements. Hosted checkout/receipts/portal belong to Lemon Squeezy; no card data
or account passwords are stored by Kareer.

Managed requests use a server allowlist: fixed
`google/gemini-2.5-flash-lite`, same-model routing at no more than $0.10/million
input and $0.40/million output tokens, no alternate model, reasoning, tools, search,
images or file plugins. Client URLs, model/provider settings and authorization are
never forwarded. Body cap: 256 KiB; prompt cap: 128 KiB UTF-8. Output caps:
4,096 for autofill/repair/discovery, 2,048 for field rewrites, 7,000 for documents.
Response start timeout is 25 seconds, total generation 120 seconds. Per-license
limits are two concurrent requests and ten rolling attempts per minute.

D1 atomically reserves one credit before generation, spending monthly grants first.
Validation precedes settlement; settlement precedes delivery. Failures release
unsettled holds. Holds expire after 150 seconds; stale work cannot settle expired
holds. Settled requests remain charged if delivery fails. Request IDs and input
hashes dedupe for 30 days; completed duplicates return status only, never repeat
generation. No automatic retry of an uncertain completion.

## Data and logging

Prompts and generated content stay in gateway memory only. Persistent data is
billing identifiers, credential hashes, credit grants/debits and request metadata:
IDs/input hashes, status, tokens, provider cost, latency and error codes. No raw keys,
authorization headers, prompt bodies, outputs or upstream error bodies are logged.
Worker observability is disabled in config. Infrastructure/AI providers have their
own network and retention policies; zero external retention is not promised.

Local backups contain personal information but exclude credentials. Users should
protect backups and review inferred/guessed AI answers. Structural validation does
not establish factual accuracy. Removing keys or uninstalling does not cancel billing.

## Browser execution and reporting

One top-frame Shadow DOM panel coordinates embedded field agents. Deterministic
DOM events perform actions; no debugger, stealth, spoofing, randomized typing,
external browser controller or CAPTCHA solving is used. Auto Submit is off by
default; user Auto Continue/Submit preferences remain in control. Attestation,
signature or assessment headings do not trigger blanket autofill pauses. Retries
and navigation are bounded; Pause preserves local progress.

Report vulnerabilities privately using
[GitHub Private Vulnerability Reporting](https://github.com/Amro212/kareer/security/advisories/new).
Do not publish applicant information, credentials, payment details or raw request
dumps in issues. Recovery and billing use native Lemon Squeezy receipts and portal.

Real staging payments, Chrome/Firefox flows, cost measurements, production setup
and store approval remain explicit gates in `docs/release-checklist.json`. Local
tests do not establish external payment behavior or store approval.
