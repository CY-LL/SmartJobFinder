// The Google Apps Script the user installs in their own Gmail, so the app can read one label's job alerts
// without a password. It runs as them, with read-only Gmail access, and only ever searches the label
// written into it. The app calls it at its web app address with the secret key written into it.

/** A long random key, generated once per browser and written into the user's script. */
export function newScriptKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export const SCRIPT_URL_RE = /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/

/** Code.gs, with the user's label and key filled in. */
export function scriptCode(label: string, key: string): string {
  return `// SmartJobFinder: shares the job alert emails in one Gmail label with your SmartJobFinder app.
// Read-only: it can't send, change or delete mail, and it only looks at the label below.
const LABEL = ${JSON.stringify(label)};
const KEY = ${JSON.stringify(key)};
const MAX_EMAILS = 50;

function doPost(e) {
  let req = {};
  try { req = JSON.parse(e.postData.contents); } catch (err) {}
  if (typeof req.key !== 'string' || req.key !== KEY) return reply({ error: 'bad_key' });

  // Nothing in the request can choose what is read: the label is fixed above, and the only other
  // input is a number of days.
  const label = (Gmail.Users.Labels.list('me').labels || []).filter(function (l) {
    return l.name.toLowerCase() === LABEL.toLowerCase();
  })[0];
  if (!label) return reply({ error: 'no_label', label: LABEL });
  const days = Math.max(1, Math.min(30, Math.floor(Number(req.days)) || 7));
  // Gmail is asked by the label's id, not a search for its name, so no other mail can match.
  const found = Gmail.Users.Messages.list('me', { labelIds: [label.id], q: 'newer_than:' + days + 'd', maxResults: MAX_EMAILS }).messages || [];
  // Each email is checked again for the label before anything from it is shared.
  const labelled = function (msg) { return (msg.labelIds || []).indexOf(label.id) >= 0; };

  if (req.check) {
    // Subjects of the first emails, so you can see exactly which emails the app can read.
    const subjects = [];
    found.slice(0, 10).forEach(function (m) {
      const msg = Gmail.Users.Messages.get('me', m.id, { format: 'metadata', metadataHeaders: ['Subject'] });
      if (labelled(msg)) subjects.push(((msg.payload && msg.payload.headers) || []).map(function (h) { return h.value; })[0] || '(no subject)');
    });
    return reply({ label: LABEL, count: found.length, subjects: subjects });
  }

  const emails = [];
  found.forEach(function (m) {
    const msg = Gmail.Users.Messages.get('me', m.id, { format: 'raw' });
    if (labelled(msg)) emails.push(typeof msg.raw === 'string' ? msg.raw : Utilities.base64EncodeWebSafe(msg.raw));
  });
  return reply({ label: LABEL, emails: emails });
}

// Opening the web app URL in a browser lands here. It shares nothing; it only confirms the script is running.
function doGet() {
  return reply({ ok: true, message: 'Your SmartJobFinder Gmail script is running. Go back to SmartJobFinder, paste this page’s address and press Connect.' });
}

function reply(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}
`
}

/** appsscript.json: read-only Gmail access, and a web app that runs as the user. */
export const SCRIPT_MANIFEST = `{
  "timeZone": "America/Toronto",
  "runtimeVersion": "V8",
  "exceptionLogging": "STACKDRIVER",
  "dependencies": {
    "enabledAdvancedServices": [{ "userSymbol": "Gmail", "serviceId": "gmail", "version": "v1" }]
  },
  "oauthScopes": ["https://www.googleapis.com/auth/gmail.readonly"],
  "webapp": { "executeAs": "USER_DEPLOYING", "access": "ANYONE_ANONYMOUS" }
}
`
