import { cookies } from "next/headers";
import { THEME_COOKIE, DEFAULT_THEME, type ThemePreference } from "@/lib/theme";

/**
 * Server Component that renders a blocking inline script to prevent
 * flash of unstyled content (FOUC) when dark mode is active.
 * Runs synchronously before React hydrates.
 */
export async function ThemeScript() {
  const cookieStore = await cookies();
  const themeCookie = cookieStore.get(THEME_COOKIE)?.value as ThemePreference | undefined;
  const ssrTheme = themeCookie || DEFAULT_THEME;

  const script = `
(function(){
  try {
    var stored = localStorage.getItem("${THEME_COOKIE}") || "${ssrTheme}";
    var isDark = stored === "dark" || (stored === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    if (isDark) document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
  } catch(e) {}
})();
`;

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
