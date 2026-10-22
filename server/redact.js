// E8: redaction for anything written to server logs. Logs never contain credentials, contact
// details, message text or exact positions. Ids (UUIDs) are kept so a log line can be traced.

const REDACTED = '[REDACTED]';
const SECRET_KEY = /authorization|cookie|passw|secret|token|signature|api[-_]?key|captcha|session/i;
const CONTACT_KEY = /^(email|e_?mail|phone|phone_?number|mobile|address|street|dropoff_?address|plate|license_?plate|first_?name|last_?name|full_?name|ip)$/i;
const TEXT_KEY = /^(body|message|messages|note|notes|comment|comments|text|description|admin_?note|reason_?note|private_?note)$/i;
const COORD_KEY = /^(lat|lng|lon|long|latitude|longitude)$/i;

const UUID_G = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const PATTERNS = [
  [/Bearer\s+[^\s,;"']+/gi, 'Bearer [REDACTED]'],
  [/\beyJ[\w-]{5,}\.[\w-]{5,}\.[\w-]+/g, '[REDACTED_JWT]'],
  [/\b(?:sk|rk|pk)_(?:live|test)_[\w]+/g, '[REDACTED_KEY]'],
  [/\bwhsec_[\w]+/g, '[REDACTED_KEY]'],
  [/\b(pi|seti)_[\w]+_secret_[\w]+/g, '[REDACTED_KEY]'],
  [/\b(sb_secret|sb_publishable)_[\w-]+/g, '[REDACTED_KEY]'],
  [/postgres(?:ql)?:\/\/[^\s'"]+/gi, 'postgres://[REDACTED]'],
  [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[REDACTED_EMAIL]'],
  [/-?\d{1,3}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}/g, '[REDACTED_COORDS]'],
  [/\b(lat|lng|latitude|longitude)=(-?\d+\.\d+)/gi, (_m, key, value) => `${key}=${roundCoordinate(Number(value))}`],
  [/(?<![\w-])\+?\d(?:[\s().-]*\d){9,14}(?![\w-])/g, '[REDACTED_PHONE]'],
];

// Two decimals ≈ 1 km: enough to tell a city area apart, not a house.
function roundCoordinate(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : null;
}

function redactString(input) {
  if (typeof input !== 'string' || !input) return input;
  const ids = [];
  let text = input.replace(UUID_G, (id) => { ids.push(id); return `\u0000${ids.length - 1}\u0000`; });
  for (const [pattern, replacement] of PATTERNS) text = text.replace(pattern, replacement);
  return text.replace(/\u0000(\d+)\u0000/g, (_m, index) => ids[Number(index)]);
}

function redact(value, key = '', depth = 0) {
  if (key && SECRET_KEY.test(key)) return value == null ? value : REDACTED;
  if (key && CONTACT_KEY.test(key)) return value == null || value === '' ? value : REDACTED;
  if (key && TEXT_KEY.test(key)) {
    if (value == null) return value;
    return typeof value === 'string' ? `[REDACTED ${value.length} chars]` : REDACTED;
  }
  if (key && COORD_KEY.test(key)) return value == null ? value : roundCoordinate(value);
  if (typeof value === 'string') return redactString(value);
  if (value === null || typeof value !== 'object') return value;
  if (depth > 6) return '[Truncated]';
  if (value instanceof Error) return serializeError(value);
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redact(item, '', depth + 1));
  const out = {};
  for (const [childKey, childValue] of Object.entries(value)) out[childKey] = redact(childValue, childKey, depth + 1);
  return out;
}

function serializeError(error) {
  if (!error || typeof error !== 'object') return { message: redactString(String(error)) };
  // 'errorMessage' (not 'message', which redact() treats as user text).
  const out = { name: error.name, errorMessage: redactString(error.message || '') };
  if (error.code !== undefined) out.code = String(error.code);
  if (error.status !== undefined) out.status = error.status;
  if (error.type) out.type = error.type;
  if (typeof error.detail === 'string') out.detail = redactString(error.detail);
  if (typeof error.stack === 'string') out.stack = redactString(error.stack);
  return out;
}

module.exports = { redact, redactString, roundCoordinate, serializeError, REDACTED };
