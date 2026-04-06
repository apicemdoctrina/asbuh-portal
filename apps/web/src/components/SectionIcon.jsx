import { Bird, Bug, Cat, Dog, Fish, Rabbit, Squirrel, Turtle, Snail } from "lucide-react";

export const ANIMAL_ICONS = {
  bird: Bird,
  bug: Bug,
  cat: Cat,
  dog: Dog,
  fish: Fish,
  rabbit: Rabbit,
  squirrel: Squirrel,
  turtle: Turtle,
  snail: Snail,
};

export const ANIMAL_LABELS = {
  bird: "Птица",
  bug: "Жук",
  cat: "Кошка",
  dog: "Собака",
  fish: "Рыба",
  rabbit: "Кролик",
  squirrel: "Белка",
  turtle: "Черепаха",
  snail: "Улитка",
};

/**
 * Renders the animal icon for a section, or "№{number}" as fallback.
 * Props:
 *   section  — объект с полями { animal?, number }
 *   size     — размер иконки (default 16)
 *   className — доп. классы для иконки
 *   showNumber — показывать "№X" рядом с иконкой (default false)
 */
export default function SectionIcon({ section, size = 16, className = "", showNumber = false }) {
  const Icon = section?.animal ? ANIMAL_ICONS[section.animal] : null;
  const label = section?.name || (section?.number != null ? `Участок №${section.number}` : "");

  if (!Icon) {
    return (
      <span className={`text-xs font-medium text-slate-500 ${className}`}>
        №{section?.number ?? "?"}
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1 ${className}`} title={label}>
      <Icon size={size} />
      {showNumber && <span className="text-xs font-medium text-slate-500">№{section.number}</span>}
    </span>
  );
}
