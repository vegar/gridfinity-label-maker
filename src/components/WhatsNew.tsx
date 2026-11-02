import { useEffect, useRef } from "react";
import { entryDate, entryHref, type WhatsNewEntry } from "../whatsNew";

interface Props {
  /** The new features to list; without them the dialog welcomes a first-time visitor. */
  entries?: WhatsNewEntry[];
  /** Called however the dialog is closed: the button, Escape, or following a link. */
  onClose: () => void;
}

/**
 * One line per new feature, each linking to its section on the features page,
 * or a welcome pointing a first-time visitor to the features and about pages.
 */
export function WhatsNew({ entries, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
    // Start on the button, not the first "Read more" link.
    d?.querySelector<HTMLButtonElement>("button.primary")?.focus();
  }, []);

  const close = () => dialog.current?.close();

  return (
    <dialog ref={dialog} className="clone-dialog whats-new" onClose={onClose}>
      <form method="dialog">
        {entries ? (
          <>
            <h2>What's new</h2>
            <ul>
              {entries.map((e) => (
                <li key={e.at}>
                  <time dateTime={e.at}>{entryDate(e.at)}</time>
                  <span>
                    {e.text}{" "}
                    <a href={entryHref(e)} onClick={close}>
                      Read more
                    </a>
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <h2>Welcome</h2>
            <p>
              Design Gridfinity bin labels for Cullenect, pred and USSA Vault holders, with text and fastener
              symbols, and download them ready for multi-colour printing. Your labels are saved in this browser.
            </p>
            <p>
              See <a href="#features" onClick={close}>Features</a> for everything the label maker can do and
              which holders it supports, and <a href="#about" onClick={close}>About</a> for credits and the
              choices behind it.
            </p>
          </>
        )}
        <div className="dialog-actions">
          <button type="submit" className="primary">
            {entries ? "Got it" : "Start making labels"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
