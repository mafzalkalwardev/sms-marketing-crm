export function isSavedContact(contact) {
  if (!contact?.phone) return false;
  const name = String(contact.name || '').trim();
  if (!name) return false;
  const phoneDigits = String(contact.phone).replace(/\D/g, '');
  const nameDigits = name.replace(/\D/g, '');
  if (name === contact.phone) return false;
  if (nameDigits && nameDigits === phoneDigits) return false;
  return true;
}

export function displayName(contact) {
  if (!contact) return '';
  if (isSavedContact(contact)) return contact.name;
  return contact.phone || '';
}

export function isPhoneLikeName(name, phone) {
  if (!name || !phone) return true;
  return String(name).replace(/\D/g, '') === String(phone).replace(/\D/g, '');
}
