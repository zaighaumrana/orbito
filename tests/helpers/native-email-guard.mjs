// Test-only architecture guard; an ordinary "Resend invitation" label is allowed.
const packages='resend|@sendgrid/mail|nodemailer|mailgun.js|@mailgun/mailgun-js|@aws-sdk/client-ses|@getbrevo/brevo';
const rules=[
 ['provider SDK',new RegExp(`(?:from\\s*|import\\s*(?:\\(\\s*)?|require\\s*\\(\\s*)["'](?:npm:|https?://(?:esm\\.sh|esm\\.run|cdn\\.jsdelivr\\.net/npm)/)?(?:${packages})(?:@[^"']*)?["']`,'i')],
 ['provider constructor',/\bnew\s+Resend\s*\(/],
 ['provider dependency',new RegExp(`["'](?:${packages})["']\\s*:`,'i')],
 ['provider API',/\b(?:resend\.com|(?:api\.)?sendgrid\.com|(?:api\.)?mailgun\.(?:net|com)|api\.brevo\.com|email\.[a-z0-9-]+\.amazonaws\.com)\b/i],
 ['provider secret',/\b(?:RESEND_API_KEY|SENDGRID_API_KEY|MAILGUN_API_KEY|BREVO_API_KEY|PLATFORM_AUTH_(?:HOOK|EMAIL_GUARD|RESEND)[A-Z0-9_]*)\b/],
 ['rejected custom transport',/platform-auth-email|platform-password-recovery|proof_digest/],
];
export function forbiddenEmailTransport(source) {
 return rules.filter(([,rule])=>rule.test(source)).map(([name])=>name);
}
