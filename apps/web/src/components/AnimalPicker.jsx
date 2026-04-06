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
              ? "border-[#6567F1] bg-[#6567F1]/10 text-[#6567F1]"
              : "border-slate-200 text-slate-400 hover:border-slate-300"
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
                  ? "border-[#6567F1] bg-[#6567F1]/10 text-[#6567F1]"
                  : isUsed
                    ? "border-slate-100 bg-slate-50 text-slate-300 cursor-not-allowed"
                    : "border-slate-200 text-slate-500 hover:border-[#6567F1]/40 hover:text-[#6567F1]"
              }`}
          >
            <Icon size={18} />
          </button>
        );
      })}
    </div>
  );
}
