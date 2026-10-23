import { useState } from 'preact/hooks';
import { Field, Modal } from '../../app/ui';
import { type Book, FORMAT_LABELS } from '../../data/models';
import { saveBook } from '../../data/store';
import { type Calibration, type EffectiveWordCount, formatDuration, parseDuration, wordsFromSample } from './logic';

const SOURCE_LABEL = { 'looked-up': 'Looked up', sampled: 'Sampled', audiobook: 'Audiobook', estimated: 'Estimated' } as const;

export function WordCountCard({
  book,
  effective,
  calibration,
}: {
  book: Book;
  effective: EffectiveWordCount | null;
  calibration: Calibration;
}) {
  const [dialog, setDialog] = useState<null | 'lookup' | 'sample' | 'audio'>(null);
  const cal = calibration.pages[book.format ?? 'unknown'];
  const audio = calibration.audio;
  const pages = book.bodyPages ?? book.pageCount;

  return (
    <section class="card">
      <h2>Word count</h2>
      {effective ? (
        <p>
          <span class="big-number">{effective.value.toLocaleString()}</span> words{' '}
          <span class={`source source-${effective.source}`}>{SOURCE_LABEL[effective.source]}</span>
        </p>
      ) : (
        <p class="muted">Unknown. Add a page count to get an estimate, or count it below.</p>
      )}
      {effective?.source === 'estimated' && !book.wordCount && (
        <p class="tiny muted">
          {pages} {book.bodyPages ? 'body ' : ''}pages × {cal.wordsPerPage} words per page (
          {cal.basis === 'own'
            ? `average of your ${cal.books} counted ${FORMAT_LABELS[book.format!].toLowerCase()} books`
            : cal.basis === 'all'
              ? `average of your ${cal.books} counted books`
              : 'default'}
          ). Rough; set the format and count a few books to improve it.
        </p>
      )}
      {effective?.source === 'audiobook' && (
        <p class="tiny muted">
          {formatDuration(book.audioMinutes!)} unabridged audiobook × {audio.wordsPerMinute} words per minute (
          {audio.basis === 'own' ? `average of your ${audio.books} counted books with audiobook lengths` : 'typical narration speed'}
          ). Usually within about 10%.
        </p>
      )}
      {book.audioMinutes && effective?.source !== 'audiobook' && (
        <p class="tiny muted">Audiobook: {formatDuration(book.audioMinutes)} unabridged.</p>
      )}
      <div class="actions">
        <button onClick={() => setDialog('sample')}>Sample this book</button>
        <button onClick={() => setDialog('audio')}>{book.audioMinutes ? 'Edit audiobook length' : 'Audiobook length'}</button>
        <button onClick={() => setDialog('lookup')}>Enter looked-up count</button>
        {book.wordCount && (
          <button class="link" onClick={() => saveBook({ ...book, wordCount: null })}>
            Clear (use estimate)
          </button>
        )}
      </div>

      {dialog === 'lookup' && <LookupDialog book={book} onClose={() => setDialog(null)} />}
      {dialog === 'sample' && <SampleDialog book={book} onClose={() => setDialog(null)} />}
      {dialog === 'audio' && <AudioDialog book={book} onClose={() => setDialog(null)} />}
    </section>
  );
}

function LookupDialog({ book, onClose }: { book: Book; onClose: () => void }) {
  const [value, setValue] = useState(book.wordCount?.source === 'looked-up' ? String(book.wordCount.value) : '');
  const n = Number(value);
  return (
    <Modal title="Looked-up word count" onClose={onClose}>
      <p class="muted">From an outside source that lists this book's word count.</p>
      <Field label="Words">
        <input inputMode="numeric" value={value} autoFocus onInput={(e) => setValue(e.currentTarget.value.replace(/\D/g, ''))} />
      </Field>
      <div class="form-actions">
        <button
          class="primary"
          disabled={!(n > 0)}
          onClick={async () => {
            await saveBook({ ...book, wordCount: { value: n, source: 'looked-up' } });
            onClose();
          }}
        >
          Save
        </button>
      </div>
    </Modal>
  );
}

function SampleDialog({ book, onClose }: { book: Book; onClose: () => void }) {
  const [fiveLines, setFiveLines] = useState('');
  const [lines, setLines] = useState('');
  const [body, setBody] = useState(String(book.bodyPages ?? book.pageCount ?? ''));
  const digits = (s: string) => s.replace(/\D/g, '');
  const [w, l, b] = [Number(fiveLines), Number(lines), Number(body)];
  const result = w > 0 && l > 0 && b > 0 ? wordsFromSample(w, l, b) : null;

  return (
    <Modal title="Sample this book" onClose={onClose}>
      <ol class="sample-steps">
        <li>
          <Field label="Words on 5 full lines" hint="Pick a typical page and count 5 lines of body text.">
            <input inputMode="numeric" value={fiveLines} autoFocus onInput={(e) => setFiveLines(digits(e.currentTarget.value))} />
          </Field>
        </li>
        <li>
          <Field label="Lines on a full page">
            <input inputMode="numeric" value={lines} onInput={(e) => setLines(digits(e.currentTarget.value))} />
          </Field>
        </li>
        <li>
          <Field label="Body pages" hint="First page of chapter 1 to the last page of text, leaving out front and back matter.">
            <input inputMode="numeric" value={body} onInput={(e) => setBody(digits(e.currentTarget.value))} />
          </Field>
        </li>
      </ol>
      <p>
        {result !== null ? (
          <>
            ≈ <span class="big-number">{result.toLocaleString()}</span> words
          </>
        ) : (
          <span class="muted">Words = (words ÷ 5) × lines per page × body pages</span>
        )}
      </p>
      <div class="form-actions">
        <button
          class="primary"
          disabled={result === null}
          onClick={async () => {
            await saveBook({ ...book, bodyPages: b, wordCount: { value: result!, source: 'sampled' } });
            onClose();
          }}
        >
          Save
        </button>
      </div>
    </Modal>
  );
}

function AudioDialog({ book, onClose }: { book: Book; onClose: () => void }) {
  const [text, setText] = useState(book.audioMinutes ? formatDuration(book.audioMinutes) : '');
  const [unabridged, setUnabridged] = useState(!!book.audioMinutes);
  const minutes = parseDuration(text);
  const valid = minutes !== null && minutes > 0 && unabridged;
  return (
    <Modal title="Audiobook length" onClose={onClose}>
      <p class="muted">
        From Audible, Libro.fm or your library app. Words are estimated from the length and a typical narration speed, which is
        calibrated once a few books have both a real count and an audiobook length.
      </p>
      <Field label="Length" hint="e.g. 10h 30m or 10:30">
        <input value={text} autoFocus placeholder="10h 30m" onInput={(e) => setText(e.currentTarget.value)} />
      </Field>
      <label class="check">
        <input type="checkbox" checked={unabridged} onChange={(e) => setUnabridged(e.currentTarget.checked)} />
        It's the unabridged edition
      </label>
      {text && minutes === null && <p class="error tiny">Couldn't read that length. Try 10h 30m or 10:30.</p>}
      {!unabridged && text && <p class="warn-text tiny">Abridged audiobooks leave out text, so they'd undercount.</p>}
      <div class="form-actions">
        {book.audioMinutes && (
          <button
            onClick={async () => {
              await saveBook({ ...book, audioMinutes: null });
              onClose();
            }}
          >
            Remove
          </button>
        )}
        <button
          class="primary"
          disabled={!valid}
          onClick={async () => {
            await saveBook({ ...book, audioMinutes: minutes });
            onClose();
          }}
        >
          Save
        </button>
      </div>
    </Modal>
  );
}
