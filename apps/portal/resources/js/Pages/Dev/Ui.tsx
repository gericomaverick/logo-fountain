import { Head } from '@inertiajs/react';
import { Ellipsis, LogOut, Pencil, RotateCcw, Send, Settings, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { Button } from '@/Components/ui/Button';
import { Checkbox } from '@/Components/ui/Checkbox';
import { ChoiceChips } from '@/Components/ui/ChoiceChips';
import { ConfirmDialog } from '@/Components/ui/ConfirmDialog';
import { Dialog } from '@/Components/ui/Dialog';
import { ErrorSummary } from '@/Components/ui/ErrorSummary';
import { Field } from '@/Components/ui/Field';
import { InlineAlert } from '@/Components/ui/InlineAlert';
import { Input } from '@/Components/ui/Input';
import { Link } from '@/Components/ui/Link';
import { Menu, MenuItem, MenuLabel, MenuSeparator } from '@/Components/ui/Menu';
import { RadioGroup } from '@/Components/ui/RadioGroup';
import { Select } from '@/Components/ui/Select';
import { Sheet } from '@/Components/ui/Sheet';
import { Textarea } from '@/Components/ui/Textarea';
import { ThemeSwitcher } from '@/Components/ui/ThemeSwitcher';
import { ToastProvider, useToast } from '@/Components/ui/Toast';

/**
 * /dev/ui: the component catalogue (UX §6 rule 5, ADR-022). Routed only when APP_ENV is local or
 * testing (routes/web.php). Every variant and state of the story 1.8a primitives; both themes
 * via the switcher (and tests/browser/ui-catalogue.spec.ts screenshots each theme).
 * A catalogue, not a screen: it breaks "one primary per view" on purpose to show the variants.
 */
const ICON = { 'aria-hidden': true, size: 16, strokeWidth: 1.5 } as const;
const BRIEF_MAX = 120;
const INDUSTRIES = [
    { value: 'food', label: 'Food and drink' },
    { value: 'health', label: 'Health and fitness' },
    { value: 'tech', label: 'Technology' },
    { value: 'other', label: 'Something else', disabled: true },
];
const STYLES = [
    { value: 'minimal', label: 'Minimal' },
    { value: 'playful', label: 'Playful' },
    { value: 'classic', label: 'Classic' },
    { value: 'bold', label: 'Bold' },
];

export default function Ui() {
    return (
        <ToastProvider>
            <Head title="UI catalogue" />
            <main className="mx-auto flex max-w-content flex-col gap-12 px-4 py-10 md:px-6 lg:px-10">
                <header className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex flex-col gap-2">
                        <p className="text-sm text-fg-3">Local and testing only</p>
                        <h1 className="text-2xl font-semibold">UI catalogue</h1>
                        <p className="max-w-prose text-fg-2">Form and action primitives (story 1.8a), every variant and state.</p>
                    </div>
                    <ThemeSwitcher />
                </header>
                <Buttons />
                <Links />
                <TextFields />
                <Selects />
                <Choices />
                <Overlays />
                <Feedback />
            </main>
        </ToastProvider>
    );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
    return (
        <section aria-labelledby={id} className="flex flex-col gap-6">
            <h2 id={id} className="border-b border-divider pb-2 text-lg font-semibold">
                {title}
            </h2>
            {children}
        </section>
    );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="flex flex-col gap-3">
            <h3 className="text-sm font-medium text-fg-2">{label}</h3>
            <div className="flex flex-wrap items-start gap-3">{children}</div>
        </div>
    );
}

function Buttons() {
    const [sending, setSending] = useState(false);
    return (
        <Section id="buttons" title="Buttons">
            {(['md', 'sm'] as const).map((size) => (
                <Row key={size} label={`Variants, ${size}`}>
                    <Button variant="primary" size={size}>
                        Request revision
                    </Button>
                    <Button variant="secondary" size={size}>
                        Send a comment
                    </Button>
                    <Button variant="ghost" size={size}>
                        Not now
                    </Button>
                    <Button variant="danger" size={size}>
                        Cancel project
                    </Button>
                </Row>
            ))}
            <Row label="With icon">
                <Button variant="primary" icon={<Send {...ICON} />}>
                    Send message
                </Button>
                <Button variant="secondary" size="sm" icon={<Pencil {...ICON} />}>
                    Edit brief
                </Button>
            </Row>
            <Row label="Loading (keeps a label)">
                <Button variant="primary" loading loadingLabel="Sending…">
                    Send
                </Button>
                <Button variant="secondary" loading loadingLabel="Saving…">
                    Save
                </Button>
                <Button
                    variant="primary"
                    loading={sending}
                    loadingLabel="Requesting…"
                    onClick={() => {
                        setSending(true);
                        window.setTimeout(() => setSending(false), 1500);
                    }}
                >
                    Try loading
                </Button>
            </Row>
            <Row label="Disabled with a reason">
                <Button variant="primary" disabledReason="You have no revisions left.">
                    Request revision
                </Button>
                <Button variant="danger" size="sm" disabledReason="Only an admin can do this.">
                    Reset project
                </Button>
            </Row>
        </Section>
    );
}

function Links() {
    return (
        <Section id="links" title="Links">
            <p className="max-w-prose">
                An inline link sits in a sentence and is <Link href="#links">always underlined</Link>, so it never depends on colour. Mail{' '}
                <Link href="mailto:hello@example.com">hello@example.com</Link> for help.
            </p>
            <div className="flex flex-col items-start gap-2">
                <Link href="#links" variant="standalone">
                    View all concepts
                </Link>
                <Link href="#links" variant="standalone">
                    Download invoice
                </Link>
            </div>
        </Section>
    );
}

function TextFields() {
    const [brief, setBrief] = useState('A friendly neighbourhood coffee shop with a calm, warm feel.');
    const [long, setLong] = useState('We roast our own beans and want a mark that works on cups, bags and a shop sign over the door.');
    const [name, setName] = useState('');
    const [submitted, setSubmitted] = useState(false);
    const nameError = submitted && name.trim() === '' ? 'Enter your brand name' : null;

    return (
        <Section id="text" title="Inputs and textareas">
            {nameError ? <ErrorSummary errors={[{ fieldId: 'brand-name', message: nameError }]} /> : null}
            <form
                className="grid gap-6 md:grid-cols-2"
                noValidate
                onSubmit={(e) => {
                    e.preventDefault();
                    setSubmitted(true);
                }}
            >
                <Field id="brand-name" label="Brand name" hint="As it should appear in the logo." error={nameError}>
                    <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="organization" />
                </Field>
                <Field label="Email" hint="We send concept updates here.">
                    <Input type="email" defaultValue="sam@northvale.example" autoComplete="email" />
                </Field>
                <Field label="Website" error="Enter a web address, like https://example.com">
                    <Input type="url" defaultValue="northvale" />
                </Field>
                <Field label="Order reference" hint="You can't change this.">
                    <Input defaultValue="LF-2026-0042" readOnly />
                </Field>
                <Field label="Coupon code" hint="Not available for this order.">
                    <Input disabled placeholder="None" />
                </Field>
                <Field label="Tagline" hint="Optional. Placeholder text is only an example, never the label.">
                    <Input placeholder="e.g. Roasted on the corner" />
                </Field>
                <Field label="Describe your brand" count={{ length: brief.length, max: BRIEF_MAX }}>
                    <Textarea value={brief} onChange={(e) => setBrief(e.target.value)} />
                </Field>
                <Field label="Anything else" count={{ length: long.length, max: 80 }}>
                    <Textarea value={long} onChange={(e) => setLong(e.target.value)} />
                </Field>
                <Field label="Designer notes" hint="Shared by your designer.">
                    <Textarea defaultValue="Exploring a cup-and-steam mark in two weights." readOnly rows={2} />
                </Field>
                <Field label="Internal notes">
                    <Textarea disabled rows={2} placeholder="Admins only" />
                </Field>
                <div className="md:col-span-2">
                    <Button variant="primary" type="submit">
                        Check the form
                    </Button>
                </div>
            </form>
        </Section>
    );
}

function Selects() {
    const [industry, setIndustry] = useState<string | undefined>(undefined);
    return (
        <Section id="selects" title="Select">
            <div className="grid gap-6 md:grid-cols-2">
                <Field label="Industry" hint="Helps us pick reference work.">
                    <Select options={INDUSTRIES} value={industry} onValueChange={setIndustry} />
                </Field>
                <Field label="Industry (chosen)">
                    <Select options={INDUSTRIES} defaultValue="food" />
                </Field>
                <Field label="Industry (error)" error="Choose an industry">
                    <Select options={INDUSTRIES} />
                </Field>
                <Field label="Industry (read-only)">
                    <Select options={INDUSTRIES} defaultValue="tech" readOnly />
                </Field>
                <Field label="Industry (disabled)">
                    <Select options={INDUSTRIES} defaultValue="health" disabled />
                </Field>
            </div>
        </Section>
    );
}

function Choices() {
    const [terms, setTerms] = useState(true);
    const [updates, setUpdates] = useState(false);
    const [pkg, setPkg] = useState<string | null>('starter');
    const [pkgErr, setPkgErr] = useState<string | null>(null);
    const [style, setStyle] = useState<string[]>(['minimal']);
    const [tone, setTone] = useState<string | null>('warm');
    const packages = [
        { value: 'starter', label: 'Starter', description: '3 concepts, 2 revisions' },
        { value: 'professional', label: 'Professional', description: '6 concepts, unlimited revisions' },
        { value: 'agency', label: 'Agency', description: 'Not available yet', disabled: true },
    ];

    return (
        <Section id="choices" title="Checkboxes, radios and choice chips">
            <div className="grid gap-8 md:grid-cols-2">
                <div className="flex flex-col gap-2">
                    <Checkbox label="I have read the brief summary" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
                    <Checkbox label="Email me design tips" hint="About once a month." checked={updates} onChange={(e) => setUpdates(e.target.checked)} />
                    <Checkbox label="I understand approval is final" error="Tick this box to approve the concept" />
                    <Checkbox label="Invoice sent (read-only)" checked readOnly onChange={() => undefined} />
                    <Checkbox label="Archived (disabled)" disabled />
                    <Checkbox label="Archived and checked (disabled)" disabled checked onChange={() => undefined} />
                </div>
                <div className="flex flex-col gap-8">
                    <RadioGroup legend="Package" hint="You can upgrade later." options={packages} value={pkg} onChange={setPkg} />
                    <RadioGroup
                        legend="Package (error)"
                        options={packages.slice(0, 2)}
                        value={null}
                        error={pkgErr ?? 'Choose a package'}
                        onChange={() => setPkgErr('Choose a package')}
                    />
                    <RadioGroup legend="Package (read-only)" options={packages.slice(0, 2)} value="professional" readOnly onChange={() => undefined} />
                    <RadioGroup legend="Package (disabled)" options={packages.slice(0, 2)} value="starter" disabled onChange={() => undefined} />
                </div>
            </div>
            <div className="flex flex-col gap-6">
                <ChoiceChips legend="Styles you like" hint="Pick any." multiple options={STYLES} value={style} onChange={setStyle} />
                <ChoiceChips
                    legend="Tone"
                    options={[
                        { value: 'warm', label: 'Warm' },
                        { value: 'cool', label: 'Cool' },
                        { value: 'neutral', label: 'Neutral' },
                    ]}
                    value={tone}
                    onChange={setTone}
                />
                <ChoiceChips legend="Styles (error)" multiple options={STYLES} value={[]} error="Pick at least one style" onChange={() => undefined} />
                <ChoiceChips legend="Styles (read-only)" multiple options={STYLES} value={['bold']} readOnly onChange={() => undefined} />
                <ChoiceChips legend="Styles (disabled)" multiple options={STYLES} value={['classic']} disabled onChange={() => undefined} />
            </div>
        </Section>
    );
}

function Overlays() {
    const [approveOpen, setApproveOpen] = useState(false);
    const [approving, setApproving] = useState(false);
    const [approveError, setApproveError] = useState<string | null>(null);
    const [resetOpen, setResetOpen] = useState(false);
    const [busyOpen, setBusyOpen] = useState(false);
    const [sending, setSending] = useState(false);

    return (
        <Section id="overlays" title="Dialogs, menus and sheets">
            <Row label="Dialog">
                <Dialog
                    trigger={<Button variant="secondary">Open dialog</Button>}
                    title="Download your files"
                    description="Your final files are ready."
                    footer={
                        <Button variant="primary" width="phone">
                            Download ZIP
                        </Button>
                    }
                >
                    <p>The ZIP has your logo in every format, plus the colour and font guide.</p>
                </Dialog>
                <Dialog
                    open={busyOpen}
                    onOpenChange={setBusyOpen}
                    trigger={<Button variant="secondary">Open submitting dialog</Button>}
                    title="Send your brief?"
                    description="While it sends, Esc and outside clicks don't close it."
                    busy={sending}
                    footer={
                        <Button
                            variant="primary"
                            width="phone"
                            loading={sending}
                            loadingLabel="Sending…"
                            onClick={() => {
                                setSending(true);
                                window.setTimeout(() => {
                                    setSending(false);
                                    setBusyOpen(false);
                                }, 3000);
                            }}
                        >
                            Send brief
                        </Button>
                    }
                />
            </Row>
            <Row label="Confirm dialog">
                <ConfirmDialog
                    open={approveOpen}
                    onOpenChange={(o) => {
                        setApproveOpen(o);
                        if (!o) setApproveError(null);
                    }}
                    trigger={<Button variant="primary">Approve this concept</Button>}
                    title="Approve concept 2?"
                    description="Approval is final."
                    acknowledgement="I understand the other concepts will be archived"
                    confirmLabel="Approve this concept"
                    pendingLabel="Approving…"
                    pending={approving}
                    error={approveError}
                    onConfirm={() => {
                        setApproving(true);
                        window.setTimeout(() => {
                            setApproving(false);
                            setApproveError('We couldn’t approve the concept. Try again in a minute.');
                        }, 1200);
                    }}
                >
                    <ul className="list-disc pl-6">
                        <li>The other concepts are archived.</li>
                        <li>Your designer prepares the final files.</li>
                    </ul>
                </ConfirmDialog>
                <ConfirmDialog
                    open={resetOpen}
                    onOpenChange={setResetOpen}
                    trigger={
                        <Button variant="danger" icon={<RotateCcw {...ICON} />}>
                            Reset project
                        </Button>
                    }
                    tone="danger"
                    title="Reset Northvale Coffee?"
                    description="This can't be undone."
                    confirmPhrase="RESET"
                    confirmLabel="Reset project"
                    pendingLabel="Resetting…"
                    onConfirm={() => setResetOpen(false)}
                >
                    <ul className="list-disc pl-6">
                        <li>All concepts, revisions and messages are deleted.</li>
                        <li>The customer is sent back to the brief.</li>
                    </ul>
                </ConfirmDialog>
            </Row>
            <Row label="Menu">
                <Menu
                    trigger={
                        <Button variant="secondary" icon={<Ellipsis {...ICON} />}>
                            Project actions
                        </Button>
                    }
                >
                    <MenuLabel>Northvale Coffee</MenuLabel>
                    <MenuItem icon={<Pencil {...ICON} />} onSelect={() => undefined}>
                        Edit details
                    </MenuItem>
                    <MenuItem icon={<Settings {...ICON} />} href="#overlays">
                        Settings
                    </MenuItem>
                    <MenuItem disabled onSelect={() => undefined}>
                        Archive (not yet)
                    </MenuItem>
                    <MenuSeparator />
                    <MenuItem tone="danger" icon={<Trash2 {...ICON} />} onSelect={() => undefined}>
                        Cancel project
                    </MenuItem>
                </Menu>
            </Row>
            <Row label="Sheet (phone)">
                <Sheet trigger={<Button variant="secondary">Open sheet</Button>} title="Account">
                    <Button variant="ghost" width="full" icon={<Settings {...ICON} />}>
                        Account settings
                    </Button>
                    <Button variant="ghost" width="full" icon={<LogOut {...ICON} />}>
                        Sign out
                    </Button>
                </Sheet>
            </Row>
        </Section>
    );
}

function Feedback() {
    const toast = useToast();
    return (
        <Section id="feedback" title="Toasts and inline alerts">
            <Row label="Toast">
                <Button variant="secondary" onClick={() => toast.success('Message sent. Your designer usually replies within a day.')}>
                    Show success toast
                </Button>
                <Button variant="secondary" onClick={() => toast.error('We couldn’t send your message. Check your connection and try again.')}>
                    Show error toast
                </Button>
            </Row>
            <div className="flex flex-col gap-3">
                <InlineAlert tone="info" title="Confirming your purchase…">
                    This usually takes a few seconds. You can keep using the portal.
                </InlineAlert>
                <InlineAlert tone="success" title="Purchase confirmed">
                    You now have 3 revisions.
                </InlineAlert>
                <InlineAlert
                    tone="warning"
                    title="Project paused"
                    action={
                        <Link href="#feedback" variant="standalone">
                            Contact us
                        </Link>
                    }
                >
                    Your designer is waiting on a reply from you.
                </InlineAlert>
                <InlineAlert tone="danger" title="Payment failed">
                    Your card was declined. No money was taken.
                </InlineAlert>
                <InlineAlert tone="info">A short alert with no title.</InlineAlert>
            </div>
        </Section>
    );
}
