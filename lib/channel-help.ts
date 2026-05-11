export const TEAMS_WEBHOOK_HELP =
  "Create a Microsoft Teams Incoming Webhook for the alert channel, then paste the https:// webhook URL here.";

export const HTTP_WEBHOOK_HELP_SUMMARY =
  "LabelWatch sends each alert as an HTTPS POST with a JSON body. Your endpoint should return any 2xx status after accepting the event.";

export const HTTP_WEBHOOK_HELP_ITEMS = [
  "Use a public HTTPS endpoint that can receive POST requests.",
  "Add an Authorization header only if your receiver requires one.",
  "After creation, save the signing secret. It is shown one time.",
  "Verify X-LabelWatch-Signature by computing HMAC-SHA256 over the raw request body.",
];
