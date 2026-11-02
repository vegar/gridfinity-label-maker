import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { Update } from "../components/labelOps";
import type { LabelState, Session } from "../state";
import type { Engine } from "../useEngine";
import type { BuildResult } from "../useLabels";
import type { Models } from "../useModels";

/** Everything the sidebar needs to show and edit the session. */
export interface SidebarProps {
  session: Session;
  setSession: Dispatch<SetStateAction<Session>>;
  /** The selected label. */
  state: LabelState;
  update: Update;
  engine?: Engine;
  builds: Map<string, BuildResult>;
  /** Label models the user uploaded. */
  models: Models;
  textDepth: number;
  maxDepth: number;
  /** The text had to shrink below a legible size. */
  shrunk: boolean;
  exportButtons: ReactNode;
}
