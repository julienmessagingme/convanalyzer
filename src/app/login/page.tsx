import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/lib/auth/config";
import { verifySession } from "@/lib/auth/jwt";
import { LoginForm } from "@/components/auth/login-form";

interface LoginPageProps {
  searchParams: Promise<{ next?: string; error?: string }>;
}

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: LoginPageProps) {
  // If already signed in, bounce to the landing page.
  const cookieStore = await cookies();
  const existing = cookieStore.get(COOKIE_NAME)?.value;
  if (existing) {
    const session = await verifySession(existing);
    if (session) redirect("/");
  }

  const { next, error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-gray-900">
            Conversation Analyzer
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Powered by MessagingMe
          </p>
        </div>

        <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-200">
          <LoginForm nextPath={next} initialError={error} />
        </div>
      </div>
    </main>
  );
}
