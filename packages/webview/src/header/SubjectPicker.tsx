/**
 * "subject: [Spyro ▾]" (D-10, docs/m1-plan.md 7.3): the model's subjects with their card counts, and "New
 * subject…" with an inline name field (a capitalised Lean identifier, not taken). Choosing a subject posts
 * `selectSubject`; creating one posts `createSubject` (the host then switches the board to it).
 */
import { isSubjectName, type ActionOutcome } from '@telelean/core';
import { useState, type FormEvent } from 'react';
import { Popover } from '../common/Popover';
import { useBoard, useBoardActions } from '../state/context';

export function subjectNameProblem(name: string, taken: readonly string[]): string | null {
  if (name === '') return null;
  if (!isSubjectName(name)) return 'Use a capitalised Lean identifier: a capital letter, then letters, digits or _ (e.g. Spyro).';
  if (taken.includes(name)) return `There is already a subject called ${name}.`;
  return null;
}

export function SubjectPicker() {
  const subject = useBoard((s) => s.subject);
  const workspace = useBoard((s) => s.workspace);
  const actions = useBoardActions();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!workspace) {
    // An older host (or the static sample) sends no workspace state: just name the subject.
    return (
      <span className="tl-toolbar__subject" data-testid="subject">
        {subject || 'no subject'}
      </span>
    );
  }

  const taken = workspace.subjects.map((s) => s.name);
  const problem = subjectNameProblem(name, taken);
  const close = () => {
    setAnchor(null);
    setCreating(false);
    setName('');
    setError(null);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name || problem || busy) return;
    setBusy(true);
    actions.createSubject(name, (outcome: ActionOutcome) => {
      setBusy(false);
      if (outcome.ok) close();
      else setError(outcome.error);
    });
  };

  return (
    <>
      <span className="tl-toolbar__label">subject:</span>
      <button
        type="button"
        className="tl-menu-button"
        data-testid="subject-picker"
        aria-haspopup="menu"
        aria-expanded={anchor !== null}
        onClick={(event) => (anchor ? close() : setAnchor(event.currentTarget))}
      >
        <span data-testid="subject">{subject || workspace.subject}</span>
        <span className="codicon codicon-chevron-down" aria-hidden="true" />
      </button>
      <Popover anchor={anchor} open={anchor !== null} onClose={close} label="Subjects" testId="subject-menu" className="tl-menu">
        <div role="menu" aria-label="Subjects">
          {workspace.subjects.map((entry) => (
            <button
              key={entry.name}
              type="button"
              role="menuitemradio"
              aria-checked={entry.name === subject}
              className="tl-menu__item"
              data-subject={entry.name}
              onClick={() => {
                close();
                actions.selectSubject(entry.name);
              }}
            >
              <span className={`codicon codicon-${entry.name === subject ? 'check' : 'blank'}`} aria-hidden="true" />
              <span className="tl-menu__text">{entry.name}</span>
              <span className="tl-menu__hint">
                {entry.nodeCount} card{entry.nodeCount === 1 ? '' : 's'}
              </span>
            </button>
          ))}
        </div>
        <div className="tl-menu__separator" />
        {creating ? (
          <form className="tl-menu__form" onSubmit={submit}>
            <input
              className="tl-input"
              aria-label="New subject name"
              placeholder="Name, e.g. Bayonetta"
              value={name}
              autoFocus
              maxLength={64}
              onChange={(event) => {
                setName(event.target.value.trim());
                setError(null);
              }}
            />
            <button type="submit" className="tl-button tl-button--small" disabled={!name || problem !== null || busy}>
              Create
            </button>
            {problem || error ? (
              <p className="tl-menu__error" role="alert">
                {problem ?? error}
              </p>
            ) : null}
          </form>
        ) : (
          <button type="button" className="tl-menu__item" onClick={() => setCreating(true)}>
            <span className="codicon codicon-add" aria-hidden="true" />
            <span className="tl-menu__text">New subject…</span>
          </button>
        )}
      </Popover>
    </>
  );
}
