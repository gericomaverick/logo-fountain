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
      <label className="block text-base font-semibold text-fg" htmlFor={field.key}>
        {field.label}{" "}
        {field.required ? (
          <span className="text-danger">*</span>
        ) : (
          <span className="text-sm font-normal text-fg-3">(optional)</span>
        )}
      </label>
      {field.helperText ? <p className="mt-2 max-w-[60ch] text-base text-fg-2">{field.helperText}</p> : null}

      <div className="mt-3">
        {hasOptions ? (
          <ChoiceField field={field} value={value} onChange={onChange} />
        ) : (
          <FreeTextField field={field} value={value} onChange={onChange} />
        )}
      </div>

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
      {field.optionsPrompt ? <p className="text-base text-fg-2">{field.optionsPrompt}</p> : null}

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
              {option.hint ? <span className="ml-1.5 text-fg-2">· {option.hint}</span> : null}
            </button>
          );
        })}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-fg-2" htmlFor={field.key}>
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
      <p id={id} hidden={!open} className="mt-2 rounded-md bg-surface px-3 py-2 text-base italic text-fg-2">
        {example}
      </p>
    </div>
  );
}
