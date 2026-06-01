import { ANIMAL_ICONS, ANIMAL_LABELS } from "./SectionIcon.jsx";

/**
 * Пикер иконки животного для участка.
 * Props:
 *   value    — текущий ключ (e.g. "cat") или ""
 *   onChange — (key: string | "") => void
 *   usedAnimals — string[] — ключи уже занятых животных (будут disabled)
 */
export default function AnimalPicker({ value, onChange, usedAnimals = [] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {/* Без животного */}
      <button
        type="button"
        onClick={() => onChange("")}
        className={`w-9 h-9 rounded-lg border-2 flex items-center justify-center text-xs font-medium transition-colors
          ${
            !value
              ? "border-primary bg-primary/10 text-primary"
              : "border-line text-subtle hover:border-line"
          }`}
        title="Без иконки"
      >
        —
      </button>

      {Object.entries(ANIMAL_ICONS).map(([key, Icon]) => {
        const isSelected = value === key;
        const isUsed = usedAnimals.includes(key) && !isSelected;
        return (
          <button
            key={key}
            type="button"
            disabled={isUsed}
            onClick={() => onChange(key)}
            title={ANIMAL_LABELS[key]}
            className={`w-9 h-9 rounded-lg border-2 flex items-center justify-center transition-colors
              ${
                isSelected
                  ? "border-primary bg-primary/10 text-primary"
                  : isUsed
                    ? "border-line bg-canvas text-subtle cursor-not-allowed"
                    : "border-line text-subtle hover:border-primary/40 hover:text-primary"
              }`}
          >
            <Icon size={18} />
          </button>
        );
      })}
    </div>
  );
}
