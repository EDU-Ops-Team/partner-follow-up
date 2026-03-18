"use client";

import { useEffect, useState } from "react";
import { signIn, useSession } from "next-auth/react";

function getErrorMessage(error: string | null): string | null {
  if (!error) return null;
  if (error === "AccessDenied") {
    return "Your Google account is not approved for this dashboard.";
  }
  if (error === "Configuration") {
    return "Authentication is not configured correctly in production.";
  }
  return "Sign-in failed. Check the auth configuration and try again.";
}

export default function SignIn() {
  const { status } = useSession();
  const [callbackUrl, setCallbackUrl] = useState("/");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setCallbackUrl(params.get("callbackUrl") ?? "/");
    setErrorMessage(getErrorMessage(params.get("error")));
  }, []);

  useEffect(() => {
    if (status === "authenticated") {
      window.location.href = callbackUrl;
    }
  }, [callbackUrl, status]);

  if (status === "authenticated") return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm rounded-lg bg-white p-8 shadow-md">
        <h1 className="mb-2 text-center text-2xl font-bold text-gray-900">
          EDU Ops Agent
        </h1>
        <p className="mb-6 text-center text-sm text-gray-500">
          Sign in with an approved Google account to access the dashboard
        </p>
        {errorMessage && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMessage}
          </div>
        )}
        <button
          onClick={() => signIn("google", { callbackUrl })}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          Sign in with Google
        </button>
      </div>
    </div>
  );
}
