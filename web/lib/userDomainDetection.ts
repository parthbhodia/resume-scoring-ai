export function getUserDomain(email: string | null | undefined): string | null {
  if (!email) return null;
  const match = email.match(/@([^@]+)$/);
  return match ? match[1].toLowerCase() : null;
}

export function isUmbcUser(email: string | null | undefined): boolean {
  return getUserDomain(email) === "umbc.edu";
}
