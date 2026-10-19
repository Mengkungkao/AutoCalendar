import { cookies } from "next/headers";
import { RosterApp } from "@/components/roster-app";
import { MAX_FILE_BYTES, VERCEL_UPLOAD_BYTES } from "@/lib/upload";
import { availableProviders, resolveProvider } from "@/server/read-roster";
import { readSettingsCookie } from "@/server/settings-cookie";

function automaticProvider() {
  try {
    return resolveProvider("auto");
  } catch {
    return null;
  }
}

export default async function Home() {
  const settings = readSettingsCookie(await cookies());
  return (
    <RosterApp
      initialSettings={settings}
      providers={availableProviders()}
      automaticProvider={automaticProvider()}
      // Vercel sets VERCEL=1; its 4.5 MB request limit can't be raised, so the browser shrinks bigger files.
      uploadLimit={process.env.VERCEL ? VERCEL_UPLOAD_BYTES : MAX_FILE_BYTES}
    />
  );
}
