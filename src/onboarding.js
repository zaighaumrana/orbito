export function validateOwner(name, email) {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 160) throw new Error('Enter the Business Owner name (up to 160 characters).');
  if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) throw new Error('Enter a valid Business Owner email.');
  return { owner_name: name.trim(), owner_email: email.trim().toLowerCase() };
}
