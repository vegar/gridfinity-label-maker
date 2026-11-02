import { useState } from "react";
import type { ManifoldToplevel } from "manifold-3d";
import { BASE_KINDS, baseInfo, type BaseKind } from "../bases";
import { KNOWN_SYSTEMS } from "../knownModels";
import { CloneDialog } from "../components/CloneDialog";
import { holderPatch, MIN_LEGIBLE_CAP_HEIGHT } from "../components/labelOps";
import { SymbolIcon, TextIcon } from "../components/Icons";
import {
  ALIGN_OPTIONS,
  HEAD_LABELS,
  MODIFIER_LABELS,
  NUT_TYPES,
  moveSegment,
  newSegment,
  removeSegment,
  replaceSegment,
  segmentName,
  segmentSummary,
} from "../components/segmentOps";
import { isText, type Segment, type Weight } from "../label";
import {
  addLabel,
  blankLabel,
  cloneLabel,
  labelTitle,
  removeLabel,
  segmentColor,
  updateLabel,
  type LabelState,
} from "../state";
import {
  DRIVES,
  SYMBOLS,
  type Drive,
  symbolInfo,
  symbolModifiers,
  type LabelSymbol,
  type NutView,
  type ScrewStyle,
  type ScrewView,
  type SymbolKind,
} from "../symbols";
import { AddSegmentMenu } from "./AddSegmentMenu";
import {
  Category,
  Check,
  IconCheck,
  IconSelect,
  Note,
  NumberInput,
  Prop,
  PropertyGrid,
  Select,
  type IconOption,
} from "./PropertyGrid";
import type { SidebarProps } from "./types";
import { useSegmentSelection } from "./useSegmentSelection";

/**
 * A compact outline of labels and segments, one line each, above a classic
 * property grid: names on the left, dropdowns and number boxes on the right.
 */
export function Sidebar(props: SidebarProps) {
  const { session, setSession, state, update, engine } = props;
  const [segment, selectSegment] = useSegmentSelection(state);
  const [cloning, setCloning] = useState<LabelState>();
  const selectLabel = (id: string, index?: number) => {
    setSession((s) => ({ ...s, selected: id }));
    selectSegment(index, id);
  };
  const setSegments = (segments: Segment[]) => update({ segments });

  return (
    <>
      <section>
        <h2>
          Structure <small>({session.labels.length} labels)</small>
        </h2>
        <ul className="outline">
          {session.labels.map((label) => {
            const current = label.id === state.id;
            return (
              <li key={label.id}>
                <div className="outline-row" aria-selected={current && segment === undefined}>
                  <button type="button" className="outline-pick" onClick={() => selectLabel(label.id)}>
                    <span className="swatch" style={{ background: label.baseColor, color: label.textColor }}>
                      {label.base === "custom" ? "File" : `${label.units}U`}
                    </span>
                    <span className="label-title">{labelTitle(label)}</span>
                  </button>
                  <div className="row-actions">
                    <button type="button" title="Clone into a table of copies" onClick={() => setCloning(label)}>
                      ⧉
                    </button>
                    <button
                      type="button"
                      title="Remove label"
                      disabled={session.labels.length === 1}
                      onClick={() => setSession((s) => removeLabel(s, label.id))}
                    >
                      ✕
                    </button>
                  </div>
                </div>
                {current && (
                  <ul>
                    {label.segments.map((seg, i) => (
                      <li key={i}>
                        <div
                          className={`outline-row child${seg.stack && i > 0 ? " stacked" : ""}`}
                          aria-selected={segment === i}
                        >
                          <button type="button" className="outline-pick" onClick={() => selectLabel(label.id, i)}>
                            {isText(seg) ? <TextIcon /> : engine && <SymbolIcon wasm={engine.wasm} symbol={seg} />}
                            <span className="label-title">{isText(seg) ? segmentSummary(seg) : segmentName(seg)}</span>
                          </button>
                          <div className="row-actions">
                            <button
                              type="button"
                              title="Move left"
                              disabled={i === 0}
                              onClick={() => setSegments(moveSegment(label.segments, i, -1))}
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              title="Move right"
                              disabled={i === label.segments.length - 1}
                              onClick={() => setSegments(moveSegment(label.segments, i, 1))}
                            >
                              ↓
                            </button>
                            <button
                              type="button"
                              title="Remove segment"
                              onClick={() => setSegments(removeSegment(label.segments, i))}
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      </li>
                    ))}
                    <li className="child">
                      <AddSegmentMenu
                        wasm={engine?.wasm}
                        segments={label.segments}
                        onAdd={(seg) => {
                          setSegments([...label.segments, seg]);
                          selectSegment(label.segments.length);
                        }}
                      />
                    </li>
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
        <button type="button" className="add-label" onClick={() => setSession((s) => addLabel(s, blankLabel(state)))}>
          + Add label
        </button>
      </section>

      <section>
        <h2>
          Properties{" "}
          <small>{segment === undefined ? "Label" : `${segmentName(state.segments[segment])} ${segment + 1}`}</small>
        </h2>
        {segment === undefined ? <LabelGrid {...props} /> : <SegmentGrid {...props} index={segment} />}
      </section>

      <section className="export sticky">{props.exportButtons}</section>

      {cloning && (
        <CloneDialog
          source={cloning}
          wasm={engine?.wasm}
          onClone={(original, copies) =>
            setSession((s) => cloneLabel(updateLabel(s, cloning.id, { segments: original }), cloning.id, copies))
          }
          onClose={() => setCloning(undefined)}
        />
      )}
    </>
  );
}

function LabelGrid({ state, update, models, textDepth, maxDepth, shrunk }: SidebarProps) {
  const base = baseInfo(state.base);
  const size = base.size(state);
  const growing = state.segments.some((s) => s.grow);
  return (
    <PropertyGrid>
      <Category title="Label holder">
        <Prop name="Holder">
          <Select<BaseKind>
            value={state.base}
            options={BASE_KINDS.map((kind) => ({ value: kind, label: baseInfo(kind).name }))}
            onChange={(kind) => update(holderPatch(kind))}
          />
        </Prop>
        {state.base === "custom" ? (
          <ModelProps state={state} update={update} models={models} />
        ) : (
          <Prop name="Bin width">
            <Select
              value={state.units}
              disabled={base.oneSize}
              options={[1, 2, 3].map((u) => ({ value: u, label: `${u}U` }))}
              onChange={(units) => update({ units })}
            />
          </Prop>
        )}
        <Prop name="Size">
          <span className="readonly">
            {+size.width.toFixed(1)} × {+size.height.toFixed(1)} mm
          </span>
        </Prop>
        {state.base === "cullenect" && (
          <Prop name="Snap-fit channels" title="Channels on the back; 1U only">
            <Check checked={state.ribs} disabled={state.units !== 1} onChange={(ribs) => update({ ribs })} />
          </Prop>
        )}
      </Category>
      <Category title="Row">
        {!growing && (
          <Prop name="Row position" title="Where the row sits when no segment grows">
            <Select value={state.align} options={ALIGN_OPTIONS} onChange={(align) => update({ align })} />
          </Prop>
        )}
        {state.segments.length > 1 && (
          <Prop name="Gap" title="Space between segments, side by side and stacked">
            <NumberInput value={state.gap} min={0} max={5} step={0.1} onChange={(gap) => update({ gap })} />
          </Prop>
        )}
        {shrunk && <Note warn>Text was shrunk below {MIN_LEGIBLE_CAP_HEIGHT} mm to fit.</Note>}
      </Category>
      <Category title="Print">
        <Prop name="Style">
          <Select
            value={state.style}
            options={[
              { value: "embedded", label: "Flush" },
              { value: "raised", label: "Raised" },
            ]}
            onChange={(style) => update({ style })}
          />
        </Prop>
        <Prop name={state.style === "embedded" ? "Text depth" : "Text height"}>
          <NumberInput
            value={textDepth}
            min={0.1}
            max={maxDepth}
            step={0.1}
            onChange={(textDepth) => update({ textDepth })}
          />
        </Prop>
        <Prop name="Label colour">
          <input type="color" value={state.baseColor} onChange={(e) => update({ baseColor: e.target.value })} />
        </Prop>
        <Prop name="Default text colour" title="For text segments without their own colour">
          <input type="color" value={state.textColor} onChange={(e) => update({ textColor: e.target.value })} />
        </Prop>
        <Prop name="Default symbol colour" title="For symbol segments without their own colour">
          <input type="color" value={state.symbolColor} onChange={(e) => update({ symbolColor: e.target.value })} />
        </Prop>
      </Category>
    </PropertyGrid>
  );
}

/**
 * Pick, upload or turn over the label model for an uploaded-model holder.
 * Only known label files are accepted, and they stay in this browser.
 */
function ModelProps({ state, update, models }: Pick<SidebarProps, "state" | "update" | "models">) {
  const [error, setError] = useState<string>();
  const current = models.list.find((m) => m.hash === state.model);
  const upload = async (file: File | undefined) => {
    if (!file) return;
    setError(undefined);
    try {
      update({ model: await models.add(file) });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };
  return (
    <>
      {models.list.length > 0 && (
        <Prop name="Model">
          <Select
            value={current?.hash ?? ""}
            options={[
              ...(current ? [] : [{ value: "", label: "Choose…" }]),
              ...models.list.map((m) => ({ value: m.hash, label: m.name })),
            ]}
            onChange={(model) => model && update({ model })}
          />
        </Prop>
      )}
      <Prop name={models.list.length ? "Add model" : "Model"} title={`The original STL or 3MF, as it came from the designer. Supported: ${KNOWN_SYSTEMS.join(", ")}`}>
        <label className="file-button">
          Upload STL / 3MF…
          <input
            type="file"
            accept=".stl,.3mf"
            hidden
            onChange={(e) => {
              upload(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
      </Prop>
      {current && (
        <Prop name="Text side" title="Turn the label over if the text ends up on the back">
          <Select
            value={current.turned ? "back" : "front"}
            options={[
              { value: "front", label: "Front" },
              { value: "back", label: "Back (turned over)" },
            ]}
            onChange={(side) => models.setTurned(current.hash, side === "back")}
          />
        </Prop>
      )}
      {current && (
        <Prop name="Text area" title="The flat part of the face the text is fitted to">
          <span className="readonly">
            {+current.face.width.toFixed(1)} × {+current.face.height.toFixed(1)} mm
          </span>
        </Prop>
      )}
      {error && <Note warn>{error}</Note>}
      {!current && !error && (
        <Note>
          {state.model
            ? "This browser doesn't have the model this label was made with. Upload it again."
            : `Upload the original label file for your holder (supported: ${KNOWN_SYSTEMS.join(", ")}). It stays in your browser and is never sent anywhere.`}
        </Note>
      )}
    </>
  );
}

function SegmentGrid({ state, update, engine, index }: SidebarProps & { index: number }) {
  const seg = state.segments[index];
  const replace = (next: Segment) => update({ segments: replaceSegment(state.segments, index, next) });
  const wasm = engine?.wasm;
  const kinds: IconOption<"text" | SymbolKind>[] = [
    { value: "text", label: "Text", icon: <TextIcon /> },
    ...SYMBOLS.map((s) => ({
      value: s.kind,
      label: s.name,
      icon: wasm && <SymbolIcon wasm={wasm} symbol={s.defaults} />,
    })),
  ];
  return (
    <PropertyGrid>
      <Category title="Segment">
        <Prop name="Type">
          <IconSelect
            value={seg.kind}
            options={kinds}
            onChange={(kind) =>
              replace({ ...newSegment(kind, state.segments), grow: seg.grow, color: seg.color, stack: seg.stack })
            }
          />
        </Prop>
        {index > 0 && (
          <Prop name="Below previous" title="Stack under the segment before it, in one column, instead of beside it">
            <Check
              checked={!!seg.stack}
              onChange={(stack) => {
                const { stack: _, ...rest } = seg;
                replace(stack ? { ...rest, stack } : rest);
              }}
            />
          </Prop>
        )}
        <Prop name="Grow" title="Take a share of the spare width">
          <Check checked={!!seg.grow} onChange={(grow) => replace({ ...seg, grow })} />
        </Prop>
        <Prop name="Own colour" title={`Off uses the label's default ${isText(seg) ? "text" : "symbol"} colour`}>
          <span className="colour-override">
            <Check
              checked={seg.color !== undefined}
              onChange={(own) => {
                const { color, ...rest } = seg;
                replace(own ? { ...rest, color: segmentColor(state, seg) } : rest);
              }}
            />
            <input
              type="color"
              value={segmentColor(state, seg)}
              disabled={seg.color === undefined}
              onChange={(e) => replace({ ...seg, color: e.target.value })}
            />
          </span>
        </Prop>
        {isText(seg) && (
          <Prop name="Text">
            <textarea
              rows={2}
              spellCheck={false}
              value={seg.text}
              onChange={(e) => replace({ ...seg, text: e.target.value })}
            />
          </Prop>
        )}
        {isText(seg) && (
          <>
            <Prop name="Align" title="How the lines line up, and where the text sits when it grows">
              <Select value={seg.align} options={ALIGN_OPTIONS} onChange={(align) => replace({ ...seg, align })} />
            </Prop>
            <Prop name="Weight">
              <Select<Weight>
                value={seg.weight}
                options={[
                  { value: "regular", label: "Regular" },
                  { value: "bold", label: "Bold" },
                ]}
                onChange={(weight) => replace({ ...seg, weight })}
              />
            </Prop>
            <Prop name="Max letter height">
              <NumberInput
                value={seg.maxCapHeight}
                min={2}
                max={9}
                step={0.1}
                onChange={(maxCapHeight) => replace({ ...seg, maxCapHeight })}
              />
            </Prop>
          </>
        )}
        {!isText(seg) && (
          <>
            <Prop name="Height">
              <NumberInput
                value={seg.size}
                min={3}
                max={9.4}
                step={0.1}
                onChange={(size) => replace({ ...seg, size })}
              />
            </Prop>
            {seg.grow && (
              <Prop name="Align" title="Where the symbol sits in its share of the spare width">
                <Select value={seg.align} options={ALIGN_OPTIONS} onChange={(align) => replace({ ...seg, align })} />
              </Prop>
            )}
          </>
        )}
      </Category>
      {!isText(seg) && <SymbolRows wasm={wasm} sym={seg} onChange={(p) => replace({ ...seg, ...p })} />}
    </PropertyGrid>
  );
}

/**
 * The symbol's options as dropdowns and checkboxes.
 * Every choice shows a drawing of the symbol with that choice applied.
 */
function SymbolRows({
  wasm,
  sym,
  onChange,
}: {
  wasm?: ManifoldToplevel;
  sym: LabelSymbol;
  onChange: (patch: Partial<LabelSymbol>) => void;
}) {
  const info = symbolInfo(sym.kind);
  const isScrew = sym.kind === "screw";
  const view = isScrew ? (sym.view ?? "both") : undefined;
  const showsDrive = view !== "side";
  const drives = sym.drives ?? [];
  const pin = drives.includes("security") ? (["security"] as const) : [];
  const drive = sym.hexHead ? "hexhead" : (drives.find((d) => d !== "security") ?? "none");
  const nutType = sym.nutType ?? "regular";
  const modifiers = symbolModifiers(sym);
  const icon = (symbol: LabelSymbol) => wasm && <SymbolIcon wasm={wasm} symbol={symbol} />;
  /** The symbol as it would look with `patch`. */
  const preview = (patch: Partial<LabelSymbol>) => icon({ ...sym, ...patch });
  /** Just the drive, seen head on. */
  const driveIcon = (patch: Partial<LabelSymbol>) => icon({ kind: "screw", view: "drive", ...patch });

  return (
    <Category title={info.name}>
      {isScrew && (
        <>
          <Prop name="Style">
            <IconSelect<ScrewStyle>
              value={sym.style ?? "regular"}
              options={[
                { value: "regular", label: "Regular", icon: preview({ style: "regular" }) },
                { value: "cullenect", label: "Cullenect", icon: preview({ style: "cullenect" }) },
              ]}
              onChange={(style) => onChange({ style })}
            />
          </Prop>
          <Prop name="Show">
            <IconSelect<ScrewView>
              value={view!}
              options={[
                { value: "both", label: "Drive and side", icon: preview({ view: "both" }) },
                { value: "drive", label: "Drive only", icon: preview({ view: "drive" }) },
                { value: "side", label: "Side only", icon: preview({ view: "side" }) },
              ]}
              onChange={(view) => onChange({ view })}
            />
          </Prop>
        </>
      )}
      {sym.kind === "nut" && (
        <>
          <Prop name="Type">
            <IconSelect
              value={nutType}
              options={NUT_TYPES.map((t) => ({
                ...t,
                icon: icon({ kind: "nut", nutType: t.value, nutView: t.value === "lock" ? "side" : "top" }),
              }))}
              onChange={(nutType) => onChange({ nutType })}
            />
          </Prop>
          {nutType !== "square" && nutType !== "tnut" && (
            <Prop name="Show">
              <IconSelect<NutView>
                value={sym.nutView ?? "top"}
                options={[
                  { value: "both", label: "Top and side", icon: preview({ nutView: "both" }) },
                  { value: "top", label: "Top only", icon: preview({ nutView: "top" }) },
                  { value: "side", label: "Side only", icon: preview({ nutView: "side" }) },
                ]}
                onChange={(nutView) => onChange({ nutView })}
              />
            </Prop>
          )}
        </>
      )}
      {info.drives && showsDrive && (
        <>
          <Prop name="Drive">
            <IconSelect<string>
              value={drive}
              options={[
                { value: "none", label: "None", icon: driveIcon({ drives: [] }) },
                ...DRIVES.filter((d) => d.value !== "security").map((d) => ({
                  value: d.value as string,
                  label: d.label,
                  icon: driveIcon({ drives: [d.value] }),
                })),
                ...(isScrew ? [{ value: "hexhead", label: "Hex head bolt", icon: driveIcon({ hexHead: true }) }] : []),
              ]}
              onChange={(v) =>
                v === "hexhead"
                  ? onChange({ hexHead: true, drives: [] })
                  : onChange({ hexHead: false, drives: [...(v === "none" ? [] : [v as Drive]), ...pin] })
              }
            />
          </Prop>
          {!sym.hexHead && (
            <Prop name="Security pin">
              <IconCheck
                checked={drives.includes("security")}
                icon={driveIcon({ drives: [...drives.filter((d) => d !== "security"), "security"] })}
                onChange={(on) =>
                  onChange({
                    drives: [...drives.filter((d) => d !== "security"), ...(on ? (["security"] as const) : [])],
                  })
                }
              />
            </Prop>
          )}
        </>
      )}
      {info.headShapes && !sym.hexHead && view !== "drive" && (
        <Prop name="Head">
          <IconSelect
            value={sym.headShape ?? "pan"}
            options={info.headShapes.map((h) => ({
              value: h,
              label: HEAD_LABELS[h],
              icon: isScrew
                ? icon({ kind: "screw", style: sym.style, view: "side", headShape: h, tapping: sym.tapping })
                : icon({ kind: "bolt", headShape: h, length: 14, tapping: sym.tapping }),
            }))}
            onChange={(headShape) => onChange({ headShape })}
          />
        </Prop>
      )}
      {info.length && (
        <Prop name="Length">
          <NumberInput
            value={sym.length ?? 10}
            min={1}
            max={200}
            step={1}
            onChange={(length) => onChange({ length })}
          />
        </Prop>
      )}
      {modifiers.map((m) => (
        <Prop key={m} name={MODIFIER_LABELS[m]}>
          <IconCheck
            checked={!!sym[m]}
            // What the symbol looks like with this turned on; a side view shows it best.
            icon={preview({ [m]: true, ...(isScrew && { view: "side" }) })}
            onChange={(on) => onChange({ [m]: on })}
          />
        </Prop>
      ))}
      {!info.drives && !info.headShapes && !info.length && sym.kind !== "nut" && modifiers.length === 0 && (
        <Note>No options.</Note>
      )}
    </Category>
  );
}
