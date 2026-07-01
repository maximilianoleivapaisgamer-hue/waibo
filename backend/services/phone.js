function normalizePhone(rawPhone) {
  if (!rawPhone) return rawPhone;
  return String(rawPhone)
    .replace(/[\s\-\(\)]/g, '')
    .replace(/^\+/, '');
}

module.exports = { normalizePhone };
