import { cn } from "@/lib/utils";

type OptionType = "calls" | "puts" | "all";

interface TypeToggleProps {
  selected: OptionType;
  onSelect: (type: OptionType) => void;
}

export function TypeToggle({ selected, onSelect }: TypeToggleProps) {
  const options: { value: OptionType; label: string }[] = [
    { value: "all", label: "All" },
    { value: "calls", label: "Calls" },
    { value: "puts", label: "Puts" },
  ];

  return (
    <div className="inline-flex items-center rounded-lg bg-secondary p-1 border border-border">
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onSelect(option.value)}
          className={cn(
            "px-4 py-1.5 text-sm font-medium rounded-md transition-all duration-200",
            selected === option.value
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
