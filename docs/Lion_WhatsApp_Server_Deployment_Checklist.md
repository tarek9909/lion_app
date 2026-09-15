# Lion WhatsApp Demo Server Deployment Checklist

This checklist covers the demo deployment only. It must not contain access tokens,
app secrets, SSH passwords, or other credentials.

## 1. Pre-deployment safety

- [x] Confirm the target host and domain are `test-lion.duckdns.org` and the supplied server IP.
- [x] Inspect existing processes, reverse-proxy configuration, firewall rules, listening ports, and deployed applications.
- [x] Identify a Lion-only application directory, service name, and port that do not overlap existing applications.
- [x] Back up or record the existing configuration files that will be touched.
- [x] Confirm the deployment will not replace or reload unrelated applications.

## 2. Repository readiness

- [x] Confirm the backend builds successfully.
- [x] Confirm the existing webhook routes: `GET /webhooks/whatsapp` and `POST /webhooks/whatsapp`.
- [x] Confirm the backend port and required MySQL/Redis dependencies.
- [x] Update the Meta Graph API version used by the WhatsApp client to the version supported by the Meta test console.
- [x] Confirm LIVE mode validates the required WhatsApp environment variables.
- [x] Confirm media/AI behavior remains compatible with the demo configuration.

## 3. Secrets and configuration

- [x] Create a server-only environment file outside Git tracking.
- [x] Set the Meta test Phone Number ID.
- [x] Set the Meta test WhatsApp Business Account ID if required by deployment tooling.
- [x] Set the Meta access token.
- [x] Set the Meta App Secret.
- [x] Set a private webhook verification token.
- [x] Set `WHATSAPP_MODE=LIVE`.
- [x] Keep all credentials out of logs, screenshots, source files, and committed changes.

## 4. Server deployment

- [x] Install or confirm only the dependencies required by Lion.
- [x] Build the backend and dashboard using the repository's supported commands.
- [x] Start Lion under a dedicated service/process manager entry.
- [x] Bind Lion to its dedicated local port.
- [x] Confirm the existing apps and ports remain unchanged.
- [x] Confirm `/health` reports the expected dependency status.

## 5. HTTPS and Meta webhook

- [x] Configure the existing reverse proxy for `test-lion.duckdns.org` without changing unrelated virtual hosts.
- [x] Obtain or confirm a valid TLS certificate.
- [x] Confirm `https://test-lion.duckdns.org/health` works.
- [x] Configure the Meta callback URL as `https://test-lion.duckdns.org/webhooks/whatsapp`.
- [x] Configure the matching webhook verification token.
- [x] Complete Meta webhook verification.
- [x] Subscribe the WhatsApp Business Account to the `messages` field.

## 6. Functional verification

- [x] Send a Meta-console test message to an authorized recipient.
- [x] Send an inbound text message from an authorized WhatsApp recipient to the Meta test number.
- [x] Confirm the webhook receives and acknowledges the message.
- [x] Confirm the bot persists the conversation and sends a reply through Meta Cloud API.
- [x] Test the authorized driver and merchant recipient numbers. Driver and merchant `96171203157` completed end-to-end. Meta accepted the merchant outbound `hello_world` test message; the merchant inbound event identified `from=96171203157`, passed signature verification, was processed, persisted, and produced bot outbound messages marked `SENT`.
- [x] Confirm the Meta test-recipient boundary: a non-authorized recipient is rejected by Meta with error `131030` (`Recipient phone number not in allowed list`), and Lion classifies it as a permanent `RECIPIENT_NOT_ALLOWED` error with no retry loop.
- [x] Test voice-note and image webhook paths. Live Meta events from merchant `96171203157` were received as `INBOUND_AUDIO` and `INBOUND_IMAGE`, signature-verified, processed, persisted in `message_media`, and followed by bot replies marked `SENT`. The deployed demo intentionally uses deterministic `MEDIA_MODE=FIXTURE` processing.
- [x] Confirm webhook signature validation and duplicate-event handling.
- [x] Confirm logs contain no credentials.
- [x] Confirm unrelated applications remain healthy after deployment and reloads.

## 7. Handoff

- [x] Record the deployed URL, service name, local port, webhook path, and non-secret operational commands.
- [x] Record any limitations, especially Meta test-recipient limits, temporary-token lifetime, and demo-only media behavior.
- [x] Remove temporary debugging output and verify the working tree does not contain secrets.
- [x] Marked complete after all applicable deployment, webhook, text, audio, image, driver, and merchant tests passed.

## 9. Meta test-number usage

- The Meta **Try it out / Send a message** control sends an outbound message from the test number to the selected recipient. It does not simulate an inbound customer message to Lion.
- To test the inbound AI path, add the tester's WhatsApp number under Meta's test recipient phone numbers, then send a normal WhatsApp message from that phone to `+1 555-145-8031`.
- If Meta returns `131030`, add/verify that sender number in the Meta test-recipient list or use one already authorized. This is a Meta test-account restriction, not a webhook or Gemini failure.

## 8. Dashboard extension deployment

- [x] Remove the frontend-only WhatsApp simulator tab.
- [x] Add an authenticated live WhatsApp Inbox backed by persisted Meta conversations and operator replies.
- [x] Add internal People & Contacts counts and full user, driver, and customer numbers.
- [x] Remove simulated driver GPS movement and GPS display from the dashboard.
- [x] Keep WhatsApp privacy protections for customer/driver communication while exposing full numbers only to dashboard operators.
- [x] Verify the public dashboard, health endpoint, inbox API, contact counts, and all existing PM2 applications after deployment.
