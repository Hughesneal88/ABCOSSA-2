import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/useTheme";

interface ThemeToggleProps {
  className?: string;
  variant?: "ghost" | "outline" | "default";
  size?: "default" | "sm" | "lg" | "icon";
  showLabel?: boolean;
}

export function ThemeToggle({
  className = "",
  variant = "ghost",
  size = "icon",
  showLabel = false,
}: ThemeToggleProps) {
  const { isDark, toggleTheme } = useTheme();

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={toggleTheme}
      className={`relative inline-flex items-center justify-center gap-2 rounded-xl transition-all duration-300 hover:bg-muted ${className}`}
      title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
      aria-label={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
    >
      <Sun className="h-4 w-4 rotate-0 scale-100 transition-all duration-300 text-amber-500 dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all duration-300 text-emerald-400 dark:rotate-0 dark:scale-100" />
      {showLabel && (
        <span className="text-xs font-medium">
          {isDark ? "Light Mode" : "Dark Mode"}
        </span>
      )}
    </Button>
  );
}
