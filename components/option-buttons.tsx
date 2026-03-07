type OptionItem = {
  id: string;
  text: string;
};

export function OptionButtons({
  options,
  selectedOptionId,
  disabled,
  correctOptionId,
  onSelect,
}: {
  options: OptionItem[];
  selectedOptionId: string | null;
  disabled: boolean;
  correctOptionId?: string | null;
  onSelect: (optionId: string) => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {options.map((option, idx) => {
        const selected = selectedOptionId === option.id;
        const isCorrect = correctOptionId === option.id;
        const isWrongSelected = Boolean(correctOptionId) && selected && !isCorrect;

        const className = [
          "min-h-14 rounded-lg border p-4 text-left text-lg font-semibold transition",
          selected ? "border-sky-400 bg-sky-500/20" : "border-slate-700 bg-slate-900",
          isCorrect ? "border-emerald-400 bg-emerald-500/20" : "",
          isWrongSelected ? "border-red-400 bg-red-500/20" : "",
          disabled ? "cursor-not-allowed opacity-90" : "hover:border-slate-500",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <button
            key={option.id}
            type="button"
            className={className}
            disabled={disabled}
            onClick={() => onSelect(option.id)}
          >
            <span className="mr-2 text-slate-400">{String.fromCharCode(65 + idx)}.</span>
            {option.text}
          </button>
        );
      })}
    </div>
  );
}
