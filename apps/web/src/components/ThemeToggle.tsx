import { Moon, Sun } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/lib/theme";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();

  return (
    <Button variant="ghost" size="sm" className="justify-start gap-1.5 md:w-full" onClick={toggle}>
      {theme === "dark" ? <Sun /> : <Moon />}
      <span className="hidden md:inline">{theme === "dark" ? "Light mode" : "Dark mode"}</span>
    </Button>
  );
}
