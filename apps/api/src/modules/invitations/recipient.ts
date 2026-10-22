import type { AuthenticatedUser } from "../../platform/auth";
type Recipient = {
  recipient_user_id: string | null;
  recipient_email: string | null;
};
export function matchesRecipient(value: Recipient, user: AuthenticatedUser) {
  return value.recipient_user_id
    ? value.recipient_user_id === user.userId
    : !!(
        user.emailVerified &&
        value.recipient_email === user.email.trim().toLowerCase()
      );
}
