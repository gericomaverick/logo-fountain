"use client";

import { useId, useState } from "react";

import type { BriefFieldDefinition } from "@/lib/brief";
import { CheckIcon } from "./icons";
import { composeBriefAnswer, parseBriefAnswer, toggleBriefChoice } from "@/lib/brief-choices";

/**
 * One brief question. Where the question offers choices, it renders as
 * pick-then-elaborate rather than a blank box — the stored value is still a
 * single string either way. Where a worked example exists, it is one click
 * away, because the usual reason a brief field sits empty is not knowing what
 * a good answer looks like.
 */
export function BriefFieldInput({
  field, value, onChange, onTouched, error, answered = false, lengthNote,
}: {
  field: BriefFieldDefinition;
  value: string;
  onChange: (next: string) => void;
  onTouched?: () => void;
  error?: string;
  answered?: boolean;
  lengthNote?: string;
}) {
  const hasOptions = Boolean(field.options?.length);
  const helpId = `brief-${field.key}-help`;
  const errorId = `brief-${field.key}-error`;
  const labelId = `brief-${field.key}-label`;
  const lengthId = `brief-${field.key}-length`;
  const describedBy = [field.helperText ? helpId : null, field.optionsPrompt ? `brief-${field.key}-options` : null, error ? errorId : null, lengthNote ? lengthId : null].filter(Boolean).join(" ") || undefined;
  const label = <>
    {field.label}{" "}
    {field.required ? <><span className="text-danger" aria-hidden={hasOptions || undefined}>*</span>{hasOptions ? <span className="sr-only">Required</span> : null}</> : <span className="text-sm font-normal text-fg-2">(optional)</span>}
    {answered && !error ? <span className="ml-2 inline-flex align-middle text-fg-2" title="Answered">
      <CheckIcon size={16} /><span className="sr-only">Answered</span>
    </span> : null}
  </>;
  const contents = <>
    {hasOptions ? <legend id={labelId} className="text-base font-semibold text-fg">{label}</legend>
      : <label id={labelId} className="block text-base font-semibold text-fg" htmlFor={field.key}>{label}</label>}
    {field.helperText ? <p id={helpId} className="mt-2 max-w-[60ch] text-base text-fg-2">{field.helperText}</p> : null}
    <div className="mt-3">
      {hasOptions ? <ChoiceField field={field} value={value} onChange={onChange} onTouched={onTouched} describedBy={describedBy} invalid={Boolean(error)} />
        : <FreeTextField field={field} value={value} onChange={onChange} describedBy={describedBy} invalid={Boolean(error)} />}
    </div>
    {error ? <p id={errorId} className="mt-2 text-base text-danger">{error}</p> : null}
    {lengthNote ? <p id={lengthId} className="mt-2 text-base text-fg-2">{lengthNote}</p> : null}
    {field.example ? <ExampleDisclosure example={field.example} /> : null}
  </>;
  const shared = { "data-brief-field": field.key, className: "min-w-0 scroll-mt-24", onBlur: (event: React.FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) onTouched?.();
  } };
  return hasOptions
    ? <fieldset {...shared} aria-invalid={error ? true : undefined}>{contents}</fieldset>
    : <div {...shared}>{contents}</div>;
}

function ChoiceField({
  field,
  value,
  onChange, onTouched, describedBy, invalid,
}: {
  field: BriefFieldDefinition;
  value: string;
  onChange: (next: string) => void;
  onTouched?: () => void;
  describedBy?: string;
  invalid?: boolean;
}) {
  const options = field.options ?? [];
  const values = options.map((option) => option.value);
  const { selected, note } = parseBriefAnswer(value, values);

  return (
    <div className="space-y-3">
      {field.optionsPrompt ? <p id={`brief-${field.key}-options`} className="text-base text-fg-2">{field.optionsPrompt}</p> : null}

      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const isSelected = selected.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={isSelected}
              aria-describedby={describedBy}
              title={option.hint}
              onClick={() => { onChange(composeBriefAnswer(toggleBriefChoice(selected, option.value, values), note)); onTouched?.(); }}
              className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                invalid ? "border-danger bg-panel text-fg-2" : isSelected
                  ? "border-accent bg-accent-soft font-medium text-fg"
                  : "border-fg-3 bg-panel text-fg-2 hover:border-fg-3 hover:text-fg"
              } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent`}
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
          aria-describedby={describedBy}
          value={note}
          maxLength={field.maxLength}
          placeholder={field.placeholder}
          onChange={(event) => onChange(composeBriefAnswer(selected, event.target.value))}
          className="portal-field min-h-24 border-fg-3 placeholder:text-fg-2 focus-visible:ring-accent"
          rows={3}
        />
      </div>
    </div>
  );
}

function FreeTextField({
  field,
  value,
  onChange, describedBy, invalid,
}: {
  field: BriefFieldDefinition;
  value: string;
  onChange: (next: string) => void;
  describedBy?: string;
  invalid?: boolean;
}) {
  if (field.kind === "textarea") {
    return (
      <textarea
        id={field.key}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        required={field.required}
        value={value}
        maxLength={field.maxLength}
        placeholder={field.placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={`portal-field min-h-32 ${invalid ? "border-danger" : "border-fg-3"} placeholder:text-fg-2 focus-visible:ring-accent`}
        rows={field.rows ?? 5}
      />
    );
  }

  return (
    <input
      id={field.key}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      required={field.required}
      value={value}
      maxLength={field.maxLength}
      placeholder={field.placeholder}
      onChange={(event) => onChange(event.target.value)}
      className={`portal-field ${invalid ? "border-danger" : "border-fg-3"} placeholder:text-fg-2 focus-visible:ring-accent`}
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
        className="portal-link text-sm focus-visible:ring-accent"
      >
        {open ? "Hide example" : "See an example"}
      </button>
      <p id={id} hidden={!open} className="mt-2 rounded-md bg-surface px-3 py-2 text-base italic text-fg-2">
        {example}
      </p>
    </div>
  );
}
