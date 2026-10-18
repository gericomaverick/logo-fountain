"use client";

import { useId, useState } from "react";

import type { BriefFieldDefinition } from "@/lib/brief";
import { composeBriefAnswer, parseBriefAnswer, toggleBriefChoice } from "@/lib/brief-choices";

/**
 * One brief question. Where the question offers choices, it renders as
 * pick-then-elaborate rather than a blank box — the stored value is still a
 * single string either way. Where a worked example exists, it is one click
 * away, because the usual reason a brief field sits empty is not knowing what
 * a good answer looks like.
 */
export function BriefFieldInput({
  field,
  value,
  onChange,
}: {
  field: BriefFieldDefinition;
  value: string;
  onChange: (next: string) => void;
}) {
  const options = field.options ?? [];
  const hasOptions = options.length > 0;

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-fg" htmlFor={field.key}>
        {field.label} {field.required ? <span className="text-danger">*</span> : <span className="text-fg-3">(optional)</span>}
      </label>
      {field.helperText ? <p className="mb-2 text-sm text-fg-3">{field.helperText}</p> : null}

      {hasOptions ? (
        <ChoiceField field={field} value={value} onChange={onChange} />
      ) : (
        <FreeTextField field={field} value={value} onChange={onChange} />
      )}

      {field.example ? <ExampleDisclosure example={field.example} /> : null}
    </div>
  );
}

function ChoiceField({
  field,
  value,
  onChange,
}: {
  field: BriefFieldDefinition;
  value: string;
  onChange: (next: string) => void;
}) {
  const options = field.options ?? [];
  const values = options.map((option) => option.value);
  const { selected, note } = parseBriefAnswer(value, values);

  return (
    <div className="space-y-3">
      {field.optionsPrompt ? <p className="text-sm text-fg-3">{field.optionsPrompt}</p> : null}

      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const isSelected = selected.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={isSelected}
              title={option.hint}
              onClick={() => onChange(composeBriefAnswer(toggleBriefChoice(selected, option.value, values), note))}
              className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                isSelected
                  ? "border-accent bg-accent-soft font-medium text-accent"
                  : "border-line-strong bg-panel text-fg-2 hover:border-fg-3 hover:text-fg"
              } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]`}
            >
              {option.value}
              {option.hint ? <span className="ml-1.5 text-fg-3">· {option.hint}</span> : null}
            </button>
          );
        })}
      </div>

      <div>
        <label className="mb-1 block text-sm text-fg-3" htmlFor={field.key}>
          {field.notePrompt ?? "Anything to add (optional)"}
        </label>
        <textarea
          id={field.key}
          value={note}
          maxLength={field.maxLength}
          placeholder={field.placeholder}
          onChange={(event) => onChange(composeBriefAnswer(selected, event.target.value))}
          className="portal-field"
          rows={2}
        />
      </div>
    </div>
  );
}

function FreeTextField({
  field,
  value,
  onChange,
}: {
  field: BriefFieldDefinition;
  value: string;
  onChange: (next: string) => void;
}) {
  if (field.kind === "textarea") {
    return (
      <textarea
        id={field.key}
        required={field.required}
        value={value}
        maxLength={field.maxLength}
        placeholder={field.placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="portal-field"
        rows={field.rows ?? 3}
      />
    );
  }

  return (
    <input
      id={field.key}
      required={field.required}
      value={value}
      maxLength={field.maxLength}
      placeholder={field.placeholder}
      onChange={(event) => onChange(event.target.value)}
      className="portal-field"
    />
  );
}

function ExampleDisclosure({ example }: { example: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls={id}
        className="portal-link text-sm"
      >
        {open ? "Hide example" : "See an example"}
      </button>
      <p id={id} hidden={!open} className="mt-2 border-l-2 border-line-strong pl-3 text-sm italic text-fg-3">
        {example}
      </p>
    </div>
  );
}
