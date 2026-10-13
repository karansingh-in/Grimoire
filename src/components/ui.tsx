import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  Ref,
  TextareaHTMLAttributes,
} from "react"

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "quiet" | "danger" | "chip"
  children: ReactNode
}

export function Button({
  variant = "quiet",
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`ui-button ui-button--${variant} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

export function IconButton({
  label,
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string
  children: ReactNode
}) {
  return (
    <button
      aria-label={label}
      className={`icon-button ${className}`}
      title={label}
      {...props}
    >
      {children}
    </button>
  )
}

export function TextInput({
  className = "",
  ref,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  ref?: Ref<HTMLInputElement>
}) {
  return (
    <input
      autoComplete="off"
      className={`text-input ${className}`}
      ref={ref}
      {...props}
    />
  )
}

export function TextArea({
  className = "",
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea autoComplete="off" className={`text-area ${className}`} {...props} />
  )
}

export function Title({
  as = "h1",
  children,
  className = "",
}: {
  as?: "h1" | "h2" | "h3"
  children: ReactNode
  className?: string
}) {
  const Tag = as
  return (
    <Tag className={`ui-title ui-title--${as} ${className}`}>{children}</Tag>
  )
}

export function Divider() {
  return <div className="divider" role="separator" />
}

export function Switch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  disabled?: boolean
}) {
  return (
    <button
      aria-checked={checked}
      aria-label={label}
      className={`ios-switch ${checked ? "is-on" : ""}`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      role="switch"
      type="button"
    >
      <span className="ios-switch__knob" />
    </button>
  )
}
