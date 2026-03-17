export type SettingsField =
  | {
      type: "string";
      key: string;
      label: string;
      required?: boolean;
      default?: string;
      placeholder?: string;
      secret?: boolean;
    }
  | {
      type: "number";
      key: string;
      label: string;
      required?: boolean;
      default?: number;
      min?: number;
      max?: number;
    }
  | {
      type: "boolean";
      key: string;
      label: string;
      required?: boolean;
      default?: boolean;
    }
  | {
      type: "select";
      key: string;
      label: string;
      required?: boolean;
      default?: string;
      options: { label: string; value: string }[];
    };

export interface SettingsSchema {
  fields: SettingsField[];
}
