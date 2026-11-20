import { CircleAlert, CircleCheck, Upload } from 'lucide-react';
import { useId, useRef, useState, type DragEvent } from 'react';

import { Button } from '@/Components/ui/Button';
import { formatBytes, percent, precheckUpload, UPLOAD_RULES, uploadErrorMessage, type UploadKind } from '@/lib/media';
import { cx, describedBy } from '@/lib/ui';

/**
 * UX §11 Upload dropzone (story 1.8c): idle · drag-over · validating · uploading (progress) ·
 * error (code → plain language) · done. The accepted types and limits are always shown up front
 * ("PNG, JPG or WebP, up to 10 MB and 40 megapixels"; final ZIP "up to 95 MB", DV-13).
 * - Keyboard and screen readers use the "Choose a file" button (Enter/Space opens the file
 *   picker); dragging is an extra for pointers, never the only way.
 * - The browser pre-checks size, extension and MIME with Next's rules (lib/media precheckUpload)
 *   and rejects at once, saying the limit; everything deeper is the server's (its `code` comes
 *   back through `status`). `onFile` only receives files that passed.
 * - Presentational: the parent uploads and drives `status`; the request-key persistence
 *   (`concept-upload-key.ts`) belongs to the upload screens (Epic 7).
 */
export type UploadStatus =
    | { phase: 'idle' }
    | { phase: 'validating'; fileName: string }
    | { phase: 'uploading'; fileName: string; loaded: number; total: number }
    | { phase: 'error'; code: string; fileName?: string; size?: number }
    | { phase: 'done'; fileName: string };

type Props = {
    kind: UploadKind;
    /** The field's name, e.g. "Concept image". */
    label: string;
    status?: UploadStatus;
    onFile: (file: File) => void;
    onCancel?: () => void;
    /** Uploading isn't possible right now, and why. */
    disabledReason?: string | null;
};

export function UploadDropzone({ kind, label, status = { phase: 'idle' }, onFile, onCancel, disabledReason }: Props) {
    const id = useId();
    const labelId = `${id}-label`;
    const limitsId = `${id}-limits`;
    const errorId = `${id}-error`;
    const input = useRef<HTMLInputElement>(null);
    const depth = useRef(0);
    const [dragOver, setDragOver] = useState(false);
    const [rejected, setRejected] = useState<{ code: string; fileName?: string; size?: number } | null>(null);
    const rule = UPLOAD_RULES[kind];

    const busy = status.phase === 'validating' || status.phase === 'uploading';
    const blocked = Boolean(disabledReason) || busy;
    const error = rejected ?? (status.phase === 'error' ? status : null);
    const state = dragOver ? 'drag-over' : rejected ? 'error' : status.phase;

    const take = (files: FileList | null) => {
        if (!files || files.length === 0) return;
        if (files.length > 1) {
            setRejected({ code: 'MULTIPLE_FILES' });
            return;
        }
        const file = files[0]!;
        const code = precheckUpload(kind, file);
        if (code) {
            setRejected({ code, fileName: file.name, size: file.size });
            return;
        }
        setRejected(null);
        onFile(file);
    };

    const onDrag = (event: DragEvent<HTMLDivElement>, kindOfEvent: 'enter' | 'over' | 'leave' | 'drop') => {
        if (!event.dataTransfer.types.includes('Files')) return;
        event.preventDefault();
        if (blocked) {
            event.dataTransfer.dropEffect = 'none';
            return;
        }
        if (kindOfEvent === 'enter') {
            depth.current++;
            setDragOver(true);
        } else if (kindOfEvent === 'over') {
            event.dataTransfer.dropEffect = 'copy';
        } else if (kindOfEvent === 'leave') {
            depth.current = Math.max(0, depth.current - 1);
            if (depth.current === 0) setDragOver(false);
        } else {
            depth.current = 0;
            setDragOver(false);
            take(event.dataTransfer.files);
        }
    };

    const errorText = error ? uploadErrorMessage(kind, error.code, error.fileName !== undefined ? { name: error.fileName, size: error.size ?? 0 } : undefined) : null;

    return (
        <div role="group" aria-labelledby={labelId} className="flex flex-col gap-2">
            <p id={labelId} className="text-sm font-medium text-fg">
                {label}
            </p>
            <div
                data-state={state}
                onDragEnter={(e) => onDrag(e, 'enter')}
                onDragOver={(e) => onDrag(e, 'over')}
                onDragLeave={(e) => onDrag(e, 'leave')}
                onDrop={(e) => onDrag(e, 'drop')}
                className={cx(
                    'flex flex-col items-center gap-3 rounded-md border-2 border-dashed px-4 py-6 text-center transition-colors',
                    dragOver
                        ? 'border-accent bg-accent-soft'
                        : disabledReason && !busy
                          ? 'border-divider bg-sunken'
                          : error
                            ? 'border-danger bg-surface'
                            : 'border-border bg-surface',
                )}
            >
                {status.phase === 'uploading' ? (
                    <Progress fileName={status.fileName} loaded={status.loaded} total={status.total} />
                ) : status.phase === 'validating' ? (
                    <p className="text-base text-fg">Checking {status.fileName}…</p>
                ) : status.phase === 'done' && !rejected ? (
                    <p className="flex items-center gap-2 text-base font-medium text-fg">
                        <CircleCheck aria-hidden="true" size={20} strokeWidth={1.5} className="text-success" />
                        {status.fileName} uploaded
                    </p>
                ) : (
                    <>
                        <Upload aria-hidden="true" size={20} strokeWidth={1.5} className={dragOver ? 'text-accent-text' : 'text-fg-3'} />
                        <p className="text-base text-fg">{dragOver ? 'Drop the file to upload it' : 'Drag a file here, or'}</p>
                    </>
                )}

                {busy ? (
                    onCancel ? (
                        <Button size="sm" variant="ghost" onClick={onCancel}>
                            Cancel upload
                        </Button>
                    ) : null
                ) : (
                    <Button
                        size="sm"
                        variant="secondary"
                        disabledReason={disabledReason}
                        aria-describedby={describedBy(limitsId, errorText && errorId)}
                        onClick={() => input.current?.click()}
                    >
                        {status.phase === 'done' || error ? 'Choose another file' : 'Choose a file'}
                    </Button>
                )}
                <p id={limitsId} className="text-sm text-fg-2">
                    {rule.summary}
                </p>
            </div>
            <input
                ref={input}
                type="file"
                accept={rule.accept}
                hidden
                tabIndex={-1}
                aria-hidden="true"
                onChange={(e) => {
                    take(e.currentTarget.files);
                    e.currentTarget.value = ''; // choosing the same file again still fires change
                }}
            />
            {/* Errors are assertive (role=alert); progress and completion are polite (role=status). */}
            <div role="alert" className="empty:hidden">
                {errorText ? (
                    <p id={errorId} className="flex items-start gap-2 text-base text-danger">
                        <CircleAlert aria-hidden="true" size={20} strokeWidth={1.5} className="mt-0.5 shrink-0" />
                        <span>
                            <span className="sr-only">Error: </span>
                            {errorText}
                        </span>
                    </p>
                ) : null}
            </div>
            <div role="status" className="sr-only">
                {status.phase === 'uploading' ? `Uploading ${status.fileName}` : status.phase === 'done' && !rejected ? `${status.fileName} uploaded` : ''}
            </div>
        </div>
    );
}

function Progress({ fileName, loaded, total }: { fileName: string; loaded: number; total: number }) {
    const value = percent(loaded, total);
    return (
        <div className="flex w-full max-w-sm flex-col gap-2">
            <p className="text-base text-fg">Uploading {fileName}</p>
            <div
                role="progressbar"
                aria-label={`Uploading ${fileName}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={value}
                aria-valuetext={`${value}%`}
                className="h-2 w-full overflow-hidden rounded-full bg-sunken"
            >
                <div className="h-full rounded-full bg-accent transition-[width] duration-(--duration-panel)" style={{ width: `${value}%` }} />
            </div>
            <p className="text-sm text-fg-2 tabular-nums">
                {value}% · {formatBytes(loaded)} of {formatBytes(total)}
            </p>
        </div>
    );
}
