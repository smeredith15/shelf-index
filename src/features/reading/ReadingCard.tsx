import { useState } from 'preact/hooks';
import { Field, Modal } from '../../app/ui';
import { useLive } from '../../data/hooks';
import type { Book, Session } from '../../data/models';
import {
  addPastRead,
  deleteSession,
  endReading,
  liveSessions,
  logProgress,
  pauseReading,
  resumeReading,
  startReading,
  updateSession,
} from '../../data/reading';
import { saveBook } from '../../data/store';
import { formatDate, today } from './dates';
import { currentPage, isPaused, pace, readingDays, sessionsFor } from './logic';

const OUTCOME_LABEL = { finished: 'Finished', dnf: 'Did not finish', reading: 'Reading' } as const;

/** Start, pause, resume, finish or DNF a book, log progress, and see every read of it. */
export function ReadingCard({ book, words }: { book: Book; words: number | null }) {
  const all = useLive(liveSessions);
  const [dialog, setDialog] = useState<null | 'finish' | 'dnf' | 'progress' | 'past' | 'start'>(null);
  const [editing, setEditing] = useState<Session | null>(null);
  if (!all) return null;

  const sessions = sessionsFor(all, book.id);
  const open = sessions.find((s) => s.end === null);
  const finishedBefore = sessions.some((s) => s.outcome === 'finished');

  return (
    <section class="card reading-card">
      <h2>Reading</h2>

      {open ? (
        <>
          <p>
            {isPaused(open) ? <strong>Paused</strong> : <strong>Reading</strong>} since {formatDate(open.start)} · day{' '}
            {readingDays(open)}
            {currentPage(open) !== null && (
              <>
                {' '}
                · page {currentPage(open)}
                {book.pageCount ? ` of ${book.pageCount}` : ''}
              </>
            )}
          </p>
          {book.pageCount && currentPage(open) !== null && (
            <div class="progress-bar">
              <div style={{ width: `${Math.min(100, (100 * currentPage(open)!) / book.pageCount)}%` }} />
            </div>
          )}
          <div class="actions">
            <button class="primary" onClick={() => setDialog('progress')}>
              Log progress
            </button>
            {isPaused(open) ? (
              <button onClick={() => resumeReading(open)}>Resume</button>
            ) : (
              <button onClick={() => pauseReading(open)}>Pause</button>
            )}
            <button onClick={() => setDialog('finish')}>Finish</button>
            <button onClick={() => setDialog('dnf')}>DNF</button>
          </div>
        </>
      ) : (
        <div class="actions">
          <button class="primary" onClick={() => startReading(book)}>
            {finishedBefore ? 'Start a reread' : 'Start reading'}
          </button>
          <button onClick={() => setDialog('start')}>Started earlier…</button>
          <button onClick={() => setDialog('past')}>Add a past read</button>
        </div>
      )}

      {book.status === 'read' && !sessions.some((s) => s.outcome === 'finished' && s.end) && (
        <p class="notice undated-note">
          {book.datesUnknown ? (
            <>
              Read, dates unknown.{' '}
              <button class="link" onClick={() => saveBook({ ...book, datesUnknown: false })}>
                Undo
              </button>
            </>
          ) : (
            <>
              Marked Read, but with no dates it's left out of stats.{' '}
              <button class="link" onClick={() => setDialog('past')}>
                Add a past read
              </button>{' '}
              ·{' '}
              <button class="link" onClick={() => saveBook({ ...book, datesUnknown: true })}>
                I don't know the dates
              </button>
            </>
          )}
        </p>
      )}

      {sessions.length > 0 && (
        <ul class="sessions">
          {sessions.map((s, i) => {
            const p = pace(s, words, book);
            return (
              <li key={s.id}>
                <div>
                  <strong>{s.end ? OUTCOME_LABEL[s.outcome === 'dnf' ? 'dnf' : 'finished'] : OUTCOME_LABEL.reading}</strong>
                  {sessions.length > 1 && <span class="muted"> · read {sessions.length - i}</span>}
                  <div class="muted tiny">
                    {formatDate(s.start)} – {s.end ? formatDate(s.end) : 'now'} · {readingDays(s)} day
                    {readingDays(s) === 1 ? '' : 's'}
                    {s.pauses.length > 0 && ` (${s.pauses.length} pause${s.pauses.length === 1 ? '' : 's'})`}
                    {p !== null && ` · ${p.toLocaleString()} words/day`}
                  </div>
                </div>
                <button class="link" onClick={() => setEditing(s)}>
                  Edit
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {open && (dialog === 'finish' || dialog === 'dnf') && (
        <DateDialog
          title={dialog === 'finish' ? 'Finished on' : 'Stopped on'}
          min={open.start}
          action={dialog === 'finish' ? 'Mark finished' : 'Mark DNF'}
          onClose={() => setDialog(null)}
          onSubmit={async (date) => {
            await endReading(book, open, dialog === 'finish' ? 'finished' : 'dnf', date);
            setDialog(null);
          }}
        />
      )}
      {!open && dialog === 'start' && (
        <DateDialog
          title="Started on"
          action="Start reading"
          onClose={() => setDialog(null)}
          onSubmit={async (date) => {
            await startReading(book, date);
            setDialog(null);
          }}
        />
      )}
      {open && dialog === 'progress' && (
        <ProgressDialog book={book} session={open} onClose={() => setDialog(null)} />
      )}
      {dialog === 'past' && <PastReadDialog book={book} onClose={() => setDialog(null)} />}
      {editing && <EditSessionDialog session={editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

function DateDialog({
  title,
  action,
  min,
  onClose,
  onSubmit,
}: {
  title: string;
  action: string;
  min?: string;
  onClose: () => void;
  onSubmit: (date: string) => void;
}) {
  const [date, setDate] = useState(today());
  return (
    <Modal title={title} onClose={onClose}>
      <Field label="Date">
        <input type="date" value={date} min={min} max={today()} onInput={(e) => setDate(e.currentTarget.value)} />
      </Field>
      <div class="form-actions">
        <button class="primary" disabled={!date} onClick={() => onSubmit(date)}>
          {action}
        </button>
      </div>
    </Modal>
  );
}

function ProgressDialog({ book, session, onClose }: { book: Book; session: Session; onClose: () => void }) {
  const [page, setPage] = useState(String(currentPage(session) ?? ''));
  const [date, setDate] = useState(today());
  const n = Number(page);
  const valid = page !== '' && n > 0 && (!book.pageCount || n <= book.pageCount);
  return (
    <Modal title="Log progress" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid) return;
          await logProgress(session, n, date);
          onClose();
        }}
      >
        <div class="row-2">
          <Field label={book.pageCount ? `Page (of ${book.pageCount})` : 'Page'}>
            <input inputMode="numeric" value={page} autoFocus onInput={(e) => setPage(e.currentTarget.value.replace(/\D/g, ''))} />
          </Field>
          <Field label="Date">
            <input type="date" value={date} min={session.start} max={today()} onInput={(e) => setDate(e.currentTarget.value)} />
          </Field>
        </div>
        {session.progress.length > 0 && (
          <p class="tiny muted">
            Earlier: {session.progress.map((p) => `p. ${p.page} on ${formatDate(p.date)}`).join(' · ')}
          </p>
        )}
        <div class="form-actions">
          <button class="primary" disabled={!valid}>
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}

function PastReadDialog({ book, onClose }: { book: Book; onClose: () => void }) {
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [outcome, setOutcome] = useState<'finished' | 'dnf'>('finished');
  const valid = !!start && !!end && start <= end;
  return (
    <Modal title="Add a past read" onClose={onClose}>
      <div class="row-2">
        <Field label="Started">
          <input type="date" value={start} max={today()} onInput={(e) => setStart(e.currentTarget.value)} />
        </Field>
        <Field label="Ended">
          <input type="date" value={end} min={start} max={today()} onInput={(e) => setEnd(e.currentTarget.value)} />
        </Field>
      </div>
      <OutcomePicker value={outcome} onChange={setOutcome} />
      <div class="form-actions">
        <button
          class="primary"
          disabled={!valid}
          onClick={async () => {
            await addPastRead(book, start, end, outcome);
            onClose();
          }}
        >
          Add
        </button>
      </div>
    </Modal>
  );
}

function OutcomePicker({ value, onChange }: { value: 'finished' | 'dnf'; onChange: (v: 'finished' | 'dnf') => void }) {
  return (
    <div class="segmented">
      <button type="button" class={value === 'finished' ? 'active' : ''} onClick={() => onChange('finished')}>
        Finished
      </button>
      <button type="button" class={value === 'dnf' ? 'active' : ''} onClick={() => onChange('dnf')}>
        DNF
      </button>
    </div>
  );
}

/** Fix dates and pauses after the fact. Progress entries are kept as they are. */
function EditSessionDialog({ session, onClose }: { session: Session; onClose: () => void }) {
  const [s, setS] = useState(session);
  const pausesValid = s.pauses.every((p) => p.from >= s.start && (p.to === null || p.to >= p.from) && (!s.end || (p.to ?? s.end) <= s.end));
  const valid = !!s.start && (!s.end || s.end >= s.start) && pausesValid;
  return (
    <Modal title="Edit read" onClose={onClose}>
      <div class="row-2">
        <Field label="Started">
          <input type="date" value={s.start} max={today()} onInput={(e) => setS({ ...s, start: e.currentTarget.value })} />
        </Field>
        {s.end !== null && (
          <Field label="Ended">
            <input type="date" value={s.end} min={s.start} max={today()} onInput={(e) => setS({ ...s, end: e.currentTarget.value })} />
          </Field>
        )}
      </div>
      {s.end !== null && (
        <OutcomePicker value={s.outcome === 'dnf' ? 'dnf' : 'finished'} onChange={(outcome) => setS({ ...s, outcome })} />
      )}
      <h3>Pauses</h3>
      {s.pauses.length === 0 && <p class="muted tiny">None. Paused days don't count toward pace.</p>}
      {s.pauses.map((p, i) => (
        <div class="row-inline pause-row" key={i}>
          <input
            type="date"
            value={p.from}
            onInput={(e) => setS({ ...s, pauses: s.pauses.map((x, j) => (j === i ? { ...x, from: e.currentTarget.value } : x)) })}
          />
          <span>to</span>
          {p.to === null ? (
            <span class="muted">now</span>
          ) : (
            <input
              type="date"
              value={p.to}
              onInput={(e) => setS({ ...s, pauses: s.pauses.map((x, j) => (j === i ? { ...x, to: e.currentTarget.value } : x)) })}
            />
          )}
          <button class="ghost danger-text small" onClick={() => setS({ ...s, pauses: s.pauses.filter((_, j) => j !== i) })}>
            ✕
          </button>
        </div>
      ))}
      <button
        class="link"
        onClick={() => setS({ ...s, pauses: [...s.pauses, { from: s.start, to: s.end ?? today() }] })}
      >
        + Add pause
      </button>
      {!valid && <p class="error tiny">Check the dates: pauses must fall inside the read, and it can't end before it starts.</p>}
      <div class="form-actions">
        <button
          class="danger-text"
          onClick={async () => {
            if (!confirm('Delete this read?')) return;
            await deleteSession(session);
            onClose();
          }}
        >
          Delete read
        </button>
        <button
          class="primary"
          disabled={!valid}
          onClick={async () => {
            await updateSession(s);
            onClose();
          }}
        >
          Save
        </button>
      </div>
    </Modal>
  );
}
