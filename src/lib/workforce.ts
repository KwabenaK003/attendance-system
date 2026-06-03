export const STAFF_ROLE_OPTIONS = [
  { value: "ceo", label: "CEO" },
  { value: "cto", label: "CTO" },
  { value: "cfo", label: "CFO" },
  { value: "manager", label: "Manager" },
  { value: "employee", label: "Employee" },
] as const;

export const ROLE_OPTIONS = [
  ...STAFF_ROLE_OPTIONS,
  { value: "admin", label: "Admin" },
] as const;

export type StaffRole = (typeof STAFF_ROLE_OPTIONS)[number]["value"];
export type AppRole = (typeof ROLE_OPTIONS)[number]["value"];

export const ROLE_LABELS = ROLE_OPTIONS.reduce<Record<string, string>>((labels, role) => {
  labels[role.value] = role.label;
  return labels;
}, {});

export const MANAGEMENT_ROLE_VALUES = ["admin", "ceo", "cto", "cfo", "manager"] as const;

export function getRoleLabel(role?: string | null): string {
  if (!role) {
    return "Employee";
  }

  return ROLE_LABELS[role] || role
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function hasManagementAccess(role?: string | null): boolean {
  return MANAGEMENT_ROLE_VALUES.includes(role as (typeof MANAGEMENT_ROLE_VALUES)[number]);
}

export const DEPARTMENT_OPTIONS = [
  "Administration",
  "Customer Support",
  "Engineering",
  "Finance",
  "Human Resources",
  "IT",
  "Legal",
  "Marketing",
  "Operations",
  "Product",
  "Sales",
  "Security",
] as const;

export type NamedPerson = {
  full_name?: string | null;
};

export function sortByName<T extends NamedPerson>(people: T[]): T[] {
  return [...people].sort((a, b) => {
    const nameA = a.full_name?.trim().toLowerCase() || "";
    const nameB = b.full_name?.trim().toLowerCase() || "";
    return nameA.localeCompare(nameB);
  });
}
