/**
 * `@underglass/ui/vue`: Strata components for Vue 3.5. Each renders exactly the markup contract on its anatomy page
 * (`docs/ui-library/components`), lets attributes and listeners fall through to its native element (choice controls:
 * `class` and `style` to the label row, the rest to the input), and supports `v-model` where a native control has a
 * value. Same components, props and markup as `@underglass/ui/react`.
 */
export { Button, ButtonGroup, IconButton, Link, ToggleButton } from "./buttons.ts";
export { Checkbox, Radio, RadioGroup, Switch } from "./choices.ts";
export type { StrataSwitchForm } from "../shared/switch-forms.ts";
export { Badge, Card, Divider, Panel, ProgressBar, Spinner } from "./display.ts";
export { Dialog, Drawer } from "./overlays.ts";
export { Field, Select, Slider, TextArea, TextField } from "./fields.ts";
export { Lamp } from "./lamp.ts";
export { StatusLight } from "./status-light.ts";
export type { StrataLampColour } from "../shared/lamp.ts";
export type { StatusLive, StrataBlink } from "../shared/status-light.ts";
export { Knob } from "./knob.ts";
export type { KnobMark } from "../shared/knob.ts";
export { Combobox } from "./combobox.ts";
export type { ComboboxOption } from "./combobox.ts";
export { DatePicker } from "./date-picker.ts";
export { Fader } from "./fader.ts";
export type { FaderMark, FaderOrientation } from "../shared/fader.ts";
export { Meter } from "./meter.ts";
export { Gauge } from "./gauge.ts";
export type { MeterMark, StrataMeterForm } from "../shared/meter.ts";
export { StrataProvider, StrataScope } from "./provider.ts";
export { Tab, TabList, TabPanel, Tabs } from "./tabs.ts";
export { Accordion, AccordionItem } from "./accordion.ts";
export { List, ListItem } from "./list.ts";
export { Avatar } from "./avatar.ts";
export { Chip } from "./chip.ts";
export { SegmentedControl } from "./segmented.ts";
export type { SegmentedOption } from "./segmented.ts";
export { Rating, RatingDisplay } from "./rating.ts";
export { Stepper } from "./stepper.ts";
export { NavigationRail } from "./navigation-rail.ts";
export type { NavigationRailItem } from "./navigation-rail.ts";
export { TreeView } from "./tree.ts";
export type { TreeNode } from "./tree.ts";
export { Carousel } from "./carousel.ts";
export { Skeleton } from "./skeleton.ts";
export { MessageBar } from "./message-bar.ts";
export { Pagination } from "./pagination.ts";
export { Toolbar } from "./toolbar.ts";
export { AppBar } from "./app-bar.ts";
export { Tooltip } from "./tooltip.ts";
export { Popover } from "./popover.ts";
export { Menu } from "./menu.ts";
export type { MenuEntry } from "./menu.ts";
/** Shows a toast (anatomy page `toast.md`): `showStrataToast` from `@underglass/ui/dom`. */
export { showStrataToast as toast } from "../dom/toast.ts";
export type { ToastHandle, ToastOptions } from "../dom/toast.ts";
export type { MessageIntent } from "../shared/message.ts";
export { Breadcrumb } from "./breadcrumb.ts";
export type { BreadcrumbItem } from "./breadcrumb.ts";
export { Table } from "./table.ts";
export type { SortDirection, TableColumn, TableRow, TableSort } from "../shared/table.ts";
export { useStrataGpu } from "./gpu.ts";
export type { FieldControl } from "./shared.ts";
export { Display } from "./readout.ts";
export type { StrataDisplayBacklight, StrataDisplayLive, StrataTextForm } from "../shared/display.ts";
