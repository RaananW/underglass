/**
 * Tabs, TabList, Tab and TabPanel (anatomy page `tabs.md`): the WAI-ARIA Tabs pattern. `Tabs` holds the selection
 * (`value` or `defaultValue`, and `onChange`) and the ids; `TabList` takes the arrow keys, Home and End
 * (`strataTabTarget` from `@underglass/ui/dom`), moving focus and, with automatic activation, selecting.
 */
import { createContext, forwardRef, useContext, useId, useState, type ButtonHTMLAttributes, type HTMLAttributes, type KeyboardEvent, type ReactNode } from "react";
import { strataTabTarget, type TabsActivation } from "../dom/tabs.ts";
import { tabCap, tabLed, tabsForm, type StrataTabsForm } from "../shared/tabs-forms.ts";
import { classes, strataAttributes, type StrataProps } from "./shared.ts";

interface TabsContext {
  id: string;
  value?: string;
  select(value: string): void;
  orientation: "horizontal" | "vertical";
  activation: TabsActivation;
  form?: StrataTabsForm;
}

const TabsContext = createContext<TabsContext | undefined>(undefined);

function useTabs(part: string): TabsContext {
  const context = useContext(TabsContext);
  if (!context) throw new Error(`<${part}> must be inside <Tabs>`);
  return context;
}

export interface TabsProps extends Omit<HTMLAttributes<HTMLDivElement>, "onChange" | "defaultValue">, StrataProps {
  /** The base of the tab and panel ids (`{id}-tab-{value}`, `{id}-panel-{value}`); generated when absent. */
  id?: string;
  /** Controlled selection: the selected tab's value. */
  value?: string;
  /** Initial selection when uncontrolled. */
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** `vertical` stacks the tabs at the start, with Up and Down between them. */
  orientation?: "horizontal" | "vertical";
  /** `automatic` (default) selects the tab focus moves to; `manual` waits for Enter or Space. */
  activation?: TabsActivation;
  /**
   * `rail`: the tabs as latching keys on one rail, each with an LED that lights while its tab is selected, the panel the faceplate under
   * them (anatomy page `tabs.md`, section 11); the tablist, the tabs, the panels and the keys are the WAI-ARIA Tabs pattern, unchanged.
   * `flush` and no form are the flat tabs over a groove; a `<div>` has no native `form` attribute, so no other string is used.
   */
  form?: StrataTabsForm | "flush" | (string & {});
  children: ReactNode;
}

export const Tabs = forwardRef<HTMLDivElement, TabsProps>(function Tabs(
  { id, value, defaultValue, onChange, orientation = "horizontal", activation = "automatic", form, size, material, level, className, children, ...rest }, ref,
) {
  const rail = tabsForm(form);
  const generated = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [own, setOwn] = useState(defaultValue);
  const selected = value !== undefined ? value : own;
  const select = (next: string) => {
    if (next === selected) return;
    if (value === undefined) setOwn(next);
    onChange?.(next);
  };
  return (
    <div ref={ref} className={classes("ug-tabs", orientation === "vertical" && "ug-tabs--vertical", className)} {...(rail ? { "data-strata-form": rail } : {})} {...strataAttributes({ size, material, level })} {...rest}>
      <TabsContext.Provider value={{ id: id ?? `tabs-${generated}`, value: selected, select, orientation, activation, form: rail }}>{children}</TabsContext.Provider>
    </div>
  );
});

export interface TabListProps extends HTMLAttributes<HTMLDivElement> {
  /** The tablist's accessible name (`aria-label`); or give `aria-labelledby`. */
  label?: string;
  children: ReactNode;
}

export const TabList = forwardRef<HTMLDivElement, TabListProps>(function TabList({ label, className, children, onKeyDown, ...rest }, ref) {
  const tabs = useTabs("TabList");
  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const from = (event.target as Element).closest("[role='tab']");
    const target = from && strataTabTarget(from, event.key);
    if (!target) return;
    event.preventDefault();
    target.focus();
    // A click selects it, through the Tab's own handler.
    if (tabs.activation === "automatic") target.click();
  };
  return (
    <div ref={ref} className={classes("ug-tabs__list", className)} role="tablist" aria-label={label}
      aria-orientation={tabs.orientation === "vertical" ? "vertical" : undefined}
      data-strata-activation={tabs.activation === "manual" ? "manual" : undefined} {...(tabs.form ? { "data-strata-face": "raised" } : {})} onKeyDown={keyDown} {...rest}>
      {!tabs.form && <span className="ug-tabs__rail" data-strata-face="groove" aria-hidden="true" />}
      {children}
    </div>
  );
});

export interface TabProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "value" | "type"> {
  value: string;
  children: ReactNode;
}

export const Tab = forwardRef<HTMLButtonElement, TabProps>(function Tab({ value, className, children, onClick, ...rest }, ref) {
  const tabs = useTabs("Tab");
  const selected = tabs.value === value;
  return (
    <button ref={ref} className={classes("ug-tab", className)} type="button" role="tab" id={`${tabs.id}-tab-${value}`} aria-selected={selected}
      aria-controls={`${tabs.id}-panel-${value}`} tabIndex={selected ? undefined : -1}
      onClick={event => { onClick?.(event); if (!event.defaultPrevented) tabs.select(value); }} {...rest}>
      {tabs.form
        ? <><span className={tabLed.className} data-strata-face={tabLed.face} aria-hidden="true" /><span className={tabCap.className} data-strata-face={tabCap.face}><span className="ug-tab__label">{children}</span></span></>
        : <><span className="ug-tab__label">{children}</span><span className="ug-tab__indicator" data-strata-face="mark" aria-hidden="true" /></>}
    </button>
  );
});

export interface TabPanelProps extends HTMLAttributes<HTMLDivElement> {
  value: string;
  children?: ReactNode;
}

export const TabPanel = forwardRef<HTMLDivElement, TabPanelProps>(function TabPanel({ value, className, children, ...rest }, ref) {
  const tabs = useTabs("TabPanel");
  return (
    <div ref={ref} className={classes("ug-tabs__panel", className)} role="tabpanel" id={`${tabs.id}-panel-${value}`} aria-labelledby={`${tabs.id}-tab-${value}`}
      tabIndex={0} hidden={tabs.value !== value} {...rest}>
      {children}
    </div>
  );
});
