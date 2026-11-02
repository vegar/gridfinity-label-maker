import { useEffect, useRef } from "react";
import { entryDate, entryHref, type WhatsNewEntry } from "../whatsNew";

interface Props {
  entries: WhatsNewEntry[];
  /** Called however the dialog is closed: the button, Escape, or following a link. */
  onClose: () => void;
}

/** One line per new feature, each linking to its section on the features page. */
export function WhatsNew({ entries, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
    // Start on the button, not the first "Read more" link.
    d?.querySelector<HTMLButtonElement>("button.primary")?.focus();
  }, []);

  return (
    <dialog ref={dialog} className="clone-dialog whats-new" onClose={onClose}>
      <form method="dialog">
        <h2>What's new</h2>
        <ul>
          {entries.map((e) => (
            <li key={e.at}>
              <time dateTime={e.at}>{entryDate(e.at)}</time>
              <span>
                {e.text}{" "}
                <a href={entryHref(e)} onClick={() => dialog.current?.close()}>
                  Read more
                </a>
              </span>
            </li>
          ))}
        </ul>
        <div className="dialog-actions">
          <button type="submit" className="primary">
            Got it
          </button>
        </div>
      </form>
    </dialog>
  );
}
