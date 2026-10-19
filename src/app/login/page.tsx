import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { isSignedIn, sitePassword } from "@/server/auth";

export const metadata: Metadata = { title: "Sign in · AutoCalendar" };

export default async function LoginPage() {
  if (await isSignedIn(await cookies())) redirect("/");
  return <LoginForm configured={sitePassword() !== null} />;
}
