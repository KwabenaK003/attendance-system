import { Children, isValidElement, type ChangeEvent, type ChangeEventHandler, type ReactNode } from "react";
import { Select } from "@base-ui/react/select";
import { AltArrowDownIcon } from "@solar-icons/react/linear/alt-arrow-down";

type OptionProps = { value?: string; disabled?: boolean; children?: ReactNode };
type Props = {
  value: string | number;
  onChange: ChangeEventHandler<HTMLSelectElement>;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  "aria-label"?: string;
};

export default function CustomSelect({ value, onChange, children, className = "", disabled, required, id, "aria-label": ariaLabel }: Props) {
  const options = Children.toArray(children).flatMap((child) => {
    if (!isValidElement<OptionProps>(child) || child.type !== "option") return [];
    return [{ value: child.props.value ?? "", label: child.props.children, disabled: child.props.disabled }];
  });
  const placeholder = options.find((option) => option.value === "")?.label ?? "Select an option";

  return (
    <Select.Root
      value={value === "" ? null : String(value)}
      items={options}
      disabled={disabled}
      required={required}
      onValueChange={(nextValue) => {
        const event = { target: { value: String(nextValue ?? "") }, currentTarget: { value: String(nextValue ?? "") } } as ChangeEvent<HTMLSelectElement>;
        onChange(event);
      }}
    >
      <Select.Trigger id={id} aria-label={ariaLabel} className={`input custom-select-trigger ${className}`}>
        <Select.Value placeholder={placeholder} />
        <Select.Icon className="custom-select-icon"><AltArrowDownIcon className="h-4 w-4" /></Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner className="custom-select-positioner" sideOffset={4}>
          <Select.Popup className="custom-select-popup">
            <Select.List>
              {options.map((option) => (
                <Select.Item key={option.value} value={option.value} disabled={option.disabled} className="custom-select-item">
                  <Select.ItemText>{option.label}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
