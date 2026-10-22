import { signIn } from "../../auth";
export default function SignInLink({
  className,
  children,
}: {
  className: string;
  children: React.ReactNode;
}) {
  return (
    <button className={className} onClick={() => void signIn()}>
      {children}
    </button>
  );
}
