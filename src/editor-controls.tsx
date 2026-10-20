import { Children, cloneElement, createContext, isValidElement, useContext, useId, type InputHTMLAttributes, type ReactElement, type ReactNode } from 'react'
import { Button } from './components/ui/button'
import { Slider } from './components/ui/slider'
import { Select, SelectContent, SelectItem, SelectTrigger } from './components/ui/select'
import { InputField, InputGroup } from './components/ui/input-group'
import { ColorPickerPopover } from './components/ui/color-picker'
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from './components/ui/accordion'
import { Banner, BannerTitle, BannerDescription } from './components/ui/banner'
import { Switch } from './components/ui/switch'
import { Tabs, TabsList, TabItem } from './components/ui/tabs'
import { AlignLeft, AlignCenter, AlignRight } from 'lucide-react'

const FieldContext = createContext({ label: '', id: '' })

export function Field({ label, children }: { label: string; children: ReactNode }) {
  const id = useId()
  return <FieldContext.Provider value={{ label, id }}><div className="field" role="group" aria-labelledby={id}>
    <span id={id}>{label}</span>
    {Children.map(children, child => isValidElement(child) && child.type === 'textarea'
      ? cloneElement(child as ReactElement, { 'aria-labelledby': id }) : child)}
  </div></FieldContext.Provider>
}

type ValueEvent = { target: { value: string } }
interface EditorInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value?: string | number
  onChange?: (event: ValueEvent) => void
}

export function EditorInput({ value, onChange, ...props }: EditorInputProps) {
  const { label } = useContext(FieldContext)
  return <InputGroup className="w-full"><InputField index={0} label={label || props['aria-label'] || 'Valeur'} labelHidden
    value={String(value ?? '')} onChange={value => onChange?.({ target: { value } })} {...props} /></InputGroup>
}

interface EditorSelectProps {
  value: string | number
  onChange: (event: ValueEvent) => void
  children: ReactNode
}

// Radix reserves the empty string for a placeholder. Preserve the document's
// empty "inherit font" value with a UI-only sentinel, never stored in MJML.
const inheritOption = '__postcraft_inherit__'
export function EditorSelect({ value, onChange, children }: EditorSelectProps) {
  const { label, id } = useContext(FieldContext)
  const options = Children.toArray(children).filter(isValidElement) as ReactElement<{ value?: string; children: ReactNode }>[]
  return <Select value={String(value) || inheritOption} onValueChange={value => onChange({ target: { value: value === inheritOption ? '' : value } })}>
    <SelectTrigger className="w-full min-w-0" aria-label={label} aria-labelledby={id || undefined} />
    <SelectContent>{options.map((option, index) => {
      const optionValue = String(option.props.value ?? option.props.children)
      return <SelectItem key={optionValue} index={index} value={optionValue || inheritOption}>{option.props.children}</SelectItem>
    })}</SelectContent>
  </Select>
}

export function NumberField({ label, value, onChange, min = 0, max = 100, unit = 'px', step = 1 }: {
  label: string; value: unknown; onChange: (value: number) => void; min?: number; max?: number; unit?: string; step?: number
}) {
  return <div className="field editor-number-field"><Slider size="compact" label={label} value={Number(value ?? 0)}
    min={min} max={max} step={step} valuePosition="top" formatValue={value => `${value} ${unit}`}
    onChange={value => onChange(value as number)} /></div>
}

const swatches = ['#171717', '#737373', '#ffffff', '#ef4444', '#f59e0b', '#22c55e', '#3b82f6']
export function ColorInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { label } = useContext(FieldContext)
  const transparent = value === 'transparent'
  return <div className="editor-color-picker" role="group" aria-label={label}>
    <ColorPickerPopover value={transparent ? '#ffffff00' : value} defaultFormat="hex" swatches={swatches}
      onValueChange={(_, parsed) => onChange(parsed.a === 0 ? 'transparent' : parsed.hex)}
      triggerLabel={transparent ? 'Transparent' : undefined} triggerLabelPosition="right" triggerShowValue={!transparent}
      triggerClassName="w-full justify-start" />
  </div>
}

export function OptionalColorInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <div className="optional-color"><ColorInput value={value} onChange={onChange} />
    <Button variant="tertiary" active={value === 'transparent'} onClick={() => onChange('transparent')}>Aucun</Button>
  </div>
}

export function SettingsSection({ title, children, className = '' }: { title: ReactNode; children: ReactNode; className?: string }) {
  return <Accordion type="single" collapsible defaultValue="settings" className={`editor-settings-section ${className}`}>
    <AccordionItem value="settings"><AccordionTrigger>{title}</AccordionTrigger>
      <AccordionContent><div className="editor-section-content">{children}</div></AccordionContent>
    </AccordionItem>
  </Accordion>
}

export function EditorMessage({ title, children, status = 'default' }: { title?: ReactNode; children?: ReactNode; status?: 'default' | 'success' | 'warning' | 'error' }) {
  return <Banner status={status} className="editor-message w-auto">
    {title && <BannerTitle>{title}</BannerTitle>}
    {children && <BannerDescription>{children}</BannerDescription>}
  </Banner>
}

export function FullWidthControl({ value, onChange }: { value: string; onChange: (event: ValueEvent) => void }) {
  return <div className="field"><Switch label="Pleine largeur" checked={value === 'true'} onToggle={() => onChange({ target: { value: value === 'true' ? 'false' : 'true' } })} /></div>
}

export function AlignmentControl({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <Tabs value={value} onValueChange={onChange} size="compact" className="alignment-control">
    <TabsList className="flex w-full" aria-label="Alignement du texte">
      <TabItem value="left" icon={AlignLeft} label="Gauche" aria-label="Aligner à gauche" title="Aligner à gauche" className="flex-1 justify-center [&>span]:hidden" />
      <TabItem value="center" icon={AlignCenter} label="Centre" aria-label="Centrer le texte" title="Centrer le texte" className="flex-1 justify-center [&>span]:hidden" />
      <TabItem value="right" icon={AlignRight} label="Droite" aria-label="Aligner à droite" title="Aligner à droite" className="flex-1 justify-center [&>span]:hidden" />
    </TabsList>
  </Tabs>
}
