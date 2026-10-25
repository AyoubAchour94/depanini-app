/** A Tunisian number as people write it, "+216 22 333 444"; any other number is shown as saved. */
export function formatPhone(phone: string): string {
  const match = /^\+216(\d{2})(\d{3})(\d{3})$/.exec(phone.replace(/\s/g, ''));
  return match ? `+216 ${match[1]} ${match[2]} ${match[3]}` : phone;
}
